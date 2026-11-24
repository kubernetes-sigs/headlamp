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

package helm_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/helm"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/repo"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

// noCluster is a client config without a cluster. A request that gets past the chart check
// would fail on it, so a missing check shows up as a wrong status, not as a panic.
func noCluster() clientcmd.ClientConfig {
	return clientcmd.NewDefaultClientConfig(*clientcmdapi.NewConfig(), &clientcmd.ConfigOverrides{})
}

// chartRequest sends an install (POST) or upgrade (PUT) request for the chart and returns
// the recorded response.
func chartRequest(t *testing.T, h *helm.Handler, method, chart string) *httptest.ResponseRecorder {
	t.Helper()

	common := helm.CommonInstallUpdateRequest{
		Name:        "my-release",
		Namespace:   "default",
		Description: "test",
		Chart:       chart,
		Version:     "1.0.0",
	}

	var payload any = helm.InstallRequest{CommonInstallUpdateRequest: common}
	if method == http.MethodPut {
		payload = helm.UpgradeReleaseRequest{CommonInstallUpdateRequest: common}
	}

	body, err := json.Marshal(payload)
	require.NoError(t, err)

	req, err := http.NewRequestWithContext(context.Background(), method,
		"/clusters/c/helm/releases", bytes.NewReader(body))
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	if method == http.MethodPut {
		h.UpgradeRelease(noCluster(), rr, req)
	} else {
		h.InstallRelease(noCluster(), rr, req)
	}

	return rr
}

// TestInstallAndUpgradeRejectUnregisteredChartSources checks that install and upgrade only
// accept charts from registered repositories. The requests are rejected before any cluster
// call, so no cluster is needed.
func TestInstallAndUpgradeRejectUnregisteredChartSources(t *testing.T) {
	h := newHelmHandlerWithRepoFile(t, &repo.Entry{Name: "bitnami", URL: "https://charts.bitnami.com/bitnami"})

	rejected := []string{
		"https://attacker.example/chart-1.0.0.tgz",
		"http://169.254.169.254/latest/meta-data",
		"oci://registry.example.com/charts/nginx",
		"/etc/passwd",
		"../chart",
		"unregistered/nginx",
		"nginx",
	}

	for _, method := range []string{http.MethodPost, http.MethodPut} {
		for _, chart := range rejected {
			t.Run(method+" rejects "+chart, func(t *testing.T) {
				rr := chartRequest(t, h, method, chart)

				assert.Equal(t, http.StatusBadRequest, rr.Code)
				assert.Contains(t, rr.Body.String(), "invalid chart reference")
			})
		}
	}
}
