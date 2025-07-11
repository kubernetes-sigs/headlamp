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
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/plugins"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"go.opentelemetry.io/otel/attribute"
)

func main() {
	if len(os.Args) == 2 && os.Args[1] == "list-plugins" {
		runListPlugins()

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
		HeadlampCFG: &headlampconfig.HeadlampCFG{
			UseInCluster:          conf.InCluster,
			KubeConfigPath:        conf.KubeConfigPath,
			SkippedKubeContexts:   conf.SkippedKubeContexts,
			ListenAddr:            conf.ListenAddr,
			Port:                  conf.Port,
			DevMode:               conf.DevMode,
			StaticDir:             conf.StaticDir,
			Insecure:              conf.InsecureSsl,
			PluginDir:             conf.PluginsDir,
			EnableHelm:            conf.EnableHelm,
			EnableDynamicClusters: conf.EnableDynamicClusters,
			WatchPluginsChanges:   conf.WatchPluginsChanges,
			KubeConfigStore:       kubeConfigStore,
			BaseURL:               conf.BaseURL,
			ProxyURLs:             strings.Split(conf.ProxyURLs, ","),
		},
		oidcClientID:              conf.OidcClientID,
		oidcValidatorClientID:     conf.OidcValidatorClientID,
		oidcClientSecret:          conf.OidcClientSecret,
		oidcIdpIssuerURL:          conf.OidcIdpIssuerURL,
		oidcValidatorIdpIssuerURL: conf.OidcValidatorIdpIssuerURL,
		oidcScopes:                strings.Split(conf.OidcScopes, ","),
		oidcUseAccessToken:        conf.OidcUseAccessToken,
		cache:                     cache,
		multiplexer:               multiplexer,
		telemetryConfig: config.Config{
			ServiceName:        conf.ServiceName,
			ServiceVersion:     conf.ServiceVersion,
			TracingEnabled:     conf.TracingEnabled,
			MetricsEnabled:     conf.MetricsEnabled,
			JaegerEndpoint:     conf.JaegerEndpoint,
			OTLPEndpoint:       conf.OTLPEndpoint,
			UseOTLPHTTP:        conf.UseOTLPHTTP,
			StdoutTraceEnabled: conf.StdoutTraceEnabled,
			SamplingRate:       conf.SamplingRate,
		},
	})
}

// CacheMiddleWare is Middleware for Caching purpose.
func CacheMiddleWare(c *HeadlampConfig) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			ctx, span := telemetry.CreateSpan(ctx, r, "cluster-api", "handleClusterAPI",
				attribute.String("cluster", mux.Vars(r)["clusterName"]),
			)

			defer span.End()

			contextKey, err := c.getContextKeyForRequest(r)
			if err != nil {
				c.handleError(w, ctx, span, err, "failed to get context key", http.StatusBadRequest)
				return
			}

			kContext, err := c.KubeConfigStore.GetContext(contextKey)
			if err != nil {
				c.handleError(w, ctx, span, err, "failed to get context", http.StatusNotFound)
				return
			}

			if kContext.Error != "" {
				c.handleError(w, ctx, span, errors.New(kContext.Error), "context has error", http.StatusBadRequest)
				return
			}

			rcw := k8cache.Initialize(w)

			key, err := k8cache.GenerateKey(r.URL, contextKey)
			if err != nil {
				c.handleError(w, ctx, span, err, "failed to generate key ", http.StatusBadRequest)
				return
			}

			isAllowed, err := k8cache.IsAllowed(r.URL, kContext, w, r)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			served, err := k8cache.LoadfromCache(k8scache, isAllowed, key, w)
			if err != nil {
				c.handleError(w, ctx, span, errors.New(kContext.Error), "failed to load from cache", http.StatusServiceUnavailable)
				return
			}

			if served {
				c.telemetryHandler.RecordEvent(span, "Served from cache")
				return
			}

			next.ServeHTTP(rcw, r)

			err = k8cache.RequestToK8sAndStore(k8scache, kContext, r.URL, rcw, r, key)
			if err != nil {
				c.handleError(w, ctx, span, errors.New(kContext.Error), "error while storing into cache", http.StatusBadRequest)
				return
			}
		})
	}
}

func runListPlugins() {
	conf, err := config.Parse(os.Args[2:])
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "fetching config:%v")
		os.Exit(1)
	}

	if err := plugins.ListPlugins(conf.StaticDir, conf.PluginsDir); err != nil {
		logger.Log(logger.LevelError, nil, err, "listing plugins")
	}
}
