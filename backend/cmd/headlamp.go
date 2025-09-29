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
	"bytes"
	"compress/gzip"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	oidc "github.com/coreos/go-oidc/v3/oidc"
	"github.com/gobwas/glob"
	"github.com/google/uuid"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	auth "github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"

	headlampcfg "github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/helm"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/plugins"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/portforward"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/spa"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"

	"golang.org/x/oauth2"
)

type HeadlampConfig struct {
	*headlampcfg.HeadlampCFG
	oidcClientID              string
	oidcValidatorClientID     string
	oidcClientSecret          string
	oidcIdpIssuerURL          string
	oidcCallbackURL           string
	oidcValidatorIdpIssuerURL string
	oidcUseAccessToken        bool
	oidcSkipTLSVerify         bool
	oidcCACert                string
	cache                     cache.Cache[interface{}]
	multiplexer               *Multiplexer
	telemetryConfig           cfg.Config
	oidcScopes                []string
	telemetryHandler          *telemetry.RequestHandler
}

const DrainNodeCacheTTL = 20 // seconds

const isWindows = runtime.GOOS == "windows"

const ContextCacheTTL = 5 * time.Minute // minutes

const ContextUpdateCacheTTL = 20 * time.Second // seconds

const JWTExpirationTTL = 10 * time.Second // seconds

const kubeConfigSource = "kubeconfig" // source for kubeconfig contexts

const (
	// TokenCacheFileMode is the file mode for token cache files.
	TokenCacheFileMode = 0o600 // octal
	// TokenCacheFileName is the name of the token cache file.
	TokenCacheFileName = "headlamp-token-cache"
)

type clientConfig struct {
	Clusters                []Cluster `json:"clusters"`
	IsDynamicClusterEnabled bool      `json:"isDynamicClusterEnabled"`
}

type OauthConfig struct {
	Config   *oauth2.Config
	Verifier *oidc.IDTokenVerifier
	Ctx      context.Context
}

// returns True if a file exists.
func fileExists(filename string) bool {
	info, err := os.Stat(filename)
	if os.IsNotExist(err) {
		return false
	}

	return !info.IsDir()
}

func mustReadFile(path string) []byte {
	data, err := os.ReadFile(path)
	if err != nil {
		// Error Reading the file
		logger.Log(logger.LevelError, nil, err, "reading file")
		os.Exit(1)
	}

	return data
}

func mustWriteFile(path string, data []byte) {
	err := os.WriteFile(path, data, fs.FileMode(0o600))
	if err != nil {
		// Error writing the file
		logger.Log(logger.LevelError, nil, err, "writing file")
		os.Exit(1)
	}
}

func makeBaseURLReplacements(data []byte, baseURL string) []byte {
	replaceURL := baseURL
	if baseURL == "" {
		// We have to do the replace when baseURL == "" because of the case when
		//   someone first does a different baseURL. If we didn't it would stay stuck
		//   on that previous baseURL.
		replaceURL = "/"
	}

	// Replacement for headlampBaseUrl - matched from the known index.html content
	data = bytes.ReplaceAll(
		data,
		[]byte("headlampBaseUrl = __baseUrl__"),
		[]byte(fmt.Sprintf("headlampBaseUrl = '%s'", replaceURL)),
	)

	// Replace any resource that has "./" in it
	data = bytes.ReplaceAll(
		data,
		[]byte("./"),
		[]byte(fmt.Sprintf("%s/", baseURL)),
	)

	// Insert baseURL in css url() imports, they don't have "./" in them
	data = bytes.ReplaceAll(
		data,
		[]byte("url("),
		[]byte(fmt.Sprintf("url(%s/", baseURL)),
	)

	return data
}

// make sure the base-url is updated in the index.html file.
func baseURLReplace(staticDir string, baseURL string) {
	indexBaseURL := path.Join(staticDir, "index.baseUrl.html")
	index := path.Join(staticDir, "index.html")

	// keep a copy of the untouched index.html file as the source for replacements
	if !fileExists(indexBaseURL) {
		d := mustReadFile(index)
		mustWriteFile(indexBaseURL, d)
	}

	// replace baseURL starting from the original copy, incase we run this multiple times
	data := mustReadFile(indexBaseURL)
	output := makeBaseURLReplacements(data, baseURL)
	mustWriteFile(index, output)
}

func getOidcCallbackURL(r *http.Request, config *HeadlampConfig) string {
	// If callback URL is configured, use it
	if config.oidcCallbackURL != "" {
		return config.oidcCallbackURL
	}

	// Otherwise, generate callback URL dynamically
	urlScheme := r.URL.Scheme
	if urlScheme == "" {
		// check proxy headers first
		fwdProto := r.Header.Get("X-Forwarded-Proto")

		switch {
		case fwdProto != "":
			urlScheme = fwdProto
		case strings.HasPrefix(r.Host, "localhost:") || r.TLS == nil:
			urlScheme = "http"
		default:
			urlScheme = "https"
		}
	}

	// Clean up + add the base URL to the redirect URL
	hostWithBaseURL := strings.Trim(r.Host, "/")
	baseURL := strings.Trim(config.BaseURL, "/")

	if baseURL != "" {
		hostWithBaseURL = hostWithBaseURL + "/" + baseURL
	}

	return fmt.Sprintf("%s://%s/oidc-callback", urlScheme, hostWithBaseURL)
}

func serveWithNoCacheHeader(fs http.Handler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Cache-Control", "no-cache")
		fs.ServeHTTP(w, r)
	}
}

func defaultHeadlampKubeConfigFile() (string, error) {
	return cfg.DefaultHeadlampKubeConfigFile()
}

// addPluginRoutes adds plugin routes to a router.
// It serves plugin list base paths as json at "plugins".
// It serves plugin static files at "plugins/" and "static-plugins/".
// It disables caching and reloads plugin list base paths if not in-cluster.
func addPluginRoutes(config *HeadlampConfig, r *mux.Router) {
	// Delete plugin route.
	// This is only available when running locally.
	if !config.UseInCluster {
		addPluginDeleteRoute(config, r)
	}

	addPluginListRoute(config, r)

	// Serve plugins
	pluginHandler := http.StripPrefix(config.BaseURL+"/plugins/", http.FileServer(http.Dir(config.PluginDir)))
	// If we're running locally, then do not cache the plugins. This ensures that reloading them (development,
	// update) will actually get the new content.
	if !config.UseInCluster {
		pluginHandler = serveWithNoCacheHeader(pluginHandler)
	}

	r.PathPrefix("/plugins/").Handler(pluginHandler)

	if config.StaticPluginDir != "" {
		staticPluginsHandler := http.StripPrefix(config.BaseURL+"/static-plugins/",
			http.FileServer(http.Dir(config.StaticPluginDir)))
		r.PathPrefix("/static-plugins/").Handler(staticPluginsHandler)
	}
}

// addPluginDeleteRoute registers a DELETE endpoint handler at "/plugins/{name}" for plugin deletion.
// This endpoint is only available when running in local (non-cluster) mode.
func addPluginDeleteRoute(config *HeadlampConfig, r *mux.Router) {
	r.HandleFunc("/plugins/{name}", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		var span trace.Span
		pluginName := mux.Vars(r)["name"]

		// Start tracing for deletePlugin.
		if config.Telemetry != nil {
			_, span = telemetry.CreateSpan(ctx, r, "plugins", "deletePlugin",
				attribute.String("plugin.name", pluginName),
			)

			defer span.End()
		}

		// Increment deletion attempt metric
		if config.Telemetry != nil && config.Metrics != nil {
			config.Metrics.PluginDeleteCount.Add(ctx, 1)
		}

		logger.Log(logger.LevelInfo, nil, nil, "Received DELETE request for plugin: "+mux.Vars(r)["name"])

		if err := checkHeadlampBackendToken(w, r); err != nil {
			config.telemetryHandler.RecordError(span, err, " Invalid backend token")
			logger.Log(logger.LevelWarn, nil, err, "Invalid backend token for DELETE /plugins/{name}")
			return
		}

		err := plugins.Delete(config.PluginDir, pluginName)
		if err != nil {
			config.telemetryHandler.RecordError(span, err, "Failed to delete plugin")

			logger.Log(logger.LevelError, nil, err, "Error deleting plugin: "+pluginName)
			http.Error(w, "Error deleting plugin", http.StatusInternalServerError)
			return
		}
		logger.Log(logger.LevelInfo, nil, nil, "Plugin deleted successfully: "+pluginName)

		w.WriteHeader(http.StatusOK)
	}).Methods("DELETE")
}

// addPluginListRoute registers a GET endpoint handler at "/plugins" that serves the list of available plugins.
// It handles Telemetry, metrics collection, and plugin list caching.
func addPluginListRoute(config *HeadlampConfig, r *mux.Router) {
	r.HandleFunc("/plugins", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		var span trace.Span

		// Start tracing for listPlugins.
		if config.Telemetry != nil {
			_, span = telemetry.CreateSpan(ctx, r, "plugins", "listPlugins")

			defer span.End()
		}

		// Increment metric for plugin loads
		if config.Telemetry != nil && config.Metrics != nil {
			config.Metrics.PluginLoadCount.Add(ctx, 1)
		}

		logger.Log(logger.LevelInfo, nil, nil, "Received GET request for plugin list")

		w.Header().Set("Content-Type", "application/json")
		pluginsList, err := config.cache.Get(context.Background(), plugins.PluginListKey)
		if err != nil && err == cache.ErrNotFound {
			pluginsList = []string{}

			if config.Telemetry != nil {
				span.SetAttributes(attribute.Int("plugins.count", 0))
			}
		} else if config.Telemetry != nil && pluginsList != nil {
			if list, ok := pluginsList.([]string); ok {
				span.SetAttributes(attribute.Int("plugins.count", len(list)))
			}
		}
		if err := json.NewEncoder(w).Encode(pluginsList); err != nil {
			logger.Log(logger.LevelError, nil, err, "encoding plugins base paths list")
		} else {
			// Notify that the client has requested the plugins list. So we can start sending
			// refresh requests.
			if err := config.cache.Set(context.Background(), plugins.PluginCanSendRefreshKey, true); err != nil {
				config.telemetryHandler.RecordError(span, err, "Failed to set plugin-can-send-refresh key")
				logger.Log(logger.LevelError, nil, err, "setting plugin-can-send-refresh key failed")
			} else if config.Telemetry != nil {
				span.SetStatus(codes.Ok, "Plugin list retrieved successfully")
			}
		}
	}).Methods("GET")
}

