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
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/stretchr/testify/require"
)

func TestPluginRouteCacheControl(t *testing.T) {
	pluginDir := t.TempDir()
	userPluginDir := t.TempDir()
	staticPluginDir := t.TempDir()

	for _, directory := range []string{pluginDir, userPluginDir, staticPluginDir} {
		require.NoError(t, os.WriteFile(filepath.Join(directory, "plugin.js"), []byte("plugin"), 0o600))
	}

	for _, test := range []struct {
		name          string
		path          string
		useInCluster  bool
		userPluginDir string
		staticDir     string
		status        int
		cacheControl  string
	}{
		{name: "local development plugin", path: "/plugins/plugin.js", status: http.StatusOK, cacheControl: "no-cache"},
		{name: "in-cluster development plugin", path: "/plugins/plugin.js", useInCluster: true, status: http.StatusOK},
		{
			name: "local user plugin", path: "/user-plugins/plugin.js", userPluginDir: userPluginDir,
			status: http.StatusOK, cacheControl: "no-cache",
		},
		{
			name: "in-cluster user plugin", path: "/user-plugins/plugin.js", useInCluster: true,
			userPluginDir: userPluginDir, status: http.StatusOK,
		},
		{name: "missing user plugin route", path: "/user-plugins/plugin.js", status: http.StatusNotFound},
		{
			name: "in-cluster static plugin", path: "/static-plugins/plugin.js", useInCluster: true,
			staticDir: staticPluginDir, status: http.StatusOK,
		},
		{name: "missing static plugin route", path: "/static-plugins/plugin.js", status: http.StatusNotFound},
	} {
		t.Run(test.name, func(t *testing.T) {
			config := &HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{
						UseInCluster:    test.useInCluster,
						PluginDir:       pluginDir,
						UserPluginDir:   test.userPluginDir,
						StaticPluginDir: test.staticDir,
					},
				},
			}
			router := mux.NewRouter()
			addPluginRoutes(config, router)

			recorder := httptest.NewRecorder()
			router.ServeHTTP(
				recorder,
				httptest.NewRequestWithContext(t.Context(), http.MethodGet, test.path, nil),
			)

			require.Equal(t, test.status, recorder.Code)
			require.Equal(t, test.cacheControl, recorder.Header().Get("Cache-Control"))
		})
	}
}

func TestLocalStaticPluginCacheControl(t *testing.T) {
	staticPluginDir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(staticPluginDir, "plugin.js"), []byte("plugin"), 0o600))

	config := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				PluginDir:       t.TempDir(),
				StaticPluginDir: staticPluginDir,
			},
		},
	}
	router := mux.NewRouter()
	addPluginRoutes(config, router)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(
		recorder,
		httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/static-plugins/plugin.js", nil),
	)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "no-cache", recorder.Header().Get("Cache-Control"))
}
