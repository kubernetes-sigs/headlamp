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
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/cli-runtime/pkg/genericclioptions"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// unauthorizedRESTGetter mirrors the staticRESTGetter fake used by TestVerifyUser
// in release_test.go: its empty host makes the whoami check performed by
// VerifyUser fail, simulating an unauthorized/anonymous user.
type unauthorizedRESTGetter struct{}

var _ genericclioptions.RESTClientGetter = (*unauthorizedRESTGetter)(nil)

func (u *unauthorizedRESTGetter) ToRESTConfig() (*rest.Config, error) {
	return &rest.Config{Host: ""}, nil
}

func (u *unauthorizedRESTGetter) ToDiscoveryClient() (discovery.CachedDiscoveryInterface, error) {
	return nil, nil
}

func (u *unauthorizedRESTGetter) ToRESTMapper() (meta.RESTMapper, error) {
	return nil, nil
}

func (u *unauthorizedRESTGetter) ToRawKubeConfigLoader() clientcmd.ClientConfig {
	return nil
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

// TestUpgradeRelease_UnauthorizedUser_DoesNotFetchChart verifies that upgradeRelease
// performs the same VerifyUser authorization check as installRelease, rejecting an
// unauthorized user before getChart is ever invoked.
func TestUpgradeRelease_UnauthorizedUser_DoesNotFetchChart(t *testing.T) {
	h := &Handler{
		Cache:       cache.New[interface{}](),
		EnvSettings: cli.New(),
	}

	// A valid, loadable chart on disk: if getChart were reached, it would
	// succeed, so any observable failure below can only come from code that
	// runs after getChart.
	chartDir := t.TempDir()
	chartYaml := filepath.Join(chartDir, "Chart.yaml")
	chartContent := []byte("apiVersion: v2\nname: test-chart\nversion: 1.0.0\ntype: application\n")
	require.NoError(t, os.WriteFile(chartYaml, chartContent, 0o600))

	// RESTClientGetter with an empty host: the whoami check inside VerifyUser
	// fails against it, simulating an unauthorized/anonymous user.
	actionConfig := &action.Configuration{
		RESTClientGetter: &unauthorizedRESTGetter{},
	}

	req := UpgradeReleaseRequest{
		CommonInstallUpdateRequest: CommonInstallUpdateRequest{
			Name:        "test-upgrade-release",
			Namespace:   "default",
			Description: "upgrade",
			Chart:       chartDir,
			// Invalid base64: if getChart were called and upgradeRelease
			// continued past it, decoding this would fail and record a
			// "failed" status. Its absence proves getChart was never reached.
			Values:  "not-valid-base64!!!",
			Version: "1.0.0",
		},
	}

	h.upgradeRelease(req, actionConfig)

	_, err := h.Cache.Get(context.Background(), "helm_upgrade_test-upgrade-release")
	assert.ErrorIs(t, err, cache.ErrNotFound,
		"no status should be recorded: upgradeRelease must return before getChart or any later step runs")
}
