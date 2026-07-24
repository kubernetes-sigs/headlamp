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

package pluginmanager_test

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	clientfeatures "k8s.io/client-go/features"
	clientfeaturestesting "k8s.io/client-go/features/testing"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/pluginmanager"
)

const (
	testNamespace = "headlamp"
	testConfigMap = "headlamp-plugin-manager"
	waitTimeout   = 10 * time.Second
	pollInterval  = 50 * time.Millisecond
)

// makeArchive builds a tar.gz with the given entries and returns it with its
// sha256 checksum.
func makeArchive(t *testing.T, entries map[string]string) ([]byte, string) {
	t.Helper()

	var buf bytes.Buffer

	gzWriter := gzip.NewWriter(&buf)
	tarWriter := tar.NewWriter(gzWriter)

	for name, content := range entries {
		require.NoError(t, tarWriter.WriteHeader(&tar.Header{
			Name:     name,
			Typeflag: tar.TypeReg,
			Mode:     0o644,
			Size:     int64(len(content)),
		}))

		_, err := tarWriter.Write([]byte(content))
		require.NoError(t, err)
	}

	require.NoError(t, tarWriter.Close())
	require.NoError(t, gzWriter.Close())

	sum := sha256.Sum256(buf.Bytes())

	return buf.Bytes(), "sha256:" + hex.EncodeToString(sum[:])
}

func makeConfigMap(state string) *corev1.ConfigMap {
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: testConfigMap, Namespace: testNamespace},
		Data:       map[string]string{pluginmanager.StateKey: state},
	}
}

func stateWithPlugin(name, archiveURL, checksum string) string {
	state := pluginmanager.State{
		Plugins: []pluginmanager.DesiredPlugin{
			{Name: name, Version: "1.0.0", ArchiveURL: archiveURL, Checksum: checksum},
		},
	}

	encoded, _ := json.Marshal(state)

	return string(encoded)
}

// newFakeClientset returns a fake clientset whose watches work with the
// reflector, which otherwise expects watch-list bookmark events that the
// fake implementation never sends.
func newFakeClientset(t *testing.T, objects ...runtime.Object) *fake.Clientset {
	t.Helper()
	clientfeaturestesting.SetFeatureDuringTest(t, clientfeatures.WatchListClient, false)

	return fake.NewSimpleClientset(objects...)
}

// startManager runs a manager against a fake clientset holding the given
// state and returns the clientset and manager.
func startManager(t *testing.T, state, pluginsDir string) (*fake.Clientset, *pluginmanager.Manager) {
	t.Helper()

	clientset := newFakeClientset(t, makeConfigMap(state))
	manager := pluginmanager.NewForTest(clientset, testNamespace, testConfigMap, pluginsDir)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	manager.Run(ctx)

	return clientset, manager
}

// startCatalogRouter starts a manager whose state contains one catalog and
// returns a router with the manager routes, ready for requests.
func routerFor(manager *pluginmanager.Manager) *mux.Router {
	router := mux.NewRouter()
	manager.RegisterRoutes(router)

	return router
}

// quoteJSON returns s as a JSON string literal, including the quotes.
func quoteJSON(s string) string {
	encoded, _ := json.Marshal(s)

	return string(encoded)
}

func startCatalogRouter(t *testing.T, catalogJSON string) *mux.Router {
	t.Helper()

	state := fmt.Sprintf(`{"catalogs": [%s]}`, catalogJSON)
	_, manager := startManager(t, state, t.TempDir())

	waitFor(t, "state to be loaded", func() bool {
		loaded, _ := manager.CurrentState()

		return len(loaded.Catalogs) == 1
	})

	return routerFor(manager)
}

func doGet(t *testing.T, router *mux.Router, path string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequestWithContext(context.Background(), http.MethodGet, path, nil)
	router.ServeHTTP(recorder, request)

	return recorder
}

// fileContains reports whether the file exists and contains the substring.
func fileContains(path, substring string) bool {
	content, err := os.ReadFile(path) //nolint:gosec // Test paths are built from t.TempDir().

	return err == nil && bytes.Contains(content, []byte(substring))
}

func waitFor(t *testing.T, message string, condition func() bool) {
	t.Helper()

	deadline := time.Now().Add(waitTimeout)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}

		time.Sleep(pollInterval)
	}

	t.Fatalf("timed out waiting for %s", message)
}

func TestValidatePluginsDir(t *testing.T) {
	assert.Error(t, pluginmanager.ValidatePluginsDir(""))

	dir := t.TempDir()
	require.NoError(t, pluginmanager.ValidatePluginsDir(dir))

	// A fresh subdirectory is created on demand.
	require.NoError(t, pluginmanager.ValidatePluginsDir(filepath.Join(dir, "sub")))

	// A path below a read-only directory must be rejected. Root ignores
	// permission bits, so this scenario only holds for regular users.
	if os.Geteuid() != 0 {
		readOnly := filepath.Join(dir, "ro")
		require.NoError(t, os.Mkdir(readOnly, 0o500))
		assert.Error(t, pluginmanager.ValidatePluginsDir(filepath.Join(readOnly, "plugins")))
	}
}

