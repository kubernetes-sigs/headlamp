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

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gofrs/flock"
	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestClusterTagsSurviveRename(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	config := api.NewConfig()
	config.Contexts["original"] = &api.Context{
		Extensions: map[string]runtime.Object{
			"headlamp_info": &runtime.Unknown{Raw: []byte(`{"customName":"before","future":{"keep":true}}`)},
			"other":         &runtime.Unknown{Raw: []byte(`{"keep":true}`)},
		},
	}
	require.NoError(t, clientcmd.WriteToFile(*config, path))
	require.NoError(t, writeClusterTags(path, "before", map[string]string{"env": "prod", "team": ""}))

	saved, err := clientcmd.LoadFromFile(path)
	require.NoError(t, err)
	require.NoError(t, customNameToExtensions(saved, "original", "after", path))
	require.NoError(t, writeClusterTags(path, "after", map[string]string{"env": "dev"}))

	saved, err = clientcmd.LoadFromFile(path)
	require.NoError(t, err)

	data, err := json.Marshal(saved.Contexts["original"].Extensions["headlamp_info"])
	require.NoError(t, err)
	require.JSONEq(t, `{"customName":"after","tags":{"env":"dev"},"future":{"keep":true}}`, string(data))
	require.NotNil(t, saved.Contexts["original"].Extensions["other"])

	require.NoError(t, customNameToExtensions(saved, "original", "", path))
	require.NoError(t, writeClusterTags(path, "original", map[string]string{}))
}

func TestValidateClusterTags(t *testing.T) {
	for _, tags := range []map[string]string{
		{}, {"env": "prod"}, {"example.com/team": "", "env": "dev"},
	} {
		require.NoError(t, validateClusterTags(tags))
	}

	for _, tags := range []map[string]string{
		{"": "prod"}, {"bad key": "prod"}, {"env": "-bad"}, {"env": "bad value"},
	} {
		require.Error(t, validateClusterTags(tags))
	}
}

func TestWriteClusterTagsMissingContext(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	require.NoError(t, clientcmd.WriteToFile(*api.NewConfig(), path))
	require.ErrorContains(t, writeClusterTags(path, "missing", map[string]string{}), "not found")
}

func TestWriteClusterTagsConcurrentContexts(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	config := api.NewConfig()

	for index := range 8 {
		config.Contexts[fmt.Sprintf("context-%d", index)] = &api.Context{}
	}

	require.NoError(t, clientcmd.WriteToFile(*config, path))

	start := make(chan struct{})
	results := make(chan error, len(config.Contexts))

	for name := range config.Contexts {
		go func() {
			<-start

			results <- writeClusterTags(path, name, map[string]string{"context": name})
		}()
	}

	close(start)

	for range config.Contexts {
		require.NoError(t, <-results)
	}

	saved, err := clientcmd.LoadFromFile(path)
	require.NoError(t, err)

	require.Len(t, saved.Contexts, len(config.Contexts))

	for name, context := range saved.Contexts {
		data, err := json.Marshal(context.Extensions["headlamp_info"])
		require.NoError(t, err)
		require.JSONEq(t, fmt.Sprintf(`{"tags":{"context":%q}}`, name), string(data))
	}
}

func TestWriteClusterTagsLoadsOnlyAfterSharedLock(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	config := api.NewConfig()
	config.Contexts["deleted"] = &api.Context{}
	require.NoError(t, clientcmd.WriteToFile(*config, path))

	lock := flock.New(path + ".lock")
	require.NoError(t, lock.Lock())
	t.Cleanup(func() { require.NoError(t, lock.Unlock()) })

	result := make(chan error, 1)

	go func() {
		result <- writeClusterTags(path, "deleted", map[string]string{"env": "prod"})
	}()

	select {
	case err := <-result:
		t.Fatalf("tag update bypassed the held kubeconfig lock: %v", err)
	case <-time.After(100 * time.Millisecond):
	}

	delete(config.Contexts, "deleted")
	require.NoError(t, clientcmd.WriteToFile(*config, path))
	require.NoError(t, lock.Unlock())
	require.ErrorContains(t, <-result, "not found")

	saved, err := clientcmd.LoadFromFile(path)
	require.NoError(t, err)
	require.NotContains(t, saved.Contexts, "deleted")
}

func TestClusterTagsStaleRenamePreservesSavedTags(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	config := api.NewConfig()
	config.Contexts["original"] = &api.Context{}
	config.Contexts["other"] = &api.Context{}
	require.NoError(t, clientcmd.WriteToFile(*config, path))

	stale, err := clientcmd.LoadFromFile(path)
	require.NoError(t, err)
	require.NoError(t, writeClusterTags(path, "other", map[string]string{"env": "prod"}))
	require.NoError(t, customNameToExtensions(stale, "original", "renamed", path))

	saved, err := clientcmd.LoadFromFile(path)
	require.NoError(t, err)

	data, err := json.Marshal(saved.Contexts["other"].Extensions["headlamp_info"])
	require.NoError(t, err)
	require.JSONEq(t, `{"tags":{"env":"prod"}}`, string(data))
	require.Equal(t, saved.Contexts["other"], stale.Contexts["other"])
}

