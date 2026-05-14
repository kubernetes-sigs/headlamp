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
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"runtime"
	"sort"
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
	"github.com/kubernetes-sigs/headlamp/backend/pkg/serviceproxy"

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
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"

	"golang.org/x/oauth2"
)

// HeadlampConfig wraps headlampconfig.HeadlampConfig and adds cmd-specific methods.
type HeadlampConfig struct {
	*headlampcfg.HeadlampConfig
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
	AllowKubeconfigChanges  bool      `json:"allowKubeconfigChanges"`
	DefaultPodDebugImage    string    `json:"defaultPodDebugImage"`
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
	data, err := os.ReadFile(path) //nolint:gosec
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
	if config.OidcCallbackURL != "" {
		return config.OidcCallbackURL
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
// It serves plugin static files at "plugins/", "user-plugins/" and "static-plugins/".
// It disables caching and reloads plugin list base paths if not in-cluster.
func addPluginRoutes(config *HeadlampConfig, r *mux.Router) {
	// Delete plugin route.
	// This is only available when running locally.
	if !config.UseInCluster {
		addPluginDeleteRoute(config, r)
	}

	addPluginListRoute(config, r)

	// Serve development plugins
	pluginHandler := http.StripPrefix(config.BaseURL+"/plugins/", http.FileServer(http.Dir(config.PluginDir)))
	// If we're running locally, then do not cache the plugins. This ensures that reloading them (development,
	// update) will actually get the new content.
	if !config.UseInCluster {
		pluginHandler = serveWithNoCacheHeader(pluginHandler)
	}

	r.PathPrefix("/plugins/").Handler(pluginHandler)

	// Serve user-installed plugins
	if config.UserPluginDir != "" {
		userPluginsHandler := http.StripPrefix(config.BaseURL+"/user-plugins/",
			http.FileServer(http.Dir(config.UserPluginDir)))
		if !config.UseInCluster {
			userPluginsHandler = serveWithNoCacheHeader(userPluginsHandler)
		}

		r.PathPrefix("/user-plugins/").Handler(userPluginsHandler)
	}

	// Serve shipped/static plugins
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

		// Get plugin type from query parameter (optional)
		pluginType := r.URL.Query().Get("type")

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

		if err := config.checkHeadlampBackendToken(w, r); err != nil {
			config.TelemetryHandler.RecordError(span, err, " Invalid backend token")
			logger.Log(logger.LevelWarn, nil, err, "Invalid backend token for DELETE /plugins/{name}")

			return
		}

		err := plugins.Delete(config.UserPluginDir, config.PluginDir, pluginName, pluginType)
		if err != nil {
			config.TelemetryHandler.RecordError(span, err, "Failed to delete plugin")

			logger.Log(logger.LevelError, nil, err, "Error deleting plugin: "+pluginName)

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)

			if err := json.NewEncoder(w).Encode(map[string]any{"success": false, "message": err.Error()}); err != nil {
				logger.Log(logger.LevelError, nil, err, "Error writing delete error response")
			}

			return
		}

		logger.Log(logger.LevelInfo, nil, nil, "Plugin deleted successfully: "+pluginName)

		w.Header().Set("Content-Type", "application/json")

		if err := json.NewEncoder(w).Encode(map[string]any{"success": true}); err != nil {
			logger.Log(logger.LevelError, nil, err, "Error writing delete response")
		}
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

		pluginsList, err := config.Cache.Get(context.Background(), plugins.PluginListKey)
		if err != nil && errors.Is(err, cache.ErrNotFound) {
			pluginsList = []plugins.PluginMetadata{}

			if config.Telemetry != nil {
				span.SetAttributes(attribute.Int("plugins.count", 0))
			}
		} else if config.Telemetry != nil && pluginsList != nil {
			if list, ok := pluginsList.([]plugins.PluginMetadata); ok {
				span.SetAttributes(attribute.Int("plugins.count", len(list)))
			}
		}

		if err := json.NewEncoder(w).Encode(pluginsList); err != nil {
			logger.Log(logger.LevelError, nil, err, "encoding plugins base paths list")
		} else {
			// Notify that the client has requested the plugins list. So we can start sending
			// refresh requests.
			if err := config.Cache.Set(context.Background(), plugins.PluginCanSendRefreshKey, true); err != nil {
				config.TelemetryHandler.RecordError(span, err, "Failed to set plugin-can-send-refresh key")
				logger.Log(logger.LevelError, nil, err, "setting plugin-can-send-refresh key failed")
			} else if config.Telemetry != nil {
				span.SetStatus(codes.Ok, "Plugin list retrieved successfully")
			}
		}
	}).Methods("GET")
}

// oidcStateTTL is the lifetime of a signed state token. It bounds how long
// a user has to complete the IdP round-trip before /oidc-callback rejects
// the state as expired.
//
//nolint:gocognit,funlen,gocyclo
const oidcStateTTL = 10 * time.Minute

// oidcStateLRUSize bounds the number of consumed-state entries kept in
// memory at once. Tokens older than this — by insertion order — can
// reuse their CSRF; for typical login volume this is several orders of
// magnitude above concurrent in-flight logins.
const oidcStateLRUSize = 4096

// minOIDCSigningKeyBytes is enforced both by NewStateSigner and at config
// load time so that operators get a clear error before the server starts.
const minOIDCSigningKeyBytes = 32

// oidcFlow bundles the per-request OIDC plumbing needed by both /oidc and
// /oidc-callback. Reconstructing it on the callback (rather than caching
// it across requests) is what makes signed state portable across replicas.
//
// The request-scoped context with TLS / issuer overrides is returned
// alongside the flow rather than stored on it, so callers stay honest
// about cancellation. Idiomatic Go (and contextcheck) avoids storing
// context in struct fields.
type oidcFlow struct {
	OAuth2   *oauth2.Config
	Verifier *oidc.IDTokenVerifier
}

// loadOIDCStateSigner constructs the StateSigner used by /oidc and
// /oidc-callback.
//
// If config.OidcStateSigningKeyFile is set, the file is read, trailing
// whitespace is trimmed, and the result is used as the HMAC key. The key
// must be at least minOIDCSigningKeyBytes long; shorter keys produce a
// startup error so misconfiguration is loud rather than silently degrading
// to per-process random behavior.
//
// When the flag is unset, a 32-byte random key is generated. This works
// for single-replica deployments but breaks multi-replica rollouts (the
// kind of breakage characterized by #4019), so we emit one log line at
// startup pointing operators at the flag.
func loadOIDCStateSigner(config *HeadlampConfig) (*auth.StateSigner, error) {
	if config.OidcStateSigningKeyFile != "" {
		raw, err := os.ReadFile(config.OidcStateSigningKeyFile) //nolint:gosec
		if err != nil {
			return nil, fmt.Errorf("read oidc state signing key file: %w", err)
		}

		key := bytes.TrimRight(raw, " \t\r\n")
		if len(key) < minOIDCSigningKeyBytes {
			return nil, fmt.Errorf("oidc state signing key must be >= %d bytes (got %d)",
				minOIDCSigningKeyBytes, len(key))
		}

		logger.Log(logger.LevelInfo, nil, nil,
			"OIDC state signing key loaded from --oidc-state-signing-key-file")

		return auth.NewStateSigner(key, oidcStateTTL, auth.WithLRUSize(oidcStateLRUSize)), nil
	}

	key := make([]byte, minOIDCSigningKeyBytes)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("generate oidc state signing key: %w", err)
	}

	logger.Log(logger.LevelInfo, nil, nil,
		"OIDC state signing key generated per-process. For multi-replica "+
			"deployments, set --oidc-state-signing-key-file=<path> with a shared key file.")

	return auth.NewStateSigner(key, oidcStateTTL, auth.WithLRUSize(oidcStateLRUSize)), nil
}

