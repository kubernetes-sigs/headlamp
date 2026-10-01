package helm

import (
	"context"
	"errors"
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
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage"
	"helm.sh/helm/v3/pkg/storage/driver"
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

func TestReleaseExistence_FailedAndNonDeployedStatus(t *testing.T) {
	memDriver := driver.NewMemory()
	store := storage.Init(memDriver)
	actionConfig := &action.Configuration{
		Releases: store,
	}

	statuses := []release.Status{
		release.StatusFailed,
		release.StatusPendingInstall,
		release.StatusPendingUpgrade,
		release.StatusPendingRollback,
		release.StatusUninstalling,
		release.StatusUninstalled,
		release.StatusSuperseded,
	}

	for _, status := range statuses {
		relName := "rel-" + string(status)
		rel := &release.Release{
			Name:      relName,
			Namespace: "default",
			Version:   1,
			Info: &release.Info{
				Status: status,
			},
		}

		err := store.Create(rel)
		require.NoError(t, err)

		// Releases.Deployed fails on non-deployed statuses
		_, err = actionConfig.Releases.Deployed(relName)
		assert.Error(t, err, "Deployed() should fail for status %s", status)

		// Releases.Last successfully returns the release across all lifecycle statuses
		lastRel, err := actionConfig.Releases.Last(relName)
		require.NoError(t, err, "Last() should succeed for status %s", status)
		assert.Equal(t, relName, lastRel.Name)
		assert.Equal(t, status, lastRel.Info.Status)
	}

	// Truly non-existent release still returns ErrReleaseNotFound
	_, err := actionConfig.Releases.Last("does-not-exist")
	assert.True(t, errors.Is(err, driver.ErrReleaseNotFound))
}