//nolint:gocognit,funlen,gocyclo
func createHeadlampHandler(config *HeadlampConfig) http.Handler {
	kubeConfigPath := config.KubeConfigPath

	config.StaticPluginDir = os.Getenv("HEADLAMP_STATIC_PLUGINS_DIR")

	logger.Log(logger.LevelInfo, nil, nil, "Creating Headlamp handler")
	logger.Log(logger.LevelInfo, nil, nil, "Listen address: "+fmt.Sprintf("%s:%d", config.ListenAddr, config.Port))
	logger.Log(logger.LevelInfo, nil, nil, "Kubeconfig path: "+kubeConfigPath)
	logger.Log(logger.LevelInfo, nil, nil, "Static plugin dir: "+config.StaticPluginDir)
	logger.Log(logger.LevelInfo, nil, nil, "Plugins dir: "+config.PluginDir)
	logger.Log(logger.LevelInfo, nil, nil, "Dynamic clusters support: "+fmt.Sprint(config.EnableDynamicClusters))
	logger.Log(logger.LevelInfo, nil, nil, "Helm support: "+fmt.Sprint(config.EnableHelm))
	logger.Log(logger.LevelInfo, nil, nil, "Proxy URLs: "+fmt.Sprint(config.ProxyURLs))

	plugins.PopulatePluginsCache(config.StaticPluginDir, config.PluginDir, config.cache)

	skipFunc := kubeconfig.SkipKubeContextInCommaSeparatedString(config.SkippedKubeContexts)

	if !config.UseInCluster || config.WatchPluginsChanges {
		// in-cluster mode is unlikely to want reloading plugins.
		pluginEventChan := make(chan string)
		go plugins.Watch(config.PluginDir, pluginEventChan)
		go plugins.HandlePluginEvents(config.StaticPluginDir, config.PluginDir, pluginEventChan, config.cache)
		// in-cluster mode is unlikely to want reloading kubeconfig.
		go kubeconfig.LoadAndWatchFiles(config.KubeConfigStore, kubeConfigPath, kubeconfig.KubeConfig, skipFunc)
	}

	// In-cluster
	if config.UseInCluster {
		context, err := kubeconfig.GetInClusterContext(config.oidcIdpIssuerURL,
			config.oidcClientID, config.oidcClientSecret,
			strings.Join(config.oidcScopes, ","),
			config.oidcSkipTLSVerify,
			config.oidcCACert)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to get in-cluster context")
		}

		context.Source = kubeconfig.InCluster

		err = context.SetupProxy()
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to setup proxy for in-cluster context")
		}

		err = config.KubeConfigStore.AddContext(context)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to add in-cluster context")
		}
	}

	if config.StaticDir != "" {
		baseURLReplace(config.StaticDir, config.BaseURL)
	}

	// For when using a base-url, like "/headlamp" with a reverse proxy.
	var r *mux.Router
	if config.BaseURL == "" {
		r = mux.NewRouter()
	} else {
		baseRoute := mux.NewRouter()
		r = baseRoute.PathPrefix(config.BaseURL).Subrouter()
	}

	fmt.Println("*** Headlamp Server ***")
	fmt.Println("  API Routers:")

	// load kubeConfig clusters
	err := kubeconfig.LoadAndStoreKubeConfigs(config.KubeConfigStore, kubeConfigPath, kubeconfig.KubeConfig, skipFunc)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "loading kubeconfig")
	}

	// Prometheus metrics endpoint
	// to enable this endpoint, run command run-backend-with-metrics
	// or set the environment variable HEADLAMP_CONFIG_METRICS_ENABLED=true
	if config.Metrics != nil && config.telemetryConfig.MetricsEnabled != nil && *config.telemetryConfig.MetricsEnabled {
		r.Handle("/metrics", promhttp.Handler())
		logger.Log(logger.LevelInfo, nil, nil, "prometheus metrics endpoint: /metrics")
	}

	// load dynamic clusters
	kubeConfigPersistenceFile, err := defaultHeadlampKubeConfigFile()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting default kubeconfig persistence file")
	}

	err = kubeconfig.LoadAndStoreKubeConfigs(config.KubeConfigStore, kubeConfigPersistenceFile,
		kubeconfig.DynamicCluster, skipFunc)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "loading dynamic kubeconfig")
	}

	addPluginRoutes(config, r)

	// Setup port forwarding handlers.
	r.HandleFunc("/clusters/{clusterName}/portforward", func(w http.ResponseWriter, r *http.Request) {
		portforward.StartPortForward(config.KubeConfigStore, config.cache, w, r)
	}).Methods("POST")

	r.HandleFunc("/clusters/{clusterName}/portforward", func(w http.ResponseWriter, r *http.Request) {
		portforward.StopOrDeletePortForward(config.cache, w, r)
	}).Methods("DELETE")

	r.HandleFunc("/clusters/{clusterName}/portforward/list", func(w http.ResponseWriter, r *http.Request) {
		portforward.GetPortForwards(config.cache, w, r)
	})
	r.HandleFunc("/clusters/{clusterName}/portforward", func(w http.ResponseWriter, r *http.Request) {
		portforward.GetPortForwardByID(config.cache, w, r)
	}).Methods("GET")

	config.handleClusterRequests(r)

	r.HandleFunc("/externalproxy", func(w http.ResponseWriter, r *http.Request) {
		proxyURL := r.Header.Get("proxy-to")
		if proxyURL == "" && r.Header.Get("Forward-to") != "" {
			proxyURL = r.Header.Get("Forward-to")
		}

		if proxyURL == "" {
			logger.Log(logger.LevelError, map[string]string{"proxyURL": proxyURL},
				errors.New("proxy URL is empty"), "proxy URL is empty")
			http.Error(w, "proxy URL is empty", http.StatusBadRequest)

			return
		}

		url, err := url.Parse(proxyURL)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"proxyURL": proxyURL},
				err, "The provided proxy URL is invalid")
			http.Error(w, fmt.Sprintf("The provided proxy URL is invalid: %v", err), http.StatusBadRequest)

			return
		}

		isURLContainedInProxyURLs := false

		for _, proxyURL := range config.ProxyURLs {
			g := glob.MustCompile(proxyURL)
			if g.Match(url.String()) {
				isURLContainedInProxyURLs = true
				break
			}
		}

		if !isURLContainedInProxyURLs {
			logger.Log(logger.LevelError, nil, err, "no allowed proxy url match, request denied")
			http.Error(w, "no allowed proxy url match, request denied ", http.StatusBadRequest)

			return
		}

		ctx := context.Background()

		proxyReq, err := http.NewRequestWithContext(ctx, r.Method, proxyURL, r.Body)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "creating request")
			http.Error(w, err.Error(), http.StatusInternalServerError)

			return
		}

		// We may want to filter some headers, otherwise we could just use a shallow copy
		proxyReq.Header = make(http.Header)
		for h, val := range r.Header {
			proxyReq.Header[h] = val
		}

		// Disable caching
		w.Header().Set("Cache-Control", "no-cache, private, max-age=0")
		w.Header().Set("Expires", time.Unix(0, 0).Format(http.TimeFormat))
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("X-Accel-Expires", "0")

		client := http.Client{}

		resp, err := client.Do(proxyReq)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "making request")
			http.Error(w, err.Error(), http.StatusBadGateway)

			return
		}

		defer resp.Body.Close()

		// Check that the server actually sent compressed data
		var reader io.ReadCloser

		switch resp.Header.Get("Content-Encoding") {
		case "gzip":
			reader, err = gzip.NewReader(resp.Body)
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "reading gzip response")
				http.Error(w, err.Error(), http.StatusInternalServerError)

				return
			}
			defer reader.Close()
		default:
			reader = resp.Body
		}

		respBody, err := io.ReadAll(reader)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "reading response")
			http.Error(w, err.Error(), http.StatusBadGateway)

			return
		}

		_, err = w.Write(respBody)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "writing response")
			http.Error(w, err.Error(), http.StatusInternalServerError)

			return
		}

		defer resp.Body.Close()
	})

	// Configuration
	r.HandleFunc("/config", config.getConfig).Methods("GET")

	// Auth token management
	r.HandleFunc("/auth/set-token", config.handleSetToken).Methods("POST")

	// Websocket connections
	r.HandleFunc("/wsMultiplexer", config.multiplexer.HandleClientWebSocket)

	config.addClusterSetupRoute(r)

	oauthRequestMap := make(map[string]*OauthConfig)

	r.HandleFunc("/oidc", func(w http.ResponseWriter, r *http.Request) {
		ctx := context.Background()
		cluster := r.URL.Query().Get("cluster")
		if config.Insecure {
			tr := &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
			}
			InsecureClient := &http.Client{Transport: tr}
			ctx = oidc.ClientContext(ctx, InsecureClient)
		}

		kContext, err := config.KubeConfigStore.GetContext(cluster)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"cluster": cluster},
				err, "failed to get context")

			http.NotFound(w, r)
			return
		}

		oidcAuthConfig, err := kContext.OidcConfig()
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"cluster": cluster},
				err, "failed to get oidc config")

			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		ctx = configureTLSContext(ctx, oidcAuthConfig.SkipTLSVerify, oidcAuthConfig.CACert)

		if config.oidcValidatorIdpIssuerURL != "" {
			ctx = oidc.InsecureIssuerURLContext(ctx, config.oidcValidatorIdpIssuerURL)
		}

		provider, err := oidc.NewProvider(ctx, oidcAuthConfig.IdpIssuerURL)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"idpIssuerURL": oidcAuthConfig.IdpIssuerURL},
				err, "failed to get provider")

			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		validatorClientID := oidcAuthConfig.ClientID
		if config.oidcValidatorClientID != "" {
			validatorClientID = config.oidcValidatorClientID
		}
		oidcConfig := &oidc.Config{
			ClientID: validatorClientID,
		}

		verifier := provider.Verifier(oidcConfig)
		oauthConfig := &oauth2.Config{
			ClientID:     oidcAuthConfig.ClientID,
			ClientSecret: oidcAuthConfig.ClientSecret,
			Endpoint:     provider.Endpoint(),
			RedirectURL:  getOidcCallbackURL(r, config),
			Scopes:       append([]string{oidc.ScopeOpenID}, oidcAuthConfig.Scopes...),
		}
		/* we encode the cluster to base64 and set it as state so that when getting redirected
		by oidc we can use this state value to get cluster name
		*/
		state := base64.StdEncoding.EncodeToString([]byte(cluster))
		oauthRequestMap[state] = &OauthConfig{Config: oauthConfig, Verifier: verifier, Ctx: ctx}
		http.Redirect(w, r, oauthConfig.AuthCodeURL(state), http.StatusFound)
	}).Queries("cluster", "{cluster}")

	r.HandleFunc("/drain-node", config.handleNodeDrain).Methods("POST")
	r.HandleFunc("/drain-node-status",
		config.handleNodeDrainStatus).Methods("GET").Queries("cluster", "{cluster}", "nodeName", "{node}")

	r.HandleFunc("/oidc-callback", func(w http.ResponseWriter, r *http.Request) {
		state := r.URL.Query().Get("state")

		decodedState, err := base64.StdEncoding.DecodeString(state)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to decode state")
			http.Error(w, "wrong state set, invalid request "+err.Error(), http.StatusBadRequest)

			return
		}

		if state == "" {
			logger.Log(logger.LevelError, nil, err, "invalid request state is empty")
			http.Error(w, "invalid request state is empty", http.StatusBadRequest)

			return
		}

		//nolint:nestif
		if oauthConfig, ok := oauthRequestMap[state]; ok {
			oauth2Token, err := oauthConfig.Config.Exchange(oauthConfig.Ctx, r.URL.Query().Get("code"))
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "failed to exchange token")
				http.Error(w, "Failed to exchange token: "+err.Error(), http.StatusInternalServerError)

				return
			}

			tokenType := "id_token"
			if config.oidcUseAccessToken {
				tokenType = "access_token"
			}

			rawUserToken, ok := oauth2Token.Extra(tokenType).(string)
			if !ok {
				logger.Log(logger.LevelError, nil, err, fmt.Sprintf("no %s field in oauth2 token", tokenType))
				http.Error(w, fmt.Sprintf("No %s field in oauth2 token.", tokenType), http.StatusInternalServerError)

				return
			}

			if err := config.cache.Set(context.Background(),
				fmt.Sprintf("oidc-token-%s", rawUserToken), oauth2Token.RefreshToken); err != nil {
				logger.Log(logger.LevelError, nil, err, "failed to cache refresh token")
				http.Error(w, "Failed to cache refresh token: "+err.Error(), http.StatusInternalServerError)

				return
			}

			idToken, err := oauthConfig.Verifier.Verify(oauthConfig.Ctx, rawUserToken)
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "failed to verify ID Token")
				http.Error(w, "Failed to verify ID Token: "+err.Error(), http.StatusInternalServerError)

				return
			}

			resp := struct {
				OAuth2Token   *oauth2.Token
				IDTokenClaims *json.RawMessage // ID Token payload is just JSON.
			}{oauth2Token, new(json.RawMessage)}

			if err := idToken.Claims(&resp.IDTokenClaims); err != nil {
				logger.Log(logger.LevelError, nil, err, "failed to get id token claims")
				http.Error(w, err.Error(), http.StatusInternalServerError)

				return
			}

			var redirectURL string
			if config.DevMode {
				redirectURL = "http://localhost:3000/"
			} else {
				redirectURL = "/"
			}

			baseURL := strings.Trim(config.BaseURL, "/")
			if baseURL != "" {
				redirectURL += baseURL + "/"
			}

			// Set auth cookie
			auth.SetTokenCookie(w, r, string(decodedState), rawUserToken)

			redirectURL += fmt.Sprintf("auth?cluster=%1s", decodedState)
			http.Redirect(w, r, redirectURL, http.StatusSeeOther)
		} else {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
	})

	// Serve the frontend if needed
	if spa.UseEmbeddedFiles {
		r.PathPrefix("/").Handler(spa.NewEmbeddedHandler(spa.StaticFilesEmbed, "index.html", config.BaseURL))
	} else if config.StaticDir != "" {
		staticPath := config.StaticDir

		if isWindows {
			// We support unix paths on windows. So "frontend/static" works.
			if strings.Contains(config.StaticDir, "/") {
				staticPath = filepath.FromSlash(config.StaticDir)
			}
		}

		spa := spa.NewHandler(staticPath, "index.html", config.BaseURL)
		r.PathPrefix("/").Handler(spa)

		http.Handle("/", r)
	}

	// On dev mode we're loose about where connections come from
	if config.DevMode {
		headers := handlers.AllowedHeaders([]string{
			"X-HEADLAMP_BACKEND-TOKEN", "X-Requested-With", "Content-Type",
			"Authorization", "Forward-To",
			"KUBECONFIG", "X-HEADLAMP-USER-ID",
		})
		methods := handlers.AllowedMethods([]string{"GET", "POST", "PUT", "HEAD", "DELETE", "PATCH", "OPTIONS"})

		return handlers.CORS(
			headers,
			methods,
			handlers.AllowCredentials(),
			handlers.AllowedOriginValidator(func(s string) bool { return true }),
		)(r)
	}

	return r
}