// buildOIDCFlow constructs the per-request OIDC plumbing — the OAuth2
// config and the ID-token verifier — and returns the request context
// with the right TLS / issuer overrides applied.
//
// Both /oidc and /oidc-callback call this. Building it on the callback
// (instead of caching the /oidc result in a per-process map) is what makes
// signed state portable across replicas; the cluster name comes from the
// signed state payload, so the callback can rebuild the same OAuth2 config
// on any replica that has the same kubeconfig.
func buildOIDCFlow(ctx context.Context, config *HeadlampConfig, r *http.Request,
	cluster string,
) (*oidcFlow, context.Context, error) {
	if config.Insecure {
		tr := &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
		}
		insecureClient := &http.Client{Transport: tr}
		ctx = oidc.ClientContext(ctx, insecureClient)
	}

	kContext, err := config.KubeConfigStore.GetContext(cluster)
	if err != nil {
		return nil, ctx, &errFlowCluster{cluster: cluster, err: err}
	}

	oidcAuthConfig, err := kContext.OidcConfig()
	if err != nil {
		return nil, ctx, &errFlowOIDCConfig{cluster: cluster, err: err}
	}

	ctx = auth.ConfigureTLSContext(ctx, oidcAuthConfig.SkipTLSVerify, oidcAuthConfig.CACert)

	if config.OidcValidatorIdpIssuerURL != "" {
		ctx = oidc.InsecureIssuerURLContext(ctx, config.OidcValidatorIdpIssuerURL)
	}

	provider, err := oidc.NewProvider(ctx, oidcAuthConfig.IdpIssuerURL)
	if err != nil {
		return nil, ctx, &errFlowProvider{issuerURL: oidcAuthConfig.IdpIssuerURL, err: err}
	}

	validatorClientID := oidcAuthConfig.ClientID
	if config.OidcValidatorClientID != "" {
		validatorClientID = config.OidcValidatorClientID
	}

	verifier := provider.Verifier(&oidc.Config{ClientID: validatorClientID})
	oauthConfig := &oauth2.Config{
		ClientID:     oidcAuthConfig.ClientID,
		ClientSecret: oidcAuthConfig.ClientSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  getOidcCallbackURL(r, config),
		Scopes:       append([]string{oidc.ScopeOpenID}, oidcAuthConfig.Scopes...),
	}

	return &oidcFlow{OAuth2: oauthConfig, Verifier: verifier}, ctx, nil
}

// Concrete buildOIDCFlow error types. handleOIDCFlowError dispatches via
// errors.As so each carries exactly the fields its caller needs and there
// is no untyped `extra` map to drift.
type errFlowCluster struct {
	cluster string
	err     error
}

func (e *errFlowCluster) Error() string { return e.err.Error() }
func (e *errFlowCluster) Unwrap() error { return e.err }

type errFlowOIDCConfig struct {
	cluster string
	err     error
}

func (e *errFlowOIDCConfig) Error() string { return e.err.Error() }
func (e *errFlowOIDCConfig) Unwrap() error { return e.err }

type errFlowProvider struct {
	issuerURL string
	err       error
}

func (e *errFlowProvider) Error() string { return e.err.Error() }
func (e *errFlowProvider) Unwrap() error { return e.err }

// handleOIDCFlowError translates buildOIDCFlow failures into HTTP
// responses: 404 for missing cluster, 500 for OIDC config / provider
// failure. Logs the full error server-side; the HTTP body is generic
// to avoid leaking IdP-supplied error strings to anonymous callers.
func handleOIDCFlowError(w http.ResponseWriter, r *http.Request, err error) {
	var (
		clusterErr  *errFlowCluster
		configErr   *errFlowOIDCConfig
		providerErr *errFlowProvider
	)

	switch {
	case errors.As(err, &clusterErr):
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterErr.cluster},
			clusterErr.err, "failed to get context")
		http.NotFound(w, r)
	case errors.As(err, &configErr):
		logger.Log(logger.LevelError, map[string]string{"cluster": configErr.cluster},
			configErr.err, "failed to get oidc config")
		http.Error(w, "oidc not configured for cluster", http.StatusInternalServerError)
	case errors.As(err, &providerErr):
		logger.Log(logger.LevelError, map[string]string{"idpIssuerURL": providerErr.issuerURL},
			providerErr.err, "failed to get provider")
		http.Error(w, "oidc provider unavailable", http.StatusInternalServerError)
	default:
		logger.Log(logger.LevelError, nil, err, "OIDC flow error")
		http.Error(w, "internal error", http.StatusInternalServerError)
	}
}

// oidcCallbackError writes a 4xx/5xx response on /oidc-callback failure.
// Browser callers (Accept: text/html) get a small HTML page with a link
// back to the cluster (or root) so they're not stranded on a JSON error;
// non-browser callers get the existing plain-text contract preserved
// from the pre-stage-5 handler. plainBody is what non-HTML callers see
// (preserve historical wording for downstream contract); htmlReason is
// the friendlier text shown inside the HTML page.
func oidcCallbackError(
	w http.ResponseWriter, r *http.Request, status int,
	plainBody, htmlReason string,
	cluster, baseURL string,
) {
	if !wantsHTML(r) {
		http.Error(w, plainBody, status)
		return
	}

	clusterRoot := "/"
	if trimmed := strings.Trim(baseURL, "/"); trimmed != "" {
		clusterRoot = "/" + trimmed + "/"
	}

	if cluster != "" {
		clusterRoot += "c/" + url.PathEscape(cluster) + "/"
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)

	page := buildOIDCErrorPage(htmlReason, clusterRoot)
	if _, err := io.WriteString(w, page); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing OIDC error page")
	}
}

// wantsHTML returns true when the caller's Accept header prefers HTML
// over JSON / plain text. We treat any "text/html" or "*/*" without a
// more specific JSON preference as HTML — browsers are the dominant
// caller of /oidc-callback so this skews toward HTML when the header
// is ambiguous.
func wantsHTML(r *http.Request) bool {
	accept := r.Header.Get("Accept")
	if accept == "" {
		return false
	}

	lower := strings.ToLower(accept)
	if strings.Contains(lower, "application/json") &&
		!strings.Contains(lower, "text/html") {
		return false
	}

	return strings.Contains(lower, "text/html") || strings.Contains(lower, "*/*")
}

