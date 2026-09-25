package helm

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/chartutil"
	"helm.sh/helm/v3/pkg/cli"
	kubefake "helm.sh/helm/v3/pkg/kube/fake"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage"
	"helm.sh/helm/v3/pkg/storage/driver"
	"k8s.io/client-go/tools/clientcmd"
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

func seedTestRelease(t *testing.T, store *storage.Storage, name string, status release.Status) {
	t.Helper()

	err := store.Create(&release.Release{
		Name:      name,
		Namespace: "default",
		Version:   1,
		Info:      &release.Info{Status: status},
		Chart: &chart.Chart{
			Metadata: &chart.Metadata{
				Name:    "test-chart",
				Version: "0.1.0",
			},
		},
	})
	require.NoError(t, err)
}

func testGetAndHistoryHandlers(t *testing.T, h *Handler, store *storage.Storage, status release.Status) {
	t.Helper()

	statusStr := string(status)

	t.Run("GetRelease_"+statusStr, func(t *testing.T) {
		relName := "handler-get-" + statusStr
		seedTestRelease(t, store, relName, status)

		req, err := http.NewRequestWithContext(context.Background(), "GET",
			"/clusters/test/helm/releases?name="+relName+"&namespace=default", nil)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		h.GetRelease(fakeClientConfig(), rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Contains(t, rr.Body.String(), relName)
	})

	t.Run("GetReleaseHistory_"+statusStr, func(t *testing.T) {
		relName := "handler-history-" + statusStr
		seedTestRelease(t, store, relName, status)

		req, err := http.NewRequestWithContext(context.Background(), "GET",
			"/clusters/test/helm/releases/history?name="+relName+"&namespace=default", nil)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		h.GetReleaseHistory(fakeClientConfig(), rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Contains(t, rr.Body.String(), relName)
	})
}

func testMutationHandlers(t *testing.T, h *Handler, store *storage.Storage, status release.Status) {
	t.Helper()

	statusStr := string(status)

	t.Run("UninstallRelease_"+statusStr, func(t *testing.T) {
		relName := "handler-uninstall-" + statusStr
		seedTestRelease(t, store, relName, status)

		req, err := http.NewRequestWithContext(context.Background(), "DELETE",
			"/clusters/test/helm/releases/uninstall?name="+relName+"&namespace=default", nil)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		h.UninstallRelease(fakeClientConfig(), rr, req)

		assert.Equal(t, http.StatusAccepted, rr.Code)
		assert.Contains(t, rr.Body.String(), "uninstall request accepted")
	})

	t.Run("RollbackRelease_"+statusStr, func(t *testing.T) {
		relName := "handler-rollback-" + statusStr
		seedTestRelease(t, store, relName, status)

		body := fmt.Sprintf(`{"name":%q,"namespace":"default","revision":1}`, relName)
		req, err := http.NewRequestWithContext(context.Background(), "PUT",
			"/clusters/test/helm/releases/rollback", strings.NewReader(body))
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		h.RollbackRelease(fakeClientConfig(), rr, req)

		assert.Equal(t, http.StatusAccepted, rr.Code)
		assert.Contains(t, rr.Body.String(), "rollback request accepted")
	})

	t.Run("UpgradeRelease_"+statusStr, func(t *testing.T) {
		relName := "handler-upgrade-" + statusStr
		seedTestRelease(t, store, relName, status)

		body := fmt.Sprintf(
			`{"name":%q,"namespace":"default","description":"upgrade","chart":"test-chart","version":"0.1.0"}`,
			relName,
		)
		req, err := http.NewRequestWithContext(context.Background(), "PUT",
			"/clusters/test/helm/releases", strings.NewReader(body))
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		h.UpgradeRelease(fakeClientConfig(), rr, req)

		assert.Equal(t, http.StatusAccepted, rr.Code)
		assert.Contains(t, rr.Body.String(), "upgrade request accepted")
	})
}

func testNotFoundQueryHandlers(t *testing.T, h *Handler) {
	t.Helper()

	const missingRel = "missing-release"

	t.Run("GetRelease_NotFound", func(t *testing.T) {
		req, err := http.NewRequestWithContext(context.Background(), "GET",
			"/clusters/test/helm/releases?name="+missingRel+"&namespace=default", nil)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		h.GetRelease(fakeClientConfig(), rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("GetReleaseHistory_NotFound", func(t *testing.T) {
		req, err := http.NewRequestWithContext(context.Background(), "GET",
			"/clusters/test/helm/releases/history?name="+missingRel+"&namespace=default", nil)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		h.GetReleaseHistory(fakeClientConfig(), rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})
}

func testNotFoundMutationHandlers(t *testing.T, h *Handler) {
	t.Helper()

	const missingRel = "missing-release"

	t.Run("UninstallRelease_NotFound", func(t *testing.T) {
		req, err := http.NewRequestWithContext(context.Background(), "DELETE",
			"/clusters/test/helm/releases/uninstall?name="+missingRel+"&namespace=default", nil)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		h.UninstallRelease(fakeClientConfig(), rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("RollbackRelease_NotFound", func(t *testing.T) {
		body := fmt.Sprintf(`{"name":%q,"namespace":"default","revision":1}`, missingRel)
		req, err := http.NewRequestWithContext(context.Background(), "PUT",
			"/clusters/test/helm/releases/rollback", strings.NewReader(body))
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		h.RollbackRelease(fakeClientConfig(), rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})

	t.Run("UpgradeRelease_NotFound", func(t *testing.T) {
		body := fmt.Sprintf(
			`{"name":%q,"namespace":"default","description":"upgrade","chart":"test-chart","version":"0.1.0"}`,
			missingRel,
		)
		req, err := http.NewRequestWithContext(context.Background(), "PUT",
			"/clusters/test/helm/releases", strings.NewReader(body))
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		h.UpgradeRelease(fakeClientConfig(), rr, req)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})
}

func TestReleaseHandlers_FailedAndNonDeployedStatus(t *testing.T) {
	memDriver := driver.NewMemory()
	store := storage.Init(memDriver)
	actionConfig := &action.Configuration{
		Releases:     store,
		KubeClient:   &kubefake.PrintingKubeClient{Out: io.Discard},
		Capabilities: chartutil.DefaultCapabilities,
		Log:          func(string, ...interface{}) {},
	}

	h := &Handler{
		Cache:       newTestCache(),
		EnvSettings: cli.New(),
		actionConfigFunc: func(clientConfig clientcmd.ClientConfig, namespace string) (*action.Configuration, error) {
			return actionConfig, nil
		},
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
		testGetAndHistoryHandlers(t, h, store, status)
		testMutationHandlers(t, h, store, status)
	}

	testNotFoundQueryHandlers(t, h)
	testNotFoundMutationHandlers(t, h)
}
