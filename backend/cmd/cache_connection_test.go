package main

import (
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/mux"
	inventorymetadata "github.com/kubernetes-sigs/headlamp/backend/pkg/clusterinventory/metadata"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	authorizationv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/clientcmd/api"
)

func newCacheConnectionServer(
	t *testing.T, pod, token string, before func(*http.Request),
) (*httptest.Server, *atomic.Int32) {
	t.Helper()

	podRequests := &atomic.Int32{}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		allowed := r.Header.Get("Authorization") == "Bearer "+token
		if strings.Contains(r.Header.Get("Accept"), "as=PartialObjectMetadata") {
			if !allowed {
				http.Error(w, "denied", http.StatusForbidden)
				return
			}

			serveMetadataListWatch(w, r, nil)

			return
		}

		if before != nil {
			before(r)
		}

		switch {
		case strings.HasSuffix(r.URL.Path, "/selfsubjectaccessreviews"):
			writeAccessReview(w, allowed)
		case r.URL.Path == "/api/v1/pods":
			if !allowed {
				w.WriteHeader(http.StatusForbidden)
				_, _ = w.Write([]byte(`{"kind":"Status","status":"Failure","reason":"Forbidden"}`))

				return
			}

			podRequests.Add(1)

			_ = json.NewEncoder(w).Encode(corev1.PodList{
				TypeMeta: metav1.TypeMeta{APIVersion: "v1", Kind: "PodList"},
				Items:    []corev1.Pod{{ObjectMeta: metav1.ObjectMeta{Name: pod}}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	return server, podRequests
}

// serveMetadataListWatch answers the metadata list that seeds a shared cache
// watch, then holds a watch open until the client disconnects.
func serveMetadataListWatch(w http.ResponseWriter, r *http.Request, onWatch func()) {
	w.Header().Set("Content-Type", "application/json")

	if r.URL.Query().Get("watch") == "true" {
		if onWatch != nil {
			onWatch()
		}

		w.WriteHeader(http.StatusOK)
		w.(http.Flusher).Flush()
		<-r.Context().Done()

		return
	}

	_, _ = w.Write([]byte(`{"apiVersion":"meta.k8s.io/v1","kind":"PartialObjectMetadataList",` +
		`"metadata":{"resourceVersion":"1"},"items":[]}`))
}

func writeAccessReview(w http.ResponseWriter, allowed bool) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(authorizationv1.SelfSubjectAccessReview{
		TypeMeta: metav1.TypeMeta{APIVersion: "authorization.k8s.io/v1", Kind: "SelfSubjectAccessReview"},
		Status:   authorizationv1.SubjectAccessReviewStatus{Allowed: allowed},
	})
}

func cacheConnectionContext(t *testing.T, server *httptest.Server, source int) *kubeconfig.Context {
	t.Helper()

	kContext := &kubeconfig.Context{
		Name: "cache-switch", ClusterID: "stable-cluster-id", Source: source,
		KubeContext: &api.Context{Cluster: "cache-switch", AuthInfo: "cache-switch"},
		Cluster: &api.Cluster{
			Server: server.URL,
			CertificateAuthorityData: pem.EncodeToMemory(&pem.Block{
				Type: "CERTIFICATE", Bytes: server.Certificate().Raw,
			}),
		},
		AuthInfo: &api.AuthInfo{}, OidcConf: &kubeconfig.OidcConfig{ClientID: "headlamp"},
	}
	require.NoError(t, kContext.SetupProxy())

	return kContext
}

func cacheConnectionRouter(t *testing.T, kContext *kubeconfig.Context) (*HeadlampConfig, *mux.Router) {
	t.Helper()
	resetCacheMiddlewareTestState()
	t.Cleanup(resetCacheMiddlewareTestState)

	cfg := newDrainAuthConfig(t, kContext)
	cfg.CacheEnabled = true
	router := mux.NewRouter()
	handleClusterAPI(cfg, router)

	return cfg, router
}

func cacheConnectionRequest(t *testing.T, router http.Handler, method, token string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequestWithContext(t.Context(), method, "/clusters/cache-switch/api/v1/pods", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)

	return response
}

func TestDiscoveredDrainRejectsChangedConnection(t *testing.T) {
	upstream, requests := newCacheConnectionServer(t, "pod", "user", nil)
	connection := cacheConnectionContext(t, upstream, kubeconfig.ClusterInventory)
	connection.Discovery = &kubeconfig.DiscoveryOrigin{ConnectionRevision: "replacement"}
	_, router := cacheConnectionRouter(t, connection)

	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost,
		"/clusters/cache-switch/drain-node?"+discoveryConnectionRevisionParam+"=original",
		strings.NewReader(`{"cluster":"cache-switch","nodeName":"node-a"}`))
	req.Header.Set("Authorization", "Bearer user")
	req.Header.Set("Content-Type", "application/json")

	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	require.Equal(t, http.StatusConflict, res.Code)
	require.Zero(t, requests.Load())
}

//nolint:funlen // Exercises drain submission and polling across two mock clusters.
func TestDiscoveredDrainKeepsStatusWithItsConnection(t *testing.T) {
	originalStarted := make(chan struct{})
	original, _ := newCacheConnectionServer(t, "pod", "user", func(r *http.Request) {
		if r.URL.Path == "/api/v1/nodes/node-a" {
			close(originalStarted)
			<-r.Context().Done()
		}
	})
	replacement := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/api/v1/nodes/node-a":
			_, _ = w.Write([]byte(`{"kind":"Node","apiVersion":"v1","metadata":{"name":"node-a"}}`))
		case "/api/v1/pods":
			_, _ = w.Write([]byte(`{"kind":"PodList","apiVersion":"v1","items":[]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(replacement.Close)

	originalConnection := cacheConnectionContext(t, original, kubeconfig.ClusterInventory)
	originalConnection.Discovery = &kubeconfig.DiscoveryOrigin{ConnectionRevision: "original"}
	cfg, router := cacheConnectionRouter(t, originalConnection)
	cfg.ServerCtx = t.Context()

	request := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequestWithContext(t.Context(), method, "/clusters/cache-switch"+path,
			strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer user")
		r.Header.Set("Content-Type", "application/json")

		response := httptest.NewRecorder()
		router.ServeHTTP(response, r)

		return response
	}

	const (
		payload    = `{"cluster":"cache-switch","nodeName":"node-a"}`
		statusPath = "/drain-node-status?nodeName=node-a"
	)

	require.Equal(t, http.StatusOK, request(http.MethodPost, "/drain-node", payload).Code)

	select {
	case <-originalStarted:
	case <-time.After(time.Second):
		t.Fatal("original drain did not start")
	}

	originalStatus := request(http.MethodGet, statusPath, "")
	require.Equal(t, http.StatusOK, originalStatus.Code)
	require.Contains(t, originalStatus.Body.String(), drainStatusInProgress)

	replacementConnection := cacheConnectionContext(t, replacement, kubeconfig.ClusterInventory)
	replacementConnection.Discovery = &kubeconfig.DiscoveryOrigin{ConnectionRevision: "replacement"}
	require.NoError(t, cfg.KubeConfigStore.AddContext(replacementConnection))

	require.Equal(t, http.StatusConflict, request(http.MethodGet,
		statusPath+"&"+discoveryConnectionRevisionParam+"=original", "").Code)
	require.Equal(t, http.StatusNotFound, request(http.MethodGet, statusPath, "").Code)

	require.Equal(t, http.StatusOK, request(http.MethodPost, "/drain-node", payload).Code)
	require.Eventually(t, func() bool {
		response := request(http.MethodGet, statusPath+"&"+discoveryConnectionRevisionParam+"=replacement", "")

		return response.Code == http.StatusOK && strings.Contains(response.Body.String(), `"id":"success"`)
	}, time.Second, 10*time.Millisecond)
}

func TestDiscoveredRequestsUseTheExpectedConnection(t *testing.T) {
	first, _ := newCacheConnectionServer(t, "first-pod", "user", func(r *http.Request) {
		assert.False(t, r.URL.Query().Has(discoveryConnectionRevisionParam))
	})
	second, secondRequests := newCacheConnectionServer(t, "second-pod", "user", nil)
	firstContext := cacheConnectionContext(t, first, kubeconfig.ClusterInventory)
	firstContext.Discovery = &kubeconfig.DiscoveryOrigin{ConnectionRevision: "first"}
	secondContext := cacheConnectionContext(t, second, kubeconfig.ClusterInventory)
	secondContext.Discovery = &kubeconfig.DiscoveryOrigin{ConnectionRevision: "second"}
	cfg, router := cacheConnectionRouter(t, firstContext)

	request := func(method string, upgrade bool) *httptest.ResponseRecorder {
		url := "/clusters/cache-switch/api/v1/pods?" + discoveryConnectionRevisionParam + "=first&limit=1"
		req := httptest.NewRequestWithContext(t.Context(), method, url, nil)
		req.Header.Set("Authorization", "Bearer user")

		if upgrade {
			req.Header.Set("Upgrade", "websocket")
		}

		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)

		return response
	}

	before := request(http.MethodGet, false)
	require.Equal(t, http.StatusOK, before.Code, before.Body.String())
	require.Contains(t, before.Body.String(), "first-pod")

	// The browser keeps using its first configuration snapshot while the route changes.
	require.NoError(t, cfg.KubeConfigStore.AddContext(secondContext))

	conflict := request(http.MethodGet, false)
	require.Equal(t, http.StatusConflict, conflict.Code)
	require.Equal(t, "application/json", conflict.Header().Get("Content-Type"))
	require.JSONEq(t, `{"message":"Discovered cluster connection changed"}`, conflict.Body.String())
	require.Equal(t, http.StatusConflict, request(http.MethodGet, true).Code)

	for _, method := range []string{http.MethodPost, http.MethodPatch, http.MethodPut, http.MethodDelete} {
		require.Equal(t, http.StatusConflict, request(method, false).Code)
	}

	require.Zero(t, secondRequests.Load())

	// Clients that omit the revision still see the current upstream.
	unguarded := cacheConnectionRequest(t, router, http.MethodGet, "user")
	require.Equal(t, http.StatusOK, unguarded.Code, unguarded.Body.String())
	require.Contains(t, unguarded.Body.String(), "second-pod")

	require.NoError(t, cfg.KubeConfigStore.AddContext(firstContext))

	after := request(http.MethodGet, false)
	require.Equal(t, http.StatusOK, after.Code, after.Body.String())
	require.Contains(t, after.Body.String(), "first-pod")
}

func TestCacheConnectionReplacement(t *testing.T) {
	for _, source := range []int{kubeconfig.ClusterInventory, kubeconfig.DiscoveredCluster, kubeconfig.KubeConfig} {
		t.Run(fmt.Sprint(source), func(t *testing.T) {
			oldServer, _ := newCacheConnectionServer(t, "old-pod", "old-user", nil)
			newServer, newRequests := newCacheConnectionServer(t, "new-pod", "new-user", nil)
			oldContext := cacheConnectionContext(t, oldServer, source)
			cfg, router := cacheConnectionRouter(t, oldContext)
			setupKubeConfigStoreWatcher(cfg.KubeConfigStore)

			require.Equal(t, http.StatusOK, cacheConnectionRequest(t, router, http.MethodGet, "old-user").Code)
			requireCachedResource(t, router, "/api/v1/pods", "old-user", "")

			newContext := cacheConnectionContext(t, newServer, source)
			require.NoError(t, cfg.KubeConfigStore.AddContext(newContext))

			first := cacheConnectionRequest(t, router, http.MethodGet, "new-user")
			require.Equal(t, http.StatusOK, first.Code, first.Body.String())
			require.Contains(t, first.Body.String(), "new-pod")
			require.NotContains(t, first.Body.String(), "old-pod")
			require.Empty(t, first.Header().Get("X-HEADLAMP-CACHE"))

			denied := cacheConnectionRequest(t, router, http.MethodGet, "old-user")
			require.Equal(t, http.StatusForbidden, denied.Code, denied.Body.String())
			require.NotContains(t, denied.Body.String(), "new-pod")
			requireCachedResource(t, router, "/api/v1/pods", "new-user", "")

			requestsAfterHit := newRequests.Load()

			oldScope, err := k8cache.ContextCacheKey(oldContext.Name, oldContext)
			require.NoError(t, err)
			oldKey, err := k8cache.GenerateKey(&url.URL{Path: "/api/v1/pods"}, oldScope)
			require.NoError(t, err)
			require.Eventually(t, func() bool {
				_, err := k8sResponseCache.Get(t.Context(), oldKey)
				return err != nil
			}, 3*time.Second, 10*time.Millisecond, "context notifications should purge the old connection")
			requireCachedResource(t, router, "/api/v1/pods", "new-user", "")
			require.Equal(t, requestsAfterHit, newRequests.Load())
		})
	}
}

func TestCacheConnectionReplacementDuringRequest(t *testing.T) {
	for _, phase := range []string{"authorization", "response", "mutation"} {
		t.Run(phase, func(t *testing.T) {
			started, release := make(chan struct{}), make(chan struct{})

			var unblock sync.Once
			defer unblock.Do(func() { close(release) })

			oldServer, _ := newCacheConnectionServer(t, "old-pod", "shared-user", func(r *http.Request) {
				block := phase == "authorization" && strings.HasSuffix(r.URL.Path, "/selfsubjectaccessreviews") ||
					phase == "response" && r.URL.Path == "/api/v1/pods" ||
					phase == "mutation" && r.Method == http.MethodPost
				if block {
					close(started)
					<-release
				}
			})
			newServer, newRequests := newCacheConnectionServer(t, "new-pod", "shared-user", nil)
			cfg, router := cacheConnectionRouter(t, cacheConnectionContext(t, oldServer, kubeconfig.ClusterInventory))

			method := http.MethodGet
			if phase == "mutation" {
				method = http.MethodPost
			}

			finished := make(chan *httptest.ResponseRecorder, 1)
			go func() { finished <- cacheConnectionRequest(t, router, method, "shared-user") }()

			select {
			case <-started:
			case <-time.After(5 * time.Second):
				t.Fatal("old request did not reach the synchronization point")
			}

			require.NoError(t, cfg.KubeConfigStore.AddContext(cacheConnectionContext(t, newServer, kubeconfig.ClusterInventory)))
			fresh := cacheConnectionRequest(t, router, http.MethodGet, "shared-user")
			require.Equal(t, http.StatusOK, fresh.Code, fresh.Body.String())
			require.Contains(t, fresh.Body.String(), "new-pod")

			unblock.Do(func() { close(release) })

			select {
			case old := <-finished:
				require.Equal(t, http.StatusOK, old.Code, old.Body.String())
				require.Contains(t, old.Body.String(), "old-pod", "an in-flight request must keep its original connection")
			case <-time.After(5 * time.Second):
				t.Fatal("old request did not finish")
			}

			cached := requireCachedResource(t, router, "/api/v1/pods", "shared-user", "")
			assert.Contains(t, cached.Body.String(), "new-pod")
			assert.NotContains(t, cached.Body.String(), "old-pod")

			requestsAfterHit := newRequests.Load()
			response := cacheConnectionRequest(t, router, http.MethodGet, "shared-user")
			require.Equal(t, "true", response.Header().Get("X-HEADLAMP-CACHE"))
			assert.Equal(t, requestsAfterHit, newRequests.Load())
		})
	}
}

func TestCacheConnectionTLSChange(t *testing.T) {
	server, requests := newCacheConnectionServer(t, "private-pod", "user", nil)
	kContext := cacheConnectionContext(t, server, kubeconfig.ClusterInventory)
	cfg, router := cacheConnectionRouter(t, kContext)
	require.Equal(t, http.StatusOK, cacheConnectionRequest(t, router, http.MethodGet, "user").Code)

	replacement := kContext.Copy()
	replacement.Cluster.TLSServerName = "different-cluster.invalid"
	require.NoError(t, replacement.SetupProxy())
	require.NoError(t, cfg.KubeConfigStore.AddContext(replacement))

	response := cacheConnectionRequest(t, router, http.MethodGet, "user")
	assert.Equal(t, http.StatusBadGateway, response.Code, response.Body.String())
	assert.NotContains(t, response.Body.String(), "private-pod")
	assert.Empty(t, response.Header().Get("X-HEADLAMP-CACHE"))
	assert.EqualValues(t, 1, requests.Load())
}

func TestCacheConnectionMetadataUpdate(t *testing.T) {
	server, requests := newCacheConnectionServer(t, "pod", "user", nil)
	kContext := cacheConnectionContext(t, server, kubeconfig.ClusterInventory)
	cfg, router := cacheConnectionRouter(t, kContext)
	require.Equal(t, http.StatusOK, cacheConnectionRequest(t, router, http.MethodGet, "user").Code)

	requireCachedResource(t, router, "/api/v1/pods", "user", "")
	requests.Store(0)

	replacement := kContext.Copy()
	replacement.ClusterInventory = &inventorymetadata.Metadata{Version: &inventorymetadata.Version{Kubernetes: "v1.35.0"}}
	require.NoError(t, replacement.SetupProxy())
	require.NoError(t, cfg.KubeConfigStore.AddContext(replacement))

	response := cacheConnectionRequest(t, router, http.MethodGet, "user")
	assert.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Equal(t, "true", response.Header().Get("X-HEADLAMP-CACHE"))
	assert.Zero(t, requests.Load())
}

func TestCacheConnectionConfiguredCredentialsChange(t *testing.T) {
	server, _ := newCacheConnectionServer(t, "private-pod", "allowed", nil)
	kContext := cacheConnectionContext(t, server, kubeconfig.KubeConfig)
	kContext.AuthInfo.Token = "allowed"
	require.NoError(t, kContext.SetupProxy())
	cfg, router := cacheConnectionRouter(t, kContext)

	require.Equal(t, http.StatusOK, cacheResourceRequest(t, router, "/api/v1/pods", "", "", "").Code)

	replacement := kContext.Copy()
	replacement.AuthInfo.Token = "denied"
	require.NoError(t, replacement.SetupProxy())
	require.NoError(t, cfg.KubeConfigStore.AddContext(replacement))

	response := cacheResourceRequest(t, router, "/api/v1/pods", "", "", "")
	assert.Equal(t, http.StatusForbidden, response.Code, response.Body.String())
	assert.NotContains(t, response.Body.String(), "private-pod")
}

func TestCacheConnectionIdentityFailureBypassesCache(t *testing.T) {
	resetCacheMiddlewareTestState()
	t.Cleanup(resetCacheMiddlewareTestState)

	kContext := &kubeconfig.Context{
		Name: "cache-switch", Cluster: &api.Cluster{Server: "https://example.com"},
		AuthInfo: &api.AuthInfo{Exec: &api.ExecConfig{
			Config: &runtime.Unknown{Raw: []byte(`{"credential":"secret"`)},
		}},
	}
	_, err := k8cache.ContextCacheKey(kContext.Name, kContext)
	require.Error(t, err)
	require.NotContains(t, err.Error(), "secret")

	cfg := newDrainAuthConfig(t, kContext)
	cfg.CacheEnabled = true

	var forwarded int

	router := mux.NewRouter()
	router.PathPrefix("/clusters/{clusterName}/{api:.*}").Handler(CacheMiddleWare(cfg)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, resolved, err := cfg.getContextWithWebSocketFallback(r, kContext.Name)
			assert.NoError(t, err)
			assert.Same(t, kContext, resolved)

			forwarded++
			_, _ = w.Write([]byte("uncached"))
		}),
	))

	for range 2 {
		response := cacheConnectionRequest(t, router, http.MethodGet, "user")
		assert.Equal(t, http.StatusOK, response.Code)
		assert.Equal(t, "uncached", response.Body.String())
		assert.Empty(t, response.Header().Get("X-HEADLAMP-CACHE"))
	}

	assert.Equal(t, 2, forwarded)
	entries, err := k8sResponseCache.GetAll(t.Context(), nil)
	require.NoError(t, err)
	assert.Empty(t, entries)
}
