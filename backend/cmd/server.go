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
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"

	"github.com/cli/browser"
	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/plugins"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/spa"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

var k8sResponseCache = cache.New[string]()

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

	logger.Init(conf.LogLevel)

	if conf.Version {
		fmt.Printf("%s %s (%s/%s)\n", kubeconfig.AppName, kubeconfig.Version, runtime.GOOS, runtime.GOARCH)
		return
	}

	// Open browser if running locally with embedded frontend and not in cluster and no-browser is not set
	if spa.UseEmbeddedFiles && !conf.NoBrowser && !conf.InCluster {
		go func() {
			time.Sleep(500 * time.Millisecond) // give server time to start

			if err := browser.OpenURL(fmt.Sprintf("http://localhost:%d", conf.Port)); err != nil {
				logger.Log(logger.LevelError, nil, err, "failed to open browser")
			}
		}()
	}

	headlampConfig := createHeadlampConfig(conf)
	StartHeadlampServer(headlampConfig)
}

// buildHeadlampCFG maps the parsed config into the struct the backend uses.
func buildHeadlampCFG(conf *config.Config, kubeConfigStore kubeconfig.ContextStore) *headlampconfig.HeadlampCFG {
	return &headlampconfig.HeadlampCFG{
		UseInCluster:          conf.InCluster,
		InClusterContextName:  conf.InClusterContextName,
		KubeConfigPath:        conf.KubeConfigPath,
		SkippedKubeContexts:   conf.SkippedKubeContexts,
		ListenAddr:            conf.ListenAddr,
		CacheEnabled:          conf.CacheEnabled,
		Port:                  conf.Port,
		DevMode:               conf.DevMode,
		StaticDir:             conf.StaticDir,
		Insecure:              conf.InsecureSsl,
		PluginDir:             conf.PluginsDir,
		UserPluginDir:         conf.UserPluginsDir,
		EnableHelm:            conf.EnableHelm,
		EnableDynamicClusters: conf.EnableDynamicClusters,
		WatchPluginsChanges:   conf.WatchPluginsChanges,
		KubeConfigStore:       kubeConfigStore,
		BaseURL:               conf.BaseURL,
		ProxyURLs:             strings.Split(conf.ProxyURLs, ","),
		TLSCertPath:           conf.TLSCertPath,
		TLSKeyPath:            conf.TLSKeyPath,
	}
}

// buildTelemetryConfig collects only the telemetry fields and passes them along.
func buildTelemetryConfig(conf *config.Config) config.Config {
	return config.Config{
		ServiceName:        conf.ServiceName,
		ServiceVersion:     conf.ServiceVersion,
		TracingEnabled:     conf.TracingEnabled,
		MetricsEnabled:     conf.MetricsEnabled,
		JaegerEndpoint:     conf.JaegerEndpoint,
		OTLPEndpoint:       conf.OTLPEndpoint,
		UseOTLPHTTP:        conf.UseOTLPHTTP,
		StdoutTraceEnabled: conf.StdoutTraceEnabled,
		SamplingRate:       conf.SamplingRate,
	}
}

func createHeadlampConfig(conf *config.Config) *HeadlampConfig {
	cache := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()
	multiplexer := NewMultiplexer(kubeConfigStore)

	cfg := &headlampconfig.HeadlampConfig{
		HeadlampCFG:               buildHeadlampCFG(conf, kubeConfigStore),
		OidcClientID:              conf.OidcClientID,
		OidcValidatorClientID:     conf.OidcValidatorClientID,
		OidcClientSecret:          conf.OidcClientSecret,
		OidcIdpIssuerURL:          conf.OidcIdpIssuerURL,
		OidcCallbackURL:           conf.OidcCallbackURL,
		OidcValidatorIdpIssuerURL: conf.OidcValidatorIdpIssuerURL,
		OidcScopes:                strings.Split(conf.OidcScopes, ","),
		OidcSkipTLSVerify:         conf.OidcSkipTLSVerify,
		OidcUseAccessToken:        conf.OidcUseAccessToken,
		OidcUsePKCE:               conf.OidcUsePKCE,
		MeUsernamePaths:           conf.MeUsernamePath,
		MeEmailPaths:              conf.MeEmailPath,
		MeGroupsPaths:             conf.MeGroupsPath,
		MeUserInfoURL:             conf.MeUserInfoURL,
		Cache:                     cache,
		Multiplexer:               multiplexer,
		TelemetryConfig:           buildTelemetryConfig(conf),
	}

	if conf.OidcCAFile != "" {
		caFileContents, err := os.ReadFile(conf.OidcCAFile)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "reading oidc ca file")
			os.Exit(1)
		}

		cfg.OidcCACert = string(caFileContents)
	}

	return &HeadlampConfig{HeadlampConfig: cfg}
}