func TestReconcileInstallsAndRemovesPlugins(t *testing.T) {
	archive, checksum := makeArchive(t, map[string]string{
		"my-plugin/main.js":      "console.log('hi');",
		"my-plugin/package.json": `{"name": "my-plugin", "version": "1.0.0"}`,
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(archive)
	}))

	defer server.Close()

	pluginsDir := t.TempDir()
	clientset, manager := startManager(t,
		stateWithPlugin("my-plugin", server.URL+"/my-plugin.tar.gz", checksum), pluginsDir)

	installedDir := filepath.Join(pluginsDir, "my-plugin")

	waitFor(t, "plugin to be installed", func() bool {
		_, err := os.Stat(filepath.Join(installedDir, "main.js"))

		return err == nil
	})

	_, status := manager.CurrentState()
	assert.Equal(t, pluginmanager.PhaseSynced, status.Plugins["my-plugin"].Phase)

	// An empty desired state must remove the managed plugin again.
	_, err := clientset.CoreV1().ConfigMaps(testNamespace).Update(
		context.Background(), makeConfigMap(`{"plugins": []}`), metav1.UpdateOptions{})
	require.NoError(t, err)

	waitFor(t, "plugin to be removed", func() bool {
		_, err := os.Stat(installedDir)

		return os.IsNotExist(err)
	})
}

func TestReconcileNeverTouchesUnmanagedPlugins(t *testing.T) {
	pluginsDir := t.TempDir()
	unmanagedDir := filepath.Join(pluginsDir, "hand-installed")
	require.NoError(t, os.MkdirAll(unmanagedDir, 0o750))
	require.NoError(t, os.WriteFile(filepath.Join(unmanagedDir, "main.js"), []byte("x"), 0o600))

	_, manager := startManager(t, `{"plugins": []}`, pluginsDir)

	waitFor(t, "a sync to happen", func() bool {
		_, status := manager.CurrentState()

		return status.LastSync != ""
	})

	_, err := os.Stat(filepath.Join(unmanagedDir, "main.js"))
	assert.NoError(t, err, "unmanaged plugin must survive reconciliation")
}

func TestReconcileRefusesToReplaceUnmanagedPlugin(t *testing.T) {
	archive, checksum := makeArchive(t, map[string]string{"p/main.js": "x", "p/package.json": "{}"})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(archive)
	}))

	defer server.Close()

	// A directory with the desired plugin's name, but without a marker file:
	// installed by other means, so the manager must not replace it.
	pluginsDir := t.TempDir()
	unmanagedDir := filepath.Join(pluginsDir, "p")
	require.NoError(t, os.MkdirAll(unmanagedDir, 0o750))
	require.NoError(t, os.WriteFile(filepath.Join(unmanagedDir, "main.js"), []byte("keep"), 0o600))

	_, manager := startManager(t, stateWithPlugin("p", server.URL+"/p.tar.gz", checksum), pluginsDir)

	waitFor(t, "plugin to be reported as failed", func() bool {
		_, status := manager.CurrentState()

		return status.Plugins["p"].Phase == pluginmanager.PhaseError
	})

	_, status := manager.CurrentState()
	assert.Contains(t, status.Plugins["p"].Error, "unmanaged")

	assert.True(t, fileContains(filepath.Join(unmanagedDir, "main.js"), "keep"),
		"unmanaged plugin must survive")
}

func TestReconcileRejectsChecksumMismatch(t *testing.T) {
	archive, _ := makeArchive(t, map[string]string{"p/main.js": "x", "p/package.json": "{}"})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(archive)
	}))

	defer server.Close()

	wrongChecksum := "sha256:" + hex.EncodeToString(bytes.Repeat([]byte{0xab}, 32))
	pluginsDir := t.TempDir()
	_, manager := startManager(t, stateWithPlugin("p", server.URL+"/p.tar.gz", wrongChecksum), pluginsDir)

	waitFor(t, "plugin to be reported as failed", func() bool {
		_, status := manager.CurrentState()

		return status.Plugins["p"].Phase == pluginmanager.PhaseError
	})

	_, status := manager.CurrentState()
	assert.Contains(t, status.Plugins["p"].Error, "checksum mismatch")

	_, err := os.Stat(filepath.Join(pluginsDir, "p"))
	assert.True(t, os.IsNotExist(err))
}

