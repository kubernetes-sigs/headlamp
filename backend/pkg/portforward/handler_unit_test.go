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

package portforward_test

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
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/portforward"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

// newRequestWithVars creates an http.Request with gorilla/mux route variables set.
// This is needed because the handlers extract clusterName from mux.Vars(r).
func newRequestWithVars(method, target string, body io.Reader, vars map[string]string) *http.Request {
	req := httptest.NewRequestWithContext(context.Background(), method, target, body)
	req = mux.SetURLVars(req, vars)

	return req
}

// --- GetPortForwards handler tests ---

func TestGetPortForwards_MissingCluster(t *testing.T) {
	t.Parallel()

	ch := cache.New[interface{}]()
	w := httptest.NewRecorder()
	// No clusterName in mux vars — simulates a request without the route parameter.
	r := newRequestWithVars(http.MethodGet, "/portforward/list", nil, map[string]string{})

	portforward.GetPortForwards(ch, "", w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusBadRequest, res.StatusCode)

	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "cluster is required")
}

func TestGetPortForwards_EmptyList(t *testing.T) {
	t.Parallel()

	ch := cache.New[interface{}]()
	w := httptest.NewRecorder()
	r := newRequestWithVars(http.MethodGet, "/portforward/list", nil, map[string]string{
		"clusterName": "test-cluster",
	})

	portforward.GetPortForwards(ch, "test-cluster", w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusOK, res.StatusCode)
	assert.Equal(t, "application/json", res.Header.Get("Content-Type"))

	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)

	// Empty list should return a valid JSON array.
	assert.Equal(t, "[]\n", string(body))
}

func TestGetPortForwards_ContentTypeHeader(t *testing.T) {
	t.Parallel()

	ch := cache.New[interface{}]()
	w := httptest.NewRecorder()
	r := newRequestWithVars(http.MethodGet, "/portforward/list", nil, map[string]string{
		"clusterName": "any-cluster",
	})

	portforward.GetPortForwards(ch, "any-cluster", w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	// Content-Type must be set to application/json for valid responses.
	assert.Equal(t, "application/json", res.Header.Get("Content-Type"))
}

// --- GetPortForwardByID handler tests ---

func TestGetPortForwardByID_MissingCluster(t *testing.T) {
	t.Parallel()

	ch := cache.New[interface{}]()
	w := httptest.NewRecorder()
	r := newRequestWithVars(http.MethodGet, "/portforward?id=abc", nil, map[string]string{})
	r.URL = &url.URL{RawQuery: "id=abc"}

	portforward.GetPortForwardByID(ch, "", w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusBadRequest, res.StatusCode)

	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "cluster is required")
}

func TestGetPortForwardByID_MissingID(t *testing.T) {
	t.Parallel()

	ch := cache.New[interface{}]()
	w := httptest.NewRecorder()
	r := newRequestWithVars(http.MethodGet, "/portforward", nil, map[string]string{
		"clusterName": "test-cluster",
	})
	r.URL = &url.URL{}

	portforward.GetPortForwardByID(ch, "test-cluster", w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusBadRequest, res.StatusCode)

	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "id is required")
}

func TestGetPortForwardByID_NotFound(t *testing.T) {
	t.Parallel()

	ch := cache.New[interface{}]()
	w := httptest.NewRecorder()
	r := newRequestWithVars(http.MethodGet, "/portforward?id=nonexistent", nil, map[string]string{
		"clusterName": "test-cluster",
	})
	r.URL = &url.URL{RawQuery: "id=nonexistent"}

	portforward.GetPortForwardByID(ch, "test-cluster", w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusNotFound, res.StatusCode)

	body, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	assert.Contains(t, string(body), "no portforward running with id")
}

// --- StopOrDeletePortForward handler tests ---

func TestStopOrDeletePortForward_InvalidJSON(t *testing.T) {
	t.Parallel()

	ch := cache.New[interface{}]()
	w := httptest.NewRecorder()

	body := bytes.NewBufferString("{invalid json")
	r := newRequestWithVars(http.MethodDelete, "/portforward", body, map[string]string{
		"clusterName": "test-cluster",
	})

	portforward.StopOrDeletePortForward(ch, "test-cluster", w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusBadRequest, res.StatusCode)
}

func TestStopOrDeletePortForward_ErrorCases(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		id             string
		wantStatusCode int
		wantBody       string
	}{
		{
			name:           "missing id",
			id:             "",
			wantStatusCode: http.StatusBadRequest,
			wantBody:       "id is required",
		},
		{
			name:           "id not found in cache",
			id:             "does-not-exist",
			wantStatusCode: http.StatusNotFound,
			wantBody:       "failed to delete port forward",
		},
	}

	for _, tt := range tests {
		tt := tt

		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			ch := cache.New[interface{}]()
			w := httptest.NewRecorder()

			payload := map[string]interface{}{
				"id":           tt.id,
				"stopOrDelete": true,
			}

			jsonPayload, err := json.Marshal(payload)
			require.NoError(t, err)

			body := bytes.NewReader(jsonPayload)
			r := newRequestWithVars(http.MethodDelete, "/portforward", body, map[string]string{
				"clusterName": "test-cluster",
			})

			portforward.StopOrDeletePortForward(ch, "test-cluster", w, r)

			res := w.Result()

			defer func() { _ = res.Body.Close() }()

			assert.Equal(t, tt.wantStatusCode, res.StatusCode)

			respBody, err := io.ReadAll(res.Body)
			require.NoError(t, err)
			assert.Contains(t, string(respBody), tt.wantBody)
		})
	}
}

