package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/gofrs/flock"
	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

func writeClusterDeletionConfig(t *testing.T, path, contextName, customName string) {
	t.Helper()

	config := api.NewConfig()
	config.Clusters["cluster"] = &api.Cluster{Server: "https://cluster.example.com"}
	config.AuthInfos["user"] = &api.AuthInfo{Token: "test-token"}
	config.Contexts[contextName] = &api.Context{Cluster: "cluster", AuthInfo: "user"}
	config.Contexts["kept"] = &api.Context{Cluster: "cluster", AuthInfo: "user"}
	config.CurrentContext = "kept"

	if customName != "" {
		config.Contexts[contextName].Extensions = map[string]k8sruntime.Object{
			"headlamp_info": &kubeconfig.CustomObject{CustomName: customName},
		}
	}

	require.NoError(t, clientcmd.WriteToFile(*config, path))
}

func readClusterDeletionConfig(t *testing.T, path string) []byte {
	t.Helper()

	data, err := os.ReadFile(path) //nolint:gosec // Only reads kubeconfigs created in t.TempDir.
	require.NoError(t, err)

	return data
}

func newClusterDeletionTestConfig(
	t *testing.T, contextName, customName string, symlink bool,
) (*HeadlampConfig, string, string, string) {
	t.Helper()
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "test-backend-token")

	configPath := filepath.Join(t.TempDir(), "selected")
	outsidePath := filepath.Join(t.TempDir(), "outside")
	writeClusterDeletionConfig(t, configPath, contextName, customName)
	writeClusterDeletionConfig(t, outsidePath, "victim", "")

	if symlink {
		if runtime.GOOS == "windows" {
			t.Skip("creating symlinks requires additional privileges on Windows")
		}

		link := filepath.Join(t.TempDir(), "config")
		require.NoError(t, os.Symlink(configPath, link))
		configPath = link
	}

	contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(configPath, kubeconfig.KubeConfig)
	require.NoError(t, err)
	require.Empty(t, contextErrors)

	store := kubeconfig.NewContextStore()
	for i := range contexts {
		require.NoError(t, store.AddContext(&contexts[i]))
	}

	name := kubeconfig.MakeDNSFriendly(contextName)
	if customName != "" {
		name = customName
	}

	c := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore:        store,
				KubeConfigPath:         outsidePath + string(os.PathListSeparator) + configPath,
				AllowKubeconfigChanges: true,
				EnableDynamicClusters:  true,
			},
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}

	return c, configPath, outsidePath, name
}

func deleteClusterTestRequest(c *HeadlampConfig, name string, query url.Values) *httptest.ResponseRecorder {
	req := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/cluster/test?"+query.Encode(), nil)
	req = mux.SetURLVars(req, map[string]string{"name": name})
	req.Header.Set("X-HEADLAMP_BACKEND-TOKEN", "test-backend-token")

	w := httptest.NewRecorder()
	c.deleteCluster(w, req)

	return w
}

func TestDeleteClusterUsesPersistentOrigin(t *testing.T) {
	tests := []struct {
		name        string
		contextName string
		customName  string
		symlink     bool
	}{
		{name: "ignores attacker-selected file and context", contextName: "selected"},
		{name: "preserves original unsanitized context key", contextName: "team/cluster + dev"},
		{name: "preserves original key after custom rename", contextName: "selected", customName: "display-name"},
		{name: "supports configured symlink", contextName: "selected", symlink: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, configPath, outsidePath, name := newClusterDeletionTestConfig(t, tt.contextName, tt.customName, tt.symlink)
			outsideBefore := readClusterDeletionConfig(t, outsidePath)

			w := deleteClusterTestRequest(c, name, url.Values{
				"removeKubeConfig": {"true"},
				"configPath":       {outsidePath},
				"originalName":     {"victim"},
				"clusterID":        {"untrusted"},
			})

			require.Equal(t, http.StatusOK, w.Code, w.Body.String())
			assert.Equal(t, "application/json", w.Result().Header.Get("Content-Type"))

			_, err := c.KubeConfigStore.GetContext(name)
			require.Error(t, err)

			config, err := clientcmd.LoadFromFile(configPath)
			require.NoError(t, err)
			assert.NotContains(t, config.Contexts, tt.contextName)
			assert.Contains(t, config.Contexts, "kept")
			assert.Contains(t, config.Clusters, "cluster")
			assert.Contains(t, config.AuthInfos, "user")

			outsideAfter := readClusterDeletionConfig(t, outsidePath)
			assert.Equal(t, outsideBefore, outsideAfter)

			if tt.symlink {
				info, err := os.Lstat(configPath)
				require.NoError(t, err)
				assert.NotZero(t, info.Mode()&os.ModeSymlink)
			}
		})
	}
}