func TestWriteClusterTagsPublishesWhileLocked(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	config := api.NewConfig()
	config.Contexts["original"] = &api.Context{}
	require.NoError(t, clientcmd.WriteToFile(*config, path))

	published := false

	require.NoError(t, writeClusterTags(path, "original", map[string]string{"env": "prod"},
		func(committed *api.Config) error {
			lock := flock.New(path + ".lock")
			locked, err := lock.TryLock()
			require.NoError(t, err)

			if locked {
				require.NoError(t, lock.Unlock())
			}

			require.False(t, locked, "cache publication must retain the shared kubeconfig lock")

			saved, err := clientcmd.LoadFromFile(path)
			require.NoError(t, err)
			savedData, err := json.Marshal(saved.Contexts["original"].Extensions["headlamp_info"])
			require.NoError(t, err)
			committedData, err := json.Marshal(committed.Contexts["original"].Extensions["headlamp_info"])
			require.NoError(t, err)
			require.JSONEq(t, string(savedData), string(committedData))

			published = true

			return nil
		}))
	require.True(t, published)
}

func TestClusterTagsRenamePreservesContextIdentity(t *testing.T) {
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "before", Source: kubeconfig.KubeConfig, KubeConfigPath: "config-a",
		ClusterID: "config-a+original", KubeContext: &api.Context{},
	}))
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "other", Source: kubeconfig.KubeConfig, KubeConfigPath: "config-b", KubeContext: &api.Context{},
	}))

	config := api.NewConfig()
	config.Contexts["original"] = &api.Context{}
	require.NoError(t, updateHeadlampInfo(config.Contexts["original"], map[string]interface{}{
		"customName": "after", "tags": map[string]string{"env": "prod"},
	}))

	cfg := &HeadlampConfig{HeadlampConfig: &headlampconfig.HeadlampConfig{
		HeadlampCFG: &headlampconfig.HeadlampCFG{KubeConfigStore: store},
	}}
	require.Empty(t, cfg.updateCustomContextToCache(config, "before", "original", "kubeconfig"))

	renamed, err := store.GetContext("after")
	require.NoError(t, err)
	require.Equal(t, kubeconfig.KubeConfig, renamed.Source)
	require.Equal(t, "config-a", renamed.KubeConfigPath)
	require.Equal(t, "config-a+original", renamed.ClusterID)
	require.NotNil(t, renamed.KubeContext.Extensions["headlamp_info"])

	_, err = store.GetContext("before")
	require.Error(t, err)
	other, err := store.GetContext("other")
	require.NoError(t, err)
	require.Equal(t, "config-b", other.KubeConfigPath)
}

func TestUpdateClusterTagsCacheRejectsStaleContext(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	config := api.NewConfig()
	config.Contexts["test"] = &api.Context{}
	require.NoError(t, clientcmd.WriteToFile(*config, path))

	store := kubeconfig.NewContextStore()
	original := &kubeconfig.Context{
		Name: "test", ClusterID: path + "+test", KubeConfigPath: path, KubeContext: &api.Context{},
	}
	require.NoError(t, store.AddContext(original))

	cfg := &HeadlampConfig{HeadlampConfig: &headlampconfig.HeadlampConfig{
		HeadlampCFG: &headlampconfig.HeadlampCFG{KubeConfigStore: store},
	}}
	replacement := &kubeconfig.Context{Name: "test", ClusterID: "replacement+test"}
	require.NoError(t, store.AddContext(replacement))
	require.ErrorIs(t, cfg.writeCachedClusterTags(path, original, map[string]string{"env": "prod"}),
		errClusterTagsConflict)

	current, err := store.GetContext("test")
	require.NoError(t, err)
	require.Same(t, replacement, current)
	require.NoError(t, store.RemoveContext("test"))
	require.ErrorIs(t, cfg.writeCachedClusterTags(path, original, map[string]string{"env": "prod"}),
		errClusterTagsConflict)

	_, err = store.GetContext("test")
	require.Error(t, err)

	saved, err := clientcmd.LoadFromFile(path)
	require.NoError(t, err)
	require.Empty(t, saved.Contexts["test"].Extensions)
}