// buildOIDCErrorPage renders the small HTML page shown on
// /oidc-callback failures. The reason is HTML-escaped via
// html/template; the link target is constructed from trusted server
// state (cluster root) and is not user-controlled, so it's spliced in
// directly via the template.
func buildOIDCErrorPage(reason, clusterRoot string) string {
	tmpl := template.Must(template.New("oidc-error").Parse(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Sign-in error — Headlamp</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; color: #222; }
h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
p { line-height: 1.4; }
a { color: #1565c0; }
</style>
</head>
<body>
<h1>Sign-in didn't complete</h1>
<p>{{.Reason}}</p>
<p><a href="{{.Home}}">Return to Headlamp</a> and try again.</p>
</body>
</html>`))

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, struct {
		Reason string
		Home   string
	}{Reason: reason, Home: clusterRoot}); err != nil {
		// Fall back to a static body if templating somehow fails. Defensive
		// only — the template above is constant.
		return "Sign-in didn't complete. <a href=\"" + clusterRoot + "\">Return to Headlamp</a>."
	}

	return buf.String()
}

func createHeadlampHandler(ctx context.Context, config *HeadlampConfig) http.Handler {
	kubeConfigPath := config.KubeConfigPath

	config.StaticPluginDir = os.Getenv("HEADLAMP_STATIC_PLUGINS_DIR")

	logger.Log(logger.LevelInfo, nil, nil, "Creating Headlamp handler")
	logger.Log(logger.LevelInfo, nil, nil, "Listen address: "+fmt.Sprintf("%s:%d", config.ListenAddr, config.Port))
	logger.Log(logger.LevelInfo, nil, nil, "Kubeconfig path: "+kubeConfigPath)
	logger.Log(logger.LevelInfo, nil, nil, "Static plugin dir: "+config.StaticPluginDir)
	logger.Log(logger.LevelInfo, nil, nil, "User plugins dir: "+config.UserPluginDir)
	logger.Log(logger.LevelInfo, nil, nil, "Plugins dir: "+config.PluginDir)
	logger.Log(logger.LevelInfo, nil, nil, "Dynamic clusters support: "+fmt.Sprint(config.EnableDynamicClusters))
	logger.Log(logger.LevelInfo, nil, nil, "Helm support: "+fmt.Sprint(config.EnableHelm))
	logger.Log(logger.LevelInfo, nil, nil, "Proxy URLs: "+fmt.Sprint(config.ProxyURLs))
	logger.Log(logger.LevelInfo, nil, nil, "TLS certificate path: "+config.TLSCertPath)
	logger.Log(logger.LevelInfo, nil, nil, "TLS key path: "+config.TLSKeyPath)
	logger.Log(logger.LevelInfo, nil, nil, "me Username Paths: "+config.MeUsernamePaths)
	logger.Log(logger.LevelInfo, nil, nil, "me Email Paths: "+config.MeEmailPaths)
	logger.Log(logger.LevelInfo, nil, nil, "me Groups Paths: "+config.MeGroupsPaths)
	logger.Log(logger.LevelInfo, nil, nil, "me User Info URL: "+config.MeUserInfoURL)
	logger.Log(logger.LevelInfo, nil, nil, "Base URL: "+config.BaseURL)
	logger.Log(logger.LevelInfo, nil, nil, "Session TTL: "+fmt.Sprint(config.SessionTTL))
	logger.Log(logger.LevelInfo, nil, nil, "Use In Cluster: "+fmt.Sprint(config.UseInCluster))
	logger.Log(logger.LevelInfo, nil, nil, "Watch Plugins Changes: "+fmt.Sprint(config.WatchPluginsChanges))

	plugins.PopulatePluginsCache(config.StaticPluginDir, config.UserPluginDir, config.PluginDir, config.Cache)

	skipFunc := kubeconfig.SkipKubeContextInCommaSeparatedString(config.SkippedKubeContexts)

	if !config.UseInCluster || config.WatchPluginsChanges {
		// in-cluster mode is unlikely to want reloading plugins.
		pluginEventChan := make(chan string)
		go plugins.Watch(ctx, config.PluginDir, pluginEventChan)

		// Watch user-plugins directory for catalog-installed plugins
		if config.UserPluginDir != "" {
			userPluginEventChan := make(chan string)
			go plugins.Watch(ctx, config.UserPluginDir, userPluginEventChan)
			// Merge both event channels into one
			go func() {
				for event := range userPluginEventChan {
					pluginEventChan <- event
				}
			}()
		}

		go plugins.HandlePluginEvents(
			config.StaticPluginDir,
			config.UserPluginDir,
			config.PluginDir,
			pluginEventChan,
			config.Cache,
		)
		// in-cluster mode is unlikely to want reloading kubeconfig.
		go kubeconfig.LoadAndWatchFiles(ctx, config.KubeConfigStore, kubeConfigPath, kubeconfig.KubeConfig, skipFunc)
	}

	// In-cluster
	if config.UseInCluster {
		context, err := kubeconfig.GetInClusterContext(
			config.InClusterContextName,
			config.OidcIdpIssuerURL,
			config.OidcClientID, config.OidcClientSecret,
			strings.Join(config.OidcScopes, ","),
			config.OidcSkipTLSVerify,
			config.OidcCACert)
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
	if config.Metrics != nil && config.TelemetryConfig.MetricsEnabled != nil && *config.TelemetryConfig.MetricsEnabled {
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
		portforward.StartPortForward(config.KubeConfigStore, config.Cache, w, r)
	}).Methods("POST")

	r.HandleFunc("/clusters/{clusterName}/portforward", func(w http.ResponseWriter, r *http.Request) {
		portforward.StopOrDeletePortForward(config.Cache, w, r)
	}).Methods("DELETE")

	r.HandleFunc("/clusters/{clusterName}/portforward/list", func(w http.ResponseWriter, r *http.Request) {
		portforward.GetPortForwards(config.Cache, w, r)
	})
	r.HandleFunc("/clusters/{clusterName}/portforward", func(w http.ResponseWriter, r *http.Request) {
		portforward.GetPortForwardByID(config.Cache, w, r)
	}).Methods("GET")

	// Expose user info so the frontend can show the current user in the top bar using the per-cluster auth cookie.
	r.HandleFunc("/clusters/{clusterName}/me",
		auth.HandleMe(auth.MeHandlerOptions{
			UsernamePaths: config.MeUsernamePaths,
			EmailPaths:    config.MeEmailPaths,
			GroupsPaths:   config.MeGroupsPaths,
			UserInfoURL:   config.MeUserInfoURL,
		}),
	).Methods("GET")

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

		proxyReq, err := http.NewRequestWithContext(ctx, r.Method, proxyURL, r.Body) //nolint:gosec
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

		resp, err := client.Do(proxyReq) //nolint:gosec
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "making request")
			http.Error(w, err.Error(), http.StatusBadGateway)

			return
		}

		defer func() { _ = resp.Body.Close() }()

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

			defer func() { _ = reader.Close() }()
		default:
			reader = resp.Body
		}

		respBody, err := io.ReadAll(reader)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "reading response")
			http.Error(w, err.Error(), http.StatusBadGateway)

			return
		}

		if contentType := resp.Header.Get("Content-Type"); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}

		w.WriteHeader(resp.StatusCode)

		_, err = w.Write(respBody)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "writing response")

			return
		}
	})

	// Configuration
	r.HandleFunc("/config", config.getConfig).Methods("GET")

	// Auth token management
	r.HandleFunc("/auth/set-token", config.handleSetToken).Methods("POST")

	// Websocket connections
	if config.Multiplexer != nil {
		r.HandleFunc("/wsMultiplexer", config.Multiplexer.HandleClientWebSocket)
	}

	config.addClusterSetupRoute(r)

	// stateSigner signs and verifies the OAuth2 state parameter for the
	// OIDC handlers. A single signer is shared by /oidc and /oidc-callback
	// in the same process. Operators that run multiple replicas must point
	// every replica at the same signing key via
	// --oidc-state-signing-key-file; otherwise a callback that lands on a
	// different replica than the one that issued the state will be
	// rejected (see #4019).
	stateSigner, err := loadOIDCStateSigner(config)
	if err != nil {
		// A bad --oidc-state-signing-key-file (unreadable, too short) is
		// an operator startup error and not survivable. We panic instead
		// of returning the error to keep createHeadlampHandler's
		// signature unchanged across many call sites; the recovery path
		// in production is "fix the file and restart the binary".
		// loadOIDCStateSigner only errors on file IO + length validation,
		// not on the per-process default-key path, so tests that don't
		// exercise the bad-key code path are unaffected.
		logger.Log(logger.LevelError, nil, err, "loading OIDC state signing key")
		panic(fmt.Sprintf("failed to load OIDC state signing key: %v", err))
	}

	r.HandleFunc("/oidc", func(w http.ResponseWriter, r *http.Request) {
		cluster := r.URL.Query().Get("cluster")

		// mode controls how /oidc-callback redirects after a successful
		// token exchange. ModePopup preserves the legacy /auth?cluster=...
		// contract; ModeFullPage redirects directly to returnTo (or the
		// cluster root if returnTo is absent). ModeDesktop is reserved
		// for PR 2 of #5401 and is rejected here so its eventual
		// semantics can't be silently established by abuse.
		mode := auth.StateMode(r.URL.Query().Get("mode"))
		switch mode {
		case "":
			mode = auth.ModePopup
		case auth.ModePopup, auth.ModeFullPage:
			// ok
		case auth.ModeDesktop:
			http.Error(w,
				"mode=desktop is reserved for the desktop OIDC code-handoff flow "+
					"(see kubernetes-sigs/headlamp#5401, PR 2) and is not yet supported",
				http.StatusBadRequest)

			return
		default:
			http.Error(w, "invalid mode", http.StatusBadRequest)
			return
		}

		var validatedReturnTo string

		if rawReturnTo := r.URL.Query().Get("returnTo"); rawReturnTo != "" {
			cleaned, vErr := auth.ValidateReturnTo(rawReturnTo, config.BaseURL)
			if vErr != nil {
				logger.Log(logger.LevelError, map[string]string{"cluster": cluster},
					vErr, "rejected returnTo on /oidc")
				http.Error(w, "invalid returnTo", http.StatusBadRequest)

				return
			}

			validatedReturnTo = cleaned
		}

		flow, _, err := buildOIDCFlow(r.Context(), config, r, cluster)
		if err != nil {
			handleOIDCFlowError(w, r, err)
			return
		}

		csrfBytes := make([]byte, 16)
		if _, err := rand.Read(csrfBytes); err != nil {
			logger.Log(logger.LevelError, nil, err, "generating CSRF for OIDC state")
			http.Error(w, "internal error", http.StatusInternalServerError)

			return
		}

		payload := auth.StatePayload{
			Cluster:  cluster,
			Mode:     mode,
			ReturnTo: validatedReturnTo,
			CSRF:     hex.EncodeToString(csrfBytes),
		}

		var authURL string

		if config.OidcUsePKCE {
			payload.CodeVerifier = oauth2.GenerateVerifier()
		}

		state, err := stateSigner.Encode(payload)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "encoding OIDC state")
			http.Error(w, "internal error", http.StatusInternalServerError)

			return
		}

		if config.OidcUsePKCE {
			authURL = flow.OAuth2.AuthCodeURL(state, oauth2.S256ChallengeOption(payload.CodeVerifier))
		} else {
			authURL = flow.OAuth2.AuthCodeURL(state)
		}

		http.Redirect(w, r, authURL, http.StatusFound)
	}).Queries("cluster", "{cluster}")

	r.HandleFunc("/drain-node", config.handleNodeDrain).Methods("POST")
	r.HandleFunc("/drain-node-status",
		config.handleNodeDrainStatus).Methods("GET").Queries("cluster", "{cluster}", "nodeName", "{node}")

	r.HandleFunc("/oidc-callback", func(w http.ResponseWriter, r *http.Request) {
		state := r.URL.Query().Get("state")

		if state == "" {
			logger.Log(logger.LevelError, nil, nil, "invalid request state is empty")
			oidcCallbackError(w, r, http.StatusBadRequest,
				"invalid request state is empty",
				"The sign-in link is missing required information.",
				"", config.BaseURL)

			return
		}

		payload, err := stateSigner.Decode(state)
		if err != nil {
			// Any decode failure (bad signature, malformed, expired, bad
			// version, oversize) collapses to "invalid request" so we
			// don't leak details to anonymous callers.
			logger.Log(logger.LevelError, nil, err, "decoding OIDC state")
			oidcCallbackError(w, r, http.StatusBadRequest,
				"invalid request",
				"The sign-in link is invalid or has expired. Please start the sign-in again.",
				"", config.BaseURL)

			return
		}

		if !stateSigner.MarkConsumed(payload.CSRF) {
			// State has already been used. Same response shape as the
			// unknown-state path so callers can't infer whether a state
			// was previously valid.
			oidcCallbackError(w, r, http.StatusBadRequest,
				"invalid request",
				"This sign-in link has already been used. Please start the sign-in again.",
				payload.Cluster, config.BaseURL)
			return
		}

		flow, flowCtx, err := buildOIDCFlow(r.Context(), config, r, payload.Cluster)
		if err != nil {
			handleOIDCFlowError(w, r, err)
			return
		}

		var oauth2Token *oauth2.Token

		// Exchange authorization code for token, with or without PKCE
		if config.OidcUsePKCE && payload.CodeVerifier != "" {
			oauth2Token, err = flow.OAuth2.Exchange(
				flowCtx,
				r.URL.Query().Get("code"),
				oauth2.SetAuthURLParam("code_verifier", payload.CodeVerifier),
			)
		} else {
			oauth2Token, err = flow.OAuth2.Exchange(
				flowCtx,
				r.URL.Query().Get("code"),
			)
		}

		if err != nil {
			// Don't echo the upstream OAuth2 error body to the browser;
			// it can carry full IdP HTTP response bodies including
			// internal addresses or stack traces. Log the full detail
			// server-side and surface a generic message via
			// oidcCallbackError so the response shape matches the rest
			// of the 4xx/5xx paths.
			logger.Log(logger.LevelError, map[string]string{"cluster": payload.Cluster},
				err, "failed to exchange token")
			oidcCallbackError(w, r, http.StatusInternalServerError,
				"Failed to exchange token",
				"The identity provider rejected the sign-in. Please try again.",
				payload.Cluster, config.BaseURL)

			return
		}

		tokenType := "id_token"
		if config.OidcUseAccessToken {
			tokenType = "access_token"
		}

		rawUserToken, ok := oauth2Token.Extra(tokenType).(string)
		if !ok {
			logger.Log(logger.LevelError, nil, nil, fmt.Sprintf("no %s field in oauth2 token", tokenType))
			http.Error(w, fmt.Sprintf("No %s field in oauth2 token.", tokenType), http.StatusInternalServerError)

			return
		}

		if err := config.Cache.Set(context.Background(),
			fmt.Sprintf("oidc-token-%s", rawUserToken), oauth2Token.RefreshToken); err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to cache refresh token")
			http.Error(w, "Failed to cache refresh token: "+err.Error(), http.StatusInternalServerError)

			return
		}

		idToken, err := flow.Verifier.Verify(flowCtx, rawUserToken)
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
		auth.SetTokenCookie(w, r, payload.Cluster, rawUserToken, config.BaseURL, config.SessionTTL)

		// Re-validate returnTo at consumption time (defense in depth: even
		// though the value was validated at /oidc and signed into the
		// state, a future schema change or signing-key compromise should
		// not be able to convert state into an arbitrary open redirect).
		// We pass config.BaseURL so the validator also enforces the
		// sub-path prefix when one is configured.
		safeReturnTo := ""
		if payload.ReturnTo != "" {
			cleaned, vErr := auth.ValidateReturnTo(payload.ReturnTo, config.BaseURL)
			if vErr == nil {
				safeReturnTo = cleaned
			} else {
				logger.Log(logger.LevelError, map[string]string{"cluster": payload.Cluster},
					vErr, "rejected returnTo on /oidc-callback (signed state had unsafe returnTo)")
			}
		}

		escapedCluster := url.PathEscape(payload.Cluster)

		switch payload.Mode {
		case auth.ModeFullPage:
			// Skip /auth entirely. Redirect straight to returnTo, or to
			// the cluster root if returnTo is absent or unsafe.
			if safeReturnTo != "" {
				redirectURL = safeReturnTo
			} else {
				redirectURL += "c/" + escapedCluster + "/"
			}
		case auth.ModeDesktop:
			// Belt-and-suspenders: /oidc rejects mode=desktop, but signed
			// state could in principle carry it via a different code path.
			http.Error(w, "mode=desktop is not yet supported", http.StatusBadRequest)
			return
		default:
			// ModePopup (and unset, treated as popup): preserve the
			// existing /auth?cluster=... contract, optionally with
			// returnTo so the /auth page can finish navigating after the
			// popup-storage handshake.
			redirectURL += "auth?cluster=" + url.QueryEscape(payload.Cluster)
			if safeReturnTo != "" {
				redirectURL += "&returnTo=" + url.QueryEscape(safeReturnTo)
			}
		}

		http.Redirect(w, r, redirectURL, http.StatusSeeOther)
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

// setTokenFromCookie attempts to get a token from the cookie and set it as Authorization header.
func setTokenFromCookie(r *http.Request, clusterName string) {
	tokenFromCookie, err := auth.GetTokenFromCookie(r, clusterName)
	// Set bearer token from cookie if it exists
	if err == nil && tokenFromCookie != "" {
		r.Header.Set("Authorization", fmt.Sprintf("Bearer %s", tokenFromCookie))
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
		c.TelemetryHandler.RecordEvent(span, "Not a cluster request, skipping OIDC refresh")
		next.ServeHTTP(w, r)
		c.TelemetryHandler.RecordDuration(ctx, start,
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
		c.TelemetryHandler.RecordEvent(span, "Missing cluster or token, bypassing OIDC refresh")
		next.ServeHTTP(w, r)
		c.TelemetryHandler.RecordDuration(ctx, start,
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
		c.TelemetryHandler.RecordError(span, err, "Failed to get context")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error", "get_context_failure"))
		next.ServeHTTP(w, r)
		c.TelemetryHandler.RecordDuration(ctx, start,
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
		c.TelemetryHandler.RecordEvent(span, "OIDC auth not enabled for cluster")
		next.ServeHTTP(w, r)
		c.TelemetryHandler.RecordDuration(ctx, start,
			attribute.String("api.route", "OIDCTokenRefreshMiddleware"),
			attribute.String("status", "oidc_auth_not_enabled"))

		return true
	}

	return false
}

// TODO: moving functions one at a time, this will be relocated
//
//nolint:funlen
func (c *HeadlampConfig) OIDCTokenRefreshMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		start := time.Now()

		var span trace.Span
		if c.Telemetry != nil {
			_, span = telemetry.CreateSpan(ctx, r, "auth", "OIDCTokenRefreshMiddleware")

			c.TelemetryHandler.RecordEvent(span, "Middleware started")

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
			c.TelemetryHandler.RecordEvent(span, "Token not about to expire, skipping refresh")
			next.ServeHTTP(w, r)
			c.TelemetryHandler.RecordDuration(ctx, start,
				attribute.String("api.route", "OIDCTokenRefreshMiddleware"),
				attribute.String("status", "token_valid"))

			return
		}

		// refresh and cache new token
		auth.RefreshAndSetToken(auth.RefreshAndSetTokenParams{
			Ctx:                       ctx,
			OIDCAuthConfig:            oidcAuthConfig,
			Cache:                     c.Cache,
			Token:                     token,
			Cluster:                   cluster,
			Span:                      span,
			Writer:                    w,
			Request:                   r,
			TelemetryHandler:          c.TelemetryHandler,
			OIDCUseAccessToken:        c.OidcUseAccessToken,
			OIDCIdpIssuerURL:          c.OidcIdpIssuerURL,
			OIDCValidatorIdpIssuerURL: c.OidcValidatorIdpIssuerURL,
			BaseURL:                   c.BaseURL,
			SessionTTL:                c.SessionTTL,
		})

		next.ServeHTTP(w, r)
		c.TelemetryHandler.RecordDuration(ctx, start,
			attribute.String("api.route", "OIDCTokenRefreshMiddleware"),
			attribute.String("status", "success"))
	})
}

// isLoopbackAddr reports whether the given listen address is a loopback address.
func isLoopbackAddr(addr string) bool {
	if strings.EqualFold(addr, "localhost") {
		return true
	}

	// Strip brackets from IPv6 addresses like "[::1]".
	ip := net.ParseIP(strings.Trim(addr, "[]"))

	return ip != nil && ip.IsLoopback()
}

// allowedHosts returns the set of normalized host values that are considered
// valid for the given listen address and port. All entries are lowercased and
// host:port pairs are built with net.JoinHostPort so that IPv6 literals are
// always bracketed correctly.
func allowedHosts(listenAddr string, port uint) map[string]bool {
	portStr := fmt.Sprintf("%d", port)

	loopbackHosts := []string{"localhost", "127.0.0.1", "::1"}

	hosts := make(map[string]bool, len(loopbackHosts)*2+2)

	for _, h := range loopbackHosts {
		hosts[net.JoinHostPort(h, portStr)] = true
		hosts[h] = true
	}

	// If the server was told to listen on a specific address, accept that too.
	// Normalize via net.ParseIP so non-canonical IPv6 forms (e.g.
	// "0:0:0:0:0:0:0:1") are reduced to their canonical representation ("::1")
	// before being added to the set.
	rawAddr := strings.ToLower(strings.Trim(listenAddr, "[]"))
	normAddr := rawAddr

	if ip := net.ParseIP(rawAddr); ip != nil {
		normAddr = ip.String()
	}

	if normAddr != "" && !hosts[normAddr] {
		hosts[net.JoinHostPort(normAddr, portStr)] = true
		hosts[normAddr] = true
	}

	return hosts
}

// normalizeHost canonicalizes the Host header value. The host portion is
// lowercased and, if it is an IP address, reduced to its canonical string form
// so that e.g. "[0:0:0:0:0:0:0:1]" and "[::1]" are treated identically.
// When a port is present the result is re-joined with net.JoinHostPort.
func normalizeHost(raw string) string {
	if raw == "" {
		return ""
	}

	host, port, err := net.SplitHostPort(raw)
	if err != nil {
		// No port — strip brackets from IPv6 literals (e.g. "[::1]" → "::1"),
		// then normalize to canonical IP form if applicable.
		stripped := strings.ToLower(strings.Trim(raw, "[]"))
		if ip := net.ParseIP(stripped); ip != nil {
			return ip.String()
		}

		return stripped
	}

	// Normalize the host part: lowercase, then canonicalize if it's an IP.
	lower := strings.ToLower(host)
	if ip := net.ParseIP(lower); ip != nil {
		lower = ip.String()
	}

	return net.JoinHostPort(lower, port)
}

// hostValidationMiddleware rejects requests whose Host header is not in the
// allowlist derived from the configured port's loopback hostnames/IPs
// (localhost, 127.0.0.1, and ::1, with or without the port) and, when
// provided, the server's explicit listen address.
func hostValidationMiddleware(listenAddr string, port uint) func(http.Handler) http.Handler {
	allowed := allowedHosts(listenAddr, port)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			normalized := normalizeHost(r.Host)

			if !allowed[normalized] {
				logger.Log(logger.LevelWarn, map[string]string{"host": r.Host},
					nil, "Rejected request with unexpected Host header")
				http.Error(w, "invalid Host header", http.StatusForbidden)

				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func StartHeadlampServer(config *HeadlampConfig) {
	tel, err := initTelemetry(config)
	if err != nil {
		os.Exit(1)
	}

	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := tel.Shutdown(shutdownCtx); err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to properly shutdown telemetry")
		}
	}()

	router := mux.NewRouter()

	if config.Telemetry != nil && config.Metrics != nil {
		router.Use(telemetry.TracingMiddleware("headlamp-server"))
		router.Use(config.Metrics.RequestCounterMiddleware)
	}

	if config.StaticDir != "" {
		if err := copyStaticFiles(config); err != nil {
			return
		}
	}

	// Create a cancellable context for watcher goroutines
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	handler := createHeadlampHandler(ctx, config)
	handler = config.OIDCTokenRefreshMiddleware(handler)

	// Only validate the Host header when listening on a loopback address.
	// When bound to a non-loopback address (e.g. behind a reverse proxy),
	// arbitrary Host headers are expected and must be allowed through.
	if isLoopbackAddr(config.ListenAddr) {
		handler = hostValidationMiddleware(config.ListenAddr, config.Port)(handler)
	}

	listenHost := strings.TrimPrefix(strings.TrimSuffix(config.ListenAddr, "]"), "[")
	addr := net.JoinHostPort(listenHost, fmt.Sprintf("%d", config.Port))

	server := &http.Server{Addr: addr, Handler: handler} //nolint:gosec

	serverDone := make(chan struct{})
	setupGracefulShutdown(server, cancel, serverDone)

	if config.TLSCertPath != "" && config.TLSKeyPath != "" {
		err = server.ListenAndServeTLS(config.TLSCertPath, config.TLSKeyPath)
	} else {
		err = server.ListenAndServe()
	}

	close(serverDone)

	if err != nil && err != http.ErrServerClosed {
		logger.Log(logger.LevelError, nil, err, "Failed to start server")
		HandleServerStartError(&err)
	}
}

// initTelemetry initializes telemetry and metrics for the server.
func initTelemetry(config *HeadlampConfig) (*telemetry.Telemetry, error) {
	tel, err := telemetry.NewTelemetry(config.TelemetryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "Failed to initialize telemetry")

		return nil, err
	}

	metrics, err := telemetry.NewMetrics()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "Failed to initialize metrics")
	}

	config.Telemetry = tel
	config.Metrics = metrics
	config.TelemetryHandler = telemetry.NewRequestHandler(tel, metrics)

	return tel, nil
}

// copyStaticFiles copies static files to a temporary directory.
// This is needed because squashFS is read-only (AppImage).
func copyStaticFiles(config *HeadlampConfig) error {
	dir, err := os.MkdirTemp(os.TempDir(), ".headlamp")
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "Failed to create static dir")

		return err
	}

	err = os.CopyFS(dir, os.DirFS(config.StaticDir))
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "Failed to copy files from static dir")

		return err
	}

	config.StaticDir = dir

	return nil
}

// setupGracefulShutdown starts a goroutine that listens for OS signals
// (SIGINT, SIGTERM) and gracefully shuts down the server. It cancels
// the context to stop all watcher goroutines. The serverDone channel
// is used to stop this goroutine if the server exits for a non-signal reason.
func setupGracefulShutdown(server *http.Server, cancel context.CancelFunc, serverDone <-chan struct{}) {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		defer signal.Stop(sigChan)

		select {
		case <-sigChan:
			logger.Log(logger.LevelInfo, nil, nil, "Received shutdown signal, stopping watchers...")

			cancel() // Cancel context to stop all watcher goroutines

			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer shutdownCancel()

			if err := server.Shutdown(shutdownCtx); err != nil {
				logger.Log(logger.LevelError, nil, err, "Failed to gracefully shutdown server")
			}
		case <-serverDone:
			// Server exited on its own, clean up watchers and stop the signal goroutine
			cancel()
			return
		}
	}()
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
	c.TelemetryHandler.RecordEvent(span, "Get helm handler started")

	defer span.End()

	c.TelemetryHandler.RecordRequestCount(ctx, r)

	clusterName := mux.Vars(r)["clusterName"]
	telemetry.AddSpanAttributes(ctx, attribute.String("clusterName", clusterName))

	helmHandler, err := helm.NewHandler(c.Cache)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName},
			err, "failed to create helm handler")
		c.TelemetryHandler.RecordError(span, err, "failed to create helm handler")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error", "helm handler creation failure"))
		c.TelemetryHandler.RecordDuration(ctx, start, attribute.String("status", "failure"))
		http.Error(w, "failed to create helm handler", http.StatusInternalServerError)

		return nil, err
	}

	c.TelemetryHandler.RecordDuration(ctx, start, attribute.String("status", "success"))
	c.TelemetryHandler.RecordEvent(span, "Successfully created helm handler")

	return helmHandler, nil
}

// Check request for header "X-HEADLAMP_BACKEND-TOKEN" matches HEADLAMP_BACKEND_TOKEN env
// This check is to prevent access except for from the app.
// The app sets HEADLAMP_BACKEND_TOKEN, and gives the token to the frontend.
func (c *HeadlampConfig) checkHeadlampBackendToken(w http.ResponseWriter, r *http.Request) error {
	if c.UseInCluster {
		return nil
	}

	backendToken := r.Header.Get("X-HEADLAMP_BACKEND-TOKEN")
	backendTokenEnv := os.Getenv("HEADLAMP_BACKEND_TOKEN")

	if backendToken != backendTokenEnv || backendTokenEnv == "" {
		http.Error(w, "access denied", http.StatusForbidden)
		return errors.New("X-HEADLAMP_BACKEND-TOKEN does not match HEADLAMP_BACKEND_TOKEN")
	}

	return nil
}

// handleClusterServiceProxy registers a new route for the path serviceproxy/{namespace}/{name}
// to proxy requests to in-cluster services.
func handleClusterServiceProxy(c *HeadlampConfig, router *mux.Router) {
	router.HandleFunc("/clusters/{clusterName}/serviceproxy/{namespace}/{name}",
		func(w http.ResponseWriter, r *http.Request) {
			serviceproxy.RequestHandler(c.KubeConfigStore, w, r)
		}).Queries("request", "{request}").
		Methods("GET")
}

func handleClusterHelm(c *HeadlampConfig, router *mux.Router) {
	router.PathPrefix("/clusters/{clusterName}/helm/{.*}").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		path := r.URL.Path
		clusterName := mux.Vars(r)["clusterName"]

		_, span := telemetry.CreateSpan(ctx, r, "helm", "handleClusterHelm",
			attribute.String("cluster", clusterName),
		)

		c.TelemetryHandler.RecordEvent(span, "Starting Helm operation request")
		defer span.End()

		c.TelemetryHandler.RecordRequestCount(ctx, r, attribute.String("cluster", clusterName))

		if err := c.checkHeadlampBackendToken(w, r); err != nil {
			c.handleError(w, ctx, span, err, "failed to check headlamp backend token", http.StatusForbidden)
			return
		}

		helmHandler, err := getHelmHandler(c, w, r)
		if err != nil {
			c.handleError(w, ctx, span, err, "failed to get helm handler", http.StatusForbidden)
			return
		}

		c.dispatchHelmRoute(ctx, span, w, r, path, clusterName, helmHandler)
	})
}

func (c *HeadlampConfig) helmRouteReleaseHandler(
	ctx context.Context,
	span trace.Span,
	r *http.Request,
	w http.ResponseWriter,
	clusterName, route, operation string,
	handler func(clientcmd.ClientConfig, http.ResponseWriter, *http.Request),
) {
	c.TelemetryHandler.RecordEvent(span, "Executing route",
		attribute.String("route", route),
		attribute.String("operation", operation))
	c.TelemetryHandler.RecordRequestCount(ctx, r)

	logger.Log(logger.LevelInfo, map[string]string{"route": route}, nil, "Dispatching helm operation: "+operation)

	context, err := c.KubeConfigStore.GetContext(clusterName)
	if err != nil {
		c.handleError(w, ctx, span, err, "failed to get context", http.StatusNotFound)
		return
	}

	// Create a copy of the context to avoid modifying the cached context
	context = context.Copy()

	// Only promote a cookie token when the request does not already provide Authorization.
	if strings.TrimSpace(r.Header.Get("Authorization")) == "" {
		setTokenFromCookie(r, clusterName)
	}

	bearerToken := r.Header.Get("Authorization")

	if bearerToken != "" {
		// Remove "Bearer " prefix if present
		bearerToken = strings.TrimPrefix(bearerToken, "Bearer ")

		if context.AuthInfo == nil {
			context.AuthInfo = &api.AuthInfo{}
		}

		context.AuthInfo.Token = bearerToken
	}

	handler(context.ClientConfig(), w, r)
}

func (c *HeadlampConfig) helmRouteRepositoryHandler(
	ctx context.Context,
	span trace.Span,
	r *http.Request,
	w http.ResponseWriter,
	clusterName, route, operation string,
	handler func(http.ResponseWriter, *http.Request),
) {
	c.TelemetryHandler.RecordEvent(span, "Executing route",
		attribute.String("route", route),
		attribute.String("operation", operation))
	c.TelemetryHandler.RecordRequestCount(ctx, r)

	// fetch token from cookie
	setTokenFromCookie(r, clusterName)

	// fetch token from header
	bearerToken := r.Header.Get("Authorization")

	// if no token present in in-cluster mode, return error
	if c.UseInCluster && bearerToken == "" {
		c.handleError(
			w, ctx, span,
			errors.New("no authentication token provided"),
			"failed to get token",
			http.StatusUnauthorized,
		)

		return
	}

	logger.Log(
		logger.LevelInfo,
		map[string]string{"route": route},
		nil,
		"Dispatching helm repository operation: "+operation,
	)

	handler(w, r)
}

func (c *HeadlampConfig) dispatchHelmRoute(
	ctx context.Context,
	span trace.Span,
	w http.ResponseWriter,
	r *http.Request,
	path, clusterName string,
	helmHandler *helm.Handler,
) {
	routeReleaseHandler := func(
		route, operation string,
		handler func(clientcmd.ClientConfig, http.ResponseWriter, *http.Request),
	) {
		c.helmRouteReleaseHandler(ctx, span, r, w, clusterName, route, operation, handler)
	}

	routeRepositoryHandler := func(
		route, operation string,
		handler func(http.ResponseWriter, *http.Request),
	) {
		c.helmRouteRepositoryHandler(ctx, span, r, w, clusterName, route, operation, handler)
	}

	switch {
	case strings.HasSuffix(path, "/releases/list") && r.Method == http.MethodGet:
		routeReleaseHandler("/releases/list", "ListRelease", helmHandler.ListRelease)
	case strings.HasSuffix(path, "/release/install") && r.Method == http.MethodPost:
		routeReleaseHandler("/release/install", "InstallRelease", helmHandler.InstallRelease)
	case strings.HasSuffix(path, "/release/history") && r.Method == http.MethodGet:
		routeReleaseHandler("/release/history", "GetReleaseHistory", helmHandler.GetReleaseHistory)
	case strings.HasSuffix(path, "/releases/uninstall") && r.Method == http.MethodDelete:
		routeReleaseHandler("/releases/uninstall", "UninstallRelease", helmHandler.UninstallRelease)
	case strings.HasSuffix(path, "/releases/rollback") && r.Method == http.MethodPut:
		routeReleaseHandler("/releases/rollback", "RollbackRelease", helmHandler.RollbackRelease)
	case strings.HasSuffix(path, "/releases/upgrade") && r.Method == http.MethodPut:
		routeReleaseHandler("/releases/upgrade", "UpgradeRelease", helmHandler.UpgradeRelease)
	case strings.HasSuffix(path, "/releases") && r.Method == http.MethodGet:
		routeReleaseHandler("/releases", "GetRelease", helmHandler.GetRelease)
	case strings.HasSuffix(path, "/repositories") && r.Method == http.MethodGet:
		routeRepositoryHandler("/repositories", "ListRepo", helmHandler.ListRepo)
	case strings.HasSuffix(path, "/repositories") && r.Method == http.MethodPost:
		routeRepositoryHandler("/repositories", "AddRepo", helmHandler.AddRepo)
	case strings.HasSuffix(path, "/repositories/remove") && r.Method == http.MethodDelete:
		routeRepositoryHandler("/repositories/remove", "RemoveRepo", helmHandler.RemoveRepo)
	case strings.HasSuffix(path, "/repositories/update") && r.Method == http.MethodPut:
		routeRepositoryHandler("/repositories/update", "UpdateRepository", helmHandler.UpdateRepository)
	case strings.HasSuffix(path, "/charts") && r.Method == http.MethodGet:
		routeRepositoryHandler("/charts", "ListCharts", helmHandler.ListCharts)
	case strings.HasSuffix(path, "/action/status") && r.Method == http.MethodGet:
		routeReleaseHandler("/action/status", "GetActionStatus", helmHandler.GetActionStatus)
	default:
		logger.Log(logger.LevelError, map[string]string{"path": path}, nil, "Unknown helm API route")

		c.TelemetryHandler.RecordEvent(span, "Unknown API route", attribute.String("path", path))
		span.SetStatus(codes.Error, "Unknown API route")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error", "unknown_route"))

		http.NotFound(w, r)
	}
}

func (c *HeadlampConfig) handleError(w http.ResponseWriter, ctx context.Context,
	span trace.Span, err error, msg string, status int,
) {
	logger.Log(logger.LevelError, nil, err, msg)
	c.TelemetryHandler.RecordError(span, err, msg)
	c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", msg))
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

		c.TelemetryHandler.RecordRequestCount(ctx, r, attribute.String("cluster", mux.Vars(r)["clusterName"]))
		c.TelemetryHandler.RecordEvent(span, "Cluster API request started")

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
		c.TelemetryHandler.RecordClusterProxyRequestsCount(ctx, attribute.String("cluster", contextKey),
			attribute.String("http.method", r.Method))

		r.Host = clusterURL.Host
		r.Header.Set("X-Forwarded-Host", r.Host)

		// Remove User-Agent for WebSocket connections to avoid potential issues with some K8s API servers
		// For regular HTTP requests, User-Agent is set by the transport layer (userAgentRoundTripper)
		if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			r.Header.Del("User-Agent")
		}

		r.URL.Host = clusterURL.Host
		r.URL.Path = mux.Vars(r)["api"]
		r.URL.Scheme = clusterURL.Scheme

		token, err := auth.GetTokenFromCookie(r, mux.Vars(r)["clusterName"])
		if err == nil && token != "" {
			r.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
		}

		// Process WebSocket protocol headers if present
		processWebSocketProtocolHeader(r)
		plugins.HandlePluginReload(c.Cache, w)

		if err = kContext.ProxyRequest(w, r); err != nil {
			c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "proxy_error"),
				attribute.String("cluster", contextKey))
			c.handleError(w, ctx, span, err, "failed to proxy request", http.StatusInternalServerError)

			return
		}

		if c.Telemetry != nil {
			span.SetStatus(codes.Ok, "")
			c.TelemetryHandler.RecordEvent(span, "Cluster API request completed")
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
	c.TelemetryHandler.RecordDuration(ctx, start,
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

	handleClusterServiceProxy(c, router)
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

	clientConfig := clientConfig{
		Clusters:                c.getClusters(),
		IsDynamicClusterEnabled: c.EnableDynamicClusters,
		AllowKubeconfigChanges:  c.AllowKubeconfigChanges,
		DefaultPodDebugImage:    c.PodDebugImage,
	}

	if err := json.NewEncoder(w).Encode(&clientConfig); err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding config")
	}
}

// addCluster adds cluster to store and updates the kubeconfig file.
func (c *HeadlampConfig) addCluster(w http.ResponseWriter, r *http.Request) { //nolint:funlen
	ctx := r.Context()
	start := time.Now()

	_, span := telemetry.CreateSpan(ctx, r, "cluster-management", "addCluster")

	c.TelemetryHandler.RecordEvent(span, "Add cluster request started")
	defer span.End()
	// Defer recording the duration and logging when the request is complete.
	defer recordRequestCompletion(c, ctx, start, r)

	c.TelemetryHandler.RecordRequestCount(ctx, r)

	if err := c.checkHeadlampBackendToken(w, r); err != nil {
		c.TelemetryHandler.RecordError(span, err, "invalid backend token")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "invalid token"))
		logger.Log(logger.LevelError, nil, err, "invalid token")

		return
	}

	clusterReq, err := decodeClusterRequest(r)
	if err != nil {
		c.TelemetryHandler.RecordError(span, err, "failed to decode cluster request")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "decode error"))
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
		c.TelemetryHandler.RecordError(span, errors.New("no contexts found in kubeconfig"), "no contexts found in kubeconfig")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "no_contexts_found"))
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
				c.TelemetryHandler.RecordError(span, setupErr, "setup error")
			}
		}

		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "setup_context_error"))
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
	var setupErrors []error

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

	c.TelemetryHandler.RecordRequestCount(ctx, r)

	defer func() {
		duration := time.Since(start).Milliseconds()

		c.TelemetryHandler.RecordDuration(ctx, start, attribute.String("api.route", "/cluster/delete"))
		logger.Log(logger.LevelInfo, map[string]string{
			"duration_ms": fmt.Sprintf("%d", duration),
			"api.route":   "/cluster/delete",
		}, nil, "Completed deleteCluster request")
	}()

	name := mux.Vars(r)["name"]

	if err := c.checkHeadlampBackendToken(w, r); err != nil {
		c.TelemetryHandler.RecordError(span, err, "invalid backend token")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "invalid_token"))
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

	c.TelemetryHandler.RecordRequestCount(ctx, r, attribute.String("cluster", clusterName))
	_, span := telemetry.CreateSpan(ctx, r, "cluster-rename", "handleStatelessClusterRename",
		attribute.String("cluster", clusterName),
	)
	c.TelemetryHandler.RecordEvent(span, "Stateless cluster rename request started")

	defer span.End()

	if err := c.KubeConfigStore.RemoveContext(clusterName); err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName},
			err, "decoding request body")
		c.TelemetryHandler.RecordError(span, err, "decoding request body")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "remove_context_failure"))
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	w.WriteHeader(http.StatusCreated)
	c.getConfig(w, r)

	duration := time.Since(start).Milliseconds()
	c.TelemetryHandler.RecordDuration(ctx, start, attribute.String("api.route", "handleStatelessClusterRename"))
	logger.Log(logger.LevelInfo, map[string]string{
		"duration_ms": fmt.Sprintf("%d", duration),
		"api.route":   "handleStatelessClusterRename",
	}, nil, "Completed stateless cluster rename")
}

// customNameToExtensions writes the custom name to the Extensions map in the kubeconfig.
func customNameToExtensions(config *api.Config, contextName, newClusterName, path string) error {
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

	// Assign the CustomObject to the Extensions map.
	// Extensions is nil for contexts that have never had extensions set; initialize
	// it before writing to avoid a nil-map panic.
	if contextConfig.Extensions == nil {
		contextConfig.Extensions = make(map[string]k8sruntime.Object)
	}

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

	c.TelemetryHandler.RecordEvent(span, "Rename cluster request started")
	c.TelemetryHandler.RecordRequestCount(ctx, r, attribute.String("cluster", clusterName))

	// Parse request and validate
	var reqBody RenameClusterRequest
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		c.handleError(w, ctx, span, err, "failed to decode request body", http.StatusBadRequest)
		return
	}

	// Handle stateless clusters separately
	if reqBody.Stateless {
		c.TelemetryHandler.RecordEvent(span, "Delegating to handleStatelessClusterRename")
		c.handleStatelessClusterRename(w, r, clusterName)

		return
	}

	if err := c.handleClusterRename(w, r, clusterName, reqBody, ctx, span); err != nil {
		return // Error already handled inside handleClusterRename
	}

	// Record success metrics and logging
	c.TelemetryHandler.RecordDuration(ctx, start, attribute.String("api.route", "renameCluster"))
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

	if err := customNameToExtensions(config, contextName, reqBody.NewClusterName, path); err != nil {
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
// has a matching customObj.CustomName, if any. It also handles the case where
// the clusterName is a DNS-friendly version of the original context key
// (e.g. slashes replaced with double dashes by MakeDNSFriendly).
//
// Resolution order:
//  1. Custom name match (headlamp_info extension) — highest priority, returns immediately.
//  2. Exact key match — avoids DNS-friendly ambiguity when the name already exists verbatim.
//  3. DNS-friendly match — collects all candidates; warns and picks the
//     lexicographically first one when multiple keys map to the same form.
func findMatchingContextName(config *api.Config, clusterName string) string {
	// 1. Custom name takes priority: return the real context key immediately.
	for k, v := range config.Contexts {
		info := v.Extensions["headlamp_info"]
		if info == nil {
			continue
		}

		customObj, err := MarshalCustomObject(info, k)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"cluster": k},
				err, "marshaling custom object")

			continue
		}

		if customObj.CustomName != "" && customObj.CustomName == clusterName {
			return k
		}
	}

	// 2. Exact key match: clusterName is already a verbatim context key.
	if _, ok := config.Contexts[clusterName]; ok {
		return clusterName
	}

	// 3. DNS-friendly match: collect all keys whose DNS-friendly form matches.
	// Sorting makes the selection deterministic when multiple keys collide.
	var matches []string

	for k := range config.Contexts {
		if kubeconfig.MakeDNSFriendly(k) == clusterName {
			matches = append(matches, k)
		}
	}

	switch len(matches) {
	case 1:
		return matches[0]
	case 0:
		return clusterName
	default:
		sort.Strings(matches)
		logger.Log(logger.LevelWarn,
			map[string]string{"clusterName": clusterName},
			nil,
			fmt.Sprintf("ambiguous DNS-friendly cluster name %q matches multiple context keys %v; using %q",
				clusterName, matches, matches[0]),
		)

		return matches[0]
	}
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
	c.TelemetryHandler.RecordRequestCount(ctx, r)
	c.TelemetryHandler.RecordEvent(span, "node drain request started")

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

func (c *HeadlampConfig) drainNode(clientset kubernetes.Interface, nodeName string, cluster string) {
	go func() {
		nodeClient := clientset.CoreV1().Nodes()
		ctx := context.Background()
		cacheKey := uuid.NewSHA1(uuid.Nil, []byte(nodeName+cluster)).String()
		cacheItemTTL := DrainNodeCacheTTL * time.Minute

		node, err := nodeClient.Get(ctx, nodeName, v1.GetOptions{})
		if err != nil {
			_ = c.Cache.SetWithTTL(ctx, cacheKey, "error: "+err.Error(), cacheItemTTL)
			return
		}

		// cordon the node first
		node.Spec.Unschedulable = true

		_, err = nodeClient.Update(ctx, node, v1.UpdateOptions{})
		if err != nil {
			_ = c.Cache.SetWithTTL(ctx, cacheKey, "error: "+err.Error(), cacheItemTTL)
			return
		}

		pods, err := clientset.CoreV1().Pods("").List(ctx,
			v1.ListOptions{FieldSelector: "spec.nodeName=" + nodeName})
		if err != nil {
			_ = c.Cache.SetWithTTL(ctx, cacheKey, "error: "+err.Error(), cacheItemTTL)
			return
		}

		var gracePeriod int64 = 0

		var deleteErrors []string

		for _, pod := range pods.Items {
			// ignore daemonsets
			if pod.Labels["kubernetes.io/created-by"] == "daemonset-controller" {
				continue
			}

			if err := clientset.CoreV1().Pods(pod.Namespace).Delete(ctx,
				pod.Name, v1.DeleteOptions{GracePeriodSeconds: &gracePeriod}); err != nil && !apierrors.IsNotFound(err) {
				deleteErrors = append(deleteErrors, fmt.Sprintf("%s/%s: %v", pod.Namespace, pod.Name, err))
			}
		}

		if len(deleteErrors) > 0 {
			errMsg := fmt.Sprintf("error: failed to delete %d pod(s)", len(deleteErrors))
			logger.Log(logger.LevelError, nil, nil,
				fmt.Sprintf("node drain: failed to delete %d pod(s): %s",
					len(deleteErrors), strings.Join(deleteErrors, "; ")))

			_ = c.Cache.SetWithTTL(ctx, cacheKey, errMsg, cacheItemTTL)
		} else {
			_ = c.Cache.SetWithTTL(ctx, cacheKey, "success", cacheItemTTL)
		}
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
	c.TelemetryHandler.RecordEvent(span, "handleNodeDrainStatus request started")
	c.TelemetryHandler.RecordRequestCount(ctx, r)

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

	cacheItem, err := c.Cache.Get(ctx, cacheKey)
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

	c.TelemetryHandler.RecordEvent(span, "Drain status found", attribute.String("cache.key", cacheKey))

	if err = json.NewEncoder(w).Encode(responsePayload); err != nil {
		c.handleError(w, ctx, span, err, "failed to encode repsone", http.StatusInternalServerError)

		return
	}

	c.TelemetryHandler.RecordDuration(ctx, start, attribute.String("api.route", "handleNodeDrainStatus"))
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
		auth.ClearTokenCookie(w, r, cluster, c.BaseURL)
	} else {
		auth.SetTokenCookie(w, r, cluster, req.Token, c.BaseURL, c.SessionTTL)
	}

	w.WriteHeader(http.StatusOK)
}