func TestReconcileRejectsPathTraversalArchive(t *testing.T) {
	archive, checksum := makeArchive(t, map[string]string{
		"../escape.js": "evil",
		"p/main.js":    "x",
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(archive)
	}))

	defer server.Close()

	pluginsDir := t.TempDir()
	_, manager := startManager(t, stateWithPlugin("p", server.URL+"/p.tar.gz", checksum), pluginsDir)

	waitFor(t, "plugin to be reported as failed", func() bool {
		_, status := manager.CurrentState()

		return status.Plugins["p"].Phase == pluginmanager.PhaseError
	})

	_, err := os.Stat(filepath.Join(filepath.Dir(pluginsDir), "escape.js"))
	assert.True(t, os.IsNotExist(err), "traversal entry must not be written")
}

func TestReconcileUpdatesPluginOnChecksumChange(t *testing.T) {
	oldArchive, oldChecksum := makeArchive(t, map[string]string{
		"p/main.js":      "console.log('v1');",
		"p/package.json": `{"version": "1.0.0"}`,
	})
	newArchive, newChecksum := makeArchive(t, map[string]string{
		"p/main.js":      "console.log('v2');",
		"p/package.json": `{"version": "2.0.0"}`,
	})

	current := oldArchive
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(current)
	}))

	defer server.Close()

	pluginsDir := t.TempDir()
	clientset, _ := startManager(t, stateWithPlugin("p", server.URL+"/p.tar.gz", oldChecksum), pluginsDir)

	mainJS := filepath.Join(pluginsDir, "p", "main.js")

	waitFor(t, "v1 to be installed", func() bool {
		return fileContains(mainJS, "v1")
	})

	current = newArchive
	_, err := clientset.CoreV1().ConfigMaps(testNamespace).Update(context.Background(),
		makeConfigMap(stateWithPlugin("p", server.URL+"/p.tar.gz", newChecksum)), metav1.UpdateOptions{})
	require.NoError(t, err)

	waitFor(t, "v2 to be installed", func() bool {
		return fileContains(mainJS, "v2")
	})
}

func newIndexCatalogRouter(t *testing.T) *mux.Router {
	t.Helper()

	index := fmt.Sprintf(`{"plugins": [
		{"name": "flux", "displayName": "Flux UI", "description": "GitOps",
		 "version": "2.0.0", "archiveUrl": "https://example.com/flux.tar.gz",
		 "checksum": %q},
		{"name": "trivy", "displayName": "Trivy", "description": "Scanner",
		 "version": "1.2.3", "archiveUrl": "https://example.com/trivy.tar.gz",
		 "checksum": %q}
	]}`, validChecksum, validChecksum)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(index))
	}))
	t.Cleanup(server.Close)

	return startCatalogRouter(t, fmt.Sprintf(
		`{"id": "nexus", "name": "Nexus", "type": "index", "url": %q}`, server.URL+"/index.json"))
}

func TestIndexCatalogSearchFiltersByQuery(t *testing.T) {
	router := newIndexCatalogRouter(t)

	recorder := doGet(t, router, "/plugin-manager/catalogs/nexus/search?q=gitops")
	require.Equal(t, http.StatusOK, recorder.Code)

	var result struct {
		Entries []pluginmanager.CatalogEntry `json:"entries"`
	}

	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &result))
	require.Len(t, result.Entries, 1)
	assert.Equal(t, "flux", result.Entries[0].Name)
}

func TestIndexCatalogSearchPaginates(t *testing.T) {
	index := fmt.Sprintf(`{"plugins": [
		{"name": "a", "version": "1", "archiveUrl": "https://e/a.tgz", "checksum": %q},
		{"name": "b", "version": "1", "archiveUrl": "https://e/b.tgz", "checksum": %q},
		{"name": "c", "version": "1", "archiveUrl": "https://e/c.tgz", "checksum": %q}
	]}`, validChecksum, validChecksum, validChecksum)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(index))
	}))
	t.Cleanup(server.Close)

	router := startCatalogRouter(t, fmt.Sprintf(
		`{"id": "nexus", "name": "Nexus", "type": "index", "url": %q}`, server.URL+"/index.json"))

	type page struct {
		Entries []pluginmanager.CatalogEntry `json:"entries"`
		HasMore bool                         `json:"hasMore"`
	}

	decode := func(query string) page {
		recorder := doGet(t, router, "/plugin-manager/catalogs/nexus/search?"+query)
		require.Equal(t, http.StatusOK, recorder.Code)

		var result page
		require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &result))

		return result
	}

	first := decode("limit=2&offset=0")
	require.Len(t, first.Entries, 2)
	assert.True(t, first.HasMore)

	second := decode("limit=2&offset=2")
	require.Len(t, second.Entries, 1)
	assert.False(t, second.HasMore)

	names := []string{first.Entries[0].Name, first.Entries[1].Name, second.Entries[0].Name}
	assert.Equal(t, []string{"a", "b", "c"}, names)
}

