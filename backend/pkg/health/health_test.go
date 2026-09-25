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

package health_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/health"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandlerHealthz(t *testing.T) {
	checker := health.NewChecker()
	handler := checker.HandlerHealthz()

	t.Run("returns 200 OK", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/healthz", nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))

		var resp health.Response
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.Equal(t, "ok", resp.Status)
		assert.Empty(t, resp.Checks)
	})

	t.Run("returns 200 even when shutting down", func(t *testing.T) {
		checker.SetShuttingDown()

		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/healthz", nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestHandlerReadyz(t *testing.T) {
	t.Run("returns 200 when ready", func(t *testing.T) {
		checker := health.NewChecker()
		handler := checker.HandlerReadyz()

		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/readyz", nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))

		var resp health.Response
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.Equal(t, "ok", resp.Status)
		assert.Empty(t, resp.Checks)
	})

	t.Run("returns 503 when shutting down", func(t *testing.T) {
		checker := health.NewChecker()
		checker.SetShuttingDown()

		handler := checker.HandlerReadyz()

		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/readyz", nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusServiceUnavailable, rec.Code)
		assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))

		var resp health.Response
		require.NoError(t, json.NewDecoder(rec.Body).Decode(&resp))
		assert.Equal(t, "error", resp.Status)
		assert.Equal(t, "server is shutting down", resp.Checks["shutdown"])
	})
}

func TestNewChecker(t *testing.T) {
	checker := health.NewChecker()
	require.NotNil(t, checker)
}
