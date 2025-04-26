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
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	corev1 "k8s.io/api/core/v1"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

const (
	RUNNING = "Running"
	STOPPED = "Stopped"
)

const PodAvailabilityCheckTimer = 5 // seconds

type portForwardRequest struct {
	ID               string `json:"id"`
	Namespace        string `json:"namespace"`
	Pod              string `json:"pod"`
	Service          string `json:"service"`
	ServiceNamespace string `json:"serviceNamespace"`
	TargetPort       string `json:"targetPort"`
	Cluster          string `json:"cluster"`
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

	if p.Cluster == "" {
		return fmt.Errorf("cluster name is required")
	}

	return nil
}

type portForward struct {
	ID               string `json:"id"`
	closeChan        chan struct{}
	Pod              string `json:"pod"`
	Service          string `json:"service"`
	ServiceNamespace string `json:"serviceNamespace"`
	Namespace        string `json:"namespace"`
	Cluster          string `json:"cluster"`
	Port             string `json:"port"`
	TargetPort       string `json:"targetPort"`
	Status           string `json:"status"`
	Error            string `json:"error"`
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

	defer l.Close()

	return l.Addr().(*net.TCPAddr).Port, nil
}

// StartPortForward handles the port forward request.
//
//nolint:funlen
func StartPortForward(kubeConfigStore kubeconfig.ContextStore, cache cache.Cache[interface{}],
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

	reqToken := r.Header.Get("Authorization")
	splitToken := strings.Split(reqToken, "Bearer ")

	var token string
	if reqToken != "" || len(splitToken) > 2 {
		token = splitToken[1]
	}

	if err := p.Validate(); err != nil {
		logger.Log(logger.LevelError, nil, err, "validating portforward payload")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	if p.Port == "" {
		// if no port is specified find a available port
		freePort, err := getFreePort()
		if err != nil || freePort == 0 {
			logger.Log(logger.LevelError, nil, err, "getting free port")
			http.Error(w, "can't find any available port "+err.Error(), http.StatusInternalServerError)

			return
		}

		p.Port = strconv.Itoa(freePort)
	}

	// Get user ID from header if present
	userID := r.Header.Get("X-HEADLAMP-USER-ID")

	// If user ID is present, append it to cluster name
	clusterName := p.Cluster
	if userID != "" {
		clusterName = p.Cluster + userID
	}

	kContext, err := kubeConfigStore.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": p.Cluster},
			err, "getting kubeconfig context")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	err = startPortForward(kContext, cache, p, token)
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

// startPortForward starts a port forward.
//
//nolint:funlen
func startPortForward(kContext *kubeconfig.Context, cache cache.Cache[interface{}],
	p portForwardRequest, token string,
) error {
	clientset, err := kContext.ClientSetWithToken(token)
	if err != nil {
		return fmt.Errorf("failed to create portforward request: %v", err)
	}

	rConf, err := kContext.RESTConfig()
	if err != nil {
		return fmt.Errorf("failed to create portforward request: %v", err)
	}

	if token != "" {
		rConf.BearerToken = token
	}

	roundTripper, upgrader, err := spdy.RoundTripperFor(rConf)
	if err != nil {
		return fmt.Errorf("failed to create portforward request")
	}

	requestURL := fmt.Sprintf("%s/api/v1/namespaces/%s/pods/%s/portforward", rConf.Host, p.Namespace, p.Pod)

	reqURL, err := url.Parse(requestURL)
	if err != nil {
		return fmt.Errorf("portforward request: failed to parse url: %v", err)
	}

	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: roundTripper}, http.MethodPost, reqURL)
	stopChan, readyChan := make(chan struct{}), make(chan struct{}, 1)
	out, errOut := new(bytes.Buffer), new(bytes.Buffer)

	forwarder, err := portforward.New(dialer, []string{p.Port + ":" + p.TargetPort},
		stopChan, readyChan, out, errOut)
	if err != nil {
		return fmt.Errorf("portforward request: failed to create portforward: %v", err)
	}

	portForwardToStore := portForward{
		ID:               p.ID,
		closeChan:        stopChan,
		Pod:              p.Pod,
		Cluster:          p.Cluster,
		Namespace:        p.Namespace,
		Service:          p.Service,
		ServiceNamespace: p.ServiceNamespace,
		TargetPort:       p.TargetPort,
		Status:           RUNNING,
		Port:             p.Port,
		Error:            "",
	}

	go func() {
		if err = forwarder.ForwardPorts(); err != nil { // Locks until stopChan is closed.
			logger.Log(logger.LevelError, nil, err, "forwarding ports")
			stopChan <- struct{}{}

			portForwardToStore.Error = err.Error()
			portforwardstore(cache, portForwardToStore)
		}
	}()

	<-readyChan

	if errOut.String() == "" {
		portforwardstore(cache, portForwardToStore)
	}

	/* check every PodAvailabilityCheckTimer seconds if the pod for which we started a portforward is running
	if not then we close the channel
	*/
	ticker := time.NewTicker(PodAvailabilityCheckTimer * time.Second)

	go func() {
		for range ticker.C {
			err := checkIfPodIsRunning(clientset, p.Namespace, p.Pod)
			if err != nil {
				if errors.Is(err, syscall.ECONNREFUSED) {
					continue
				}

				logger.Log(logger.LevelError, nil, err, "checking if pod is running")
				stopChan <- struct{}{}

				portForwardToStore.Error = err.Error()

				portforwardstore(cache, portForwardToStore)
				ticker.Stop()
			}
		}
	}()

	return nil
}

