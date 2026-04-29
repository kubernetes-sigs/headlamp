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
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHandlePortForwardReadiness tests handlePortForwardReadiness function.
func TestHandlePortForwardReadiness(t *testing.T) {
	c := cache.New[interface{}]()
	logParams := map[string]string{"id": "id"}
	errOut := &bytes.Buffer{}

	t.Run("closed_channel", func(t *testing.T) {
		pfDetails := &portForward{
			ID:        "id",
			Cluster:   "cluster",
			closeChan: make(chan struct{}, 1),
			Status:    RUNNING,
		}
		readyChan := make(chan struct{}, 1)

		forwardErrChan := make(chan error, 1)
		close(forwardErrChan)

		err := handlePortForwardReadiness(c, pfDetails, readyChan, errOut, logParams, forwardErrChan)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "stopped before ready")
		assert.Equal(t, STOPPED, pfDetails.Status)
	})

	t.Run("nil_error", func(t *testing.T) {
		pfDetails := &portForward{
			ID:        "id",
			Cluster:   "cluster",
			closeChan: make(chan struct{}, 1),
			Status:    RUNNING,
		}
		readyChan := make(chan struct{}, 1)

		forwardErrChan := make(chan error, 1)
		forwardErrChan <- nil

		err := handlePortForwardReadiness(c, pfDetails, readyChan, errOut, logParams, forwardErrChan)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "nil error received")
		assert.Equal(t, STOPPED, pfDetails.Status)
	})

	t.Run("actual_error", func(t *testing.T) {
		pfDetails := &portForward{
			ID:        "id",
			Cluster:   "cluster",
			closeChan: make(chan struct{}, 1),
			Status:    RUNNING,
		}
		readyChan := make(chan struct{}, 1)

		forwardErrChan := make(chan error, 1)
		forwardErrChan <- fmt.Errorf("some error")

		err := handlePortForwardReadiness(c, pfDetails, readyChan, errOut, logParams, forwardErrChan)
		assert.Error(t, err)
		assert.Equal(t, "some error", err.Error())
		assert.Equal(t, STOPPED, pfDetails.Status)
	})
}

// TestPortforwardKeyGenerator tests portforwardKeyGenerator function.
func TestPortforwardKeyGenerator(t *testing.T) {
	tests := []struct {
		name string
		p    portForward
		want string
	}{
		{"only_cluster_id", portForward{ID: "id", Cluster: "cluster"}, "PORT_FORWARD_clusterid"},
		{"only_service", portForward{Cluster: "cluster", Service: "service"}, "PORT_FORWARD_clusterservice"},
		{"only_pod", portForward{Cluster: "cluster", Pod: "pod"}, "PORT_FORWARD_clusterpod"},
		{"service_and_pod", portForward{Cluster: "cluster", Service: "service", Pod: "pod"}, "PORT_FORWARD_clusterservice"},
		{"id_and_service", portForward{Cluster: "cluster", ID: "id", Service: "service"}, "PORT_FORWARD_clusterid"},
		{"id_and_pod", portForward{Cluster: "cluster", ID: "id", Pod: "pod"}, "PORT_FORWARD_clusterid"},
		{
			"id_and_service_and_pod",
			portForward{Cluster: "cluster", ID: "id", Service: "service", Pod: "pod"},
			"PORT_FORWARD_clusterid",
		},
	}

	for _, tt := range tests {
		testname := tt.name
		t.Run(testname, func(t *testing.T) {
			key := portforwardKeyGenerator(tt.p)
			assert.Equal(t, tt.want, key)
		})
	}
}

// TestPortforwardStore tests portforwardstore function.
func TestPortforwardStore(t *testing.T) {
	cache := cache.New[interface{}]()
	p := portForward{ID: "id", Cluster: "cluster"}
	portforwardstore(cache, p)

	key := portforwardKeyGenerator(p)

	pFromCache, err := cache.Get(context.Background(), key)
	require.NoError(t, err)
	assert.Equal(t, p, pFromCache.(portForward))
}

