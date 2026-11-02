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
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/portforward"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	ssarPath    = "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews"
	podPath     = "/api/v1/namespaces/ns/pods/p"
	forwardPath = "/api/v1/namespaces/ns/pods/p/portforward"
)

// writeJSON writes body as a JSON response with the given status code.
func writeJSON(w http.ResponseWriter, code int, body string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_, _ = w.Write([]byte(body))
}

func statusBody(code int, reason string) string {
	return fmt.Sprintf(`{"kind":"Status","apiVersion":"v1","status":"Failure","reason":%q,"message":%q,"code":%d}`,
		reason, reason, code)
}

// TestStartPortForwardStatusCodes checks the HTTP status returned by
// StartPortForward when the pre-flight checks (RBAC and pod lookup) fail.
// It runs against a fake Kubernetes API server, so no cluster is needed.
//
//nolint:funlen // Table-driven test; the table is most of the length.
func TestStartPortForwardStatusCodes(t *testing.T) {
	t.Parallel()

	const allowedSSAR = `{"kind":"SelfSubjectAccessReview","apiVersion":"authorization.k8s.io/v1",` +
		`"status":{"allowed":true}}`

	const deniedSSAR = `{"kind":"SelfSubjectAccessReview","apiVersion":"authorization.k8s.io/v1",` +
		`"status":{"allowed":false,"reason":"no RBAC rule"}}`

	const runningPod = `{"kind":"Pod","apiVersion":"v1","metadata":{"name":"p","namespace":"ns"},` +
		`"status":{"phase":"Running"}}`

	tests := []struct {
		name string
		// ssar and pod are the fake API server's answers (status code, body).
		ssarCode, podCode int
		ssarBody, podBody string
		wantStatus        int
		wantForwardHit    bool
		wantBodyContain   string
	}{
		{
			name:     "allowed and pod exists proceeds to port-forward (not 403/404)",
			ssarCode: http.StatusCreated, ssarBody: allowedSSAR,
			podCode: http.StatusOK, podBody: runningPod,
			// The fake server cannot upgrade to SPDY, so the forward itself fails.
			wantStatus:     http.StatusInternalServerError,
			wantForwardHit: true,
		},
		{
			name:     "denied by RBAC returns 403",
			ssarCode: http.StatusCreated, ssarBody: deniedSSAR,
			podCode: http.StatusOK, podBody: runningPod,
			wantStatus:      http.StatusForbidden,
			wantBodyContain: "no RBAC rule",
		},
		{
			name:     "pod not found returns 404",
			ssarCode: http.StatusCreated, ssarBody: allowedSSAR,
			podCode: http.StatusNotFound, podBody: statusBody(http.StatusNotFound, "NotFound"),
			wantStatus:      http.StatusNotFound,
			wantBodyContain: "ns/p not found",
		},
		{
			name:     "cannot get pod but may port-forward still proceeds",
			ssarCode: http.StatusCreated, ssarBody: allowedSSAR,
			podCode: http.StatusForbidden, podBody: statusBody(http.StatusForbidden, "Forbidden"),
			wantStatus:     http.StatusInternalServerError,
			wantForwardHit: true,
		},
		{
			name:     "generic API error during permission check returns 500",
			ssarCode: http.StatusInternalServerError, ssarBody: statusBody(http.StatusInternalServerError, "InternalError"),
			podCode: http.StatusOK, podBody: runningPod,
			wantStatus: http.StatusInternalServerError,
		},
		{
			name:     "API 401 during permission check is not mapped and stays 500",
			ssarCode: http.StatusUnauthorized, ssarBody: statusBody(http.StatusUnauthorized, "Unauthorized"),
			podCode: http.StatusOK, podBody: runningPod,
			wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var forwardHits atomic.Int32

			apiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case ssarPath:
					writeJSON(w, tt.ssarCode, tt.ssarBody)
				case podPath:
					writeJSON(w, tt.podCode, tt.podBody)
				case forwardPath:
					forwardHits.Add(1)
					writeJSON(w, http.StatusInternalServerError, statusBody(http.StatusInternalServerError, "InternalError"))
				default:
					writeJSON(w, http.StatusNotFound, statusBody(http.StatusNotFound, "NotFound"))
				}
			}))
			defer apiServer.Close()

			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(&kubeconfig.Context{
				Name:        "c",
				KubeContext: &api.Context{Cluster: "c", AuthInfo: "u"},
				Cluster:     &api.Cluster{Server: apiServer.URL},
				AuthInfo:    &api.AuthInfo{Token: "token"},
			}))

			body, err := json.Marshal(map[string]string{"pod": "p", "namespace": "ns", "targetPort": "80"})
			require.NoError(t, err)

			req := httptest.NewRequestWithContext(context.Background(), http.MethodPost,
				"/clusters/c/portforward", bytes.NewReader(body))
			req = mux.SetURLVars(req, map[string]string{"clusterName": "c"})
			rec := httptest.NewRecorder()

			portforward.StartPortForward(store, cache.New[interface{}](), false, "c", rec, req)

			assert.Equal(t, tt.wantStatus, rec.Code, "body: %s", rec.Body.String())
			assert.Equal(t, tt.wantForwardHit, forwardHits.Load() > 0,
				"port-forward request to the API server should only happen when the checks pass")

			if tt.wantBodyContain != "" {
				assert.True(t, strings.Contains(rec.Body.String(), tt.wantBodyContain),
					"body %q should contain %q", rec.Body.String(), tt.wantBodyContain)
			}
		})
	}
}