// configureTLSContext configures TLS settings for the HTTP client in the context.
// If skipTLSVerify is true, TLS verification will be skipped.
// If caCert is provided, it will be added to the certificate pool for TLS verification.
func configureTLSContext(ctx context.Context, skipTLSVerify *bool, caCert *string) context.Context {
	if skipTLSVerify != nil && *skipTLSVerify {
		tlsSkipTransport := &http.Transport{
			// the gosec linter is disabled here because we are explicitly requesting to skip TLS verification.
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
		}
		ctx = oidc.ClientContext(ctx, &http.Client{Transport: tlsSkipTransport})
	}

	if caCert != nil {
		caCertPool := x509.NewCertPool()
		if !caCertPool.AppendCertsFromPEM([]byte(*caCert)) {
			// Log error but continue with original context
			logger.Log(logger.LevelError, nil,
				errors.New("failed to append ca cert to pool"), "couldn't add custom cert to context")
			return ctx
		}

		// the gosec linter is disabled because gosec promotes using a minVersion of TLS 1.2 or higher.
		// since we are using a custom CA cert configured by the user, we are not forcing a minVersion.
		customTransport := &http.Transport{
			TLSClientConfig: &tls.Config{ //nolint:gosec
				RootCAs: caCertPool,
			},
		}

		ctx = oidc.ClientContext(ctx, &http.Client{Transport: customTransport})
	}

	return ctx
}

func refreshAndCacheNewToken(oidcAuthConfig *kubeconfig.OidcConfig,
	cache cache.Cache[interface{}],
	tokenType, token, issuerURL string,
) (*oauth2.Token, error) {
	ctx := context.Background()
	ctx = configureTLSContext(ctx, oidcAuthConfig.SkipTLSVerify, oidcAuthConfig.CACert)

	// get provider
	provider, err := oidc.NewProvider(ctx, issuerURL)
	if err != nil {
		return nil, fmt.Errorf("getting provider: %v", err)
	}
	// get refresh token
	newToken, err := auth.GetNewToken(
		oidcAuthConfig.ClientID,
		oidcAuthConfig.ClientSecret,
		cache,
		tokenType,
		token,
		provider.Endpoint().TokenURL,
	)
	if err != nil {
		return nil, fmt.Errorf("refreshing token: %v", err)
	}

	return newToken, nil
}

func (c *HeadlampConfig) refreshAndSetToken(oidcAuthConfig *kubeconfig.OidcConfig,
	cache cache.Cache[interface{}], token string,
	w http.ResponseWriter, r *http.Request, cluster string, span trace.Span, ctx context.Context,
) {
	// The token type to use
	tokenType := "id_token"
	if c.oidcUseAccessToken {
		tokenType = "access_token"
	}

	idpIssuerURL := c.oidcIdpIssuerURL
	if idpIssuerURL == "" {
		idpIssuerURL = oidcAuthConfig.IdpIssuerURL
	}

	newToken, err := refreshAndCacheNewToken(
		oidcAuthConfig,
		cache,
		tokenType,
		token,
		idpIssuerURL,
	)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": cluster},
			err, "failed to refresh token")
		c.telemetryHandler.RecordError(span, err, "Token refresh failed")
		c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error", "token_refresh_failure"))
	} else if newToken != nil {
		var newTokenString string
		if c.oidcUseAccessToken {
			newTokenString = newToken.Extra("access_token").(string)
		} else {
			newTokenString = newToken.Extra("id_token").(string)
		}

		// Set refreshed token in cookie
		auth.SetTokenCookie(w, r, cluster, newTokenString)

		c.telemetryHandler.RecordEvent(span, "Token refreshed successfully")
	}
}

func (c *HeadlampConfig) incrementRequestCounter(ctx context.Context) {
	if c.Metrics != nil {
		c.Metrics.RequestCounter.Add(ctx, 1,
			metric.WithAttributes(
				attribute.String("api.route", "OIDCTokenRefreshMiddleware"),
				attribute.String("status", "start"),
			))
	}
}

