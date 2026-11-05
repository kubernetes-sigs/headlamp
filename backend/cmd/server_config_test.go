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
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterdiscovery"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildHeadlampCFG(t *testing.T) {
	store := kubeconfig.NewContextStore()

	t.Run("maps basic fields and splits proxy urls", func(t *testing.T) {
		conf := &config.Config{
			AppName:                "Branded Headlamp",
			Port:                   4444,
			InCluster:              true,
			InClusterContextName:   "test-incluster",
			InsecureSsl:            true,
			KubeConfigDir:          "/kubeconfigs",
			PluginsDir:             "/plugins",
			UserPluginsDir:         "/user-plugins",
			AllowKubeconfigChanges: true,
			WatchPluginsChanges:    false,
			BaseURL:                "/headlamp",
			ProxyURLs:              "http://proxy1,http://proxy2",
		}

		headlampCFG := buildHeadlampCFG(conf, store)

		assert.Equal(t, "Branded Headlamp", headlampCFG.AppName)
		assert.Equal(t, uint(4444), headlampCFG.Port)
		assert.True(t, headlampCFG.UseInCluster)
		assert.Equal(t, "test-incluster", headlampCFG.InClusterContextName)
		assert.True(t, headlampCFG.Insecure)
		assert.Equal(t, "/kubeconfigs", headlampCFG.KubeConfigDir)
		assert.Equal(t, "/plugins", headlampCFG.PluginDir)
		assert.Equal(t, "/user-plugins", headlampCFG.UserPluginDir)
		assert.True(t, headlampCFG.AllowKubeconfigChanges)
		assert.False(t, headlampCFG.WatchPluginsChanges)
		assert.Equal(t, "/headlamp", headlampCFG.BaseURL)
		assert.Equal(t, []string{"http://proxy1", "http://proxy2"}, headlampCFG.ProxyURLs)
		assert.Equal(t, store, headlampCFG.KubeConfigStore)
	})

	t.Run("empty proxy urls yields empty slice", func(t *testing.T) {
		conf := &config.Config{ProxyURLs: ""}

		headlampCFG := buildHeadlampCFG(conf, store)

		assert.Empty(t, headlampCFG.ProxyURLs)
	})

	t.Run("trims spaces around proxy urls and drops empty entries", func(t *testing.T) {
		conf := &config.Config{ProxyURLs: " http://proxy1 , http://proxy2/*,,"}

		headlampCFG := buildHeadlampCFG(conf, store)

		assert.Equal(t, []string{"http://proxy1", "http://proxy2/*"}, headlampCFG.ProxyURLs)

		c := &HeadlampConfig{HeadlampConfig: &headlampconfig.HeadlampConfig{HeadlampCFG: headlampCFG}}

		allowed, err := c.proxyURLAllowed("http://proxy2/api")
		require.NoError(t, err)
		assert.True(t, allowed)
	})
}

func TestBuildHeadlampCFGDiscoverySources(t *testing.T) {
	conf := &config.Config{DiscoverySources: map[string]clusterdiscovery.Settings{
		"cluster_inventory": {Enabled: true, Namespaces: "team-a,team-b"},
		"cluster_api":       {Enabled: true, Namespaces: "workloads"},
		"third_source":      {Enabled: true, Namespaces: "another"},
	}}

	headlampCFG := buildHeadlampCFG(conf, kubeconfig.NewContextStore())

	assert.Equal(t, conf.DiscoverySources, headlampCFG.DiscoverySources)
}

func TestSplitOIDCScopes(t *testing.T) {
	assert.Equal(t,
		[]string{"profile", "email", "offline_access"},
		splitOIDCScopes("profile, email, , offline_access"),
	)
	assert.Empty(t, splitOIDCScopes(" ,\t"))
}
