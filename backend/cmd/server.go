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
	"os"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/plugins"
)

func main() {
	if len(os.Args) == 2 && os.Args[1] == "list-plugins" {
		conf, err := config.Parse(os.Args[2:])
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "fetching config:%v")
			os.Exit(1)
		}

		if err := plugins.ListPlugins(conf.StaticDir, conf.PluginsDir); err != nil {
			logger.Log(logger.LevelError, nil, err, "listing plugins")
		}

		return
	}

	conf, err := config.Parse(os.Args)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "fetching config:%v")
		os.Exit(1)
	}

	cache := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()
	multiplexer := NewMultiplexer(kubeConfigStore)

	StartHeadlampServer(&HeadlampConfig{
		useInCluster:          conf.InCluster,
		kubeConfigPath:        conf.KubeConfigPath,
		skippedKubeContexts:   conf.SkippedKubeContexts,
		listenAddr:            conf.ListenAddr,
		port:                  conf.Port,
		devMode:               conf.DevMode,
		staticDir:             conf.StaticDir,
		insecure:              conf.InsecureSsl,
		pluginDir:             conf.PluginsDir,
		oidcClientID:          conf.OidcClientID,
		oidcClientSecret:      conf.OidcClientSecret,
		oidcIdpIssuerURL:      conf.OidcIdpIssuerURL,
		oidcScopes:            strings.Split(conf.OidcScopes, ","),
		baseURL:               conf.BaseURL,
		proxyURLs:             strings.Split(conf.ProxyURLs, ","),
		enableHelm:            conf.EnableHelm,
		enableDynamicClusters: conf.EnableDynamicClusters,
		watchPluginsChanges:   conf.WatchPluginsChanges,
		cache:                 cache,
		kubeConfigStore:       kubeConfigStore,
		multiplexer:           multiplexer,
	})
}