func (c *HeadlampConfig) shouldSkipOIDCRefresh(w http.ResponseWriter, r *http.Request, span trace.Span,
	ctx context.Context, start time.Time, next http.Handler,
) bool {
	if !strings.HasPrefix(r.URL.String(), "/clusters/") {
		c.telemetryHandler.RecordEvent(span, "Not a cluster request, skipping OIDC refresh")
		next.ServeHTTP(w, r)
		c.telemetryHandler.RecordDuration(ctx, start,
			attribute.String("api.route", "OIDCTokenRefreshMiddleware"),
			attribute.String("status", "skipped"))

		return true
	}

	return false
}

func (c *HeadlampConfig) shouldBypassOIDCRefresh(cluster, token string, w http.ResponseWriter, r *http.Request,
	span trace.Span, ctx context.Context, start time.Time, next http.Handler,
) bool {
	if cluster == "" || token == "" {
		c.telemetryHandler.RecordEvent(span, "Missing cluster or token, bypassing OIDC refresh")
		next.ServeHTTP(w, r)
		c.telemetryHandler.RecordDuration(ctx, start,
			attribute.String("api.route", "OIDCTokenRefreshMiddleware"),
			attribute.String("status", "missing"))

		return true
	}

	return false
}

func (c *HeadlampConfig) handleGetContextError(err error, cluster string, w http.ResponseWriter, r *http.Request,
	span trace.Span, ctx context.Context, start time.Time, next http.Handler,
) bool {
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": cluster},
			err, "failed to get context")
		c.telemetryHandler.RecordError(span, err, "Failed to get context")
		c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error", "get_context_failure"))
		next.ServeHTTP(w, r)
		c.telemetryHandler.RecordDuration(ctx, start,
			attribute.String("api.route", "OIDCTokenRefreshMiddleware"),
			attribute.String("status", "get_context_failure"))

		return true
	}

	return false
}

func (c *HeadlampConfig) handleOIDCAuthConfigError(err error, w http.ResponseWriter, r *http.Request, span trace.Span,
	ctx context.Context, start time.Time, next http.Handler,
) bool {
	if err != nil {
		c.telemetryHandler.RecordEvent(span, "OIDC auth not enabled for cluster")
		next.ServeHTTP(w, r)
		c.telemetryHandler.RecordDuration(ctx, start,
			attribute.String("api.route", "OIDCTokenRefreshMiddleware"),
			attribute.String("status", "oidc_auth_not_enabled"))

		return true
	}

	return false
}

func (c *HeadlampConfig) OIDCTokenRefreshMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		start := time.Now()

		var span trace.Span
		if c.Telemetry != nil {
			_, span = telemetry.CreateSpan(ctx, r, "auth", "OIDCTokenRefreshMiddleware")

			c.telemetryHandler.RecordEvent(span, "Middleware started")

			defer span.End()
		}

		c.incrementRequestCounter(ctx)

		// skip if not cluster request
		if c.shouldSkipOIDCRefresh(w, r, span, ctx, start, next) {
			return
		}

		// parse cluster and token
		cluster, token := auth.ParseClusterAndToken(r)
		if c.shouldBypassOIDCRefresh(cluster, token, w, r, span, ctx, start, next) {
			return
		}

		// get oidc config
		kContext, err := c.KubeConfigStore.GetContext(cluster)
		if c.handleGetContextError(err, cluster, w, r, span, ctx, start, next) {
			return
		}

		// skip if cluster is not using OIDC auth
		oidcAuthConfig, err := kContext.OidcConfig()
		if c.handleOIDCAuthConfigError(err, w, r, span, ctx, start, next) {
			return
		}

		// skip if token is not about to expire
		if !auth.IsTokenAboutToExpire(token) {
			c.telemetryHandler.RecordEvent(span, "Token not about to expire, skipping refresh")
			next.ServeHTTP(w, r)
			c.telemetryHandler.RecordDuration(ctx, start,
				attribute.String("api.route", "OIDCTokenRefreshMiddleware"),
				attribute.String("status", "token_valid"))

			return
		}

		// refresh and cache new token
		c.refreshAndSetToken(oidcAuthConfig, c.cache, token, w, r, cluster, span, ctx)

		next.ServeHTTP(w, r)
		c.telemetryHandler.RecordDuration(ctx, start,
			attribute.String("api.route", "OIDCTokenRefreshMiddleware"),
			attribute.String("status", "success"))
	})
}

func StartHeadlampServer(config *HeadlampConfig) {
	tel, err := telemetry.NewTelemetry(config.telemetryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "Failed to initialize telemetry")
		os.Exit(1)
	}

	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := tel.Shutdown(shutdownCtx); err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to properly shutdown telemetry")
		}
	}()

	metrics, err := telemetry.NewMetrics()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "Failed to initialize metrics")
	}

	config.Telemetry = tel
	config.Metrics = metrics
	config.telemetryHandler = telemetry.NewRequestHandler(tel, metrics)

	router := mux.NewRouter()

	if config.Telemetry != nil && config.Metrics != nil {
		router.Use(telemetry.TracingMiddleware("headlamp-server"))
		router.Use(config.Metrics.RequestCounterMiddleware)
	}

	// Copy static files as squashFS is read-only (AppImage)
	if config.StaticDir != "" {
		dir, err := os.MkdirTemp(os.TempDir(), ".headlamp")
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to create static dir")
			return
		}

		err = os.CopyFS(dir, os.DirFS(config.StaticDir))
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to copy files from static dir")
			return
		}

		config.StaticDir = dir
	}

	handler := createHeadlampHandler(config)

	handler = config.OIDCTokenRefreshMiddleware(handler)

	addr := fmt.Sprintf("%s:%d", config.ListenAddr, config.Port)

	// Start server
	if err := http.ListenAndServe(addr, handler); err != nil { //nolint:gosec
		logger.Log(logger.LevelError, nil, err, "Failed to start server")

		HandleServerStartError(&err)
	}
}

// Handle common server startup errors.
func HandleServerStartError(err *error) {
	// Check if the reason server failed because the address is already in use
	// this might be because backend process is already running
	if errors.Is(*err, syscall.EADDRINUSE) {
		// Exit with 98 (address in use) exit code
		os.Exit(int(syscall.EADDRINUSE))
	}
}

// Returns the helm.Handler given the config and request. Writes http.NotFound if clusterName is not there.
func getHelmHandler(c *HeadlampConfig, w http.ResponseWriter, r *http.Request) (*helm.Handler, error) {
	ctx := r.Context()
	start := time.Now()

	_, span := telemetry.CreateSpan(ctx, r, "headlamp-server", "getHelmHandler")
	c.telemetryHandler.RecordEvent(span, "Get helm handler started")

	defer span.End()
	c.telemetryHandler.RecordRequestCount(ctx, r)

	clusterName := mux.Vars(r)["clusterName"]
	telemetry.AddSpanAttributes(ctx, attribute.String("clusterName", clusterName))

	context, err := c.KubeConfigStore.GetContext(clusterName)
	if err != nil {
		logger.Log(
			logger.LevelError, map[string]string{"clusterName": clusterName},
			err, "failed to get context")
		c.telemetryHandler.RecordError(span, err, "failed to get context")
		c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error", "failed to get context"))
		c.telemetryHandler.RecordDuration(ctx, start, attribute.String("status", "not found"))
		http.NotFound(w, r)

		return nil, errors.New("not found")
	}

	namespace := r.URL.Query().Get("namespace")

	helmHandler, err := helm.NewHandler(context.ClientConfig(), c.cache, namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"namespace": namespace},
			err, "failed to create helm handler")
		c.telemetryHandler.RecordError(span, err, "failed to create helm handler")
		c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error", "helm handler creation failure"))
		c.telemetryHandler.RecordDuration(ctx, start, attribute.String("status", "failure"))
		http.Error(w, "failed to create helm handler", http.StatusInternalServerError)

		return nil, err
	}

	c.telemetryHandler.RecordDuration(ctx, start, attribute.String("status", "success"))
	c.telemetryHandler.RecordEvent(span, "Successfully created helm handler")

	return helmHandler, nil
}

// Check request for header "X-HEADLAMP_BACKEND-TOKEN" matches HEADLAMP_BACKEND_TOKEN env
// This check is to prevent access except for from the app.
// The app sets HEADLAMP_BACKEND_TOKEN, and gives the token to the frontend.
func checkHeadlampBackendToken(w http.ResponseWriter, r *http.Request) error {
	backendToken := r.Header.Get("X-HEADLAMP_BACKEND-TOKEN")
	backendTokenEnv := os.Getenv("HEADLAMP_BACKEND_TOKEN")

	if backendToken != backendTokenEnv || backendTokenEnv == "" {
		http.Error(w, "access denied", http.StatusForbidden)
		return errors.New("X-HEADLAMP_BACKEND-TOKEN does not match HEADLAMP_BACKEND_TOKEN")
	}

	return nil
}

