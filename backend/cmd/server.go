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
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/cli/browser"
	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
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

	conf, err := config.ParseWithAppNameDefault(os.Args, kubeconfig.AppName)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "fetching config:%v")
		os.Exit(1)
	}

	logger.Init(conf.LogLevel)
	kubeconfig.AppName = conf.AppName

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
		AppName:                conf.AppName,
		UseInCluster:           conf.InCluster,
		InClusterContextName:   conf.InClusterContextName,
		KubeConfigPath:         conf.KubeConfigPath,
		KubeConfigDir:          conf.KubeConfigDir,
		SkippedKubeContexts:    conf.SkippedKubeContexts,
		ListenAddr:             conf.ListenAddr,
		CacheEnabled:           conf.CacheEnabled,
		Port:                   conf.Port,
		DevMode:                conf.DevMode,
		StaticDir:              conf.StaticDir,
		Insecure:               conf.InsecureSsl,
		PluginDir:              conf.PluginsDir,
		UserPluginDir:          conf.UserPluginsDir,
		EnableHelm:             conf.EnableHelm,
		EnableDynamicClusters:  conf.EnableDynamicClusters,
		EnableClusterInventory: conf.EnableClusterInventory,
		AllowKubeconfigChanges: conf.AllowKubeconfigChanges,
		WatchPluginsChanges:    conf.WatchPluginsChanges,
		KubeConfigStore:        kubeConfigStore,
		BaseURL:                conf.BaseURL,
		ProxyURLs: func() []string {
			proxyURLs := []string{}

			// Trim the spaces around each entry, because a pattern like
			// " https://b.com" never matches, and drop empty entries.
			for _, proxyURL := range strings.Split(conf.ProxyURLs, ",") {
				if proxyURL = strings.TrimSpace(proxyURL); proxyURL != "" {
					proxyURLs = append(proxyURLs, proxyURL)
				}
			}

			return proxyURLs
		}(),
		ClusterInventoryProviderFile:          conf.ClusterInventoryProviderFile,
		ClusterInventoryLabelSelector:         conf.ClusterInventoryLabelSelector,
		ClusterInventoryNamespaces:            conf.ClusterInventoryNamespaces,
		ClusterInventoryRootReconcileInterval: conf.ClusterInventoryRootReconcileInterval,
		ClusterInventoryNoCRDCacheTTL:         conf.ClusterInventoryNoCRDCacheTTL,
		TLSCertPath:                           conf.TLSCertPath,
		TLSKeyPath:                            conf.TLSKeyPath,
		SessionTTL:                            conf.SessionTTL,
		PodDebugImage:                         conf.PodDebugImage,
		NodeShellImage:                        conf.NodeShellImage,
		NodeShellNamespace:                    conf.NodeShellNamespace,
		OidcUseCookie:                         conf.OidcUseCookie,
		OidcUseTokenBroadcast:                 conf.OidcUseTokenBroadcast,
		DefaultLightTheme:                     conf.DefaultLightTheme,
		DefaultDarkTheme:                      conf.DefaultDarkTheme,
		ForceTheme:                            conf.ForceTheme,
		UnsafeUseServiceAccountToken:          conf.UnsafeUseServiceAccountToken,
		ServiceAccountTokenPath:               conf.ServiceAccountTokenPath,
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

// setupKubeConfigStoreWatcher sets up a listener on the kubeConfigStore to sync watchers
// when kubeconfig contexts change.
func setupKubeConfigStoreWatcher(kubeConfigStore kubeconfig.ContextStore) {
	var (
		syncTimer  *time.Timer
		syncMu     sync.Mutex
		generation int64
	)

	kubeConfigStore.AddListener(func() {
		syncMu.Lock()
		defer syncMu.Unlock()

		generation++
		currentGen := generation

		if syncTimer != nil {
			syncTimer.Stop()
		}

		syncTimer = time.AfterFunc(500*time.Millisecond, func() {
			syncMu.Lock()
			if currentGen != generation {
				syncMu.Unlock()
				return
			}
			syncMu.Unlock()

			contexts, err := kubeConfigStore.GetContexts()
			if err != nil {
				logger.Log(logger.LevelWarn, nil, err, "failed to get kubeconfig contexts; skipping watcher sync")
				return
			}

			active := make([]string, 0, len(contexts))
			for _, kContext := range contexts {
				key, err := k8cache.ContextCacheKey(kContext.Name, kContext)
				if err == nil {
					active = append(active, key)
				}
			}

			k8cache.SyncWatchers(k8sResponseCache, active)
		})
	})
}