// TestGetPortForwardByID tests getPortForwardByID function.
func TestGetPortForwardByID(t *testing.T) {
	cache := cache.New[interface{}]()
	p := portForward{ID: "id", Cluster: "cluster"}
	err := cache.Set(context.Background(), portforwardKeyGenerator(p), p)
	require.NoError(t, err)

	pFromCache, err := getPortForwardByID(cache, "cluster", "id")
	require.NoError(t, err)
	assert.Equal(t, p, pFromCache)

	_, err = getPortForwardByID(cache, "cluster", "id2")
	assert.Error(t, err)

	err = cache.Set(context.Background(), portforwardKeyGenerator(portForward{ID: "id2", Cluster: "cluster"}), "test")
	require.NoError(t, err)

	_, err = getPortForwardByID(cache, "cluster", "id2")
	assert.Error(t, err)
}

// TestStopOrDeletePortForward tests stopOrDeletePortForward function.
func TestStopOrDeletePortForward(t *testing.T) {
	cache := cache.New[interface{}]()
	ch := make(chan struct{}, 1)

	p := portForward{ID: "id", Cluster: "cluster", closeChan: ch}

	err := cache.Set(context.Background(), portforwardKeyGenerator(p), p)
	require.NoError(t, err)

	err = stopOrDeletePortForward(cache, "cluster", "id", true)
	assert.NoError(t, err)

	chanValue := <-ch
	assert.Equal(t, struct{}{}, chanValue)

	pFromCache, err := getPortForwardByID(cache, "cluster", "id")
	require.NoError(t, err)
	assert.NotEqual(t, portForward{}, pFromCache)
	assert.Equal(t, STOPPED, pFromCache.Status)

	err = stopOrDeletePortForward(cache, "cluster", "id", false)
	require.NoError(t, err)

	_, err = cache.Get(context.Background(), portforwardKeyGenerator(p))
	assert.Error(t, err)
}

// TestGetPortForwardList tests getPortForwardList function.
func TestGetPortForwardList(t *testing.T) {
	p1 := portForward{ID: "id1", Cluster: "cluster1"}
	p2 := portForward{ID: "id2", Cluster: "cluster1"}
	p3 := portForward{ID: "id3", Cluster: "cluster2"}

	cache := cache.New[interface{}]()

	err := cache.Set(context.Background(), portforwardKeyGenerator(p1), p1)
	require.NoError(t, err)

	err = cache.Set(context.Background(), portforwardKeyGenerator(p2), p2)
	require.NoError(t, err)

	err = cache.Set(context.Background(), portforwardKeyGenerator(p3), p3)
	require.NoError(t, err)

	pfList := getPortForwardList(cache, "cluster1")
	assert.ElementsMatch(t, []portForward{p1, p2}, pfList)

	pfList = getPortForwardList(cache, "cluster2")

	require.NoError(t, err)
	assert.ElementsMatch(t, []portForward{p3}, pfList)
}

// Test portForwardRequest.Validate() function.
func TestPortForwardRequestValidate(t *testing.T) {
	req := portForwardRequest{}

	err := req.Validate()
	assert.EqualError(t, err, "namespace is required")

	req.Namespace = "namespace"

	err = req.Validate()
	assert.EqualError(t, err, "pod name is required")

	req.Pod = "pod"

	err = req.Validate()
	assert.EqualError(t, err, "targetPort is required")

	req.TargetPort = "targetPort"

	err = req.Validate()
	assert.NoError(t, err)
}