func assertPortForwardBadRequest(
	t *testing.T,
	body string,
	wantBody string,
	call func(w *httptest.ResponseRecorder, r *http.Request),
	method string,
) {
	t.Helper()

	w := httptest.NewRecorder()
	r := newRequestWithVars(method, "/portforward", bytes.NewBufferString(body), map[string]string{
		"clusterName": "test-cluster",
	})

	call(w, r)

	res := w.Result()
	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusBadRequest, res.StatusCode)

	respBody, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	assert.Contains(t, string(respBody), wantBody)
}

func TestStartPortForward_InputValidation(t *testing.T) {
	t.Parallel()

	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/apis/authentication.k8s.io/v1/selfsubjectreviews", r.URL.Path)
		assert.Equal(t, "Bearer alice", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		_, err := w.Write([]byte(`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
			`"status":{"userInfo":{"username":"alice","uid":"alice-id"}}}`))
		assert.NoError(t, err)
	}))
	t.Cleanup(upstream.Close)

	oversized := fmt.Sprintf(
		`{"namespace":"default","pod":"my-pod","targetPort":"80","id":"%s"}`,
		bytes.Repeat([]byte("a"), 70<<10),
	)

	tests := []struct {
		name     string
		body     string
		wantBody string
	}{
		{"oversized body", oversized, "http: request body too large"},
		{"trailing JSON", `{"namespace":"default","pod":"my-pod","targetPort":"80"}{}`, "single JSON object"},
		{"bad namespace", `{"namespace":"../kube-system","pod":"my-pod","targetPort":"80"}`, "invalid namespace"},
		{"bad targetPort", `{"namespace":"default","pod":"my-pod","targetPort":"70000"}`, "targetPort must be a valid"},
		{"bad port", `{"namespace":"default","pod":"my-pod","targetPort":"80","port":"0"}`, "port must be a valid"},
		{"bad id", `{"namespace":"default","pod":"my-pod","targetPort":"80","id":"bad/id"}`, "invalid portforward id"},
	}

	for _, tt := range tests {
		tt := tt

		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			ch := cache.New[interface{}]()

			t.Cleanup(func() { assert.NoError(t, ch.Close()) })

			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(&kubeconfig.Context{
				Name: "test-cluster", Source: kubeconfig.KubeConfig,
				Cluster:     &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
				KubeContext: &api.Context{Cluster: "test-cluster", AuthInfo: "alice"},
				AuthInfo:    &api.AuthInfo{Token: "alice"},
			}))

			assertPortForwardBadRequest(t, tt.body, tt.wantBody, func(w *httptest.ResponseRecorder, r *http.Request) {
				portforward.StartPortForward(store, ch, false, "test-cluster", w, r)
			}, http.MethodPost)
		})
	}
}

func TestStopOrDeletePortForward_StrictJSONAndIDValidation(t *testing.T) {
	t.Parallel()

	oversized := `{"id":"` + string(bytes.Repeat([]byte("a"), 70<<10)) + `","stopOrDelete":true}`

	tests := []struct {
		name     string
		body     string
		wantBody string
	}{
		{
			name:     "oversized body",
			body:     oversized,
			wantBody: "http: request body too large",
		},
		{
			name:     "trailing JSON object",
			body:     `{"id":"pf-1","stopOrDelete":true}{"extra":1}`,
			wantBody: "single JSON object",
		},
		{
			name:     "invalid id format",
			body:     `{"id":"../bad","stopOrDelete":true}`,
			wantBody: "must be 1-128 characters matching [A-Za-z0-9._-]",
		},
	}

	for _, tt := range tests {
		tt := tt

		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			ch := cache.New[interface{}]()
			w := httptest.NewRecorder()
			r := newRequestWithVars(http.MethodDelete, "/portforward", bytes.NewBufferString(tt.body), map[string]string{
				"clusterName": "test-cluster",
			})

			portforward.StopOrDeletePortForward(ch, "test-cluster", w, r)

			res := w.Result()
			defer func() { _ = res.Body.Close() }()

			assert.Equal(t, http.StatusBadRequest, res.StatusCode)

			respBody, err := io.ReadAll(res.Body)
			require.NoError(t, err)
			assert.Contains(t, string(respBody), tt.wantBody)
		})
	}
}
