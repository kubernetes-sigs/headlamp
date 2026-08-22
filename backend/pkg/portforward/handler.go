/*
Copyright 2025 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package portforward

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	authv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/httpstream" //nolint:staticcheck // SA1019: client-go/tools/portforward still uses this; migrate when upstream does.
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
	streamhttp "k8s.io/streaming/pkg/httpstream"
)

const (
	RUNNING      = "Running"
	STOPPED      = "Stopped"
	RECONNECTING = "Reconnecting"
)

const (
	PodAvailabilityCheckTimer   = 5 // seconds
	PortForwardReadinessTimeout = 30 * time.Second
)

var inFlightPortForwards sync.Map

type portForwardRequest struct {
	ID               string `json:"id"`
	Namespace        string `json:"namespace"`
	Pod              string `json:"pod"`
	Service          string `json:"service"`
	ServiceNamespace string `json:"serviceNamespace"`
	TargetPort       string `json:"targetPort"`
	Port             string `json:"port"`
}

func (p *portForwardRequest) Validate() error {
	if p.Namespace == "" {
		return fmt.Errorf("namespace is required")
	}

	if p.Pod == "" {
		return fmt.Errorf("pod name is required")
	}

	if p.TargetPort == "" {
		return fmt.Errorf("targetPort is required")
	}

	return nil
}

type portForward struct {
	mu               *sync.Mutex
	ID               string `json:"id"`
	closeChan        chan struct{}
	Pod              string       `json:"pod"`
	Service          string       `json:"service"`
	ServiceNamespace string       `json:"serviceNamespace"`
	Namespace        string       `json:"namespace"`
	Cluster          string       `json:"cluster"`
	cacheKey         string       `json:"-"`
	Port             string       `json:"port"`
	TargetPort       string       `json:"targetPort"`
	Status           string       `json:"status"`
	Error            string       `json:"error"`
	rConf            *rest.Config `json:"-"` // needed for reconnect on pod restart
}

// setStatusAndSnapshot updates the Status and Error fields and returns a
// snapshot of the struct. When mu is initialized (production path), both
// the update and the snapshot are performed within a single critical section.
// When mu is nil (e.g. test-only structs not accessed concurrently), the
// update proceeds without locking.
func (pf *portForward) setStatusAndSnapshot(status, errMsg string) portForward {
	if pf.mu != nil {
		pf.mu.Lock()
		defer pf.mu.Unlock()
	}

	pf.Status = status
	pf.Error = errMsg

	return *pf
}

func getFreePort() (int, error) {
	addr, err := net.ResolveTCPAddr("tcp", "localhost:0")
	if err != nil {
		return 0, err
	}

	l, err := net.ListenTCP("tcp", addr)
	if err != nil {
		return 0, err
	}

	defer func() { _ = l.Close() }()

	return l.Addr().(*net.TCPAddr).Port, nil
}

// StartPortForward handles the port forward request.
//
//nolint:funlen
func StartPortForward(kubeConfigStore kubeconfig.ContextStore, cache cache.Cache[interface{}],
	unsafeUseServiceAccountToken bool,
	contextKey string,
	w http.ResponseWriter, r *http.Request,
) {
	var p portForwardRequest

	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		logger.Log(logger.LevelError, nil, err, "decoding portforward payload")
		http.Error(w, "failed to marshal port forward payload "+err.Error(), http.StatusBadRequest)

		return
	}

	if p.ID == "" {
		p.ID = uuid.New().String()
	}

	requestClusterName := mux.Vars(r)["clusterName"]

	// Ensure we don't orphan an existing port-forward by overwriting its cache entry.
	// This check happens before any resource allocation or blocking code so duplicates short-circuit
	// deterministically and avoid unnecessary listener churn.
	if existingPF, err := getPortForwardByID(cache, contextKey, p.ID); err == nil && existingPF.Status == RUNNING {
		//nolint:goconst
		logger.Log(logger.LevelError, map[string]string{"cluster": contextKey, "id": p.ID},
			nil, "portforward ID already exists")
		http.Error(w, "portforward with this ID is already running", http.StatusConflict)

		return
	}

	// Reject duplicates before any resource-consuming work (port alloc, kubeconfig lookup).
	inFlightKey := strings.Join([]string{contextKey, p.ID}, "\x00")
	if _, loaded := inFlightPortForwards.LoadOrStore(inFlightKey, struct{}{}); loaded {
		logger.Log(logger.LevelError, map[string]string{"cluster": contextKey, "id": p.ID},
			nil, "portforward ID is already starting")
		http.Error(w, "portforward with this ID is already starting", http.StatusConflict)

		return
	}

	defer inFlightPortForwards.Delete(inFlightKey)

	if err := p.Validate(); err != nil {
		logger.Log(logger.LevelError, nil, err, "validating portforward payload")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	if p.Port == "" {
		freePort, err := getFreePort()
		if err != nil || freePort == 0 {
			logger.Log(logger.LevelError, nil, err, "getting free port")
			http.Error(w, "can't find any available port "+err.Error(), http.StatusInternalServerError)

			return
		}

		p.Port = strconv.Itoa(freePort)
	}

	kContext, err := kubeConfigStore.GetContext(contextKey)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": contextKey},
			err, "getting kubeconfig context")

		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	token := ""

	if !unsafeUseServiceAccountToken || !kContext.UsesInClusterServiceAccountToken() {
		// Check Authorization header first (consistent with ParseClusterAndToken),
		// then fall back to the cluster cookie.
		if authHeader := r.Header.Get("Authorization"); authHeader != "" {
			token = auth.BearerTokenValue(authHeader)
		}

		if token == "" {
			token, _ = auth.GetTokenFromCookie(r, requestClusterName)
		}
	}

	err = startPortForward(kContext, cache, p, token, contextKey, requestClusterName)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "starting portforward")

		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/json")

	if err = json.NewEncoder(w).Encode(p); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing json payload to response write")
		http.Error(w, "failed to write json payload to response write "+err.Error(), http.StatusInternalServerError)

		return
	}
}

// checkPortForwardPermission checks if the current user has permission to create pods/portforward.
// It uses SelfSubjectAccessReview to verify RBAC permissions for the specified namespace and pod.
// Returns an error if permission is denied or if the permission check fails.
func checkPortForwardPermission(clientset *kubernetes.Clientset, namespace, podName string) error {
	ctx := context.Background()

	// Create a SelfSubjectAccessReview to check permissions
	ssar := &authv1.SelfSubjectAccessReview{
		Spec: authv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authv1.ResourceAttributes{
				Namespace:   namespace,
				Verb:        "create",
				Group:       "", // core API group
				Resource:    "pods",
				Subresource: "portforward",
				Name:        podName,
			},
		},
	}

	result, err := clientset.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, ssar, v1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to check permissions: %w", err)
	}

	if !result.Status.Allowed {
		reason := "insufficient permissions"
		if result.Status.Reason != "" {
			reason = result.Status.Reason
		}

		return fmt.Errorf("access denied: %s", reason)
	}

	return nil
}

// getKubeClientAndConfig prepares Kubernetes clientset and REST config.
// It takes a kubeconfig context and an optional bearer token.
// It returns the configured clientset, REST config, or an error if setup fails.
func getKubeClientAndConfig(kContext *kubeconfig.Context, token string) (*kubernetes.Clientset, *rest.Config, error) {
	clientset, err := kContext.ClientSetWithToken(token)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create clientset: %w", err)
	}

	rConf, err := kContext.RESTConfig()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get REST config: %w", err)
	}

	if token != "" {
		rConf.BearerToken = token
	}

	return clientset, rConf, nil
}

// buildPortForwardDialer returns a dialer that performs the port-forward
// upgrade. Direct API endpoints use SPDY, while path-routed proxies try
// WebSocket first because proxies such as Warpgate can drop SPDY headers.
func buildPortForwardDialer(
	rConf *rest.Config, fullURL *url.URL,
	upgrader spdy.Upgrader, roundTripper http.RoundTripper,
) httpstream.Dialer {
	spdyDialer := spdy.NewDialer(upgrader, &http.Client{Transport: roundTripper}, http.MethodPost, fullURL)
	if strings.HasPrefix(fullURL.Path, "/api/") {
		return spdyDialer
	}

	tunnelingDialer, err := portforward.NewSPDYOverWebsocketDialer(fullURL, rConf)
	if err != nil {
		// WebSocket dialer not available (e.g. config conversion failed);
		// keep SPDY-only behavior.
		return spdyDialer
	}

	return portforward.NewFallbackDialer(tunnelingDialer, spdyDialer, shouldFallbackToSPDY)
}

func shouldFallbackToSPDY(err error) bool {
	return httpstream.IsUpgradeFailure(err) ||
		streamhttp.IsUpgradeFailure(err) ||
		httpstream.IsHTTPSProxyError(err)
}

// buildPortForwardURL constructs the upstream port-forward URL for a pod,
// preserving any path prefix carried by the kubeconfig server URL (for
// clusters fronted by a path-routing reverse proxy such as Warpgate).
//
// `hostURL.ResolveReference(&url.URL{Path: …})` cannot be used here because
// `ResolveReference` replaces the host path when the reference path is
// absolute, dropping the prefix.
func buildPortForwardURL(host, namespace, podName, targetPort string) (*url.URL, error) {
	hostURL, err := url.Parse(host)
	if err != nil {
		return nil, fmt.Errorf("invalid REST config host: %w", err)
	}

	// url.Parse accepts scheme-less inputs like "example.com" or
	// "kubernetes.default.svc:443" without erroring, producing a relative URL
	// (the latter is parsed as scheme="kubernetes.default.svc", opaque="443").
	// Default to https:// when the host parsed without one, then reject what
	// still has no host.
	if hostURL.Host == "" {
		hostURL, err = url.Parse("https://" + host)
		if err != nil {
			return nil, fmt.Errorf("invalid REST config host: %w", err)
		}
	}

	if hostURL.Host == "" {
		return nil, fmt.Errorf("invalid REST config host %q: missing host", host)
	}

	prefix := strings.TrimSuffix(hostURL.Path, "/")
	hostURL.Path = fmt.Sprintf("%s/api/v1/namespaces/%s/pods/%s/portforward", prefix, namespace, podName)
	query := hostURL.Query()
	// The API server decodes PodPortForwardOptions.ports and forwards each value
	// to the kubelet's singular port query parameter.
	query.Set("ports", targetPort)
	hostURL.RawQuery = query.Encode()

	return hostURL, nil
}

// initPortForwarder sets up the SPDY dialer and creates a new port forwarder.
// It requires a REST config, namespace, pod name, and the port mapping string (e.g., "8080:80").
// It returns the port forwarder instance, stop/ready channels, an error buffer, or an error.
func initPortForwarder(rConf *rest.Config, namespace, podName, portMapping, targetPort string) (
	*portforward.PortForwarder, chan struct{}, chan struct{}, *bytes.Buffer, error,
) {
	roundTripper, upgrader, err := spdy.RoundTripperFor(rConf)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("failed to create SPDY round tripper: %w", err)
	}

	fullURL, err := buildPortForwardURL(rConf.Host, namespace, podName, targetPort)
	if err != nil {
		return nil, nil, nil, nil, err
	}

	// Path-routed proxies use WebSocket first; direct API endpoints use SPDY.
	dialer := buildPortForwardDialer(rConf, fullURL, upgrader, roundTripper)

	stopChan, readyChan := make(chan struct{}), make(chan struct{}, 1)
	out, errOut := new(bytes.Buffer), new(bytes.Buffer)

	forwarder, err := portforward.New(dialer, []string{portMapping}, stopChan, readyChan, out, errOut)
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("failed to create portforwarder: %w", err)
	}

	return forwarder, stopChan, readyChan, errOut, nil
}

// safeCloseChan attempts to close a channel and recovers from a panic
// if the channel is already closed or nil.
func safeCloseChan(ch chan struct{}) {
	defer func() {
		if r := recover(); r != nil {
			_ = r
		}
	}()

	if ch != nil {
		close(ch)
	}
}

// monitorPodAndManagePortForward runs in a goroutine and periodically checks if the
// target pod for a port-forward is still running. If the pod is not running
// (or if an unrecoverable error occurs during check), it signals the port-forward
// to stop by closing its stopChan and updates its status in the cache.
// For service-backed port-forwards, it attempts automatic reconnection to a new pod.
// It stops when the associated port-forward's closeChan is closed.
func monitorPodAndManagePortForward(
	clientset *kubernetes.Clientset,
	cache cache.Cache[interface{}],
	pfDetails *portForward,
) {
	ticker := time.NewTicker(PodAvailabilityCheckTimer * time.Second)
	defer ticker.Stop()

	logParams := map[string]string{"id": pfDetails.ID, "pod": pfDetails.Pod, "namespace": pfDetails.Namespace}

	for {
		select {
		case <-ticker.C:
			if handlePodCheck(clientset, cache, pfDetails, logParams) {
				return
			}
		case <-pfDetails.closeChan:
			// closeChan fires when: (a) the forwarder goroutine exits
			// (connection broke), or (b) user explicitly stopped the PF.
			// Check the pod to distinguish: if the pod is gone/terminating
			// we should reconnect (service) or mark Stopped (direct).
			logger.Log(logger.LevelInfo, logParams, nil, "closeChan fired, checking pod status")

			if handlePodCheck(clientset, cache, pfDetails, logParams) {
				return
			}

			// Pod is still running — this was a user-initiated stop.
			logger.Log(logger.LevelInfo, logParams, nil, "Pod monitor stopping: user-initiated stop")

			return
		}
	}
}

// handlePodCheck checks if the monitored pod is still alive and either
// triggers reconnection (service-backed) or marks the PF stopped (direct).
// Returns true when the caller (monitor loop) should exit.
func handlePodCheck(
	clientset *kubernetes.Clientset,
	cache cache.Cache[interface{}],
	pfDetails *portForward,
	logParams map[string]string,
) bool {
	err := checkIfPodIsRunning(clientset, pfDetails.Namespace, pfDetails.Pod)
	if err == nil {
		return false // pod is fine
	}

	if errors.Is(err, syscall.ECONNREFUSED) {
		logger.Log(logger.LevelInfo, logParams, err, "checking pod (ECONNREFUSED), continuing")
		return false
	}

	// If this port-forward is backed by a Service, attempt auto-reconnect
	// to a replacement pod instead of immediately stopping.
	if pfDetails.Service != "" {
		logger.Log(logger.LevelInfo, logParams, err,
			"pod unavailable, attempting reconnect via service")

		pfSnapshot := pfDetails.setStatusAndSnapshot(RECONNECTING, "")
		portforwardstore(cache, pfSnapshot)

		// Close the old forwarder's stop channel so its goroutine
		// exits, then allocate a fresh one. attemptReconnect's
		// backoff select listens on closeChan for user-initiated
		// cancellation; without a new channel, the select would
		// fire immediately on the already-closed channel.
		safeCloseChan(pfDetails.closeChan)

		pfDetails.mu.Lock()
		pfDetails.closeChan = make(chan struct{})
		pfDetails.mu.Unlock()

		if attemptReconnect(clientset, cache, pfDetails) {
			return true // new monitor goroutine started by runAndMonitorPortForward
		}
		// All reconnect attempts failed — fall through to stop
	}

	errMsg := fmt.Sprintf("Pod %s/%s check failed: %v", pfDetails.Namespace, pfDetails.Pod, err)
	logger.Log(logger.LevelError, logParams, errors.New(errMsg), "stopping port-forward due to pod status")

	pfSnapshot := pfDetails.setStatusAndSnapshot(STOPPED, errMsg)
	portforwardstore(cache, pfSnapshot)
	safeCloseChan(pfDetails.closeChan)

	return true
}

// resolveServicePod queries the EndpointSlice API for the given service and
// returns the name and namespace of the first ready pod backing the service.
func resolveServicePod(
	clientset kubernetes.Interface, serviceNamespace, serviceName string,
) (podName string, podNamespace string, err error) {
	slices, err := clientset.DiscoveryV1().EndpointSlices(serviceNamespace).List(
		context.Background(), v1.ListOptions{
			LabelSelector: discoveryv1.LabelServiceName + "=" + serviceName,
		})
	if err != nil {
		return "", "", fmt.Errorf("failed to list endpointslices for service %s/%s: %w",
			serviceNamespace, serviceName, err)
	}

	for i := range slices.Items {
		for j := range slices.Items[i].Endpoints {
			ep := &slices.Items[i].Endpoints[j]
			if ep.Conditions.Ready != nil && !*ep.Conditions.Ready {
				continue
			}

			if ep.TargetRef != nil && ep.TargetRef.Kind == "Pod" {
				ns := serviceNamespace
				if ep.TargetRef.Namespace != "" {
					ns = ep.TargetRef.Namespace
				}

				return ep.TargetRef.Name, ns, nil
			}
		}
	}

	return "", "", fmt.Errorf("no ready endpoints for service %s/%s",
		serviceNamespace, serviceName)
}

// attemptReconnect tries to re-establish a port-forward by finding a new pod
// behind the same service. It retries up to 3 times with exponential backoff
// (5s, 10s, 20s). Returns true if reconnection succeeded.
func attemptReconnect(
	clientset *kubernetes.Clientset,
	cache cache.Cache[interface{}],
	pfDetails *portForward,
) bool {
	logParams := map[string]string{
		"id": pfDetails.ID, "service": pfDetails.Service,
		"serviceNamespace": pfDetails.ServiceNamespace,
	}
	backoffs := []time.Duration{5 * time.Second, 10 * time.Second, 20 * time.Second}

	for attempt, delay := range backoffs {
		logger.Log(logger.LevelInfo, logParams, nil,
			fmt.Sprintf("reconnect attempt %d/%d, waiting %s", attempt+1, len(backoffs), delay))

		// Use a select so the backoff sleep is cancellable when the user
		// stops or deletes the port-forward during a retry window.
		select {
		case <-time.After(delay):
		case <-pfDetails.closeChan:
			logger.Log(logger.LevelInfo, logParams, nil, "reconnect cancelled during backoff")
			return false
		}

		ok, abort := tryReconnectOnce(clientset, cache, pfDetails, logParams)
		if abort {
			return false
		}

		if ok {
			return true
		}

		// Not ok and not abort → retry on next iteration.
	}

	logger.Log(logger.LevelError, logParams, nil, "all reconnect attempts exhausted")

	return false
}

// tryReconnectOnce resolves a new pod for the service, initialises a fresh
// port-forwarder, swaps closeChan safely, and starts monitoring.
// It returns (true, false) on success, (false, true) to abort retries,
// or (false, false) when the caller should retry.
//
//nolint:cyclop
func tryReconnectOnce(
	clientset *kubernetes.Clientset,
	cache cache.Cache[interface{}],
	pfDetails *portForward,
	logParams map[string]string,
) (ok bool, abort bool) {
	newPod, podNamespace, err := resolveServicePod(
		clientset, pfDetails.ServiceNamespace, pfDetails.Service)
	if err != nil {
		logger.Log(logger.LevelError, logParams, err, "resolving service endpoint for reconnect")

		pfSnapshot := pfDetails.setStatusAndSnapshot(RECONNECTING, "")
		portforwardstore(cache, pfSnapshot)

		return false, false
	}

	if pfDetails.rConf == nil {
		logger.Log(logger.LevelError, logParams, nil, "no REST config available for reconnect")
		return false, true
	}

	portMapping := pfDetails.Port + ":" + pfDetails.TargetPort

	forwarder, stopChan, readyChan, errOut, err := initPortForwarder(
		pfDetails.rConf, podNamespace, newPod, portMapping, pfDetails.TargetPort,
	)
	if err != nil {
		logger.Log(logger.LevelError, logParams, err, "re-initializing port forwarder")

		pfSnapshot := pfDetails.setStatusAndSnapshot(RECONNECTING, "")
		portforwardstore(cache, pfSnapshot)

		return false, false
	}

	// Swap closeChan and pod name under lock.
	// Capture the old closeChan so the old forwarder's deferred
	// safeCloseChan does not accidentally close the new channel.
	pfDetails.mu.Lock()
	oldCloseChan := pfDetails.closeChan
	pfDetails.closeChan = stopChan
	pfDetails.Pod = newPod
	pfDetails.Namespace = podNamespace
	pfDetails.mu.Unlock()

	// Ensure the old channel is closed so its goroutine can exit cleanly.
	safeCloseChan(oldCloseChan)

	err = runAndMonitorPortForward(clientset, cache, pfDetails, forwarder, readyChan, errOut)
	if err != nil {
		logger.Log(logger.LevelError, logParams, err, "reconnected forwarder failed readiness")

		pfSnapshot := pfDetails.setStatusAndSnapshot(RECONNECTING, "")
		portforwardstore(cache, pfSnapshot)

		return false, false
	}

	logger.Log(logger.LevelInfo, logParams, nil,
		fmt.Sprintf("successfully reconnected to pod %s/%s", podNamespace, newPod))

	return true, false
}

func handlePortForwardError(
	cache cache.Cache[interface{}],
	pfDetails *portForward,
	logParams map[string]string,
	errMsg string,
) error {
	logger.Log(logger.LevelError, logParams, errors.New(errMsg), "portforward error")

	pfSnapshot := pfDetails.setStatusAndSnapshot(STOPPED, errMsg)

	portforwardstore(cache, pfSnapshot)
	safeCloseChan(pfDetails.closeChan)

	return errors.New(errMsg)
}

// Helper to handle success and update state.
func handlePortForwardSuccess(
	cache cache.Cache[interface{}],
	pfDetails *portForward,
	logParams map[string]string,
) {
	pfSnapshot := pfDetails.setStatusAndSnapshot(RUNNING, "")
	portforwardstore(cache, pfSnapshot)
	logger.Log(logger.LevelInfo, logParams, nil, "Port forward ready and running.")
}

// handlePortForwardReadiness waits for the port forward to be ready, handling potential
// errors from errOut, timeouts, or premature stop signals.
// It updates the portForward details in the cache based on the outcome.
func handlePortForwardReadiness(
	cache cache.Cache[interface{}],
	pfDetails *portForward,
	readyChan chan struct{},
	errOut *bytes.Buffer,
	logParams map[string]string,
	forwardErrChan <-chan error,
) error {
	select {
	case <-readyChan:
		if errOut.String() != "" {
			return handlePortForwardError(cache, pfDetails, logParams,
				fmt.Sprintf("portforward failed, stderr: %s", errOut.String()))
		}

		handlePortForwardSuccess(cache, pfDetails, logParams)
	case err, ok := <-forwardErrChan:
		if !ok {
			return handlePortForwardError(cache, pfDetails, logParams, "portforward stopped before ready")
		}

		if err == nil {
			return handlePortForwardError(cache, pfDetails, logParams, "portforward failed: nil error received")
		}

		return handlePortForwardError(cache, pfDetails, logParams, err.Error())
	case <-time.After(PortForwardReadinessTimeout):
		return handlePortForwardError(cache, pfDetails, logParams, "timeout waiting for portforward to be ready")
	case <-pfDetails.closeChan:
		msg := "portforward stopped before becoming ready"

		if pfDetails.mu != nil {
			pfDetails.mu.Lock()
		}

		if pfDetails.Status == RUNNING {
			pfDetails.Status = STOPPED
		}

		if pfDetails.Error == "" {
			pfDetails.Error = msg
		}

		pfSnapshot := *pfDetails

		if pfDetails.mu != nil {
			pfDetails.mu.Unlock()
		}

		portforwardstore(cache, pfSnapshot)
		logger.Log(logger.LevelInfo, logParams, nil, msg)

		return errors.New(msg)
	}

	return nil
}

// forwardPortsAsync runs ForwardPorts in a goroutine, reporting errors via forwardErrChan.
// It does NOT set the port-forward status on exit — the monitor goroutine owns
// lifecycle decisions (reconnect vs stop). It only closes the closeChan captured
// at launch so the monitor can react to the connection loss.
func forwardPortsAsync(
	pfDetails *portForward,
	forwarder *portforward.PortForwarder,
	forwardErrChan chan error,
	logParams map[string]string,
) {
	// Capture closeChan now so the deferred close targets THIS forwarder's
	// channel even if pfDetails.closeChan is swapped during reconnect.
	closeOnExit := pfDetails.closeChan

	go func() {
		defer func() {
			safeCloseChan(closeOnExit)
			close(forwardErrChan)
		}()

		if err := forwarder.ForwardPorts(); err != nil {
			logger.Log(logger.LevelError, logParams, err, "ForwardPorts() failed")

			// Report the error to the readiness handler if it's still listening.
			// Do NOT set status here — the monitor goroutine decides whether
			// to reconnect or mark stopped.
			select {
			case forwardErrChan <- err:
			default:
			}

			return
		}

		logger.Log(logger.LevelInfo, logParams, nil, "ForwardPorts() exited cleanly.")
	}()
}

// runAndMonitorPortForward starts the actual port forwarding in a goroutine,
// then handles its readiness, and if ready, starts another goroutine to
// monitor the target pod's status.
func runAndMonitorPortForward(
	clientset *kubernetes.Clientset,
	cache cache.Cache[interface{}],
	pfDetails *portForward,
	forwarder *portforward.PortForwarder,
	readyChan chan struct{},
	errOut *bytes.Buffer,
) error {
	logParams := map[string]string{
		"id": pfDetails.ID, "pod": pfDetails.Pod, "port": pfDetails.Port, "targetPort": pfDetails.TargetPort,
	}
	forwardErrChan := make(chan error, 1)

	forwardPortsAsync(pfDetails, forwarder, forwardErrChan, logParams)

	err := handlePortForwardReadiness(cache, pfDetails, readyChan, errOut, logParams, forwardErrChan)
	if err != nil {
		return err
	}

	go monitorPodAndManagePortForward(clientset, cache, pfDetails)

	return nil
}

// startPortForward starts a port forward. This is the internal function that was refactored.
// It sets up Kubernetes clients, initializes the port forwarder, and manages its lifecycle.
func startPortForward(kContext *kubeconfig.Context, cache cache.Cache[interface{}],
	p portForwardRequest, token string, clusterName string, requestClusterName string,
) error {
	clientset, rConf, err := getKubeClientAndConfig(kContext, token)
	if err != nil {
		return fmt.Errorf("failed to setup Kubernetes client/config: %w", err)
	}

	// Check RBAC permissions before attempting port forward
	err = checkPortForwardPermission(clientset, p.Namespace, p.Pod)
	if err != nil {
		return fmt.Errorf("permission check failed: %w", err)
	}

	portMapping := p.Port + ":" + p.TargetPort

	var (
		forwarder           *portforward.PortForwarder
		stopChan, readyChan chan struct{}
		errOut              *bytes.Buffer
		errInit             error
	)

	forwarder, stopChan, readyChan, errOut, errInit = initPortForwarder(
		rConf, p.Namespace, p.Pod, portMapping, p.TargetPort,
	)
	if errInit != nil {
		return fmt.Errorf("failed to initialize port forwarder: %w", errInit)
	}

	pfDetails := &portForward{
		mu:               &sync.Mutex{},
		ID:               p.ID,
		closeChan:        stopChan,
		Pod:              p.Pod,
		Cluster:          requestClusterName,
		cacheKey:         clusterName,
		Namespace:        p.Namespace,
		Service:          p.Service,
		ServiceNamespace: p.ServiceNamespace,
		TargetPort:       p.TargetPort,
		Status:           RUNNING,
		Port:             p.Port,
		Error:            "",
		rConf:            rConf,
	}

	return runAndMonitorPortForward(clientset, cache, pfDetails, forwarder, readyChan, errOut)
}

func checkIfPodIsRunning(clientset *kubernetes.Clientset, namespace string, pod string) error {
	ctx := context.Background()

	p, err := clientset.CoreV1().Pods(namespace).Get(ctx, pod, v1.GetOptions{})
	if err != nil {
		return err
	}

	// A pod that has been deleted but is still in its termination grace period
	// reports Phase: Running. Check DeletionTimestamp to catch this case.
	if p.DeletionTimestamp != nil {
		return errors.New("pod is terminating")
	}

	if p.Status.Phase != corev1.PodRunning {
		return errors.New("pod is not running")
	}

	return nil
}

// stopOrDeletePortForwardRequest is the payload for stop or delete port forward request handler.
type stopOrDeletePortForwardRequest struct {
	ID           string `json:"id"`
	StopOrDelete bool   `json:"stopOrDelete"`
}

func (r *stopOrDeletePortForwardRequest) Validate() error {
	if r.ID == "" {
		return errors.New("invalid request, id is required")
	}

	return nil
}

// StopOrDeletePortForward handles stop or delete port forward request.
func StopOrDeletePortForward(cache cache.Cache[interface{}], contextKey string,
	w http.ResponseWriter, r *http.Request,
) {
	var p stopOrDeletePortForwardRequest

	err := json.NewDecoder(r.Body).Decode(&p)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "decoding delete portforward payload")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	if err := p.Validate(); err != nil {
		logger.Log(logger.LevelError, nil, err, "validating delete portforward payload")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	err = stopOrDeletePortForward(cache, contextKey, p.ID, p.StopOrDelete)
	if err == nil {
		if _, err := w.Write([]byte("stopped")); err != nil {
			logger.Log(logger.LevelError, nil, err, "writing response")
			http.Error(w, "failed to write response "+err.Error(), http.StatusInternalServerError)
		}

		return
	}

	http.Error(w, "failed to delete port forward "+err.Error(), http.StatusInternalServerError)
}

// GetPortForwards handles get port forwards request.
func GetPortForwards(cache cache.Cache[interface{}], contextKey string,
	w http.ResponseWriter, r *http.Request,
) {
	cluster := mux.Vars(r)["clusterName"]
	if cluster == "" {
		logger.Log(logger.LevelError, nil, errors.New("cluster is required"), "getting portforwards")
		http.Error(w, "cluster is required", http.StatusBadRequest)

		return
	}

	ports := getPortForwardList(cache, contextKey)

	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(ports); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing json payload to response")
		http.Error(w, "failed to write json payload to response "+err.Error(), http.StatusInternalServerError)

		return
	}
}

// GetPortForwardByID handles get port forward by id request.
func GetPortForwardByID(cache cache.Cache[interface{}], contextKey string,
	w http.ResponseWriter, r *http.Request,
) {
	cluster := mux.Vars(r)["clusterName"]
	if cluster == "" {
		logger.Log(logger.LevelError, nil, errors.New("cluster is required"), "getting portforward by id")
		http.Error(w, "cluster is required", http.StatusBadRequest)

		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		logger.Log(logger.LevelError, nil, errors.New("id is required"), "getting portforward by id")
		http.Error(w, "id is required", http.StatusBadRequest)

		return
	}

	p, err := getPortForwardByID(cache, contextKey, id)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting portforward by id")
		http.Error(w, "no portforward running with id "+id, http.StatusNotFound)

		return
	}

	type payload struct {
		ID        string `json:"id"`
		Pod       string `json:"pod"`
		Service   string `json:"service"`
		Cluster   string `json:"cluster"`
		Namespace string `json:"namespace"`
	}

	portForwardStruct := payload{
		ID:        p.ID,
		Pod:       p.Pod,
		Namespace: p.Namespace,
		Cluster:   cluster,
		Service:   p.Service,
	}

	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(portForwardStruct); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing json payload to response")
		http.Error(w, "failed to write json payload "+err.Error(), http.StatusInternalServerError)

		return
	}
}
