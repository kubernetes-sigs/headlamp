package helm

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/cli"
	kubefake "helm.sh/helm/v3/pkg/kube/fake"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage"
	"helm.sh/helm/v3/pkg/storage/driver"
	helmtime "helm.sh/helm/v3/pkg/time"
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

func TestGetActionStatusErrors(t *testing.T) {
	h := &Handler{Cache: cache.New[interface{}]()}
	tests := []struct {
		name       string
		query      string
		wantStatus int
		wantError  string
	}{
		{
			name:       "unknown query parameter",
			query:      "action=install&name=test-release&unexpected=value",
			wantStatus: http.StatusBadRequest,
			wantError:  `invalid path "unexpected"`,
		},
		{
			name:       "missing release name",
			query:      "action=install",
			wantStatus: http.StatusBadRequest,
			wantError:  "'Name' failed on the 'required' tag",
		},
		{
			name:       "missing action",
			query:      "name=test-release",
			wantStatus: http.StatusBadRequest,
			wantError:  "'Action' failed on the 'required' tag",
		},
		{
			name:       "unsupported action",
			query:      "action=delete&name=test-release",
			wantStatus: http.StatusBadRequest,
			wantError:  "invalid action",
		},
		{
			name:       "missing cached status",
			query:      "action=install&name=missing-release",
			wantStatus: http.StatusInternalServerError,
			wantError:  "key not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(context.Background(),
				http.MethodGet, "/helm/releases/status?"+tt.query, nil)
			rr := httptest.NewRecorder()

			h.GetActionStatus(nil, rr, req)

			assert.Equal(t, tt.wantStatus, rr.Code)
			assert.Contains(t, rr.Body.String(), tt.wantError)
		})
	}
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

func newReleaseListActionConfig(t *testing.T) *action.Configuration {
	t.Helper()

	actionConfig := &action.Configuration{
		Releases:   storage.Init(driver.NewMemory()),
		KubeClient: &kubefake.PrintingKubeClient{Out: io.Discard},
	}
	fixtures := []struct {
		name   string
		status release.Status
	}{
		{"alpha", release.StatusDeployed},
		{"bravo", release.StatusFailed},
		{"charlie", release.StatusUninstalled},
		{"delta", release.StatusSuperseded},
		{"echo", release.StatusUninstalling},
		{"foxtrot", release.StatusPendingInstall},
		{"golf", release.StatusPendingUpgrade},
		{"hotel", release.StatusPendingRollback},
	}
	deployedAt := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	for i, fixture := range fixtures {
		require.NoError(t, actionConfig.Releases.Create(&release.Release{
			Name:      fixture.name,
			Namespace: "default",
			Version:   1,
			Info: &release.Info{
				Status:       fixture.status,
				LastDeployed: helmtime.Time{Time: deployedAt.Add(-time.Duration(i) * time.Hour)},
			},
		}))
	}

	return actionConfig
}

func TestGetReleasesDefaults(t *testing.T) {
	actionConfig := newReleaseListActionConfig(t)
	tests := []struct {
		name    string
		request ListReleaseRequest
		want    []string
	}{
		{
			name: "default deployed and failed releases",
			want: []string{"alpha", "bravo"},
		},
		{
			name: "false flags and nonpositive pagination preserve defaults",
			request: ListReleaseRequest{
				All: new(false), Deployed: new(false), Pending: new(false),
				Limit: new(0), Offset: new(-1), Filter: new(""),
			},
			want: []string{"alpha", "bravo"},
		},
		{
			name:    "all overrides individual status flags",
			request: ListReleaseRequest{All: new(true), Deployed: new(true)},
			want:    []string{"alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			releases, err := getReleases(tt.request, actionConfig)
			require.NoError(t, err)

			names := make([]string, 0, len(releases))
			for _, rel := range releases {
				names = append(names, rel.Name)
			}

			assert.Equal(t, tt.want, names)
		})
	}
}

func TestGetReleasesStatusFilters(t *testing.T) {
	actionConfig := newReleaseListActionConfig(t)
	tests := []struct {
		name    string
		request ListReleaseRequest
		want    []string
	}{
		{
			name:    "deployed only",
			request: ListReleaseRequest{Deployed: new(true)},
			want:    []string{"alpha"},
		},
		{
			name:    "failed only",
			request: ListReleaseRequest{Failed: new(true)},
			want:    []string{"bravo"},
		},
		{
			name:    "uninstalled only",
			request: ListReleaseRequest{Uninstalled: new(true)},
			want:    []string{"charlie"},
		},
		{
			name:    "superseded only",
			request: ListReleaseRequest{Superseded: new(true)},
			want:    []string{"delta"},
		},
		{
			name:    "uninstalling only",
			request: ListReleaseRequest{Uninstalling: new(true)},
			want:    []string{"echo"},
		},
		{
			name:    "pending includes install upgrade and rollback",
			request: ListReleaseRequest{Pending: new(true)},
			want:    []string{"foxtrot", "golf", "hotel"},
		},
		{
			name:    "status flags combine",
			request: ListReleaseRequest{Deployed: new(true), Pending: new(true)},
			want:    []string{"alpha", "foxtrot", "golf", "hotel"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			releases, err := getReleases(tt.request, actionConfig)
			require.NoError(t, err)

			names := make([]string, 0, len(releases))
			for _, rel := range releases {
				names = append(names, rel.Name)
			}

			assert.Equal(t, tt.want, names)
		})
	}
}

func TestGetReleasesQueryOptions(t *testing.T) {
	actionConfig := newReleaseListActionConfig(t)
	tests := []struct {
		name    string
		request ListReleaseRequest
		want    []string
	}{
		{
			name:    "release name regular expression",
			request: ListReleaseRequest{Filter: new("^br")},
			want:    []string{"bravo"},
		},
		{
			name:    "no matching releases",
			request: ListReleaseRequest{Filter: new("^missing$")},
			want:    []string{},
		},
		{
			name:    "date sorting precedes pagination",
			request: ListReleaseRequest{ByDate: new(true), Limit: new(1)},
			want:    []string{"bravo"},
		},
		{
			name:    "name sorting with limit and offset",
			request: ListReleaseRequest{All: new(true), Limit: new(2), Offset: new(1)},
			want:    []string{"bravo", "charlie"},
		},
		{
			name:    "offset beyond results",
			request: ListReleaseRequest{Offset: new(10)},
			want:    []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			releases, err := getReleases(tt.request, actionConfig)
			require.NoError(t, err)

			names := make([]string, 0, len(releases))
			for _, rel := range releases {
				names = append(names, rel.Name)
			}

			assert.Equal(t, tt.want, names)
		})
	}
}

func TestGetReleasesInvalidFilter(t *testing.T) {
	actionConfig := newReleaseListActionConfig(t)

	_, err := getReleases(ListReleaseRequest{Filter: new("[")}, actionConfig)
	require.ErrorContains(t, err, "error parsing regexp")
}
