package helm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/cli"
)

func TestGetActionStatus_NilErr(t *testing.T) {
	h := &Handler{
		Cache: cache.New[interface{}](),
	}

	// Set a failed status in the cache with a nil Err pointer
	statusVal := stat{
		Status: "failed",
		Err:    nil,
	}
	err := h.Cache.Set(context.Background(), "helm_install_test-release", statusVal)
	require.NoError(t, err)

	url := "/clusters/minikube/helm/releases/status?action=install&name=test-release"
	req, err := http.NewRequestWithContext(context.Background(), "GET", url, nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()

	// GetActionStatus panics if it dereferences a nil pointer.
	// This call should not panic.
	h.GetActionStatus(nil, rr, req)

	assert.Equal(t, http.StatusAccepted, rr.Code)

	// The response should indicate "unknown error"
	assert.Contains(t, rr.Body.String(), "action failed with error: unknown error")
}

func TestGetChart_InvalidType(t *testing.T) {
	h := &Handler{
		Cache:       cache.New[interface{}](),
		EnvSettings: cli.New(),
	}

	// Create a temp directory for the fake chart
	chartDir := t.TempDir()
	chartYaml := filepath.Join(chartDir, "Chart.yaml")

	chartContent := []byte("apiVersion: v2\nname: test-lib\nversion: 1.0.0\ntype: library\n")
	err := os.WriteFile(chartYaml, chartContent, 0o600)
	require.NoError(t, err)

	opts := action.ChartPathOptions{}
	loadedChart, err := h.getChart("install", chartDir, "test-release", opts, false, h.EnvSettings)

	assert.Nil(t, loadedChart)
	require.Error(t, err)
	assert.Equal(t, "chart type \"library\" is not installable", err.Error())

	// Verify that the failed status was logged to the cache
	statusVal, err := h.Cache.Get(context.Background(), "helm_install_test-release")
	require.NoError(t, err)

	statusMap := statusVal.(stat)
	assert.Equal(t, "failed", statusMap.Status)
	assert.NotNil(t, statusMap.Err)
	assert.Contains(t, *statusMap.Err, "chart type \"library\" is not installable")
}