//nolint:funlen // Table-driven regression coverage for rejection before file or store mutation.
func TestDeleteClusterRejectsUnauthorizedFileMutation(t *testing.T) {
	tests := []struct {
		name    string
		prepare func(t *testing.T, c *HeadlampConfig, stored *kubeconfig.Context, path string)
		route   string
		status  int
	}{
		{
			name: "kubeconfig changes disabled",
			prepare: func(t *testing.T, c *HeadlampConfig, stored *kubeconfig.Context, path string) {
				c.AllowKubeconfigChanges = false
			},
			status: http.StatusForbidden,
		},
		{
			name: "in-cluster kubeconfig changes disabled",
			prepare: func(t *testing.T, c *HeadlampConfig, stored *kubeconfig.Context, path string) {
				c.UseInCluster = true
				c.AllowKubeconfigChanges = false
			},
			status: http.StatusForbidden,
		},
		{name: "unknown cluster", route: "unknown", status: http.StatusNotFound},
		{
			name: "no persistent file",
			prepare: func(t *testing.T, c *HeadlampConfig, stored *kubeconfig.Context, path string) {
				stored.KubeConfigPath = ""
			},
			status: http.StatusBadRequest,
		},
		{
			name: "no persistent context key",
			prepare: func(t *testing.T, c *HeadlampConfig, stored *kubeconfig.Context, path string) {
				stored.KubeConfigContextName = ""
			},
			status: http.StatusBadRequest,
		},
		{
			name: "persistent file no longer exists",
			prepare: func(t *testing.T, c *HeadlampConfig, stored *kubeconfig.Context, path string) {
				stored.KubeConfigPath = path + ".missing"
			},
			status: http.StatusInternalServerError,
		},
		{
			name: "file update fails",
			prepare: func(t *testing.T, c *HeadlampConfig, stored *kubeconfig.Context, path string) {
				writeClusterDeletionConfig(t, path, "different-context", "")
			},
			status: http.StatusInternalServerError,
		},
		{
			name: "backend token still required",
			prepare: func(t *testing.T, c *HeadlampConfig, stored *kubeconfig.Context, path string) {
				t.Setenv("HEADLAMP_BACKEND_TOKEN", "different-backend-token")
			},
			status: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, configPath, outsidePath, name := newClusterDeletionTestConfig(t, "selected", "", false)
			stored, err := c.KubeConfigStore.GetContext(name)
			require.NoError(t, err)

			if tt.prepare != nil {
				tt.prepare(t, c, stored, configPath)
			}

			before := readClusterDeletionConfig(t, configPath)
			outsideBefore := readClusterDeletionConfig(t, outsidePath)

			route := name
			if tt.route != "" {
				route = tt.route
			}

			w := deleteClusterTestRequest(c, route, url.Values{
				"removeKubeConfig": {"true"},
				"configPath":       {outsidePath},
				"originalName":     {"victim"},
				"clusterID":        {"untrusted"},
			})

			assert.Equal(t, tt.status, w.Code, w.Body.String())
			assert.NotContains(t, w.Body.String(), `"clusters":`)

			_, err = c.KubeConfigStore.GetContext(name)
			require.NoError(t, err)

			after := readClusterDeletionConfig(t, configPath)
			assert.Equal(t, before, after)

			outsideAfter := readClusterDeletionConfig(t, outsidePath)
			assert.Equal(t, outsideBefore, outsideAfter)
		})
	}
}

func TestDeleteClusterWithoutFileMutation(t *testing.T) {
	c, configPath, _, name := newClusterDeletionTestConfig(t, "selected", "", false)
	c.AllowKubeconfigChanges = false
	before := readClusterDeletionConfig(t, configPath)

	w := deleteClusterTestRequest(c, name, nil)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	_, err := c.KubeConfigStore.GetContext(name)
	require.Error(t, err)

	after := readClusterDeletionConfig(t, configPath)
	assert.Equal(t, before, after)
}