// loadOidcCACert reads the OIDC CA certificate from file if configured.
func loadOidcCACert(oidcCAFile string) string {
	if oidcCAFile == "" {
		return ""
	}

	caFileContents, err := os.ReadFile(oidcCAFile) //nolint:gosec // CA file path is provided via CLI configuration
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading oidc ca file")
		os.Exit(1)
	}

	return string(caFileContents)
}

func createHeadlampConfig(conf *config.Config) *HeadlampConfig {
	cache := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()
	setupKubeConfigStoreWatcher(kubeConfigStore)

	multiplexer := NewMultiplexer(kubeConfigStore, conf.InCluster && conf.UnsafeUseServiceAccountToken)

	cfg := &headlampconfig.HeadlampConfig{
		HeadlampCFG:               buildHeadlampCFG(conf, kubeConfigStore),
		OidcAutoLogin:             conf.OidcAutoLogin,
		OidcClientID:              conf.OidcClientID,
		OidcValidatorClientID:     conf.OidcValidatorClientID,
		OidcClientSecret:          conf.OidcClientSecret,
		OidcIdpIssuerURL:          conf.OidcIdpIssuerURL,
		OidcCallbackURL:           conf.OidcCallbackURL,
		OidcValidatorIdpIssuerURL: conf.OidcValidatorIdpIssuerURL,
		OidcScopes:                splitOIDCScopes(conf.OidcScopes),
		OidcSkipTLSVerify:         conf.OidcSkipTLSVerify,
		OidcSkipLogout:            conf.OidcSkipLogout,
		OidcUseAccessToken:        conf.OidcUseAccessToken,
		OidcUsePKCE:               conf.OidcUsePKCE,
		MeUsernamePaths:           conf.MeUsernamePath,
		MeEmailPaths:              conf.MeEmailPath,
		MeGroupsPaths:             conf.MeGroupsPath,
		MeUserInfoURL:             conf.MeUserInfoURL,
		Cache:                     cache,
		Multiplexer:               multiplexer,
		TelemetryConfig:           buildTelemetryConfig(conf),
		OidcCACert:                loadOidcCACert(conf.OidcCAFile),
	}

	cfg.ProxyAuthEnabled = conf.ProxyAuthEnabled
	cfg.ProxyAuthUsernameHeader = conf.ProxyAuthUsernameHeader
	cfg.ProxyAuthGroupHeader = conf.ProxyAuthGroupHeader
	cfg.ProxyAuthEmailHeader = conf.ProxyAuthEmailHeader
	cfg.ProxyAuthTokenHeader = conf.ProxyAuthTokenHeader

	compiledProxyURLs, err := compileProxyURLPatterns(cfg.ProxyURLs)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to compile proxy URL patterns")
		os.Exit(1)
	}

	cfg.AdminSettings, err = loadAdminSettings(conf.SettingsPath)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "loading admin settings")
		os.Exit(1)
	}

	return &HeadlampConfig{
		HeadlampConfig:    cfg,
		compiledProxyURLs: compiledProxyURLs,
	}
}

// loadAdminSettings reads and validates the admin settings JSON file.
func loadAdminSettings(path string) (json.RawMessage, error) {
	if path == "" {
		return nil, nil
	}

	data, err := os.ReadFile(path) //nolint:gosec // Settings file path is provided via CLI configuration
	if err != nil {
		return nil, fmt.Errorf("reading settings file: %w", err)
	}

	if !json.Valid(data) {
		return nil, errors.New("settings file is not valid JSON")
	}

	return data, nil
}

