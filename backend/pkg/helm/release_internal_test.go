package helm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage"
	"helm.sh/helm/v3/pkg/storage/driver"
)

// TestImpersonationExpired_PastDeadlineRecordsFailedStatus locks in the fix for a gap where
// install/upgrade/uninstall/rollback ran under Headlamp's own service-account-backed,
// impersonating client indefinitely: Kubernetes has no token there to re-verify or expire that
// identity on its own, so nothing else would ever stop such an action from completing under a
// session that had already ended (see impersonationExpired's doc comment).
func TestImpersonationExpired_PastDeadlineRecordsFailedStatus(t *testing.T) {
	h := &Handler{Cache: cache.New[interface{}]()}

	expired := h.impersonationExpired(time.Now().Add(-time.Minute), "install", "test-release")

	assert.True(t, expired)

	statusVal, err := h.Cache.Get(context.Background(), "helm_install_test-release")
	require.NoError(t, err)

	got := statusVal.(stat)
	assert.Equal(t, "failed", got.Status)
	require.NotNil(t, got.Err)
	assert.Contains(t, *got.Err, "authorization expired")
}

func TestImpersonationExpired_FutureDeadlineIsNoop(t *testing.T) {
	h := &Handler{Cache: cache.New[interface{}]()}

	expired := h.impersonationExpired(time.Now().Add(time.Hour), "install", "test-release")

	assert.False(t, expired)

	_, err := h.Cache.Get(context.Background(), "helm_install_test-release")
	assert.Error(t, err, "no status should be recorded while the deadline has not passed yet")
}

func TestImpersonationExpired_ZeroTimeIsNoop(t *testing.T) {
	h := &Handler{Cache: cache.New[interface{}]()}

	expired := h.impersonationExpired(time.Time{}, "install", "test-release")

	assert.False(t, expired, "a zero Time means impersonation does not apply, never a deadline already in the past")
}

func TestImpersonationExpiryFromRequest(t *testing.T) {
	plainReq, err := http.NewRequestWithContext(context.Background(), http.MethodPost, "/", nil)
	require.NoError(t, err)
	assert.True(t, impersonationExpiryFromRequest(plainReq).IsZero(),
		"a request with no impersonation on its context must report no expiry")

	expiry := time.Now().Add(time.Hour)
	impersonatedReq := plainReq.WithContext(
		kubeconfig.ContextWithImpersonation(plainReq.Context(), kubeconfig.Impersonation{Username: "alice", Expiry: expiry}))

	assert.True(t, impersonationExpiryFromRequest(impersonatedReq).Equal(expiry))
}

// TestUninstallRelease_RefusesExpiredImpersonation proves the check is actually wired into the
// action, not only unit-tested in isolation: an already-expired identity must stop uninstallRelease
// before it ever reaches actionConfig.Releases (here backed by an in-memory driver purely to
// prove it is never touched, not a real cluster).
func TestUninstallRelease_RefusesExpiredImpersonation(t *testing.T) {
	h := &Handler{Cache: cache.New[interface{}]()}
	actionConfig := &action.Configuration{Releases: storage.Init(driver.NewMemory())}

	h.uninstallRelease(
		UninstallReleaseRequest{Name: "test-release", Namespace: "default"},
		actionConfig,
		time.Now().Add(-time.Minute),
	)

	statusVal, err := h.Cache.Get(context.Background(), "helm_uninstall_test-release")
	require.NoError(t, err)

	got := statusVal.(stat)
	assert.Equal(t, "failed", got.Status)
	require.NotNil(t, got.Err)
	assert.Contains(t, *got.Err, "authorization expired")
}

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

func TestReleaseExists(t *testing.T) {
	actionConfig := &action.Configuration{Releases: storage.Init(driver.NewMemory())}

	for name, status := range map[string]release.Status{
		"deployed-release":        release.StatusDeployed,
		"failed-release":          release.StatusFailed,
		"pending-upgrade-release": release.StatusPendingUpgrade,
	} {
		require.NoError(t, actionConfig.Releases.Create(&release.Release{
			Name:      name,
			Namespace: "default",
			Version:   1,
			Info:      &release.Info{Status: status},
		}))
	}

	tests := []struct {
		name        string
		releaseName string
		wantErr     error
	}{
		{name: "deployed release", releaseName: "deployed-release"},
		{name: "failed release", releaseName: "failed-release"},
		{name: "pending release", releaseName: "pending-upgrade-release"},
		{name: "missing release", releaseName: "missing-release", wantErr: driver.ErrReleaseNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := releaseExists(actionConfig, tt.releaseName)
			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				return
			}

			assert.NoError(t, err)
		})
	}
}
