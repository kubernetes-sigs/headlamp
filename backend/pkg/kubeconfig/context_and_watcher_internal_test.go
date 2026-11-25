/*
Copyright 2025 The Kubernetes Authors.

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

package kubeconfig

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/fsnotify/fsnotify"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

func TestMakeTransportForAndSourceStr(t *testing.T) {
	t.Run("makeTransportFor nil returns error", func(t *testing.T) {
		_, err := makeTransportFor(nil)
		require.ErrorContains(t, err, "cannot be nil")
	})

	t.Run("SourceStr covers all sources", func(t *testing.T) {
		assert.Equal(t, "kubeconfig", (&Context{Source: KubeConfig}).SourceStr())
		assert.Equal(t, "dynamic_cluster", (&Context{Source: DynamicCluster}).SourceStr())
		assert.Equal(t, "incluster", (&Context{Source: InCluster}).SourceStr())
		assert.Equal(t, "cluster_inventory", (&Context{Source: ClusterInventory}).SourceStr())
		assert.Equal(t, "unknown", (&Context{Source: DiscoveredCluster}).SourceStr())
		assert.Equal(t, "unknown", (&Context{Source: 999}).SourceStr())
	})
}

func TestWriteAndRemoveContextFromFile(t *testing.T) {
	dir := t.TempDir()

	cfg1 := clientcmdapi.Config{
		Clusters: map[string]*clientcmdapi.Cluster{
			"shared-cluster": {Server: "https://shared.example.com"},
		},
		AuthInfos: map[string]*clientcmdapi.AuthInfo{
			"shared-user": {Token: "tok1"},
		},
		Contexts: map[string]*clientcmdapi.Context{
			"ctx-1": {Cluster: "shared-cluster", AuthInfo: "shared-user"},
		},
	}

	require.NoError(t, WriteToFile(cfg1, dir))

	// Merge a second context sharing the same cluster and user.
	cfg2 := clientcmdapi.Config{
		Clusters: map[string]*clientcmdapi.Cluster{
			"shared-cluster": {Server: "https://shared.example.com"},
		},
		AuthInfos: map[string]*clientcmdapi.AuthInfo{
			"shared-user": {Token: "tok1"},
		},
		Contexts: map[string]*clientcmdapi.Context{
			"ctx-2": {Cluster: "shared-cluster", AuthInfo: "shared-user"},
		},
	}

	require.NoError(t, WriteToFile(cfg2, dir))

	configFile := filepath.Join(dir, "config")
	loaded, err := clientcmd.LoadFromFile(configFile)
	require.NoError(t, err)
	assert.Len(t, loaded.Contexts, 2)

	// Removing ctx-1 keeps shared-cluster and shared-user because ctx-2 still uses them.
	require.NoError(t, RemoveContextFromFile("ctx-1", configFile))

	loadedAfterFirst, err := clientcmd.LoadFromFile(configFile)
	require.NoError(t, err)
	assert.Contains(t, loadedAfterFirst.Clusters, "shared-cluster")
	assert.Contains(t, loadedAfterFirst.AuthInfos, "shared-user")

	// Removing ctx-2 orphans and removes shared-cluster and shared-user.
	require.NoError(t, RemoveContextFromFile("ctx-2", configFile))

	loadedAfterSecond, err := clientcmd.LoadFromFile(configFile)
	require.NoError(t, err)
	assert.Empty(t, loadedAfterSecond.Clusters)
	assert.Empty(t, loadedAfterSecond.AuthInfos)
}

func TestRemoveContextFromFileErrors(t *testing.T) {
	dir := t.TempDir()
	missingFile := filepath.Join(dir, "does-not-exist")
	require.Error(t, RemoveContextFromFile("ctx-1", missingFile))

	badFile := filepath.Join(dir, "bad-config")
	require.NoError(t, os.WriteFile(badFile, []byte(":::not-yaml:::"), 0o600))
	require.Error(t, RemoveContextFromFile("ctx-1", badFile))

	emptyFile := filepath.Join(dir, "empty-config")
	require.NoError(t, clientcmd.WriteToFile(clientcmdapi.Config{}, emptyFile))
	require.ErrorContains(t, RemoveContextFromFile("missing-ctx", emptyFile), "context not found")
}

func TestInClusterAndSplitHelpers(t *testing.T) {
	t.Run("deriveInClusterContextName handles invalid rest config", func(t *testing.T) {
		assert.Equal(t, "", deriveInClusterContextName(&rest.Config{Host: "://bad-host"}))
	})

	t.Run("splitKubeConfigPath", func(t *testing.T) {
		assert.Equal(t, []string{""}, splitKubeConfigPath(""))
		assert.Equal(t, []string{"/a", "/b"}, splitKubeConfigPath("/a"+string(filepath.ListSeparator)+"/b"))
	})

	t.Run("OidcConfig returns cached or error", func(t *testing.T) {
		cached := &OidcConfig{ClientID: "cid"}
		c1 := &Context{OidcConf: cached}
		got, err := c1.OidcConfig()
		require.NoError(t, err)
		assert.Equal(t, cached, got)

		c2 := &Context{AuthInfo: &clientcmdapi.AuthInfo{}}
		_, err = c2.OidcConfig()
		require.Error(t, err)
	})

	t.Run("LoadContextsFromAPIConfig loads valid and collects errors", func(t *testing.T) {
		cfg := &clientcmdapi.Config{
			Clusters: map[string]*clientcmdapi.Cluster{
				"c1": {Server: "https://example.com"},
			},
			AuthInfos: map[string]*clientcmdapi.AuthInfo{
				"u1": {Token: "tok"},
			},
			Contexts: map[string]*clientcmdapi.Context{
				"good": {Cluster: "c1", AuthInfo: "u1"},
				"bad":  {Cluster: "missing", AuthInfo: "u1"},
			},
		}
		ctxs, errs := LoadContextsFromAPIConfig(cfg, true)
		assert.Len(t, ctxs, 1)
		assert.Len(t, errs, 1)
	})
}

func TestWatcherAddFilesAndSyncContexts(t *testing.T) {
	t.Run("addFilesToWatcher handles relative, missing, and duplicate paths", func(t *testing.T) {
		w, err := fsnotify.NewWatcher()
		require.NoError(t, err)

		defer func() { _ = w.Close() }()

		dir := t.TempDir()
		f := filepath.Join(dir, "config")
		require.NoError(t, os.WriteFile(f, []byte("apiVersion: v1\nkind: Config\n"), 0o600))

		addFilesToWatcher(w, []string{f, f, filepath.Join(dir, "missing")})
		assert.Contains(t, w.WatchList(), f)
	})

	t.Run("syncContexts removes stale KubeConfig contexts and keeps others", func(t *testing.T) {
		store := NewContextStore()
		require.NoError(t, store.AddContext(&Context{
			Name:        "stale-kc",
			Source:      KubeConfig,
			KubeContext: &clientcmdapi.Context{Cluster: "c1"},
			Cluster:     &clientcmdapi.Cluster{Server: "https://example.com"},
		}))
		require.NoError(t, store.AddContext(&Context{
			Name:        "keep-dynamic",
			Source:      DynamicCluster,
			KubeContext: &clientcmdapi.Context{Cluster: "c2"},
			Cluster:     &clientcmdapi.Cluster{Server: "https://example.com"},
		}))

		err := syncContexts(store, filepath.Join(t.TempDir(), "nonexistent"), KubeConfig, nil)
		require.NoError(t, err)

		_, errStale := store.GetContext("stale-kc")
		assert.Error(t, errStale)

		_, errDyn := store.GetContext("keep-dynamic")
		assert.NoError(t, errDyn)
	})

	t.Run("toStringKeyMap and LoadContextsFromFile missing", func(t *testing.T) {
		m := map[interface{}]interface{}{"a": 1, 2: "skip"}
		assert.Equal(t, map[interface{}]interface{}{"a": 1, "2": "skip"}, toStringKeyMap(m))

		_, _, err := LoadContextsFromFile(filepath.Join(t.TempDir(), "absent"), KubeConfig)
		require.Error(t, err)
	})
}

func TestContextURLAndClientSetErrors(t *testing.T) {
	t.Run("UpstreamURL, RESTConfig, and ClientSetWithToken error cases", func(t *testing.T) {
		emptyCtx := &Context{Cluster: &clientcmdapi.Cluster{}}
		_, err := emptyCtx.RESTConfig()
		require.Error(t, err)

		badCtx := &Context{
			Name:        "bad",
			KubeContext: &clientcmdapi.Context{Cluster: "bad"},
			Cluster:     &clientcmdapi.Cluster{Server: "://bad-url"},
		}
		_, err = badCtx.UpstreamURL()
		require.Error(t, err)

		_, err = badCtx.ClientSetWithToken("tok")
		require.Error(t, err)
	})

	t.Run("ClientConfig handles empty and partial Context", func(t *testing.T) {
		assert.Nil(t, (&Context{}).ClientConfig())

		partial := &Context{Name: "p1"}
		cc := partial.ClientConfig()
		require.NotNil(t, cc)

		_, err := cc.RawConfig()
		require.NoError(t, err)
		_, _, err = cc.Namespace()
		require.Error(t, err)
		assert.Nil(t, cc.ConfigAccess())
	})

	t.Run("GetInClusterContext errors outside cluster", func(t *testing.T) {
		t.Setenv("KUBERNETES_SERVICE_HOST", "")
		t.Setenv("KUBERNETES_SERVICE_PORT", "")

		_, err := GetInClusterContext("incluster", "", "", "", "", false, "", "", "", false, false, "")
		require.Error(t, err)
	})
}

func TestContextBindAuthProviderAndApplyAPIProxy(t *testing.T) {
	t.Run("applyAPIProxy returns nil error when no proxy configured and binds authProvider", func(t *testing.T) {
		authProvider := &clientcmdapi.AuthProviderConfig{
			Name:   "oidc",
			Config: map[string]string{"idp-issuer-url": "https://idp.example.com", "client-id": "cid"},
		}
		ctx := &Context{
			Name:        "c1",
			KubeContext: &clientcmdapi.Context{Cluster: "c1", AuthInfo: "u1"},
			Cluster:     &clientcmdapi.Cluster{Server: "https://example.com"},
			AuthInfo: &clientcmdapi.AuthInfo{
				AuthProvider: authProvider,
			},
		}
		rc := &rest.Config{
			Host:         "https://example.com",
			AuthProvider: authProvider,
		}
		require.NoError(t, ctx.bindAuthProvider(rc))
		assert.NotNil(t, rc.WrapTransport)
		assert.Nil(t, rc.AuthProvider)

		out, err := ctx.applyAPIProxy(rc)
		require.NoError(t, err)
		assert.Equal(t, rc, out)
	})
}
