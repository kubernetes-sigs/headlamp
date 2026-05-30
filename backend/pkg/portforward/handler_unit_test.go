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
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/portforward"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

	portforward.GetPortForwards(ch, w, r)

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

	portforward.GetPortForwards(ch, w, r)

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

	portforward.GetPortForwards(ch, w, r)

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

	portforward.GetPortForwardByID(ch, w, r)

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

	portforward.GetPortForwardByID(ch, w, r)

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

	portforward.GetPortForwardByID(ch, w, r)

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

	portforward.StopOrDeletePortForward(ch, w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusBadRequest, res.StatusCode)
}

func TestStopOrDeletePortForward_MissingID(t *testing.T) {
	t.Parallel()

	ch := cache.New[interface{}]()
	w := httptest.NewRecorder()

	payload := map[string]interface{}{
		"id":           "",
		"stopOrDelete": true,
	}

	jsonPayload, err := json.Marshal(payload)
	require.NoError(t, err)

	body := bytes.NewReader(jsonPayload)
	r := newRequestWithVars(http.MethodDelete, "/portforward", body, map[string]string{
		"clusterName": "test-cluster",
	})

	portforward.StopOrDeletePortForward(ch, w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusBadRequest, res.StatusCode)

	respBody, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	assert.Contains(t, string(respBody), "id is required")
}

func TestStopOrDeletePortForward_NotFoundInCache(t *testing.T) {
	t.Parallel()

	ch := cache.New[interface{}]()
	w := httptest.NewRecorder()

	payload := map[string]interface{}{
		"id":           "does-not-exist",
		"stopOrDelete": true,
	}

	jsonPayload, err := json.Marshal(payload)
	require.NoError(t, err)

	body := bytes.NewReader(jsonPayload)
	r := newRequestWithVars(http.MethodDelete, "/portforward", body, map[string]string{
		"clusterName": "test-cluster",
	})

	portforward.StopOrDeletePortForward(ch, w, r)

	res := w.Result()

	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusInternalServerError, res.StatusCode)

	respBody, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	assert.Contains(t, string(respBody), "failed to delete port forward")
}