// TestBuildPortForwardURL ensures the upstream port-forward URL preserves the
// kubeconfig server's path prefix (relevant when the cluster is fronted by a
// path-routing reverse proxy such as Warpgate).
func TestBuildPortForwardURL(t *testing.T) {
	tests := []struct {
		name      string
		host      string
		namespace string
		podName   string
		want      string
	}{
		{
			name:      "no path prefix",
			host:      "https://kubernetes.default.svc:443",
			namespace: "default",
			podName:   "my-pod",
			want:      "https://kubernetes.default.svc:443/api/v1/namespaces/default/pods/my-pod/portforward",
		},
		{
			name:      "single segment path prefix",
			host:      "https://example.com/k8s",
			namespace: "default",
			podName:   "my-pod",
			want:      "https://example.com/k8s/api/v1/namespaces/default/pods/my-pod/portforward",
		},
		{
			name:      "trailing slash path prefix",
			host:      "https://example.com/k8s/",
			namespace: "default",
			podName:   "my-pod",
			want:      "https://example.com/k8s/api/v1/namespaces/default/pods/my-pod/portforward",
		},
		{
			name:      "Warpgate-style multi-segment prefix",
			host:      "https://k8s.example.com:443/proxy-routed-cluster",
			namespace: "kube-system",
			podName:   "traefik-69fpr",
			want: "https://k8s.example.com:443/proxy-routed-cluster" +
				"/api/v1/namespaces/kube-system/pods/traefik-69fpr/portforward",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := buildPortForwardURL(tt.host, tt.namespace, tt.podName)
			require.NoError(t, err)
			assert.Equal(t, tt.want, got.String())
		})
	}
}

// TestBuildPortForwardURLInvalidHost ensures an invalid host yields an error.
func TestBuildPortForwardURLInvalidHost(t *testing.T) {
	_, err := buildPortForwardURL("://not a url", "ns", "pod")
	assert.Error(t, err)
}

// TestStopOrDeletePortForwardRequest.Validate() function.
func TestStopOrDeletePortForwardRequestValidate(t *testing.T) {
	req := stopOrDeletePortForwardRequest{}

	err := req.Validate()
	assert.EqualError(t, err, "invalid request, id is required")

	req.ID = "id"

	err = req.Validate()
	assert.NoError(t, err)
}

// TestSafeCloseChan tests safeCloseChan for normal, nil, and double-close scenarios.
func TestSafeCloseChan(t *testing.T) {
	t.Run("normal_close", func(t *testing.T) {
		ch := make(chan struct{})

		// Should close without panic.
		assert.NotPanics(t, func() { safeCloseChan(ch) })

		// Use a non-blocking select to verify the channel is closed immediately,
		// failing fast if safeCloseChan regresses.
		select {
		case _, ok := <-ch:
			assert.False(t, ok, "channel should be closed")
		default:
			t.Fatal("channel should be closed")
		}
	})

	t.Run("nil_channel", func(t *testing.T) {
		// Closing a nil channel should not panic.
		assert.NotPanics(t, func() { safeCloseChan(nil) })
	})

	t.Run("double_close_recovery", func(t *testing.T) {
		ch := make(chan struct{})
		close(ch)

		// Closing an already-closed channel should recover from the panic.
		assert.NotPanics(t, func() { safeCloseChan(ch) })
	})
}

// TestHandlePortForwardError tests that handlePortForwardError correctly sets
// status, error message, persists the state to cache, and closes the channel.
func TestHandlePortForwardError(t *testing.T) {
	c := cache.New[interface{}]()
	ch := make(chan struct{}, 1)

	pfDetails := &portForward{
		ID:        "err-test",
		Cluster:   "cluster",
		Status:    RUNNING,
		closeChan: ch,
	}

	logParams := map[string]string{"id": "err-test"}
	errMsg := "something went wrong"

	err := handlePortForwardError(c, pfDetails, logParams, errMsg)

	assert.Error(t, err)
	assert.Equal(t, errMsg, err.Error())
	assert.Equal(t, STOPPED, pfDetails.Status)
	assert.Equal(t, errMsg, pfDetails.Error)

	// Verify the channel was closed by handlePortForwardError.
	select {
	case _, ok := <-ch:
		assert.False(t, ok, "closeChan should be closed after handlePortForwardError")
	default:
		t.Fatal("closeChan should be closed after handlePortForwardError")
	}

	// Verify the updated state was persisted to the cache.
	key := portforwardKeyGenerator(*pfDetails)
	cached, cacheErr := c.Get(context.Background(), key)
	require.NoError(t, cacheErr)

	cachedPF, ok := cached.(portForward)
	require.True(t, ok)
	assert.Equal(t, STOPPED, cachedPF.Status)
	assert.Equal(t, errMsg, cachedPF.Error)
}