//nolint:funlen // Exercise import and rename through the runtime handlers before deletion.
func TestDeleteClusterAfterRuntimeChanges(t *testing.T) {
	tests := []struct {
		name        string
		imported    bool
		renamed     bool
		deleteOther bool
	}{
		{name: "import then delete", imported: true},
		{name: "rename then delete", renamed: true},
		{name: "rename preserves other contexts", renamed: true, deleteOther: true},
		{name: "import then rename then delete", imported: true, renamed: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			originalName := "team/cluster + dev"
			c, configPath, outsidePath, name := newClusterDeletionTestConfig(t, originalName, "", false)
			c.KubeConfigPath = configPath
			source := "kubeconfig"

			if tt.imported {
				c.KubeConfigDir = t.TempDir()
				c.KubeConfigStore = kubeconfig.NewContextStore()
				encoded := base64.StdEncoding.EncodeToString(readClusterDeletionConfig(t, configPath))
				req, err := makeJSONReq(http.MethodPost, "/cluster", ClusterReq{KubeConfig: &encoded})
				require.NoError(t, err)
				req.Header.Set("X-HEADLAMP_BACKEND-TOKEN", "test-backend-token")

				w := httptest.NewRecorder()
				c.addCluster(w, req)
				require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

				configPath = filepath.Join(c.KubeConfigDir, "config")
				source = "dynamic"
			}

			if tt.renamed {
				req, err := makeJSONReq(http.MethodPut, "/cluster/test", RenameClusterRequest{
					NewClusterName: "renamed",
					Source:         source,
				})
				require.NoError(t, err)

				req = mux.SetURLVars(req, map[string]string{"name": name})

				w := httptest.NewRecorder()
				c.renameCluster(w, req)
				require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

				name = "renamed"
			}

			if tt.deleteOther {
				name, originalName = "kept", "kept"
			}

			stored, err := c.KubeConfigStore.GetContext(name)
			require.NoError(t, err)
			assert.Equal(t, configPath, stored.KubeConfigPath)
			assert.Equal(t, originalName, stored.KubeConfigContextName)
			outsideBefore := readClusterDeletionConfig(t, outsidePath)

			w := deleteClusterTestRequest(c, name, url.Values{
				"removeKubeConfig": {"true"},
				"configPath":       {outsidePath},
				"originalName":     {"victim"},
				"clusterID":        {"untrusted"},
			})

			require.Equal(t, http.StatusOK, w.Code, w.Body.String())

			_, err = c.KubeConfigStore.GetContext(name)
			require.Error(t, err)

			persisted, err := clientcmd.LoadFromFile(configPath)
			require.NoError(t, err)
			assert.NotContains(t, persisted.Contexts, originalName)
			assert.Len(t, persisted.Contexts, 1)
			assert.Equal(t, outsideBefore, readClusterDeletionConfig(t, outsidePath))
		})
	}
}

//nolint:funlen // Verify concurrent runtime handlers block on the same symlink-origin lock.
func TestDeleteClusterSerializesWithImportThroughSymlink(t *testing.T) {
	c, configPath, _, name := newClusterDeletionTestConfig(t, "selected", "", true)
	c.KubeConfigDir = filepath.Dir(configPath)

	imported := api.NewConfig()
	imported.Clusters["cluster"] = &api.Cluster{Server: "https://cluster.example.com"}
	imported.AuthInfos["user"] = &api.AuthInfo{Token: "test-token"}
	imported.Contexts["imported"] = &api.Context{Cluster: "cluster", AuthInfo: "user"}
	data, err := clientcmd.Write(*imported)
	require.NoError(t, err)

	encoded := base64.StdEncoding.EncodeToString(data)
	req, err := makeJSONReq(http.MethodPost, "/cluster", ClusterReq{KubeConfig: &encoded})
	require.NoError(t, err)
	req.Header.Set("X-HEADLAMP_BACKEND-TOKEN", "test-backend-token")

	lock := flock.New(configPath + ".lock")
	require.NoError(t, lock.Lock())

	var wg sync.WaitGroup

	results := make(chan error, 2)
	started := make(chan struct{}, 2)

	t.Cleanup(func() {
		assert.NoError(t, lock.Unlock())
		wg.Wait()
	})
	wg.Add(2)

	go func() {
		defer wg.Done()

		started <- struct{}{}

		w := httptest.NewRecorder()
		c.addCluster(w, req)

		if w.Code != http.StatusCreated {
			results <- fmt.Errorf("import returned %d: %s", w.Code, w.Body.String())
			return
		}

		results <- nil
	}()

	go func() {
		defer wg.Done()

		started <- struct{}{}

		w := deleteClusterTestRequest(c, name, url.Values{"removeKubeConfig": {"true"}})

		if w.Code != http.StatusOK {
			results <- fmt.Errorf("delete returned %d: %s", w.Code, w.Body.String())
			return
		}

		results <- nil
	}()

	<-started
	<-started
	assert.Never(t, func() bool { return len(results) > 0 }, 500*time.Millisecond, 10*time.Millisecond,
		"neither mutation may bypass the persistence-origin lock")
	require.NoError(t, lock.Unlock())
	wg.Wait()
	close(results)

	for err := range results {
		require.NoError(t, err)
	}

	persisted, err := clientcmd.LoadFromFile(configPath)
	require.NoError(t, err)
	assert.NotContains(t, persisted.Contexts, "selected")
	assert.Contains(t, persisted.Contexts, "kept")
	assert.Contains(t, persisted.Contexts, "imported")

	info, err := os.Lstat(configPath)
	require.NoError(t, err)
	assert.NotZero(t, info.Mode()&os.ModeSymlink)
}