func TestUpdateClusterTagsStableTargetAfterReloadAndRename(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config")
	config := api.NewConfig()
	config.Clusters["cluster"] = &api.Cluster{Server: "https://localhost"}
	config.AuthInfos["user"] = &api.AuthInfo{}
	config.Contexts["original"] = &api.Context{Cluster: "cluster", AuthInfo: "user"}
	config.Contexts["other"] = &api.Context{Cluster: "cluster", AuthInfo: "user"}
	require.NoError(t, updateHeadlampInfo(config.Contexts["original"], map[string]interface{}{"customName": "renamed"}))
	require.NoError(t, updateHeadlampInfo(config.Contexts["other"], map[string]interface{}{"customName": "original"}))
	require.NoError(t, clientcmd.WriteToFile(*config, path))

	store := kubeconfig.NewContextStore()
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, path, kubeconfig.KubeConfig, nil))

	expected, err := store.GetContext("original")
	require.NoError(t, err)
	require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, path, kubeconfig.KubeConfig, nil))

	cfg := &HeadlampConfig{HeadlampConfig: &headlampconfig.HeadlampConfig{
		HeadlampCFG: &headlampconfig.HeadlampCFG{KubeConfigStore: store},
	}}
	require.NoError(t, cfg.writeCachedClusterTags(path, expected, map[string]string{"env": "first"}))
	require.NoError(t, customNameToExtensions(config, "other", "third", path))

	expected, err = store.GetContext("original")
	require.NoError(t, err)
	require.NoError(t, cfg.writeCachedClusterTags(path, expected, map[string]string{"env": "second"}))

	saved, err := clientcmd.LoadFromFile(path)
	require.NoError(t, err)

	data, err := json.Marshal(saved.Contexts["original"].Extensions["headlamp_info"])
	require.NoError(t, err)
	require.JSONEq(t, `{"customName":"renamed"}`, string(data))
	data, err = json.Marshal(saved.Contexts["other"].Extensions["headlamp_info"])
	require.NoError(t, err)
	require.JSONEq(t, `{"customName":"third","tags":{"env":"second"}}`, string(data))
}

func TestUpdateClusterTagsRejectsUnsupportedTargets(t *testing.T) {
	tests := []struct {
		name     string
		source   int
		internal bool
		body     string
		status   int
	}{
		{"read-only kubeconfig", kubeconfig.KubeConfig, false, `{"tags":{"env":"prod"}}`, http.StatusForbidden},
		{"in-cluster", kubeconfig.InCluster, false, `{"tags":{}}`, http.StatusForbidden},
		{"inventory", kubeconfig.ClusterInventory, false, `{"tags":{}}`, http.StatusForbidden},
		{"private stateless context", kubeconfig.DynamicCluster, true, `{"tags":{}}`, http.StatusNotFound},
		{"mismatched identity", kubeconfig.KubeConfig, false, `{"tags":{},"clusterID":"other"}`, http.StatusNotFound},
		{"invalid tag", kubeconfig.DynamicCluster, false, `{"tags":{"bad key":"prod"}}`, http.StatusBadRequest},
		{"missing tags", kubeconfig.DynamicCluster, false, `{}`, http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(&kubeconfig.Context{
				Name: "test", Source: tt.source, Internal: tt.internal, KubeContext: &api.Context{},
			}))

			cfg := &HeadlampConfig{HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{KubeConfigStore: store, UseInCluster: true},
			}}
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPut,
				"/cluster/test/tags", strings.NewReader(tt.body))
			req = mux.SetURLVars(req, map[string]string{"name": "test"})
			response := httptest.NewRecorder()
			cfg.updateClusterTags(response, req)
			require.Equal(t, tt.status, response.Code, response.Body.String())
		})
	}
}

func TestUpdateClusterTagsEndpoint(t *testing.T) {
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "test-token")
	path := filepath.Join(t.TempDir(), "config")
	config := api.NewConfig()
	config.Clusters["cluster"] = &api.Cluster{Server: "https://localhost"}
	config.Contexts["original"] = &api.Context{Cluster: "cluster", AuthInfo: "user"}
	config.AuthInfos["user"] = &api.AuthInfo{}
	require.NoError(t, updateHeadlampInfo(config.Contexts["original"], map[string]interface{}{"customName": "renamed"}))
	require.NoError(t, clientcmd.WriteToFile(*config, path))

	contexts, loadErrors, err := kubeconfig.LoadContextsFromFile(path, kubeconfig.KubeConfig)
	require.NoError(t, err)
	require.Empty(t, loadErrors)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&contexts[0]))
	cfg := &HeadlampConfig{HeadlampConfig: &headlampconfig.HeadlampConfig{
		HeadlampCFG: &headlampconfig.HeadlampCFG{KubeConfigStore: store, EnableDynamicClusters: true},
	}}
	router := mux.NewRouter()
	cfg.addClusterSetupRoute(router)

	unauthorized := httptest.NewRecorder()
	router.ServeHTTP(unauthorized, httptest.NewRequestWithContext(t.Context(), http.MethodPut,
		"/cluster/renamed/tags", strings.NewReader(`{"tags":{"env":"prod"}}`)))
	require.Equal(t, http.StatusForbidden, unauthorized.Code)

	req := httptest.NewRequestWithContext(t.Context(), http.MethodPut, "/cluster/renamed/tags",
		strings.NewReader(`{"tags":{"env":"prod"}}`))
	req.Header.Set("X-HEADLAMP_BACKEND-TOKEN", "test-token")

	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())

	var result clientConfig
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &result))
	require.Len(t, result.Clusters, 1)
	require.Equal(t, "renamed", result.Clusters[0].Name)
	data, err := json.Marshal(result.Clusters[0].Metadata["extensions"])
	require.NoError(t, err)
	require.JSONEq(t, `{"headlamp_info":{"customName":"renamed","tags":{"env":"prod"}}}`, string(data))
}