func checkIfPodIsRunning(clientset *kubernetes.Clientset, namespace string, pod string) error {
	ctx := context.Background()

	p, err := clientset.CoreV1().Pods(namespace).Get(ctx, pod, v1.GetOptions{})
	if err != nil {
		return err
	}

	if p.Status.Phase != corev1.PodRunning {
		return errors.New("pod is not running")
	}

	return nil
}

// stopOrDeletePortForwardRequest is the payload for stop or delete port forward request handler.
type stopOrDeletePortForwardRequest struct {
	ID           string `json:"id"`
	Cluster      string `json:"cluster"`
	StopOrDelete bool   `json:"stopOrDelete"`
}

func (r *stopOrDeletePortForwardRequest) Validate() error {
	if r.ID == "" {
		return errors.New("invalid request, id is required")
	}

	if r.Cluster == "" {
		return errors.New("invalid request, cluster is required")
	}

	return nil
}

// StopOrDeletePortForward handles stop or delete port forward request.
func StopOrDeletePortForward(cache cache.Cache[interface{}], w http.ResponseWriter, r *http.Request) {
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

	// Get user ID from header if present
	userID := r.Header.Get("X-HEADLAMP-USER-ID")

	// If user ID is present, append it to cluster name
	clusterName := p.Cluster
	if userID != "" {
		clusterName = p.Cluster + userID
	}

	err = stopOrDeletePortForward(cache, clusterName, p.ID, p.StopOrDelete)
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
func GetPortForwards(cache cache.Cache[interface{}], w http.ResponseWriter, r *http.Request) {
	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		logger.Log(logger.LevelError, nil, errors.New("cluster is required"), "getting portforwards")
		http.Error(w, "cluster is required", http.StatusBadRequest)

		return
	}

	// Get user ID from header if present
	userID := r.Header.Get("X-HEADLAMP-USER-ID")

	// If user ID is present, append it to cluster name
	clusterName := cluster
	if userID != "" {
		clusterName = cluster + userID
	}

	ports := getPortForwardList(cache, clusterName)

	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(ports); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing json payload to response")
		http.Error(w, "failed to write json payload to response "+err.Error(), http.StatusInternalServerError)

		return
	}
}

// GetPortForwardByID handles get port forward by id request.
func GetPortForwardByID(cache cache.Cache[interface{}], w http.ResponseWriter, r *http.Request) {
	cluster := r.URL.Query().Get("cluster")
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

	// Get user ID from header if present
	userID := r.Header.Get("X-HEADLAMP-USER-ID")

	// If user ID is present, append it to cluster name
	clusterName := cluster
	if userID != "" {
		clusterName = cluster + userID
	}

	p, err := getPortForwardByID(cache, clusterName, id)
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
		Cluster:   p.Cluster,
		Service:   p.Service,
	}

	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(portForwardStruct); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing json payload to response")
		http.Error(w, "failed to write json payload "+err.Error(), http.StatusInternalServerError)

		return
	}
}