//nolint:funlen
func handleClusterHelm(c *HeadlampConfig, router *mux.Router) {
	router.PathPrefix("/clusters/{clusterName}/helm/{.*}").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		path := r.URL.Path
		clusterName := mux.Vars(r)["clusterName"]

		_, span := telemetry.CreateSpan(ctx, r, "helm", "handleClusterHelm",
			attribute.String("cluster", clusterName),
		)
		c.telemetryHandler.RecordEvent(span, "Starting Helm operation request")
		defer span.End()

		c.telemetryHandler.RecordRequestCount(ctx, r, attribute.String("cluster", clusterName))

		if err := checkHeadlampBackendToken(w, r); err != nil {
			c.handleError(w, ctx, span, err, "failed to check headlamp backend token", http.StatusForbidden)

			return
		}

		helmHandler, err := getHelmHandler(c, w, r)
		if err != nil {
			c.handleError(w, ctx, span, err, "failed to get helm handler", http.StatusForbidden)

			return
		}

		routeHandler := func(route, operation string, handler func(http.ResponseWriter, *http.Request)) {
			c.telemetryHandler.RecordEvent(span, "Executing route",
				attribute.String("route", route),
				attribute.String("operation", operation))
			c.telemetryHandler.RecordRequestCount(ctx, r)

			logger.Log(logger.LevelInfo, map[string]string{"route": route}, nil, "Dispatching helm operation: "+operation)
			handler(w, r)
		}

		switch {
		case strings.HasSuffix(path, "/releases/list") && r.Method == http.MethodGet:
			routeHandler("/releases/list", "ListRelease", helmHandler.ListRelease)
			return
		case strings.HasSuffix(path, "/release/install") && r.Method == http.MethodPost:
			routeHandler("/release/install", "InstallRelease", helmHandler.InstallRelease)
			return
		case strings.HasSuffix(path, "/release/history") && r.Method == http.MethodGet:
			routeHandler("/release/history", "GetReleaseHistory", helmHandler.GetReleaseHistory)
			return
		case strings.HasSuffix(path, "/releases/uninstall") && r.Method == http.MethodDelete:
			routeHandler("/releases/uninstall", "UninstallRelease", helmHandler.UninstallRelease)
			return
		case strings.HasSuffix(path, "/releases/rollback") && r.Method == http.MethodPut:
			routeHandler("/releases/rollback", "RollbackRelease", helmHandler.RollbackRelease)
			return
		case strings.HasSuffix(path, "/releases/upgrade") && r.Method == http.MethodPut:
			routeHandler("/releases/upgrade", "UpgradeRelease", helmHandler.UpgradeRelease)
			return
		case strings.HasSuffix(path, "/releases") && r.Method == http.MethodGet:
			routeHandler("/releases", "GetRelease", helmHandler.GetRelease)
			return
		case strings.HasSuffix(path, "/repositories") && r.Method == http.MethodGet:
			routeHandler("/repositories", "ListRepo", helmHandler.ListRepo)
			return
		case strings.HasSuffix(path, "/repositories") && r.Method == http.MethodPost:
			routeHandler("/repositories", "AddRepo", helmHandler.AddRepo)
			return
		case strings.HasSuffix(path, "/repositories/remove") && r.Method == http.MethodDelete:
			routeHandler("/repositories/remove", "RemoveRepo", helmHandler.RemoveRepo)
			return
		case strings.HasSuffix(path, "/repositories/update") && r.Method == http.MethodPut:
			routeHandler("/repositories/update", "UpdateRepository", helmHandler.UpdateRepository)
			return
		case strings.HasSuffix(path, "/charts") && r.Method == http.MethodGet:
			routeHandler("/charts", "ListCharts", helmHandler.ListCharts)
			return
		case strings.HasSuffix(path, "/action/status") && r.Method == http.MethodGet:
			routeHandler("/action/status", "GetActionStatus", helmHandler.GetActionStatus)
			return
		default:
			logger.Log(logger.LevelError, map[string]string{"path": path}, nil, "Unknown helm API route")

			c.telemetryHandler.RecordEvent(span, "Unknown API route", attribute.String("path", path))
			span.SetStatus(codes.Error, "Unknown API route")
			c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error", "unknown_route"))

			http.NotFound(w, r)

			return
		}
	})
}

func (c *HeadlampConfig) handleError(w http.ResponseWriter, ctx context.Context,
	span trace.Span, err error, msg string, status int,
) {
	logger.Log(logger.LevelError, nil, err, msg)
	c.telemetryHandler.RecordError(span, err, msg)
	c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", msg))
	http.Error(w, err.Error(), status)
}

func clusterRequestHandler(c *HeadlampConfig) http.Handler { //nolint:funlen
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ctx := r.Context()

		ctx, span := telemetry.CreateSpan(ctx, r, "cluster-api", "handleClusterAPI",
			attribute.String("cluster", mux.Vars(r)["clusterName"]),
		)
		defer span.End()

		c.telemetryHandler.RecordRequestCount(ctx, r, attribute.String("cluster", mux.Vars(r)["clusterName"]))
		c.telemetryHandler.RecordEvent(span, "Cluster API request started")

		// A deferred function to record duration metrics & log the request completion
		defer recordRequestCompletion(c, ctx, start, r)

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

		clusterURL, err := url.Parse(kContext.Cluster.Server)
		if err != nil {
			c.handleError(w, ctx, span, err, "failed to parse cluster URL", http.StatusNotFound)
			return
		}

		// Record attributes about the proxy request
		span.SetAttributes(
			attribute.String("cluster.server", kContext.Cluster.Server),
			attribute.String("cluster.api_path", mux.Vars(r)["api"]),
		)
		c.telemetryHandler.RecordClusterProxyRequestsCount(ctx, attribute.String("cluster", contextKey),
			attribute.String("http.method", r.Method))

		r.Host = clusterURL.Host
		r.Header.Set("X-Forwarded-Host", r.Host)
		r.Header.Del("User-Agent")
		r.URL.Host = clusterURL.Host
		r.URL.Path = mux.Vars(r)["api"]
		r.URL.Scheme = clusterURL.Scheme

		token, err := auth.GetTokenFromCookie(r, mux.Vars(r)["clusterName"])
		if err == nil && token != "" {
			r.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
		}

		// Process WebSocket protocol headers if present
		processWebSocketProtocolHeader(r)
		plugins.HandlePluginReload(c.cache, w)

		if err = kContext.ProxyRequest(w, r); err != nil {
			c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "proxy_error"),
				attribute.String("cluster", contextKey))
			c.handleError(w, ctx, span, err, "failed to proxy request", http.StatusInternalServerError)

			return
		}

		if c.Telemetry != nil {
			span.SetStatus(codes.Ok, "")
			c.telemetryHandler.RecordEvent(span, "Cluster API request completed")
		}
	})
}

// handleClusterAPI handles cluster API requests. It is responsible for
// all the requests made to /clusters/{clusterName}/{api:.*} endpoint.
// It parses the request and creates a proxy request to the cluster.
// That proxy is saved in the cache with the context key.
func handleClusterAPI(c *HeadlampConfig, router *mux.Router) {
	router.HandleFunc("/clusters/{clusterName}/set-token", c.handleSetToken).Methods("POST")

	handler := clusterRequestHandler(c)
	if c.CacheEnabled {
		handler = CacheMiddleWare(c)(handler)
	}

	router.PathPrefix("/clusters/{clusterName}/{api:.*}").Handler(handler)
}

func recordRequestCompletion(c *HeadlampConfig, ctx context.Context,
	start time.Time, r *http.Request,
) {
	duration := time.Since(start).Seconds() * 1000 // duration in ms
	c.telemetryHandler.RecordDuration(ctx, start,
		attribute.String("http.method", r.Method),
		attribute.String("http.path", r.URL.Path),
		attribute.String("cluster", mux.Vars(r)["clusterName"]))
	logger.Log(logger.LevelInfo,
		map[string]string{"duration_ms": fmt.Sprintf("%.2f", duration)},
		nil, "Request completed successfully")
}

// Handle WebSocket connections that include token in Sec-WebSocket-Protocol
// Some cluster setups don't support tokens via Sec-Websocket-Protocol value
// Authorization header is more commonly supported and it also used by kubectl.
func processWebSocketProtocolHeader(r *http.Request) {
	secWebSocketProtocol := r.Header.Get("Sec-Websocket-Protocol")
	if secWebSocketProtocol == "" {
		return
	}

	// Split by comma and trim spaces to get all protocols
	protocols := strings.Split(secWebSocketProtocol, ",")

	var validProtocols []string

	// This prefix is used to identify bearer tokens in the WebSocket protocol
	const bearerTokenPrefix = "base64url.bearer.authorization.k8s.io." // #nosec G101

	for _, protocol := range protocols {
		protocol = strings.TrimSpace(protocol)

		// Process protocols that contain tokens
		if strings.HasPrefix(protocol, bearerTokenPrefix) {
			processTokenProtocol(r, protocol, bearerTokenPrefix)
		} else {
			// Keep non-token protocols
			validProtocols = append(validProtocols, protocol)
		}
	}

	// Update the header with remaining valid protocols or remove it entirely
	if len(validProtocols) > 0 {
		r.Header.Set("Sec-WebSocket-Protocol", strings.Join(validProtocols, ", "))
	} else {
		r.Header.Del("Sec-WebSocket-Protocol")
	}
}

// processTokenProtocol extracts a bearer token from a WebSocket protocol string
// and sets it as an Authorization header if one doesn't already exist.
func processTokenProtocol(r *http.Request, protocol, tokenPrefix string) {
	// Only process if Authorization header is empty
	if r.Header.Get("Authorization") != "" {
		return
	}

	token := strings.TrimPrefix(protocol, tokenPrefix)
	if token == "" {
		return
	}

	// Try to decode token from base64
	decodedBytes, err := base64.URLEncoding.DecodeString(token)
	if err == nil {
		token = string(decodedBytes)
	} else {
		// Account for the possibility of tokens without base64 padding
		decodedBytes, err := base64.RawStdEncoding.DecodeString(token)
		if err == nil {
			token = string(decodedBytes)
		}
	}

	r.Header.Set("Authorization", "Bearer "+token)
}

func (c *HeadlampConfig) handleClusterRequests(router *mux.Router) {
	if c.EnableHelm {
		handleClusterHelm(c, router)
	}

	handleClusterAPI(c, router)
}

