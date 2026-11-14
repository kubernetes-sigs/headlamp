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

func TestGetReleaseHistoryRequest_Validate(t *testing.T) {
	tests := []struct {
		name    string
		req     GetReleaseHistoryRequest
		wantErr bool
	}{
		{
			name: "valid request",
			req: GetReleaseHistoryRequest{
				Name:      "my-release",
				Namespace: "default",
			},
			wantErr: false,
		},
		{
			name: "missing name",
			req: GetReleaseHistoryRequest{
				Namespace: "default",
			},
			wantErr: true,
		},
		{
			name: "missing namespace",
			req: GetReleaseHistoryRequest{
				Name: "my-release",
			},
			wantErr: true,
		},
		{
			name:    "missing both",
			req:     GetReleaseHistoryRequest{},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.req.Validate()
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestGetReleaseHistory_Validation(t *testing.T) {
	h := &Handler{}

	tests := []struct {
		name       string
		url        string
		wantStatus int
	}{
		{
			name:       "missing both name and namespace",
			url:        "/clusters/minikube/helm/releases/history",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing namespace",
			url:        "/clusters/minikube/helm/releases/history?name=my-release",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing name",
			url:        "/clusters/minikube/helm/releases/history?namespace=default",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "empty name and namespace",
			url:        "/clusters/minikube/helm/releases/history?name=&namespace=",
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, tt.url, nil)
			require.NoError(t, err)

			rr := httptest.NewRecorder()
			h.GetReleaseHistory(nil, rr, req)

			assert.Equal(t, tt.wantStatus, rr.Code)
		})
	}
}
