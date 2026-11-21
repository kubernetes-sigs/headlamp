/*
Copyright 2026 The Kubernetes Authors.

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

package helm //nolint:testpackage // Tests cover unexported helm status handling.

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/action"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

var testScope = actionScope{cluster: "test-cluster", namespace: "default"}

func TestStatusIsScopedByClusterAndNamespace(t *testing.T) {
	h, err := NewHandler(newTestCache())
	require.NoError(t, err)

	nsA := actionScope{cluster: "c1", namespace: "a"}
	nsB := actionScope{cluster: "c1", namespace: "b"}
	otherCluster := actionScope{cluster: "c2", namespace: "a"}

	require.NoError(t, h.setReleaseStatus(nsA, "install", "foo", failed, errors.New("secret detail")))
	require.NoError(t, h.setReleaseStatus(nsB, "install", "foo", success, nil))

	a, err := h.getReleaseStatus(nsA, "install", "foo")
	require.NoError(t, err)
	assert.Equal(t, failed, a.Status)
	require.NotNil(t, a.Err)
	assert.Equal(t, "secret detail", *a.Err)

	b, err := h.getReleaseStatus(nsB, "install", "foo")
	require.NoError(t, err)
	assert.Equal(t, success, b.Status)
	assert.Nil(t, b.Err)

	// Same namespace and release name in another cluster has no status.
	_, err = h.getReleaseStatus(otherCluster, "install", "foo")
	assert.Error(t, err)
}

func TestGetActionStatusStatusCodes(t *testing.T) {
	tests := []struct {
		name       string
		status     string // empty means nothing is cached
		wantStatus int
	}{
		{"processing is accepted", processing, http.StatusAccepted},
		{"success is ok", success, http.StatusOK},
		{"failed is ok", failed, http.StatusOK},
		{"unknown status is not found", "", http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, err := NewHandler(newTestCache())
			require.NoError(t, err)

			if tt.status != "" {
				require.NoError(t, h.setReleaseStatus(
					actionScope{cluster: "c1", namespace: "a"}, "install", "foo", tt.status, nil))
			}

			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
				"/clusters/c1/helm/releases/status?action=install&name=foo&namespace=a", nil)
			req = mux.SetURLVars(req, map[string]string{"clusterName": "c1"})
			rr := httptest.NewRecorder()

			h.GetActionStatus(nil, rr, req)

			assert.Equal(t, tt.wantStatus, rr.Code)
		})
	}
}

func TestGetActionStatusDoesNotCrossNamespaces(t *testing.T) {
	h, err := NewHandler(newTestCache())
	require.NoError(t, err)
	require.NoError(t, h.setReleaseStatus(
		actionScope{cluster: "c1", namespace: "a"}, "install", "foo", failed, errors.New("only for a")))

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
		"/clusters/c1/helm/releases/status?action=install&name=foo&namespace=b", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "c1"})
	rr := httptest.NewRecorder()

	h.GetActionStatus(nil, rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
	assert.NotContains(t, rr.Body.String(), "only for a")
}

func TestInstallReleaseVerifyUserFailureMarksFailed(t *testing.T) {
	h, err := NewHandler(newTestCache())
	require.NoError(t, err)

	// An empty kubeconfig makes VerifyUser fail before any network call.
	actionConfig := &action.Configuration{
		RESTClientGetter: &restConfigGetter{
			clientConfig: clientcmd.NewDefaultClientConfig(clientcmdapi.Config{}, &clientcmd.ConfigOverrides{}),
			namespace:    "a",
		},
	}

	req := InstallRequest{CommonInstallUpdateRequest: CommonInstallUpdateRequest{
		cluster: "c1", Name: "foo", Namespace: "a", Chart: "some/chart",
	}}

	require.NoError(t, h.setReleaseStatus(req.statusScope(), "install", "foo", processing, nil))

	h.installRelease(req, actionConfig)

	got, err := h.getReleaseStatus(req.statusScope(), "install", "foo")
	require.NoError(t, err)
	assert.Equal(t, failed, got.Status)
	require.NotNil(t, got.Err)
	assert.Contains(t, *got.Err, "user verification failed")
}