// GetContextKeyAndContext returns Kcontext , ContextKey for using these in CacheMiddleWare function.
// It also return span and ctx that will help while using handleError function.
func GetContextKeyAndKContext(w http.ResponseWriter,
	r *http.Request, c *HeadlampConfig) (context.Context,
	trace.Span, string, *kubeconfig.Context, error,
) {
	ctx := r.Context()
	ctx, span := telemetry.CreateSpan(ctx, r, "cluster-api", "handleClusterAPI",
		attribute.String("cluster", mux.Vars(r)["clusterName"]),
	)

	contextKey, err := c.getContextKeyForRequest(r)
	if err != nil {
		c.handleError(w, ctx, span, err, "failed to get context Key:", http.StatusBadRequest)
		return nil, nil, "", nil, err
	}

	kContext, err := c.KubeConfigStore.GetContext(contextKey)
	if err != nil {
		c.handleError(w, ctx, span, err, "failed to get context", http.StatusNotFound)
		return nil, nil, "", nil, err
	}

	return ctx, span, contextKey, kContext, nil
}

// CacheMiddleWare is Middleware for Caching purpose. It involves generating key for a request,
// authorizing user , store resource data in cache and returns data if key is present.
func CacheMiddleWare(c *HeadlampConfig) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		if !c.CacheEnabled {
			return next
		}

		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if k8cache.SkipWebSocket(r, next, w) {
				return
			}

			ctx, span, contextKey, kContext, err := GetContextKeyAndKContext(w, r, c)
			if err != nil {
				return
			}

			if err := k8cache.HandleNonGETCacheInvalidation(k8sResponseCache, w, r, next, contextKey); err != nil {
				c.handleError(w, ctx, span, err, "error while invalidating keys", http.StatusInternalServerError)
				return
			}

			rcw := k8cache.NewResponseCapture(w)

			key, err := k8cache.GenerateKey(r.URL, contextKey)
			if err != nil {
				c.handleError(w, ctx, span, err, "failed to generate key ", http.StatusBadRequest)
				return
			}

			isAllowed, authErr := k8cache.IsAllowed(kContext, r)
			if authErr != nil {
				k8cache.ServeFromCacheOrForwardToK8s(k8sResponseCache, isAllowed, next, key, w, r, rcw)

				return
			} else if !isAllowed && k8cache.IsAuthBypassURL(r.URL.Path) {
				_ = k8cache.ReturnAuthErrorResponse(w, r, contextKey)

				return
			}

			served, err := k8cache.LoadFromCache(k8sResponseCache, isAllowed, key, w, r)
			if err != nil {
				c.handleError(w, ctx, span, errors.New(kContext.Error), "failed to load from cache", http.StatusServiceUnavailable)
			}

			if served {
				c.TelemetryHandler.RecordEvent(span, "Served from cache")
				return
			}

			k8cache.CheckForChanges(k8sResponseCache, contextKey, *kContext)

			next.ServeHTTP(rcw, r)

			err = k8cache.StoreK8sResponseInCache(k8sResponseCache, r.URL, rcw, r, key)
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

	if err := plugins.ListPlugins(conf.StaticDir, conf.UserPluginsDir, conf.PluginsDir); err != nil {
		logger.Log(logger.LevelError, nil, err, "listing plugins")
	}
}