func (c *HeadlampConfig) getClusters() []Cluster {
	clusters := []Cluster{}

	contexts, err := c.KubeConfigStore.GetContexts()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get contexts")

		return clusters
	}

	for _, context := range contexts {
		if context.Error != "" {
			clusters = append(clusters, Cluster{
				Name:  context.Name,
				Error: context.Error,
			})

			continue
		}

		// Dynamic clusters should not be visible to other users.
		if context.Internal {
			continue
		}

		// This should not happen, but it's a defensive check.
		if context.KubeContext == nil {
			logger.Log(logger.LevelError, map[string]string{"context": context.Name},
				errors.New("context.KubeContext is nil"), "error adding context")
			continue
		}

		kubeconfigPath := context.KubeConfigPath

		source := context.SourceStr()

		clusterID := context.ClusterID

		clusters = append(clusters, Cluster{
			Name:     context.Name,
			Server:   context.Cluster.Server,
			AuthType: context.AuthType(),
			Metadata: map[string]interface{}{
				"source":     source,
				"namespace":  context.KubeContext.Namespace,
				"extensions": context.KubeContext.Extensions,
				"origin": map[string]interface{}{
					"kubeconfig": kubeconfigPath,
				},
				"originalName": context.Name,
				"clusterID":    clusterID,
			},
		})
	}

	return clusters
}

// parseCustomNameClusters parses the custom name clusters from the kubeconfig.
func parseCustomNameClusters(contexts []kubeconfig.Context) ([]Cluster, []error) {
	clusters := []Cluster{}

	var setupErrors []error

	for _, context := range contexts {
		info := context.KubeContext.Extensions["headlamp_info"]
		if info != nil {
			// Convert the runtime.Unknown object to a byte slice
			unknownBytes, err := json.Marshal(info)
			if err != nil {
				logger.Log(logger.LevelError, map[string]string{"cluster": context.Name},
					err, "unmarshaling context data")

				setupErrors = append(setupErrors, err)

				continue
			}

			// Now, decode the byte slice into CustomObject
			var customObj kubeconfig.CustomObject

			err = json.Unmarshal(unknownBytes, &customObj)
			if err != nil {
				logger.Log(logger.LevelError, map[string]string{"cluster": context.Name},
					err, "unmarshaling into CustomObject")

				setupErrors = append(setupErrors, err)

				continue
			}

			// Check if the CustomName field is present
			if customObj.CustomName != "" {
				context.Name = customObj.CustomName
			}
		}

		clusters = append(clusters, Cluster{
			Name:     context.Name,
			Server:   context.Cluster.Server,
			AuthType: context.AuthType(),
			Metadata: map[string]interface{}{
				"source": "dynamic_cluster",
			},
		})
	}

	return clusters, setupErrors
}

// parseClusterFromKubeConfig parses the kubeconfig and returns a list of contexts and errors.
func parseClusterFromKubeConfig(kubeConfigs []string) ([]Cluster, []error) {
	var clusters []Cluster

	var setupErrors []error

	for _, kubeConfig := range kubeConfigs {
		contexts, contextLoadErrors, err := kubeconfig.LoadContextsFromBase64String(kubeConfig, kubeconfig.DynamicCluster)
		if err != nil {
			setupErrors = append(setupErrors, err)
			continue
		}

		if len(contextLoadErrors) > 0 {
			for _, contextError := range contextLoadErrors {
				setupErrors = append(setupErrors, contextError.Error)
			}
		}

		parsedClusters, parseErrs := parseCustomNameClusters(contexts)
		if len(parseErrs) > 0 {
			setupErrors = append(setupErrors, parseErrs...)
		}

		clusters = append(clusters, parsedClusters...)
	}

	if len(setupErrors) > 0 {
		logger.Log(logger.LevelError, nil, setupErrors, "setting up contexts from kubeconfig")
		return nil, setupErrors
	}

	return clusters, nil
}

func (c *HeadlampConfig) getConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	clientConfig := clientConfig{c.getClusters(), c.EnableDynamicClusters}

	if err := json.NewEncoder(w).Encode(&clientConfig); err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding config")
	}
}

// addCluster adds cluster to store and updates the kubeconfig file.
func (c *HeadlampConfig) addCluster(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()

	_, span := telemetry.CreateSpan(ctx, r, "cluster-management", "addCluster")
	c.telemetryHandler.RecordEvent(span, "Add cluster request started")
	defer span.End()
	// Defer recording the duration and logging when the request is complete.
	defer recordRequestCompletion(c, ctx, start, r)
	c.telemetryHandler.RecordRequestCount(ctx, r)

	if err := checkHeadlampBackendToken(w, r); err != nil {
		c.telemetryHandler.RecordError(span, err, "invalid backend token")
		c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "invalid token"))
		logger.Log(logger.LevelError, nil, err, "invalid token")

		return
	}

	clusterReq, err := decodeClusterRequest(r)
	if err != nil {
		c.telemetryHandler.RecordError(span, err, "failed to decode cluster request")
		c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "decode error"))
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	if c.Telemetry != nil {
		if clusterReq.Name != nil {
			span.SetAttributes(attribute.String("clusterName", *clusterReq.Name))
		}

		if clusterReq.Server != nil {
			span.SetAttributes(attribute.String("clusterServer", *clusterReq.Server))
		}

		span.SetAttributes(attribute.Bool("clusterIsKubeConfig", clusterReq.KubeConfig != nil))
	}

	contexts, setupErrors := c.processClusterRequest(clusterReq)
	if len(contexts) == 0 {
		c.telemetryHandler.RecordError(span, errors.New("no contexts found in kubeconfig"), "no contexts found in kubeconfig")
		c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "no_contexts_found"))
		http.Error(w, "getting contexts from kubeconfig", http.StatusBadRequest)
		logger.Log(logger.LevelError, nil, errors.New("no contexts found in kubeconfig"), "getting contexts from kubeconfig")

		return
	}

	setupErrors = c.addContextsToStore(contexts, setupErrors)
	if err := c.handleSetupErrors(setupErrors, ctx, w, span); err != nil {
		return
	}

	if c.Telemetry != nil {
		span.SetAttributes(attribute.Int("contexts.added", len(contexts)))
		span.SetStatus(codes.Ok, "Cluster added successfully")
	}

	w.WriteHeader(http.StatusCreated)
	c.getConfig(w, r)
}

// decodeClusterRequest decodes the cluster request from the request body.
func decodeClusterRequest(r *http.Request) (ClusterReq, error) {
	var clusterReq ClusterReq
	if err := json.NewDecoder(r.Body).Decode(&clusterReq); err != nil {
		logger.Log(logger.LevelError, nil, err, "decoding cluster info")
		return ClusterReq{}, fmt.Errorf("decoding cluster info: %w", err)
	}

	if (clusterReq.KubeConfig == nil) && (clusterReq.Name == nil || clusterReq.Server == nil) {
		return ClusterReq{}, errors.New("please provide a 'name' and 'server' fields at least")
	}

	return clusterReq, nil
}

func (c *HeadlampConfig) handleSetupErrors(setupErrors []error,
	ctx context.Context, w http.ResponseWriter, span trace.Span,
) []error {
	if len(setupErrors) > 0 {
		logger.Log(logger.LevelError, nil, setupErrors, "setting up contexts from kubeconfig")

		if c.Telemetry != nil {
			span.SetStatus(codes.Error, "Failed to setup contexts from kubeconfig")

			errMsg := fmt.Sprintf("%v", setupErrors)
			span.SetAttributes(attribute.String("error.message", errMsg))

			for _, setupErr := range setupErrors {
				c.telemetryHandler.RecordError(span, setupErr, "setup error")
			}
		}

		c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "setup_context_error"))
		http.Error(w, "setting up contexts from kubeconfig", http.StatusBadRequest)

		return setupErrors
	}

	return nil
}

// processClusterRequest processes the cluster request.
func (c *HeadlampConfig) processClusterRequest(clusterReq ClusterReq) ([]kubeconfig.Context, []error) {
	if clusterReq.KubeConfig != nil {
		return c.processKubeConfig(clusterReq)
	}

	return c.processManualConfig(clusterReq)
}

// processKubeConfig processes the kubeconfig request.
func (c *HeadlampConfig) processKubeConfig(clusterReq ClusterReq) ([]kubeconfig.Context, []error) {
	contexts, contextLoadErrors, err := kubeconfig.LoadContextsFromBase64String(
		*clusterReq.KubeConfig,
		kubeconfig.DynamicCluster,
	)
	setupErrors := c.handleLoadErrors(err, contextLoadErrors)

	if len(contextLoadErrors) == 0 {
		if err := c.writeKubeConfig(*clusterReq.KubeConfig); err != nil {
			setupErrors = append(setupErrors, err)
		}
	}

	return contexts, setupErrors
}

// processManualConfig processes the manual config request.
func (c *HeadlampConfig) processManualConfig(clusterReq ClusterReq) ([]kubeconfig.Context, []error) {
	conf := &api.Config{
		Clusters: map[string]*api.Cluster{
			*clusterReq.Name: {
				Server:                   *clusterReq.Server,
				InsecureSkipTLSVerify:    clusterReq.InsecureSkipTLSVerify,
				CertificateAuthorityData: clusterReq.CertificateAuthorityData,
			},
		},
		Contexts: map[string]*api.Context{
			*clusterReq.Name: {
				Cluster: *clusterReq.Name,
			},
		},
	}

	return kubeconfig.LoadContextsFromAPIConfig(conf, false)
}

// handleLoadErrors handles the load errors.
func (c *HeadlampConfig) handleLoadErrors(err error, contextLoadErrors []kubeconfig.ContextLoadError) []error {
	var setupErrors []error //nolint:prealloc

	if err != nil {
		setupErrors = append(setupErrors, err)
	}

	for _, contextError := range contextLoadErrors {
		setupErrors = append(setupErrors, contextError.Error)
	}

	return setupErrors
}