// GetContextKeyAndKContext returns Kcontext , ContextKey for using these in CacheMiddleWare function.
// It also returns the span that covers the request, which the caller must end;
// on error the span is already ended.
func GetContextKeyAndKContext(w http.ResponseWriter,
	r *http.Request, c *HeadlampConfig) (trace.Span, string, *kubeconfig.Context, error,
) {
	ctx, span := telemetry.CreateSpan(r.Context(), r, "cluster-api", "handleClusterAPI",
		attribute.String("cluster", mux.Vars(r)["clusterName"]),
	)

	contextKey, err := c.getContextKeyForRequest(r)
	if err != nil {
		c.handleError(w, ctx, span, err, "failed to get context Key:", http.StatusBadRequest)
		span.End()

		return nil, "", nil, err
	}

	contextKey, kContext, err := c.getContextWithWebSocketFallback(r, contextKey)
	if err != nil {
		c.handleError(w, ctx, span, err, "failed to get context", http.StatusNotFound)
		span.End()

		return nil, "", nil, err
	}

	return span, contextKey, kContext, nil
}

// CacheMiddleWare is middleware for caching purposes. It generates a key for each request,
// authorizes the user, stores resource data in cache, and returns cached data when available.
func CacheMiddleWare(c *HeadlampConfig) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		if !c.CacheEnabled {
			return next
		}

		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cacheMiddlewareHandler(c, next, w, r)
		})
	}
}

func cacheMiddlewareHandler(c *HeadlampConfig, next http.Handler, w http.ResponseWriter, r *http.Request) {
	if k8cache.SkipWebSocket(r, next, w) {
		return
	}

	if !k8cache.IsKubernetesAPIPath(r.URL.Path) || k8cache.IsSelfSubjectReviewAPIPath(r.URL.Path) {
		next.ServeHTTP(w, r)
		return
	}

	span, contextKey, kContext, err := GetContextKeyAndKContext(w, r, c)
	if err != nil {
		return
	}
	defer span.End()

	resolved := resolvedClusterContext{key: contextKey, context: kContext}
	r = r.WithContext(context.WithValue(r.Context(), resolvedClusterContextKey{}, resolved))
	c.normalizeClusterCredentials(r, mux.Vars(r)["clusterName"], kContext)

	connection, err := k8cache.ContextCacheKey(contextKey, kContext)
	if err != nil {
		next.ServeHTTP(w, r)
		return
	}

	if err := k8cache.HandleNonGETCacheInvalidation(k8sResponseCache, w, r, next, connection); err != nil {
		return // The mutation was forwarded exactly once.
	}

	if !k8cache.CacheableRequest(r) {
		next.ServeHTTP(w, r)
		return
	}

	key, err := k8cache.GenerateRequestKey(r, connection)
	if err != nil {
		next.ServeHTTP(w, r)
		return
	}

	allowed, err := k8cache.IsAllowed(contextKey, kContext, r)
	if err != nil {
		next.ServeHTTP(w, r)
		return
	}

	if !allowed {
		if err := k8cache.ReturnAuthErrorResponse(w, r, contextKey); err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to return authorization response")
		}

		return
	}

	serveCachedResource(c, next, w, r, span, key, kContext)
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

func splitOIDCScopes(scopes string) []string {
	result := []string{}

	for _, scope := range strings.Split(scopes, ",") {
		if scope = strings.TrimSpace(scope); scope != "" {
			result = append(result, scope)
		}
	}

	return result
}

type resolvedClusterContext struct {
	key     string
	context *kubeconfig.Context
}

type resolvedClusterContextKey struct{}

func serveCachedResource(c *HeadlampConfig, next http.Handler, w http.ResponseWriter,
	r *http.Request, span trace.Span, key string, kContext *kubeconfig.Context,
) {
	read := k8cache.BeginCacheRead(k8sResponseCache, key, kContext, auth.BearerTokenValue(r.Header.Get("Authorization")))

	if !read.Ready() {
		next.ServeHTTP(w, r)
		return
	}

	if served, err := read.Load(w, r); served {
		if err != nil {
			logger.Log(logger.LevelInfo, nil, err, "failed to write cached response")
		}

		c.TelemetryHandler.RecordEvent(span, "Served from cache")

		return
	}

	response := k8cache.NewResponseCapture(w)
	next.ServeHTTP(response, r)

	if err := read.Store(response); err != nil {
		logger.Log(logger.LevelWarn, nil, err, "failed to store Kubernetes response")
	}
}