func TestIndexCatalogResolveReturnsArchive(t *testing.T) {
	router := newIndexCatalogRouter(t)

	recorder := doGet(t, router, "/plugin-manager/catalogs/nexus/resolve?name=trivy")
	require.Equal(t, http.StatusOK, recorder.Code)

	var resolved pluginmanager.ResolvedPlugin

	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &resolved))
	assert.Equal(t, "https://example.com/trivy.tar.gz", resolved.ArchiveURL)
	assert.Equal(t, validChecksum, resolved.Checksum)
}

func TestIndexCatalogResolveBeyondSearchPageLimit(t *testing.T) {
	// 70 plugins: more than the search page limit (60), so resolving one of
	// the last entries proves resolve scans the full index.
	plugins := make([]string, 0, 70)
	for i := 0; i < 70; i++ {
		plugins = append(plugins, fmt.Sprintf(
			`{"name": "plugin-%02d", "version": "1.0.0", "archiveUrl": "https://example.com/p%02d.tar.gz", "checksum": %q}`,
			i, i, validChecksum))
	}

	index := `{"plugins": [` + strings.Join(plugins, ",") + `]}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(index))
	}))
	t.Cleanup(server.Close)

	router := startCatalogRouter(t, fmt.Sprintf(
		`{"id": "nexus", "name": "Nexus", "type": "index", "url": %q}`, server.URL+"/index.json"))

	recorder := doGet(t, router, "/plugin-manager/catalogs/nexus/resolve?name=plugin-69")
	require.Equal(t, http.StatusOK, recorder.Code)

	var resolved pluginmanager.ResolvedPlugin

	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &resolved))
	assert.Equal(t, "https://example.com/p69.tar.gz", resolved.ArchiveURL)
}

func TestUnknownCatalogIsNotFound(t *testing.T) {
	router := newIndexCatalogRouter(t)

	recorder := doGet(t, router, "/plugin-manager/catalogs/nope/search")
	assert.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestInfoEndpointReportsState(t *testing.T) {
	router := newIndexCatalogRouter(t)

	recorder := doGet(t, router, "/plugin-manager")
	require.Equal(t, http.StatusOK, recorder.Code)

	var info pluginmanager.InfoResponse

	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &info))
	assert.True(t, info.Enabled)
	assert.Equal(t, testNamespace, info.Namespace)
	assert.Equal(t, testConfigMap, info.ConfigMapName)
	assert.Len(t, info.State.Catalogs, 1)
}

func newArtifactHubRouter(t *testing.T) *mux.Router {
	t.Helper()

	handler := http.NewServeMux()
	handler.HandleFunc("/api/v1/packages/search", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "21", r.URL.Query().Get("kind"))

		_, _ = w.Write([]byte(`{"packages": [{
			"name": "headlamp_kubescape", "normalized_name": "headlamp_kubescape",
			"display_name": "Kubescape", "description": "Scans", "version": "0.11.2",
			"repository": {"name": "kubescape-headlamp-plugin"}
		}]}`))
	})
	handler.HandleFunc("/api/v1/packages/headlamp/kubescape-headlamp-plugin/headlamp_kubescape",
		func(w http.ResponseWriter, _ *http.Request) {
			_, _ = fmt.Fprintf(w, `{
				"name": "headlamp_kubescape", "normalized_name": "headlamp_kubescape", "version": "0.11.2",
				"data": {
					"headlamp/plugin/archive-url": "https://example.com/kubescape.tar.gz",
					"headlamp/plugin/archive-checksum": "SHA256:%s"
				}
			}`, validChecksum[len("sha256:"):])
		})
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	return startCatalogRouter(t, fmt.Sprintf(
		`{"id": "hub", "name": "Hub", "type": "artifacthub", "url": %q}`, server.URL))
}

func TestArtifactHubSearch(t *testing.T) {
	router := newArtifactHubRouter(t)

	recorder := doGet(t, router, "/plugin-manager/catalogs/hub/search?q=kubescape")
	require.Equal(t, http.StatusOK, recorder.Code)

	var result struct {
		Entries []pluginmanager.CatalogEntry `json:"entries"`
	}

	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &result))
	require.Len(t, result.Entries, 1)
	assert.Equal(t, "kubescape-headlamp-plugin", result.Entries[0].RepoName)
}

func TestArtifactHubResolve(t *testing.T) {
	router := newArtifactHubRouter(t)

	recorder := doGet(t, router,
		"/plugin-manager/catalogs/hub/resolve?name=headlamp_kubescape&repoName=kubescape-headlamp-plugin")
	require.Equal(t, http.StatusOK, recorder.Code)

	var resolved pluginmanager.ResolvedPlugin

	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &resolved))
	assert.Equal(t, "https://example.com/kubescape.tar.gz", resolved.ArchiveURL)
	assert.Equal(t, validChecksum, resolved.Checksum)
}
