package helm

import (
	"context"
	"encoding/json"
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
	kubefake "helm.sh/helm/v3/pkg/kube/fake"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage"
	"helm.sh/helm/v3/pkg/storage/driver"
	authv1 "k8s.io/api/authentication/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/cli-runtime/pkg/genericclioptions"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/rest"
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

type authRESTGetter struct {
	cfg *rest.Config
}

var _ genericclioptions.RESTClientGetter = (*authRESTGetter)(nil)

func (a *authRESTGetter) ToRESTConfig() (*rest.Config, error) {
	return a.cfg, nil
}

func (a *authRESTGetter) ToDiscoveryClient() (discovery.CachedDiscoveryInterface, error) {
	return nil, nil
}

func (a *authRESTGetter) ToRESTMapper() (meta.RESTMapper, error) {
	return nil, nil
}

func (a *authRESTGetter) ToRawKubeConfigLoader() clientcmd.ClientConfig {
	return nil
}

func newAuthTestServer(t *testing.T, username string) *httptest.Server {
	t.Helper()

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/apis/authentication.k8s.io/v1/selfsubjectreviews" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(&authv1.SelfSubjectReview{
				Status: authv1.SelfSubjectReviewStatus{
					UserInfo: authv1.UserInfo{
						Username: username,
					},
				},
			})

			return
		}
		http.NotFound(w, r)
	}))
}

func TestUninstallRelease_UserVerification(t *testing.T) {
	tests := []struct {
		name          string
		username      string
		expectSuccess bool
	}{
		{
			name:          "anonymous user rejected before uninstall Run",
			username:      "system:anonymous",
			expectSuccess: false,
		},
		{
			name:          "unauthenticated user (empty username) rejected before uninstall Run",
			username:      "",
			expectSuccess: false,
		},
		{
			name:          "authenticated user permitted and uninstalls release",
			username:      "alice",
			expectSuccess: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newAuthTestServer(t, tt.username)
			defer server.Close()

			memDriver := driver.NewMemory()
			storageInst := storage.Init(memDriver)

			rel := &release.Release{
				Name:    "my-release",
				Version: 1,
				Info: &release.Info{
					Status: release.StatusDeployed,
				},
			}
			require.NoError(t, storageInst.Create(rel))

			actionConfig := &action.Configuration{
				RESTClientGetter: &authRESTGetter{
					cfg: &rest.Config{Host: server.URL},
				},
				Releases: storageInst,
				Log:      func(string, ...interface{}) {},
			}

			if tt.expectSuccess {
				actionConfig.KubeClient = &kubefake.PrintingKubeClient{}
			} else {
				// If action.Uninstall.Run() were called, nil KubeClient would panic.
				// Leaving KubeClient nil verifies Run() is never reached when authorization fails.
				actionConfig.KubeClient = nil
			}

			h := &Handler{
				Cache: cache.New[interface{}](),
			}

			req := UninstallReleaseRequest{
				Name:      "my-release",
				Namespace: "default",
			}

			h.uninstallRelease(req, actionConfig)

			stat, err := h.getReleaseStatus("uninstall", "my-release")
			require.NoError(t, err)

			if tt.expectSuccess {
				assert.Equal(t, "success", stat.Status)
				assert.Nil(t, stat.Err)
				// Since uninstall purged the release, it should no longer be found in storage.
				_, err := actionConfig.Releases.Last("my-release")
				assert.ErrorIs(t, err, driver.ErrReleaseNotFound)
			} else {
				assert.Equal(t, "failed", stat.Status)
				require.NotNil(t, stat.Err)
				assert.Equal(t, "user is not authorized to perform this operation", *stat.Err)
				// The release must remain deployed because Run() was not executed.
				currentRel, err := actionConfig.Releases.Last("my-release")
				require.NoError(t, err)
				assert.Equal(t, release.StatusDeployed, currentRel.Info.Status)
			}
		})
	}
}

func TestRollbackRelease_UserVerification(t *testing.T) {
	tests := []struct {
		name          string
		username      string
		expectSuccess bool
	}{
		{
			name:          "anonymous user rejected before rollback Run",
			username:      "system:anonymous",
			expectSuccess: false,
		},
		{
			name:          "unauthenticated user (empty username) rejected before rollback Run",
			username:      "",
			expectSuccess: false,
		},
		{
			name:          "authenticated user permitted and rolls back release",
			username:      "alice",
			expectSuccess: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := newAuthTestServer(t, tt.username)
			defer server.Close()

			memDriver := driver.NewMemory()
			storageInst := storage.Init(memDriver)

			rel1 := &release.Release{
				Name:    "my-release",
				Version: 1,
				Info: &release.Info{
					Status: release.StatusSuperseded,
				},
			}
			rel2 := &release.Release{
				Name:    "my-release",
				Version: 2,
				Info: &release.Info{
					Status: release.StatusDeployed,
				},
			}
			require.NoError(t, storageInst.Create(rel1))
			require.NoError(t, storageInst.Create(rel2))

			actionConfig := &action.Configuration{
				RESTClientGetter: &authRESTGetter{
					cfg: &rest.Config{Host: server.URL},
				},
				Releases: storageInst,
				Log:      func(string, ...interface{}) {},
			}

			if tt.expectSuccess {
				actionConfig.KubeClient = &kubefake.PrintingKubeClient{}
			} else {
				// If action.Rollback.Run() were called, nil KubeClient would panic.
				// Leaving KubeClient nil verifies Run() is never reached when authorization fails.
				actionConfig.KubeClient = nil
			}

			h := &Handler{
				Cache: cache.New[interface{}](),
			}

			req := RollbackReleaseRequest{
				Name:      "my-release",
				Namespace: "default",
				Revision:  1,
			}

			h.rollbackRelease(req, actionConfig)

			stat, err := h.getReleaseStatus("rollback", "my-release")
			require.NoError(t, err)

			history, err := actionConfig.Releases.History("my-release")
			require.NoError(t, err)

			if tt.expectSuccess {
				assert.Equal(t, "success", stat.Status)
				assert.Nil(t, stat.Err)
				// Revision 3 should have been created
				assert.Len(t, history, 3)
				lastRel, err := actionConfig.Releases.Last("my-release")
				require.NoError(t, err)
				assert.Equal(t, 3, lastRel.Version)
			} else {
				assert.Equal(t, "failed", stat.Status)
				require.NotNil(t, stat.Err)
				assert.Equal(t, "user is not authorized to perform this operation", *stat.Err)
				// History must remain untouched (only 2 revisions), Run() was not executed.
				assert.Len(t, history, 2)
				lastRel, err := actionConfig.Releases.Last("my-release")
				require.NoError(t, err)
				assert.Equal(t, 2, lastRel.Version)
				assert.Equal(t, release.StatusDeployed, lastRel.Info.Status)
			}
		})
	}
}
