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

package kubeconfig

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestAPIProxyClientConfigAndDiscoveryMetadata(t *testing.T) {
	baseCfg := clientcmd.NewDefaultClientConfig(api.Config{
		Clusters:       map[string]*api.Cluster{"c1": {Server: "https://k8s.example.com"}},
		Contexts:       map[string]*api.Context{"ctx1": {Cluster: "c1", Namespace: "ns1"}},
		CurrentContext: "ctx1",
	}, &clientcmd.ConfigOverrides{})

	kc := &Context{
		Name: "ctx1",
		OidcConf: &OidcConfig{
			APIProxy: &APIProxySettings{URL: "https://proxy.example.com", SkipTLSVerify: true},
		},
	}

	wrapped := &apiProxyClientConfig{base: baseCfg, context: kc}

	raw, err := wrapped.RawConfig()
	require.NoError(t, err)
	assert.Equal(t, "ctx1", raw.CurrentContext)

	ns, overridden, err := wrapped.Namespace()
	require.NoError(t, err)
	assert.Equal(t, "ns1", ns)
	assert.False(t, overridden)
	assert.NotNil(t, wrapped.ConfigAccess())

	rc, err := wrapped.ClientConfig()
	require.NoError(t, err)
	assert.Equal(t, "https://proxy.example.com", rc.Host)
	assert.True(t, rc.Insecure)

	assert.False(t, kc.IsDiscovered())
	kc.Source = DiscoveredCluster
	assert.True(t, kc.IsDiscovered())

	require.NoError(t, kc.SetDiscoveryMetadata(map[string]json.RawMessage{
		"clusterInventory": json.RawMessage(`{"name":"inv-cluster"}`),
		"custom":           json.RawMessage(`"v"`),
	}))
	require.NotNil(t, kc.ClusterInventory)
	assert.Equal(t, `"v"`, string(kc.DiscoveryMetadata["custom"]))

	err = kc.SetDiscoveryMetadata(map[string]json.RawMessage{
		"clusterInventory": json.RawMessage(`{invalid`),
	})
	require.ErrorContains(t, err, "invalid Inventory metadata")
}

func TestRequiresUserAuthenticationAndMakeTransport(t *testing.T) {
	var nilCtx *Context
	assert.False(t, nilCtx.RequiresUserAuthentication())
	assert.False(t, (&Context{}).RequiresUserAuthentication())
	assert.True(t, (&Context{OidcConf: &OidcConfig{ClientID: "cid"}}).RequiresUserAuthentication())
	assert.False(t, (&Context{
		OidcConf: &OidcConfig{ClientID: "cid"},
		AuthInfo: &api.AuthInfo{Token: "tok"},
	}).RequiresUserAuthentication())
	assert.False(t, (&Context{
		AuthInfo: &api.AuthInfo{
			AuthProvider: &api.AuthProviderConfig{
				Name:   "oidc",
				Config: map[string]string{"id-token": "jwt"},
			},
		},
	}).RequiresUserAuthentication())

	_, err := makeTransportFor(nil)
	require.ErrorContains(t, err, "cannot be nil")

	rt, err := makeTransportFor(&rest.Config{Host: "https://k8s.example.com"})
	require.NoError(t, err)
	assert.NotNil(t, rt)
}