// writeKubeConfig writes the kubeconfig to the kubeconfig file.
func (c *HeadlampConfig) writeKubeConfig(kubeConfigBase64 string) error {
	kubeConfigByte, err := base64.StdEncoding.DecodeString(kubeConfigBase64)
	if err != nil {
		return fmt.Errorf("decoding kubeconfig: %w", err)
	}

	config, err := clientcmd.Load(kubeConfigByte)
	if err != nil {
		return fmt.Errorf("loading kubeconfig: %w", err)
	}

	kubeConfigPersistenceDir, err := cfg.MakeHeadlampKubeConfigsDir()
	if err != nil {
		return fmt.Errorf("getting default kubeconfig persistence dir: %w", err)
	}

	return kubeconfig.WriteToFile(*config, kubeConfigPersistenceDir)
}

// addContextsToStore adds the contexts to the store.
func (c *HeadlampConfig) addContextsToStore(contexts []kubeconfig.Context, setupErrors []error) []error {
	for i := range contexts {
		contexts[i].Source = kubeconfig.DynamicCluster
		if err := c.KubeConfigStore.AddContext(&contexts[i]); err != nil {
			setupErrors = append(setupErrors, err)
		}
	}

	return setupErrors
}

// deleteCluster deletes the cluster from the store and updates the kubeconfig file.
func (c *HeadlampConfig) deleteCluster(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()

	_, span := telemetry.CreateSpan(ctx, r, "cluster-management", "deleteCluster")
	defer span.End()
	c.telemetryHandler.RecordRequestCount(ctx, r)

	defer func() {
		duration := time.Since(start).Milliseconds()

		c.telemetryHandler.RecordDuration(ctx, start, attribute.String("api.route", "/cluster/delete"))
		logger.Log(logger.LevelInfo, map[string]string{
			"duration_ms": fmt.Sprintf("%d", duration),
			"api.route":   "/cluster/delete",
		}, nil, "Completed deleteCluster request")
	}()

	name := mux.Vars(r)["name"]

	if err := checkHeadlampBackendToken(w, r); err != nil {
		c.telemetryHandler.RecordError(span, err, "invalid backend token")
		c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "invalid_token"))
		logger.Log(logger.LevelError, nil, err, "invalid token")

		return
	}

	err := c.KubeConfigStore.RemoveContext(name)
	if err != nil {
		c.handleError(w, ctx, span, err, "failed to delete cluster", http.StatusInternalServerError)

		return
	}

	c.handleDeleteCluster(w, r, ctx, span, name)

	c.getConfig(w, r)
}

// handleDeleteCluster handles the deletion of a cluster.
func (c *HeadlampConfig) handleDeleteCluster(
	w http.ResponseWriter,
	r *http.Request,
	ctx context.Context,
	span trace.Span,
	name string,
) {
	removeKubeConfig := r.URL.Query().Get("removeKubeConfig") == "true"
	if removeKubeConfig {
		c.handleRemoveKubeConfig(w, r, ctx, span, name)
		return
	}

	logger.Log(logger.LevelInfo, map[string]string{"cluster": name, "proxy": name},
		nil, "removed cluster successfully")
}

// handleRemoveKubeConfig removes the cluster from the kubeconfig file.
func (c *HeadlampConfig) handleRemoveKubeConfig(
	w http.ResponseWriter,
	r *http.Request,
	ctx context.Context,
	span trace.Span,
	name string,
) {
	configPath := r.URL.Query().Get("configPath")
	originalName := r.URL.Query().Get("originalName")
	clusterID := r.URL.Query().Get("clusterID")

	var configName string

	if originalName != "" && clusterID != "" {
		configName = originalName
	} else {
		configName = name
	}

	if err := kubeconfig.RemoveContextFromFile(configName, configPath); err != nil {
		c.handleError(w, ctx, span, err, "failed to remove cluster from kubeconfig", http.StatusInternalServerError)
	}
}

// Get path of kubeconfig we load headlamp with from source.
func (c *HeadlampConfig) getKubeConfigPath(source string) (string, error) {
	if source == kubeConfigSource {
		return c.KubeConfigPath, nil
	}

	return defaultHeadlampKubeConfigFile()
}

// Handler for renaming a stateless cluster.
func (c *HeadlampConfig) handleStatelessClusterRename(w http.ResponseWriter, r *http.Request, clusterName string) {
	ctx := r.Context()
	start := time.Now()

	c.telemetryHandler.RecordRequestCount(ctx, r, attribute.String("cluster", clusterName))
	_, span := telemetry.CreateSpan(ctx, r, "cluster-rename", "handleStatelessClusterRename",
		attribute.String("cluster", clusterName),
	)
	c.telemetryHandler.RecordEvent(span, "Stateless cluster rename request started")

	defer span.End()

	if err := c.KubeConfigStore.RemoveContext(clusterName); err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName},
			err, "decoding request body")
		c.telemetryHandler.RecordError(span, err, "decoding request body")
		c.telemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "remove_context_failure"))
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	w.WriteHeader(http.StatusCreated)
	c.getConfig(w, r)

	duration := time.Since(start).Milliseconds()
	c.telemetryHandler.RecordDuration(ctx, start, attribute.String("api.route", "handleStatelessClusterRename"))
	logger.Log(logger.LevelInfo, map[string]string{
		"duration_ms": fmt.Sprintf("%d", duration),
		"api.route":   "handleStatelessClusterRename",
	}, nil, "Completed stateless cluster rename")
}

// customNameToExtenstions writes the custom name to the Extensions map in the kubeconfig.
func customNameToExtenstions(config *api.Config, contextName, newClusterName, path string) error {
	var err error

	// Get the context with the given cluster name
	contextConfig, ok := config.Contexts[contextName]
	if !ok {
		logger.Log(logger.LevelError, map[string]string{"cluster": contextName},
			err, "getting context from kubeconfig")

		return err
	}

	// Create a CustomObject with CustomName field
	customObj := &kubeconfig.CustomObject{
		TypeMeta:   v1.TypeMeta{},
		ObjectMeta: v1.ObjectMeta{},
		CustomName: newClusterName,
	}

	// Assign the CustomObject to the Extensions map
	contextConfig.Extensions["headlamp_info"] = customObj

	if err := clientcmd.WriteToFile(*config, path); err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": contextName},
			err, "writing kubeconfig file")

		return err
	}

	return nil
}

// updateCustomContextToCache updates the custom context to the cache.
func (c *HeadlampConfig) updateCustomContextToCache(config *api.Config, clusterName string) []error {
	contexts, errs := kubeconfig.LoadContextsFromAPIConfig(config, false)
	if len(contexts) == 0 {
		logger.Log(logger.LevelError, nil, errs, "no contexts found in kubeconfig")
		errs = append(errs, errors.New("no contexts found in kubeconfig"))

		return errs
	}

	for _, context := range contexts {
		// Remove the old context from the store
		if err := c.KubeConfigStore.RemoveContext(clusterName); err != nil {
			logger.Log(logger.LevelError, nil, err, "Removing context from the store")
			errs = append(errs, err)
		}

		// Add the new context to the store
		if err := c.KubeConfigStore.AddContext(&context); err != nil {
			logger.Log(logger.LevelError, nil, err, "Adding context to the store")
			errs = append(errs, err)
		}
	}

	if len(errs) > 0 {
		return errs
	}

	return nil
}

// getPathAndLoadKubeconfig gets the path of the kubeconfig file and loads it.
func (c *HeadlampConfig) getPathAndLoadKubeconfig(source, clusterName string) (string, *api.Config, error) {
	// Get path of kubeconfig from source
	path, err := c.getKubeConfigPath(source)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName},
			err, "getting kubeconfig file")

		return "", nil, err
	}

	// Load kubeconfig file
	config, err := clientcmd.LoadFromFile(path)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName},
			err, "loading kubeconfig file")

		return "", nil, err
	}

	return path, config, nil
}

// Handler for renaming a cluster.
func (c *HeadlampConfig) renameCluster(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()
	clusterName := mux.Vars(r)["name"]

	// Setup telemetry
	_, span := telemetry.CreateSpan(ctx, r, "cluster-rename", "renameCluster",
		attribute.String("cluster", clusterName),
	)
	defer span.End()

	c.telemetryHandler.RecordEvent(span, "Rename cluster request started")
	c.telemetryHandler.RecordRequestCount(ctx, r, attribute.String("cluster", clusterName))

	// Parse request and validate
	var reqBody RenameClusterRequest
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		c.handleError(w, ctx, span, err, "failed to decode request body", http.StatusBadRequest)
		return
	}

	// Handle stateless clusters separately
	if reqBody.Stateless {
		c.telemetryHandler.RecordEvent(span, "Delegating to handleStatelessClusterRename")
		c.handleStatelessClusterRename(w, r, clusterName)

		return
	}

	if err := c.handleClusterRename(w, r, clusterName, reqBody, ctx, span); err != nil {
		return // Error already handled inside handleClusterRename
	}

	// Record success metrics and logging
	c.telemetryHandler.RecordDuration(ctx, start, attribute.String("api.route", "renameCluster"))
	logger.Log(logger.LevelInfo, map[string]string{
		"duration_ms": fmt.Sprintf("%d", time.Since(start).Milliseconds()),
		"api.route":   "renameCluster",
	}, nil, "Completed renameCluster request")
}

func (c *HeadlampConfig) handleClusterRename(w http.ResponseWriter, r *http.Request,
	clusterName string, reqBody RenameClusterRequest, ctx context.Context, span trace.Span,
) error {
	// Load kubeconfig
	path, config, err := c.getPathAndLoadKubeconfig(reqBody.Source, clusterName)
	if err != nil {
		c.handleError(w, ctx, span, err, "failed to get kubeconfig file", http.StatusInternalServerError)
		return err
	}

	isUnique := CheckUniqueName(config.Contexts, clusterName, reqBody.NewClusterName)
	if !isUnique {
		http.Error(w, "custom name already in use", http.StatusBadRequest)
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName},
			err, "cluster name already exists in the kubeconfig")

		return err
	}

	contextName := findMatchingContextName(config, clusterName)

	if err := customNameToExtenstions(config, contextName, reqBody.NewClusterName, path); err != nil {
		c.handleError(w, ctx, span, err, "failed to write custom extension", http.StatusInternalServerError)
		return err
	}

	if errs := c.updateCustomContextToCache(config, clusterName); len(errs) > 0 {
		c.handleError(w, ctx, span, err, "failed to update context to cache", http.StatusInternalServerError)
		return errors.New("failed to update context cache")
	}

	w.WriteHeader(http.StatusCreated)
	c.getConfig(w, r)

	return nil
}