// TestHandlePortForwardSuccess tests that handlePortForwardSuccess correctly
// sets the status to RUNNING, clears the error, and persists to cache.
func TestHandlePortForwardSuccess(t *testing.T) {
	c := cache.New[interface{}]()

	pfDetails := &portForward{
		ID:      "success-test",
		Cluster: "cluster",
		Status:  STOPPED,
		Error:   "previous error",
	}

	logParams := map[string]string{"id": "success-test"}

	handlePortForwardSuccess(c, pfDetails, logParams)

	assert.Equal(t, RUNNING, pfDetails.Status)
	assert.Empty(t, pfDetails.Error)

	// Verify the updated state was persisted to the cache.
	key := portforwardKeyGenerator(*pfDetails)
	cached, cacheErr := c.Get(context.Background(), key)
	require.NoError(t, cacheErr)

	cachedPF, ok := cached.(portForward)
	require.True(t, ok)
	assert.Equal(t, RUNNING, cachedPF.Status)
	assert.Empty(t, cachedPF.Error)
}

// TestGetFreePort tests that getFreePort returns a valid, non-zero port number.
func TestGetFreePort(t *testing.T) {
	port, err := getFreePort()
	require.NoError(t, err)
	assert.Greater(t, port, 0, "port must be positive")
	assert.LessOrEqual(t, port, 65535, "port must be within valid range")
}

// TestGetPortForwardList_UserIDKeyIsolation verifies that the user ID
// changes the cache key prefix, isolating entries between users.
func TestGetPortForwardList_UserIDKeyIsolation(t *testing.T) {
	c := cache.New[interface{}]()

	// Seed a portforward under the base cluster key (no user ID).
	pf := portForward{ID: "pf-1", Cluster: "cluster", Pod: "web", Namespace: "default", Status: RUNNING}
	portforwardstore(c, pf)

	// Query with the base cluster key — should find the entry.
	result := getPortForwardList(c, "cluster")
	assert.Len(t, result, 1)
	assert.Equal(t, "pf-1", result[0].ID)

	// Query with a user-specific key — should NOT find the entry.
	resultWithUser := getPortForwardList(c, "clusteruser123")
	assert.Empty(t, resultWithUser, "user-specific key must not return entries stored under base cluster key")
}

// TestGetPortForwardByID_UserIDKeyIsolation verifies that getPortForwardByID
// uses the correct key when a user ID is part of the cluster name.
func TestGetPortForwardByID_UserIDKeyIsolation(t *testing.T) {
	c := cache.New[interface{}]()

	// Seed a portforward under the base cluster key.
	pf := portForward{ID: "pf-2", Cluster: "cluster", Pod: "api", Namespace: "prod", Status: RUNNING}
	portforwardstore(c, pf)

	// Lookup with the base cluster key — should succeed.
	found, err := getPortForwardByID(c, "cluster", "pf-2")
	require.NoError(t, err)
	assert.Equal(t, "pf-2", found.ID)

	// Lookup with a user-specific key — should fail.
	_, err = getPortForwardByID(c, "clusteruser456", "pf-2")
	assert.Error(t, err, "user-specific key must not find entries stored under base cluster key")
}

