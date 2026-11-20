// Copyright 2025 The Kubernetes Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/nsdiscovery"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// namespaceDiscoveryQPS is the rate limit of the user client for one discovery
// run (-namespace-discovery-qps). client-go's default (5 QPS, burst 10) would
// need more than 30s for about 40 namespaces without access, because each of
// them costs every probe. In-flight requests stay bounded by nsdiscovery's
// concurrency.
func (c *HeadlampConfig) namespaceDiscoveryQPS() float64 {
	if c.NamespaceDiscoveryQPS > 0 {
		return c.NamespaceDiscoveryQPS
	}

	return config.DefaultNamespaceDiscoveryQPS
}

// namespaceDiscoveryTimeout bounds one discovery run, including all
// SelfSubjectAccessReviews (-namespace-discovery-timeout).
func (c *HeadlampConfig) namespaceDiscoveryTimeout() time.Duration {
	if c.NamespaceDiscoveryTimeout > 0 {
		return c.NamespaceDiscoveryTimeout
	}

	return config.DefaultNamespaceDiscoveryTimeout
}

var (
	namespaceDiscoverer = nsdiscovery.New()

	serviceAccountClientMu sync.Mutex
	serviceAccountClient   kubernetes.Interface

	// newServiceAccountClient builds a client with the pod's service account.
	// rest.InClusterConfig reads the token from file, so rotated tokens are picked up.
	newServiceAccountClient = func() (kubernetes.Interface, error) {
		conf, err := rest.InClusterConfig()
		if err != nil {
			return nil, err
		}

		return kubernetes.NewForConfig(conf)
	}

	// newUserClient builds a client that authenticates only with the user's token.
	newUserClient = userClientForContext
)

// namespaceListerClient returns the cached service account client used to list
// namespace names. Errors are not cached so a later request can retry.
func namespaceListerClient() (kubernetes.Interface, error) {
	serviceAccountClientMu.Lock()
	defer serviceAccountClientMu.Unlock()

	if serviceAccountClient != nil {
		return serviceAccountClient, nil
	}

	client, err := newServiceAccountClient()
	if err != nil {
		return nil, err
	}

	serviceAccountClient = client

	return client, nil
}

// userClientForContext returns a client for the context's API server that
// carries the user's bearer token and drops every other credential of the
// context, so requests can never fall back to Headlamp's own identity.
func userClientForContext(kContext *kubeconfig.Context, token string, qps float64) (kubernetes.Interface, error) {
	base, err := kContext.RESTConfig()
	if err != nil {
		return nil, err
	}

	conf := rest.AnonymousClientConfig(base)
	conf.BearerToken = token
	conf.QPS = float32(qps)
	conf.Burst = max(1, int(qps))

	return kubernetes.NewForConfig(conf)
}

// accessibleNamespacesClients returns the service account client that lists
// namespace names and the client that checks access with the user's token.
func accessibleNamespacesClients(
	kContext *kubeconfig.Context,
	token string,
	qps float64,
) (kubernetes.Interface, kubernetes.Interface, error) {
	userClient, err := newUserClient(kContext, token, qps)
	if err != nil {
		return nil, nil, err
	}

	lister, err := namespaceListerClient()
	if err != nil {
		return nil, nil, err
	}

	return lister, userClient, nil
}

// handleAccessibleNamespaces returns the namespaces the requesting user can
// access. Only namespace names are read with the service account; access is
// checked per namespace with the user's token.
func (c *HeadlampConfig) handleAccessibleNamespaces(w http.ResponseWriter, r *http.Request) {
	if !c.EnableNamespaceDiscovery {
		http.NotFound(w, r)
		return
	}

	clusterName := mux.Vars(r)["clusterName"]

	contextKey, err := c.getContextKeyForRequest(r)
	if err != nil {
		http.Error(w, "invalid cluster request", http.StatusBadRequest)
		return
	}

	kContext, err := c.KubeConfigStore.GetContext(contextKey)
	if err != nil {
		http.Error(w, "cluster not found", http.StatusNotFound)
		return
	}

	// Only the in-cluster context runs next to a service account we can use.
	// With the unsafe service account mode every user already acts as that
	// account, so there is nothing to discover.
	if kContext.Source != kubeconfig.InCluster || c.shouldUseUnsafeServiceAccountTokenForContext(kContext) {
		writeAccessibleNamespaces(w, nsdiscovery.Result{Status: nsdiscovery.StatusUnsupported, Namespaces: []string{}})
		return
	}

	// authenticatedHandler already put the token the cluster API proxy would
	// use (proxy-auth header, Authorization, then cookie) into Authorization,
	// so discovery evaluates the identity the following Kubernetes requests use.
	token := requestBearerToken(r)
	if token == "" {
		http.Error(w, "user authentication is required", http.StatusUnauthorized)
		return
	}

	lister, userClient, err := accessibleNamespacesClients(kContext, token, c.namespaceDiscoveryQPS())
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName}, err, "creating discovery clients")
		http.Error(w, "namespace discovery is not available", http.StatusInternalServerError)

		return
	}

	// Detach from the request so a cancelled caller does not fail other callers
	// sharing the same in-flight discovery.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), c.namespaceDiscoveryTimeout())
	defer cancel()

	result, err := namespaceDiscoverer.Discover(ctx, nsdiscovery.CacheKey(contextKey, token), lister, userClient)
	if err != nil {
		writeAccessibleNamespacesError(ctx, w, clusterName, err)
		return
	}

	writeAccessibleNamespaces(w, result)
}

// writeAccessibleNamespacesError maps a discovery error to an HTTP status and
// logs the ones that point at a problem of the deployment.
func writeAccessibleNamespacesError(ctx context.Context, w http.ResponseWriter, clusterName string, err error) {
	status := accessibleNamespacesErrorStatus(err)

	timedOut := ctx.Err() != nil || isRateLimiterDeadline(err)
	if timedOut {
		status = http.StatusGatewayTimeout

		logger.Log(logger.LevelWarn, map[string]string{"cluster": clusterName}, err,
			"namespace discovery hit its time limit; a run needs up to 5 access reviews per namespace, "+
				"raise -namespace-discovery-qps or -namespace-discovery-timeout for clusters with many namespaces")
	}

	if status >= http.StatusInternalServerError && !timedOut {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName}, err, "discovering namespaces")
	}

	http.Error(w, http.StatusText(status), status)
}

// isRateLimiterDeadline reports client-go's rate limiter refusing to wait
// because the next request would not fit before the deadline. It gives up
// before the deadline passes and does not wrap context.DeadlineExceeded.
func isRateLimiterDeadline(err error) bool {
	return err != nil && strings.Contains(err.Error(), "would exceed context deadline")
}

func accessibleNamespacesErrorStatus(err error) int {
	var listErr *nsdiscovery.ListError

	switch {
	case errors.As(err, &listErr):
		// Headlamp's service account lacks "list namespaces"; not the user's fault.
		return http.StatusInternalServerError
	case apierrors.IsUnauthorized(err):
		return http.StatusUnauthorized
	case apierrors.IsForbidden(err):
		// The user may not create SelfSubjectAccessReviews.
		return http.StatusForbidden
	case errors.Is(err, context.DeadlineExceeded):
		return http.StatusGatewayTimeout
	default:
		return http.StatusBadGateway
	}
}

func writeAccessibleNamespaces(w http.ResponseWriter, result nsdiscovery.Result) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")

	if err := json.NewEncoder(w).Encode(result); err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding accessible namespaces")
	}
}
