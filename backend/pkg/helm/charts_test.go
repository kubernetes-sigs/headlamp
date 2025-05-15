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
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/helm"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/cli"
)

var settings = cli.New()

func TestListChart(t *testing.T) {
	k8sclient := GetClient(t, "minikube")

	cache := cache.New[interface{}]()
	require.NotNil(t, cache)

	helmHandler, err := helm.NewHandlerWithSettings(k8sclient, cache, "default", settings)
	require.NoError(t, err)

	testAddRepo(t, helmHandler, "headlamp_test_repo", "https://kubernetes-sigs.github.io/headlamp/")

	// list chart request
	listChartsRequest, err := http.NewRequestWithContext(context.Background(),
		"GET", "/clusters/minikube/helm/repositories/charts", nil)
	require.NoError(t, err)

	// response recorder
	rr := httptest.NewRecorder()

	helmHandler.ListCharts(rr, listChartsRequest)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "headlamp_test_repo/headlamp")
	assert.NotContains(t, rr.Body.String(), "non-existing-chart")

	// list chart request with filter
	listChartsRequest, err = http.NewRequestWithContext(context.Background(),
		"GET", "/clusters/minikube/helm/repositories/charts?filter=headlamp", nil)
	require.NoError(t, err)

	// response recorder
	rr = httptest.NewRecorder()

	helmHandler.ListCharts(rr, listChartsRequest)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "headlamp_test_repo/headlamp")
	assert.NotContains(t, rr.Body.String(), "non-existing-chart")
}