// findMatchingContextName checks all contexts, returning the key for whichever
// has a matching customObj.CustomName, if any.
func findMatchingContextName(config *api.Config, clusterName string) string {
	contextName := clusterName

	for k, v := range config.Contexts {
		info := v.Extensions["headlamp_info"]
		if info != nil {
			customObj, err := MarshalCustomObject(info, contextName)
			if err != nil {
				logger.Log(logger.LevelError, map[string]string{"cluster": contextName},
					err, "marshaling custom object")
				continue
			}

			if customObj.CustomName != "" && customObj.CustomName == clusterName {
				contextName = k
			}
		}
	}

	return contextName
}

// checkUniqueName returns false if 'newName' is already in 'names', otherwise returns true.
// It is used for checking context names.
//
// Parameters:
//   - contexts: The Kubernetes API configuration containing contexts.
//   - currentName: The name of the current context being checked.
//   - newName: The new name to check for uniqueness.
func CheckUniqueName(contexts map[string]*api.Context, currentName string, newName string) bool {
	contextNames := make([]string, 0, len(contexts))

	for name := range contexts {
		contextNames = append(contextNames, name)
		logger.Log(logger.LevelInfo, map[string]string{"context added": name},
			nil, "context name")
	}

	// Iterate over the contexts and add the custom names
	for _, y := range contexts {
		info := y.Extensions["headlamp_info"]
		if info != nil {
			customObj, err := MarshalCustomObject(info, currentName)
			if err != nil {
				logger.Log(logger.LevelError, map[string]string{"context": currentName},
					err, "marshaling custom object")
			}

			// add custom name if it is not empty
			if customObj.CustomName != "" {
				contextNames = append(contextNames, customObj.CustomName)
			}
		}
	}

	for _, current := range contextNames {
		if current == newName {
			return false
		}
	}

	return true
}

func (c *HeadlampConfig) addClusterSetupRoute(r *mux.Router) {
	// Do not add the route if dynamic clusters are disabled
	if !c.EnableDynamicClusters {
		return
	}
	// Get stateless cluster
	r.HandleFunc("/parseKubeConfig", c.parseKubeConfig).Methods("POST")

	// POST a cluster
	r.HandleFunc("/cluster", c.addCluster).Methods("POST")

	// Delete a cluster
	r.HandleFunc("/cluster/{name}", c.deleteCluster).Methods("DELETE")

	// Rename a cluster
	r.HandleFunc("/cluster/{name}", c.renameCluster).Methods("PUT")
}

/*
This function is used to handle the node drain request.
*/
func (c *HeadlampConfig) handleNodeDrain(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	_, span := telemetry.CreateSpan(ctx, r, "node-management", "handleNodeDrain")
	c.telemetryHandler.RecordRequestCount(ctx, r)
	c.telemetryHandler.RecordEvent(span, "node drain request started")

	defer span.End()

	var drainPayload struct {
		Cluster  string `json:"cluster"`
		NodeName string `json:"nodeName"`
	}

	if err := json.NewDecoder(r.Body).Decode(&drainPayload); err != nil {
		c.handleError(w, ctx, span, err, "decoding payload", http.StatusBadRequest)

		return
	}

	if drainPayload.NodeName == "" {
		c.handleError(w, ctx, span, errors.New("nodeName not found"), "missing nodeName", http.StatusBadRequest)
		return
	}

	if drainPayload.Cluster == "" {
		c.handleError(w, ctx, span, errors.New("clusterName not found"), "missing clusterName", http.StatusBadRequest)

		return
	}
	// get token from header
	token := r.Header.Get("Authorization")

	ctxtProxy, err := c.KubeConfigStore.GetContext(drainPayload.Cluster)
	if err != nil {
		c.handleError(w, ctx, span, err, "Cluster not found", http.StatusNotFound)

		return
	}

	clientset, err := ctxtProxy.ClientSetWithToken(token)
	if err != nil {
		c.handleError(w, ctx, span, err, "getting client", http.StatusInternalServerError)

		return
	}

	var responsePayload struct {
		Message string `json:"message"`
		Cluster string `json:"cluster"`
	}

	responsePayload.Cluster = drainPayload.Cluster
	responsePayload.Message = "Drain node request submitted successfully"

	if err = json.NewEncoder(w).Encode(responsePayload); err != nil {
		c.handleError(w, ctx, span, err, "writing response", http.StatusInternalServerError)

		return
	}

	c.drainNode(clientset, drainPayload.NodeName, drainPayload.Cluster)
}

func (c *HeadlampConfig) drainNode(clientset *kubernetes.Clientset, nodeName string, cluster string) {
	go func() {
		nodeClient := clientset.CoreV1().Nodes()
		ctx := context.Background()
		cacheKey := uuid.NewSHA1(uuid.Nil, []byte(nodeName+cluster)).String()
		cacheItemTTL := DrainNodeCacheTTL * time.Minute

		node, err := nodeClient.Get(context.TODO(), nodeName, v1.GetOptions{})
		if err != nil {
			_ = c.cache.SetWithTTL(ctx, cacheKey, "error: "+err.Error(), cacheItemTTL)
			return
		}

		// cordon the node first
		node.Spec.Unschedulable = true

		_, err = nodeClient.Update(context.TODO(), node, v1.UpdateOptions{})
		if err != nil {
			_ = c.cache.SetWithTTL(ctx, cacheKey, "error: "+err.Error(), cacheItemTTL)
			return
		}

		pods, err := clientset.CoreV1().Pods("").List(context.TODO(),
			v1.ListOptions{FieldSelector: "spec.nodeName=" + nodeName})
		if err != nil {
			_ = c.cache.SetWithTTL(ctx, cacheKey, "error: "+err.Error(), cacheItemTTL)
			return
		}

		var gracePeriod int64 = 0

		for _, pod := range pods.Items {
			// ignore daemonsets
			if pod.ObjectMeta.Labels["kubernetes.io/created-by"] == "daemonset-controller" {
				continue
			}

			_ = clientset.CoreV1().Pods(pod.Namespace).Delete(context.TODO(),
				pod.Name, v1.DeleteOptions{GracePeriodSeconds: &gracePeriod})
		}

		_ = c.cache.SetWithTTL(ctx, cacheKey, "success", cacheItemTTL)
	}()
}

/*
* Handle node drain status
Since node drain is an async operation, we need to poll for the status of the drain operation
This endpoint returns the status of the drain operation.
*/
func (c *HeadlampConfig) handleNodeDrainStatus(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	ctx := r.Context()

	_, span := telemetry.CreateSpan(ctx, r, "node-management", "handleNodeDrainStatus",
		attribute.String("cluster", r.URL.Query().Get("cluster")),
		attribute.String("nodeName", r.URL.Query().Get("nodeName")),
	)
	c.telemetryHandler.RecordEvent(span, "handleNodeDrainStatus request started")
	c.telemetryHandler.RecordRequestCount(ctx, r)

	defer span.End()

	// Parse query parameters
	drainPayload := struct {
		Cluster  string `json:"cluster"`
		NodeName string `json:"nodeName"`
	}{
		Cluster:  r.URL.Query().Get("cluster"),
		NodeName: r.URL.Query().Get("nodeName"),
	}

	if drainPayload.NodeName == "" {
		c.handleError(w, ctx, span, errors.New("nodeName is required"), "nodeName is missing", http.StatusBadRequest)
		return
	}

	if drainPayload.Cluster == "" {
		c.handleError(w, ctx, span, errors.New("clusterName is required"), "clusterName is missing", http.StatusBadRequest)

		return
	}

	cacheKey := uuid.NewSHA1(uuid.Nil, []byte(drainPayload.NodeName+drainPayload.Cluster)).String()

	cacheItem, err := c.cache.Get(ctx, cacheKey)
	if err != nil {
		c.handleError(w, ctx, span, err, "failed to get cache item", http.StatusNotFound)

		return
	}
	// Prepare successful response
	responsePayload := struct {
		ID      string `json:"id"`
		Cluster string `json:"cluster"`
	}{
		ID:      cacheItem.(string),
		Cluster: drainPayload.Cluster,
	}

	c.telemetryHandler.RecordEvent(span, "Drain status found", attribute.String("cache.key", cacheKey))

	if err = json.NewEncoder(w).Encode(responsePayload); err != nil {
		c.handleError(w, ctx, span, err, "failed to encode repsone", http.StatusInternalServerError)

		return
	}

	c.telemetryHandler.RecordDuration(ctx, start, attribute.String("api.route", "handleNodeDrainStatus"))
	logger.Log(logger.LevelInfo, map[string]string{"duration_ms": fmt.Sprintf("%d", time.Since(start).Milliseconds())},
		nil, "handleNodeDrainStatus completed")
}

// handlerSetToken sets the authentication token in a cookie.
// If the token is an empty string, the cookie is cleared.
func (c *HeadlampConfig) handleSetToken(w http.ResponseWriter, r *http.Request) {
	cluster := mux.Vars(r)["clusterName"]

	var req struct {
		Token string `json:"token"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate cluster name is provided
	if cluster == "" {
		http.Error(w, "Cluster name is required", http.StatusBadRequest)
		return
	}

	if req.Token == "" {
		auth.ClearTokenCookie(w, r, cluster)
	} else {
		auth.SetTokenCookie(w, r, cluster, req.Token)
	}

	w.WriteHeader(http.StatusOK)
}