func TestInClusterHelpersAndProcessContext(t *testing.T) {
	oidc := newInClusterOidcConfig(
		"cid", "csec", "https://issuer.example.com", "openid,profile",
		true, "CA", "https://proxy.example.com", "PCA", true,
	)
	require.NotNil(t, oidc.CACert)
	assert.Equal(t, "CA", *oidc.CACert)
	require.NotNil(t, oidc.APIProxy)
	assert.Equal(t, "https://proxy.example.com", oidc.APIProxy.URL)
	assert.Equal(t, []string{"openid", "profile"}, oidc.Scopes)

	// Unreachable cluster config returns empty name without panicking.
	assert.Empty(t, deriveInClusterContextName(&rest.Config{Host: "http://127.0.0.1:1"}))

	rawKubeconfig := map[string]interface{}{
		"clusters": []interface{}{
			map[interface{}]interface{}{
				"name":    "c1",
				"cluster": map[interface{}]interface{}{"server": "https://k8s.example.com"},
			},
		},
		"users": []interface{}{
			map[interface{}]interface{}{
				"name": "u1",
				"user": map[interface{}]interface{}{"token": "t"},
			},
		},
	}
	rawCtx := map[interface{}]interface{}{
		"name":    "ctx1",
		"context": map[interface{}]interface{}{"cluster": "c1", "user": "u1"},
	}

	ctxObj, err := ProcessContext(rawCtx, rawKubeconfig, KubeConfig, true)
	require.NoError(t, err)
	assert.Equal(t, "ctx1", ctxObj.Name)
}

func TestFileWriteMergeAndRemoveHelpers(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "config")

	cfg1 := api.Config{
		Clusters:       map[string]*api.Cluster{"c1": {Server: "https://c1.example.com"}},
		AuthInfos:      map[string]*api.AuthInfo{"u1": {Token: "t1"}},
		Contexts:       map[string]*api.Context{"ctx1": {Cluster: "c1", AuthInfo: "u1"}},
		CurrentContext: "ctx1",
	}
	require.NoError(t, WriteToFile(cfg1, dir))

	cfg2 := api.Config{
		Clusters:  map[string]*api.Cluster{"c2": {Server: "https://c2.example.com"}},
		AuthInfos: map[string]*api.AuthInfo{"u2": {Token: "t2"}},
		Contexts:  map[string]*api.Context{"ctx2": {Cluster: "c2", AuthInfo: "u2"}},
	}
	require.NoError(t, WriteToFile(cfg2, dir))

	loaded, err := clientcmd.LoadFromFile(filePath)
	require.NoError(t, err)
	assert.Contains(t, loaded.Contexts, "ctx1")
	assert.Contains(t, loaded.Contexts, "ctx2")

	require.NoError(t, RemoveContextFromFile("ctx1", filePath))

	afterRemove, err := clientcmd.LoadFromFile(filePath)
	require.NoError(t, err)
	assert.NotContains(t, afterRemove.Contexts, "ctx1")
	assert.NotContains(t, afterRemove.Clusters, "c1")
	assert.NotContains(t, afterRemove.AuthInfos, "u1")
	assert.Contains(t, afterRemove.Contexts, "ctx2")
}

func TestLoadAndWatchFiles(t *testing.T) {
	store := NewContextStore()

	// Empty path returns immediately.
	LoadAndWatchFiles(context.Background(), store, "", KubeConfig, nil)

	kcPath := filepath.Join(t.TempDir(), "config")
	initial := `apiVersion: v1
kind: Config
clusters:
- name: c1
  cluster:
    server: https://c1.example.com
contexts:
- name: ctx1
  context:
    cluster: c1
`
	require.NoError(t, os.WriteFile(kcPath, []byte(initial), 0o600))

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	defer func() {
		cancel()
		<-done
	}()

	go func() {
		defer close(done)

		LoadAndWatchFiles(ctx, store, kcPath, KubeConfig, nil)
	}()

	updated := `apiVersion: v1
kind: Config
clusters:
- name: c1
  cluster:
    server: https://c1.example.com
contexts:
- name: ctx1
  context:
    cluster: c1
    user: u1
users:
- name: u1
  user:
    token: t1
`

	require.Eventually(t, func() bool {
		if got, err := store.GetContext("ctx1"); err == nil && got.AuthInfo != nil && got.AuthInfo.Token == "t1" {
			return true
		}

		assert.NoError(t, os.WriteFile(kcPath, []byte(updated), 0o600))

		return false
	}, 5*time.Second, 100*time.Millisecond)
}