// TestGetPortForwardsHandler_UserIDKeyIsolation uses the exported HTTP handler
// to verify that the X-HEADLAMP-USER-ID header causes a different cache lookup.
func TestGetPortForwardsHandler_UserIDKeyIsolation(t *testing.T) {
	c := cache.New[interface{}]()

	// Seed a portforward under the base cluster key.
	pf := portForward{ID: "pf-3", Cluster: "cluster", Pod: "nginx", Namespace: "default", Status: RUNNING}
	portforwardstore(c, pf)

	// Request WITHOUT user ID header — should return the seeded entry.
	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward/list", nil)
	r = mux.SetURLVars(r, map[string]string{"clusterName": "cluster"})

	GetPortForwards(c, w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusOK, res.StatusCode)

	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "pf-3")

	// Request WITH user ID header — should return empty list.
	w2 := httptest.NewRecorder()
	r2 := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward/list", nil)
	r2 = mux.SetURLVars(r2, map[string]string{"clusterName": "cluster"})
	r2.Header.Set("X-HEADLAMP-USER-ID", "user999")

	GetPortForwards(c, w2, r2)

	res2 := w2.Result()

	defer func() { _ = res2.Body.Close() }()

	assert.Equal(t, http.StatusOK, res2.StatusCode)

	body2, err := io.ReadAll(res2.Body)
	require.NoError(t, err)
	assert.Equal(t, "[]\n", string(body2), "user-specific query must not return entries stored under base cluster key")
}

// TestGetPortForwardByIDHandler_UserIDKeyIsolation uses the exported HTTP handler
// to verify that the X-HEADLAMP-USER-ID header causes a different cache lookup.
func TestGetPortForwardByIDHandler_UserIDKeyIsolation(t *testing.T) {
	c := cache.New[interface{}]()

	// Seed a portforward under the base cluster key.
	pf := portForward{ID: "pf-4", Cluster: "cluster", Pod: "redis", Namespace: "cache", Status: RUNNING}
	portforwardstore(c, pf)

	// Request WITHOUT user ID header — should find the entry.
	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward?id=pf-4", nil)
	r = mux.SetURLVars(r, map[string]string{"clusterName": "cluster"})
	r.URL = &url.URL{RawQuery: "id=pf-4"}

	GetPortForwardByID(c, w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusOK, res.StatusCode)

	// Request WITH user ID header — should NOT find it.
	w2 := httptest.NewRecorder()
	r2 := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward?id=pf-4", nil)
	r2 = mux.SetURLVars(r2, map[string]string{"clusterName": "cluster"})
	r2.URL = &url.URL{RawQuery: "id=pf-4"}
	r2.Header.Set("X-HEADLAMP-USER-ID", "user999")

	GetPortForwardByID(c, w2, r2)

	res2 := w2.Result()

	defer func() { _ = res2.Body.Close() }()

	assert.Equal(t, http.StatusNotFound, res2.StatusCode,
		"user-specific lookup must not find entries under base cluster key")
}

// TestStopOrDeletePortForwardHandler_UserIDKeyIsolation verifies that
// StopOrDeletePortForward uses cluster+userID as the cache key.
func TestStopOrDeletePortForwardHandler_UserIDKeyIsolation(t *testing.T) {
	c := cache.New[interface{}]()

	// Seed a portforward under the base cluster key with a closeChan.
	ch := make(chan struct{}, 1)
	pf := portForward{ID: "pf-5", Cluster: "cluster", Pod: "app", Namespace: "ns", Status: RUNNING, closeChan: ch}
	portforwardstore(c, pf)

	// Try to stop with a user ID header — should fail because the key is different.
	payload, err := json.Marshal(map[string]interface{}{"id": "pf-5", "stopOrDelete": true})
	require.NoError(t, err)

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/portforward", bytes.NewReader(payload))
	r = mux.SetURLVars(r, map[string]string{"clusterName": "cluster"})
	r.Header.Set("X-HEADLAMP-USER-ID", "user999")

	StopOrDeletePortForward(c, w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusInternalServerError, res.StatusCode,
		"stop request with user ID must not find entries stored under base cluster key")
}
