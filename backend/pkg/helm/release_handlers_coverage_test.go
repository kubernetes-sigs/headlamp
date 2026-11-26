/*
Copyright 2026 The Kubernetes Authors.

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

package helm //nolint:testpackage // Covers unexported release, chart, and repository error and lifecycle paths.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/chartutil"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/repo"
	"helm.sh/helm/v3/pkg/storage"
	"helm.sh/helm/v3/pkg/storage/driver"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

type failingSetCache struct {
	cache.Cache[interface{}]
	setErr error
}

func (f *failingSetCache) SetWithTTL(_ context.Context, _ string, _ interface{}, _ time.Duration) error {
	return f.setErr
}

func TestGetChart_DependencyUpdateSuccess(t *testing.T) {
	depRepoDir := t.TempDir()
	depChart := &chart.Chart{
		Metadata: &chart.Metadata{
			APIVersion: chart.APIVersionV2,
			Name:       "depchart",
			Version:    "1.0.0",
			Type:       "application",
		},
	}

	_, err := chartutil.Save(depChart, depRepoDir)
	require.NoError(t, err)

	depRepoSrv := httptest.NewServer(http.FileServer(http.Dir(depRepoDir)))
	t.Cleanup(depRepoSrv.Close)

	idx, err := repo.IndexDirectory(depRepoDir, depRepoSrv.URL)
	require.NoError(t, err)
	idx.SortEntries()
	require.NoError(t, idx.WriteFile(filepath.Join(depRepoDir, "index.yaml"), 0o600))

	settings := cli.New()
	settings.RepositoryConfig = filepath.Join(t.TempDir(), "repositories.yaml")
	settings.RepositoryCache = t.TempDir()

	repoFile := repo.NewFile()
	repoFile.Update(&repo.Entry{Name: "deprepo", URL: depRepoSrv.URL})
	require.NoError(t, repoFile.WriteFile(settings.RepositoryConfig, 0o600))

	parentDir := t.TempDir()
	chartDir := filepath.Join(parentDir, "parentchart")
	require.NoError(t, os.MkdirAll(chartDir, 0o750))

	chartYAML := "apiVersion: v2\nname: parentchart\nversion: 1.0.0\ntype: application\n" +
		"dependencies:\n  - name: depchart\n    version: \"1.0.0\"\n    repository: \"" + depRepoSrv.URL + "\"\n"
	require.NoError(t, os.WriteFile(filepath.Join(chartDir, "Chart.yaml"), []byte(chartYAML), 0o600))

	h := &Handler{
		EnvSettings: settings,
		Cache:       cache.New[interface{}](),
	}

	loaded, err := h.getChart("install", chartDir, "parent-rel", action.ChartPathOptions{}, true, settings)
	require.NoError(t, err)
	require.NotNil(t, loaded)
	require.NoError(t, action.CheckDependencies(loaded, loaded.Metadata.Dependencies))
	assert.FileExists(t, filepath.Join(chartDir, "Chart.lock"))
	assert.FileExists(t, filepath.Join(chartDir, "charts", "depchart-1.0.0.tgz"))
}

func TestGetChart_DependencyUpdateError(t *testing.T) {
	settings := cli.New()
	settings.RepositoryConfig = filepath.Join(t.TempDir(), "repositories.yaml")
	settings.RepositoryCache = t.TempDir()

	repoFile := repo.NewFile()
	repoFile.Update(&repo.Entry{Name: "baddep", URL: "http://127.0.0.1:1"})
	require.NoError(t, repoFile.WriteFile(settings.RepositoryConfig, 0o600))

	chartDir := t.TempDir()
	chartYAML := "apiVersion: v2\nname: badparent\nversion: 1.0.0\ntype: application\n" +
		"dependencies:\n  - name: missingdep\n    version: \"1.0.0\"\n    repository: \"http://127.0.0.1:1\"\n"
	require.NoError(t, os.WriteFile(filepath.Join(chartDir, "Chart.yaml"), []byte(chartYAML), 0o600))

	h := &Handler{
		EnvSettings: settings,
		Cache:       cache.New[interface{}](),
	}

	loaded, err := h.getChart("install", chartDir, "bad-dep-rel", action.ChartPathOptions{}, true, settings)
	require.Error(t, err)
	assert.Nil(t, loaded)

	st, statusErr := h.getReleaseStatus("install", "bad-dep-rel")
	require.NoError(t, statusErr)
	assert.Equal(t, failed, st.Status)
	require.NotNil(t, st.Err)
}

func TestHandlerStatusCacheFailuresAndCorruptEntries(t *testing.T) {
	t.Run("getReleaseStatus rejects unmarshalable or mismatched cache values", func(t *testing.T) {
		ch := cache.New[interface{}]()
		h := &Handler{Cache: ch}

		require.NoError(t, ch.Set(context.Background(), "helm_install_chan", make(chan int)))

		st, err := h.getReleaseStatus("install", "chan")
		require.Error(t, err)
		assert.Nil(t, st)

		require.NoError(t, ch.Set(context.Background(), "helm_install_badtype", map[string]int{"Status": 123}))

		st, err = h.getReleaseStatus("install", "badtype")
		require.Error(t, err)
		assert.Nil(t, st)
	})

	t.Run("mutation handlers return 500 when setReleaseStatus fails", func(t *testing.T) {
		rel := &release.Release{
			Name:      "existing",
			Namespace: "default",
			Version:   1,
			Chart:     &chart.Chart{Metadata: &chart.Metadata{Name: "demo", Version: "1.0.0"}},
			Info:      &release.Info{Status: release.StatusDeployed},
		}

		srv, _ := newFakeHelmSecretsServer(t, rel, "alice")
		defer srv.Close()

		h := newTestChartRepoHandler(t)
		h.Cache = &failingSetCache{Cache: h.Cache, setErr: errors.New("cache unavailable")}

		// Verify setReleaseStatusSilent logs without panicking.
		h.setReleaseStatusSilent("install", "existing", failed, errors.New("boom"))

		cfg := clientConfigFor(srv.URL)

		rr := httptest.NewRecorder()
		h.UninstallRelease(cfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodDelete,
			"/helm/releases/uninstall?name=existing&namespace=default", nil))
		assert.Equal(t, http.StatusInternalServerError, rr.Code)

		rr = httptest.NewRecorder()
		h.RollbackRelease(cfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodPut,
			"/helm/releases/rollback", strings.NewReader(`{"name":"existing","namespace":"default","revision":1}`)))
		assert.Equal(t, http.StatusInternalServerError, rr.Code)

		rr = httptest.NewRecorder()
		h.InstallRelease(cfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodPost,
			"/helm/release/install", strings.NewReader(
				`{"name":"newrel","namespace":"default","description":"d","chart":"myrepo/demo","version":"1.0.0"}`)))
		assert.Equal(t, http.StatusInternalServerError, rr.Code)

		rr = httptest.NewRecorder()
		h.UpgradeRelease(cfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodPut,
			"/helm/releases/upgrade", strings.NewReader(
				`{"name":"existing","namespace":"default","description":"d","chart":"myrepo/demo","version":"1.0.0"}`)))
		assert.Equal(t, http.StatusInternalServerError, rr.Code)
	})
}

func TestInstallAndUpgradeActionConfigErrors(t *testing.T) {
	badClientCfg := clientcmd.NewDefaultClientConfig(api.Config{}, nil)
	h := newTestChartRepoHandler(t)

	// NewActionConfig initializes lazily; InstallRelease accepts the request and
	// fails asynchronously inside VerifyUser, while UpgradeRelease fails
	// synchronously during releaseExists.
	rr := httptest.NewRecorder()
	h.InstallRelease(badClientCfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodPost,
		"/helm/release/install", strings.NewReader(
			`{"name":"newrel","namespace":"default","description":"d","chart":"myrepo/demo","version":"1.0.0"}`)))
	assert.Equal(t, http.StatusAccepted, rr.Code)

	rr = httptest.NewRecorder()
	h.UpgradeRelease(badClientCfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodPut,
		"/helm/releases/upgrade", strings.NewReader(
			`{"name":"existing","namespace":"default","description":"d","chart":"myrepo/demo","version":"1.0.0"}`)))
	assert.Equal(t, http.StatusInternalServerError, rr.Code)
}

func newNamespaceScopedSecretsServer(
	t *testing.T,
	rel *release.Release,
) (*httptest.Server, func() []string) {
	t.Helper()

	client := k8sfake.NewClientset()
	releases := storage.Init(driver.NewSecrets(client.CoreV1().Secrets(rel.Namespace)))
	require.NoError(t, releases.Create(rel))

	var (
		mu          sync.Mutex
		secretPaths []string
	)

	record := func(path string) {
		mu.Lock()
		defer mu.Unlock()

		secretPaths = append(secretPaths, path)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.URL.Path == "/version":
			_, _ = w.Write([]byte(`{"gitVersion":"v1.34.0"}`))
		case r.URL.Path == "/api":
			_, _ = w.Write([]byte(`{"kind":"APIVersions","versions":["v1"]}`))
		case r.URL.Path == "/api/v1":
			_, _ = w.Write([]byte(`{"kind":"APIResourceList","groupVersion":"v1","resources":[]}`))
		case r.URL.Path == "/apis":
			_, _ = w.Write([]byte(`{"kind":"APIGroupList","groups":[]}`))
		case r.URL.Path == "/api/v1/secrets":
			record(r.URL.Path)

			filtered, err := client.CoreV1().Secrets("").List(r.Context(),
				metav1.ListOptions{LabelSelector: r.URL.Query().Get("labelSelector")})
			writeJSONOrK8sError(w, http.StatusOK, filtered, err)
		case strings.HasPrefix(r.URL.Path, "/api/v1/namespaces/") && strings.HasSuffix(r.URL.Path, "/secrets"):
			record(r.URL.Path)

			ns := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/v1/namespaces/"), "/secrets")
			filtered, err := client.CoreV1().Secrets(ns).List(r.Context(),
				metav1.ListOptions{LabelSelector: r.URL.Query().Get("labelSelector")})
			writeJSONOrK8sError(w, http.StatusOK, filtered, err)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)

	return srv, func() []string {
		mu.Lock()
		defer mu.Unlock()

		return append([]string(nil), secretPaths...)
	}
}

func TestListReleaseAllNamespacesFilter(t *testing.T) {
	rel := &release.Release{
		Name:      "cluster-rel",
		Namespace: "other-ns",
		Version:   1,
		Info:      &release.Info{Status: release.StatusDeployed},
	}

	srv, getSecretPaths := newNamespaceScopedSecretsServer(t, rel)
	h := &Handler{}
	clientCfg := clientConfigFor(srv.URL)

	// Without allNamespaces=true, querying namespace=default excludes the release in other-ns.
	scopedReq := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
		"/helm/releases?namespace=default", nil)
	scopedRR := httptest.NewRecorder()
	h.ListRelease(clientCfg, scopedRR, scopedReq)
	require.Equal(t, http.StatusOK, scopedRR.Code, scopedRR.Body.String())

	var scopedResp ListReleaseResponse
	require.NoError(t, json.Unmarshal(scopedRR.Body.Bytes(), &scopedResp))
	assert.Empty(t, scopedResp.Releases)
	assert.Equal(t, []string{"/api/v1/namespaces/default/secrets"}, getSecretPaths())

	// With allNamespaces=true and namespace=default, the handler queries /api/v1/secrets and returns the release.
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
		"/helm/releases?namespace=default&allNamespaces=true", nil)
	rr := httptest.NewRecorder()
	h.ListRelease(clientCfg, rr, req)
	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

	var resp ListReleaseResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, []string{"/api/v1/namespaces/default/secrets", "/api/v1/secrets"}, getSecretPaths())
	require.Len(t, resp.Releases, 1)
	assert.Equal(t, "cluster-rel", resp.Releases[0].Name)
	assert.Equal(t, "other-ns", resp.Releases[0].Namespace)
}

func TestChartsAndRepositoryEdgeCases(t *testing.T) {
	t.Run("ListCharts returns 500 when cached repo index file is missing", func(t *testing.T) {
		settings := cli.New()
		settings.RepositoryConfig = filepath.Join(t.TempDir(), "repositories.yaml")
		settings.RepositoryCache = t.TempDir()

		f := repo.NewFile()
		f.Update(&repo.Entry{Name: "nocache", URL: "https://charts.example.com"})
		require.NoError(t, f.WriteFile(settings.RepositoryConfig, 0o600))

		h := &Handler{EnvSettings: settings, Cache: cache.New[interface{}]()}
		rr := httptest.NewRecorder()
		h.ListCharts(rr, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/helm/charts", nil))

		assert.Equal(t, http.StatusInternalServerError, rr.Code)
		assert.NotContains(t, rr.Body.String(), `"charts"`)
	})

	t.Run("createFullPath returns error when parent is an existing file", func(t *testing.T) {
		blocker := filepath.Join(t.TempDir(), "not-a-dir")
		require.NoError(t, os.WriteFile(blocker, []byte("x"), 0o600))

		_, err := createFullPath(filepath.Join(blocker, "repositories.yaml"))
		require.Error(t, err)
	})
}
