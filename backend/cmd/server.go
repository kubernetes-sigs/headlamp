package main

import (
	"os"
	"strings"

	"github.com/headlamp-k8s/headlamp/backend/pkg/cache"
	"github.com/headlamp-k8s/headlamp/backend/pkg/config"
	"github.com/headlamp-k8s/headlamp/backend/pkg/kubeconfig"
	"github.com/headlamp-k8s/headlamp/backend/pkg/logger"
	"github.com/headlamp-k8s/headlamp/backend/pkg/plugins"
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
