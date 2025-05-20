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
	"regexp"
	"runtime"
	"strings"
	"time"

	oidc "github.com/coreos/go-oidc/v3/oidc"
	"github.com/gobwas/glob"
	"github.com/google/uuid"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/helm"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/plugins"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/portforward"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"

	"golang.org/x/oauth2"
)

type HeadlampConfig struct {
	useInCluster              bool
	listenAddr                string
	devMode                   bool
	insecure                  bool
	enableHelm                bool
	enableDynamicClusters     bool
	watchPluginsChanges       bool
	port                      uint
	kubeConfigPath            string
	skippedKubeContexts       string
	staticDir                 string
	pluginDir                 string
	staticPluginDir           string
	oidcClientID              string
	oidcValidatorClientID     string
	oidcClientSecret          string
	oidcIdpIssuerURL          string
	oidcValidatorIdpIssuerURL string
	oidcUseAccessToken        bool
	baseURL                   string
	oidcScopes                []string
	proxyURLs                 []string
	cache                     cache.Cache[interface{}]
	kubeConfigStore           kubeconfig.ContextStore
	multiplexer               *Multiplexer
}

const DrainNodeCacheTTL = 20 // seconds

const isWindows = runtime.GOOS == "windows"

const ContextCacheTTL = 5 * time.Minute // minutes

const ContextUpdateCacheTTL = 20 * time.Second // seconds

const JWTExpirationTTL = 10 * time.Second // seconds

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

type spaHandler struct {
	staticPath string
	indexPath  string
	baseURL    string
}

type OauthConfig struct {
	Config   *oauth2.Config
	Verifier *oidc.IDTokenVerifier
	Ctx      context.Context
}

func (h spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if strings.Contains(r.URL.Path, "..") {
		http.Error(w, "Contains unexpected '..'", http.StatusBadRequest)
		return
	}

	absStaticPath, err := filepath.Abs(h.staticPath)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting absolute static path")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// Clean the path to prevent directory traversal
	path := filepath.Clean(r.URL.Path)
	path = strings.TrimPrefix(path, h.baseURL)

	// prepend the path with the path to the static directory
	path = filepath.Join(absStaticPath, path)

	// This is defensive, for preventing using files outside of the staticPath
	// if in the future we touch the code.
	absPath, err := filepath.Abs(path)
	if err != nil || !strings.HasPrefix(absPath, absStaticPath) {
		http.Error(w, "Invalid file name (file to serve is outside of the static dir!)", http.StatusBadRequest)
		return
	}

	// check whether a file exists at the given path
	_, err = os.Stat(path)
	if os.IsNotExist(err) {
		// file does not exist, serve index.html
		http.ServeFile(w, r, filepath.Join(absStaticPath, h.indexPath))
		return
	} else if err != nil {
		// if we got an error (that wasn't that the file doesn't exist) stating the
		// file, return a 500 internal server error and stop
		logger.Log(logger.LevelError, nil, err, "stating file")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// The file does exist, so we serve that.
	http.ServeFile(w, r, path)
}

// returns True if a file exists.
func fileExists(filename string) bool {
	info, err := os.Stat(filename)
	if os.IsNotExist(err) {
		return false
	}

	return !info.IsDir()
}

// copy a file, whilst doing some search/replace on the data.
func copyReplace(src string, dst string,
	search []byte, replace []byte,
	search2 []byte, replace2 []byte,
) {
	data, err := os.ReadFile(src)
	if err != nil {
		// Error Reading the file
		logger.Log(logger.LevelError, nil, err, "reading file")
		os.Exit(1)
	}

	data1 := bytes.ReplaceAll(data, search, replace)
	data2 := bytes.ReplaceAll(data1, search2, replace2)
	fileMode := 0o600

	err = os.WriteFile(dst, data2, fs.FileMode(fileMode))
	if err != nil {
		// Error writing the file
		logger.Log(logger.LevelError, nil, err, "writing file")
		os.Exit(1)
	}
}

// make sure the base-url is updated in the index.html file.
func baseURLReplace(staticDir string, baseURL string) {
	indexBaseURL := path.Join(staticDir, "index.baseUrl.html")
	index := path.Join(staticDir, "index.html")

	replaceURL := baseURL
	if baseURL == "" {
		// We have to do the replace when baseURL == "" because of the case when
		//   someone first does a different baseURL. If we didn't it would stay stuck
		//   on that previous baseURL.
		replaceURL = "/"
	}

	if !fileExists(indexBaseURL) {
		copyReplace(index, indexBaseURL, []byte(""), []byte(""), []byte(""), []byte(""))
	}

	copyReplace(indexBaseURL,
		index,
		[]byte("headlampBaseUrl = './'"),
		[]byte("headlampBaseUrl = '"+replaceURL+"'"),
		// Replace any resource that has "./" in it
		[]byte("./"),
		[]byte(baseURL+"/"))

	// Insert baseURL in css url() imports, they don't have "./" in them
	copyReplace(index, index, []byte("url("), []byte("url("+baseURL+"/"), []byte(""), []byte(""))
}

func getOidcCallbackURL(r *http.Request, config *HeadlampConfig) string {
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
	baseURL := strings.Trim(config.baseURL, "/")

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

// defaultKubeConfigPersistenceDir returns the default directory to store kubeconfig
// files of clusters that are loaded in Headlamp.
func defaultKubeConfigPersistenceDir() (string, error) {
	userConfigDir, err := os.UserConfigDir()
	if err == nil {
		kubeConfigDir := filepath.Join(userConfigDir, "Headlamp", "kubeconfigs")
		if isWindows {
			// golang is wrong for config folder on windows.
			// This matches env-paths and headlamp-plugin.
			kubeConfigDir = filepath.Join(userConfigDir, "Headlamp", "Config", "kubeconfigs")
		}

		// Create the directory if it doesn't exist.
		fileMode := 0o755

		err = os.MkdirAll(kubeConfigDir, fs.FileMode(fileMode))
		if err == nil {
			return kubeConfigDir, nil
		}
	}

	// if any error occurred, fallback to the current directory.
	ex, err := os.Executable()
	if err == nil {
		return filepath.Dir(ex), nil
	}

	return "", fmt.Errorf("failed to get default kubeconfig persistence directory: %v", err)
}

func defaultKubeConfigPersistenceFile() (string, error) {
	kubeConfigDir, err := defaultKubeConfigPersistenceDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(kubeConfigDir, "config"), nil
}

// addPluginRoutes adds plugin routes to a router.
// It serves plugin list base paths as json at "plugins".
// It serves plugin static files at "plugins/" and "static-plugins/".
// It disables caching and reloads plugin list base paths if not in-cluster.
func addPluginRoutes(config *HeadlampConfig, r *mux.Router) {
	// Delete plugin route
	// This is only available when running locally.
	if !config.useInCluster {
		r.HandleFunc("/plugins/{name}", func(w http.ResponseWriter, r *http.Request) {
			if err := checkHeadlampBackendToken(w, r); err != nil {
				return
			}
			pluginName := mux.Vars(r)["name"]

			err := plugins.Delete(config.pluginDir, pluginName)
			if err != nil {
				http.Error(w, "Error deleting plugin", http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
		}).Methods("DELETE")
	}

	r.HandleFunc("/plugins", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		pluginsList, err := config.cache.Get(context.Background(), plugins.PluginListKey)
		if err != nil && err == cache.ErrNotFound {
			pluginsList = []string{}
		}
		if err := json.NewEncoder(w).Encode(pluginsList); err != nil {
			logger.Log(logger.LevelError, nil, err, "encoding plugins base paths list")
		} else {
			// Notify that the client has requested the plugins list. So we can start sending
			// refresh requests.
			if err := config.cache.Set(context.Background(), plugins.PluginCanSendRefreshKey, true); err != nil {
				logger.Log(logger.LevelError, nil, err, "setting plugin-can-send-refresh key")
			}
		}
	}).Methods("GET")

	// Serve plugins
	pluginHandler := http.StripPrefix(config.baseURL+"/plugins/", http.FileServer(http.Dir(config.pluginDir)))
	// If we're running locally, then do not cache the plugins. This ensures that reloading them (development,
	// update) will actually get the new content.
	if !config.useInCluster {
		pluginHandler = serveWithNoCacheHeader(pluginHandler)
	}

	r.PathPrefix("/plugins/").Handler(pluginHandler)

	if config.staticPluginDir != "" {
		staticPluginsHandler := http.StripPrefix(config.baseURL+"/static-plugins/",
			http.FileServer(http.Dir(config.staticPluginDir)))
		r.PathPrefix("/static-plugins/").Handler(staticPluginsHandler)
	}
}

//nolint:gocognit,funlen,gocyclo
func createHeadlampHandler(config *HeadlampConfig) http.Handler {
	kubeConfigPath := config.kubeConfigPath

	config.staticPluginDir = os.Getenv("HEADLAMP_STATIC_PLUGINS_DIR")

	logger.Log(logger.LevelInfo, nil, nil, "Creating Headlamp handler")
	logger.Log(logger.LevelInfo, nil, nil, "Listen address: "+fmt.Sprintf("%s:%d", config.listenAddr, config.port))
	logger.Log(logger.LevelInfo, nil, nil, "Kubeconfig path: "+kubeConfigPath)
	logger.Log(logger.LevelInfo, nil, nil, "Static plugin dir: "+config.staticPluginDir)
	logger.Log(logger.LevelInfo, nil, nil, "Plugins dir: "+config.pluginDir)
	logger.Log(logger.LevelInfo, nil, nil, "Dynamic clusters support: "+fmt.Sprint(config.enableDynamicClusters))
	logger.Log(logger.LevelInfo, nil, nil, "Helm support: "+fmt.Sprint(config.enableHelm))
	logger.Log(logger.LevelInfo, nil, nil, "Proxy URLs: "+fmt.Sprint(config.proxyURLs))

	plugins.PopulatePluginsCache(config.staticPluginDir, config.pluginDir, config.cache)

	skipFunc := kubeconfig.SkipKubeContextInCommaSeparatedString(config.skippedKubeContexts)

	if !config.useInCluster || config.watchPluginsChanges {
		// in-cluster mode is unlikely to want reloading plugins.
		pluginEventChan := make(chan string)
		go plugins.Watch(config.pluginDir, pluginEventChan)
		go plugins.HandlePluginEvents(config.staticPluginDir, config.pluginDir, pluginEventChan, config.cache)
		// in-cluster mode is unlikely to want reloading kubeconfig.
		go kubeconfig.LoadAndWatchFiles(config.kubeConfigStore, kubeConfigPath, kubeconfig.KubeConfig, skipFunc)
	}

	// In-cluster
	if config.useInCluster {
		context, err := kubeconfig.GetInClusterContext(config.oidcIdpIssuerURL,
			config.oidcClientID, config.oidcClientSecret,
			strings.Join(config.oidcScopes, ","))
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to get in-cluster context")
		}

		context.Source = kubeconfig.InCluster

		err = context.SetupProxy()
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to setup proxy for in-cluster context")
		}

		err = config.kubeConfigStore.AddContext(context)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to add in-cluster context")
		}
	}

	if config.staticDir != "" {
		baseURLReplace(config.staticDir, config.baseURL)
	}

	// For when using a base-url, like "/headlamp" with a reverse proxy.
	var r *mux.Router
	if config.baseURL == "" {
		r = mux.NewRouter()
	} else {
		baseRoute := mux.NewRouter()
		r = baseRoute.PathPrefix(config.baseURL).Subrouter()
	}

	fmt.Println("*** Headlamp Server ***")
	fmt.Println("  API Routers:")

	// load kubeConfig clusters
	err := kubeconfig.LoadAndStoreKubeConfigs(config.kubeConfigStore, kubeConfigPath, kubeconfig.KubeConfig, skipFunc)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "loading kubeconfig")
	}

	// load dynamic clusters
	kubeConfigPersistenceFile, err := defaultKubeConfigPersistenceFile()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting default kubeconfig persistence file")
	}

	err = kubeconfig.LoadAndStoreKubeConfigs(config.kubeConfigStore, kubeConfigPersistenceFile,
		kubeconfig.DynamicCluster, skipFunc)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "loading dynamic kubeconfig")
	}

	addPluginRoutes(config, r)

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

		for _, proxyURL := range config.proxyURLs {
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

	// Websocket connections
	r.HandleFunc("/wsMultiplexer", config.multiplexer.HandleClientWebSocket)

	config.addClusterSetupRoute(r)

	oauthRequestMap := make(map[string]*OauthConfig)

	r.HandleFunc("/oidc", func(w http.ResponseWriter, r *http.Request) {
		ctx := context.Background()
		cluster := r.URL.Query().Get("cluster")
		if config.insecure {
			tr := &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
			}
			insecureClient := &http.Client{Transport: tr}
			ctx = oidc.ClientContext(ctx, insecureClient)
		}

		kContext, err := config.kubeConfigStore.GetContext(cluster)
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

	r.HandleFunc("/portforward", func(w http.ResponseWriter, r *http.Request) {
		portforward.StartPortForward(config.kubeConfigStore, config.cache, w, r)
	}).Methods("POST")

	r.HandleFunc("/portforward", func(w http.ResponseWriter, r *http.Request) {
		portforward.StopOrDeletePortForward(config.cache, w, r)
	}).Methods("DELETE")

	r.HandleFunc("/portforward/list", func(w http.ResponseWriter, r *http.Request) {
		portforward.GetPortForwards(config.cache, w, r)
	})

	r.HandleFunc("/drain-node", config.handleNodeDrain).Methods("POST")
	r.HandleFunc("/drain-node-status",
		config.handleNodeDrainStatus).Methods("GET").Queries("cluster", "{cluster}", "nodeName", "{node}")
	r.HandleFunc("/portforward", func(w http.ResponseWriter, r *http.Request) {
		portforward.GetPortForwardByID(config.cache, w, r)
	}).Methods("GET")

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
			if config.devMode {
				redirectURL = "http://localhost:3000/"
			} else {
				redirectURL = "/"
			}

			baseURL := strings.Trim(config.baseURL, "/")
			if baseURL != "" {
				redirectURL += baseURL + "/"
			}

			redirectURL += fmt.Sprintf("auth?cluster=%1s&token=%2s", decodedState, rawUserToken)
			http.Redirect(w, r, redirectURL, http.StatusSeeOther)
		} else {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
	})

	// Serve the frontend if needed
	if config.staticDir != "" {
		staticPath := config.staticDir

		if isWindows {
			// We support unix paths on windows. So "frontend/static" works.
			if strings.Contains(config.staticDir, "/") {
				staticPath = filepath.FromSlash(config.staticDir)
			}
		}

		spa := spaHandler{staticPath: staticPath, indexPath: "index.html", baseURL: config.baseURL}
		r.PathPrefix("/").Handler(spa)

		http.Handle("/", r)
	}

	// On dev mode we're loose about where connections come from
	if config.devMode {
		headers := handlers.AllowedHeaders([]string{
			"X-HEADLAMP_BACKEND-TOKEN", "X-Requested-With", "Content-Type",
			"Authorization", "Forward-To",
			"KUBECONFIG", "X-HEADLAMP-USER-ID",
		})
		methods := handlers.AllowedMethods([]string{"GET", "POST", "PUT", "HEAD", "DELETE", "PATCH", "OPTIONS"})
		origins := handlers.AllowedOrigins([]string{"*"})

		return handlers.CORS(headers, methods, origins)(r)
	}

	return r
}

func parseClusterAndToken(r *http.Request) (string, string) {
	cluster := ""
	re := regexp.MustCompile(`^/clusters/([^/]+)/.*`)
	urlString := r.URL.RequestURI()

	matches := re.FindStringSubmatch(urlString)
	if len(matches) > 1 {
		cluster = matches[1]
	}

	// get token
	token := r.Header.Get("Authorization")
	token = strings.TrimPrefix(token, "Bearer ")

	return cluster, token
}

func decodePayload(payload string) (map[string]interface{}, error) {
	payloadBytes, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return nil, err
	}

	var payloadMap map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &payloadMap); err != nil {
		return nil, err
	}

	return payloadMap, nil
}

func getExpiryTime(payload map[string]interface{}) (time.Time, error) {
	exp, ok := payload["exp"].(float64)
	if !ok {
		return time.Time{}, errors.New("expiry time not found or invalid")
	}

	return time.Unix(int64(exp), 0), nil
}

func isTokenAboutToExpire(token string) bool {
	const tokenParts = 3

	parts := strings.Split(token, ".")
	if len(parts) != tokenParts {
		return false
	}

	payload, err := decodePayload(parts[1])
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to decode payload")
		return false
	}

	expiryTime, err := getExpiryTime(payload)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get expiry time")
		return false
	}

	return time.Until(expiryTime) <= JWTExpirationTTL
}

func refreshAndCacheNewToken(clientID, clientSecret, token, issuerURL string) (*oauth2.Token, error) {
	// get provider
	provider, err := oidc.NewProvider(context.Background(), issuerURL)
	if err != nil {
		return nil, fmt.Errorf("getting provider: %v", err)
	}

	// get refresh token
	refreshToken, err := getNewTokenFromRefresh(clientID, clientSecret, token, provider.Endpoint().TokenURL)
	if err != nil {
		return nil, fmt.Errorf("refreshing token: %v", err)
	}

	// cache the refreshed token
	if err := cacheRefreshedToken(refreshToken); err != nil {
		return nil, fmt.Errorf("caching refreshed token: %v", err)
	}

	return refreshToken, nil
}

// getNewTokenFromRefresh uses the provided credentials and refresh token to obtain a new OAuth2 token
// from the specified token URL endpoint.
func getNewTokenFromRefresh(clientID, clientSecret, rToken, tokenURL string) (*oauth2.Token, error) {
	// Create OAuth2 config with client credentials and token endpoint
	conf := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint: oauth2.Endpoint{
			TokenURL: tokenURL,
		},
	}

	// Request new token using the refresh token
	token, err := conf.TokenSource(context.Background(), &oauth2.Token{
		RefreshToken: rToken,
	}).Token()
	if err != nil {
		return nil, err
	}

	return token, nil
}

// cacheRefreshedToken stores the provided OAuth2 token in a temporary file cache.
// The token is serialized to JSON and written to a file named "headlamp-token-cache"
// in the system's temporary directory with 0600 permissions.
func cacheRefreshedToken(token *oauth2.Token) error {
	tokenBytes, err := json.Marshal(token)
	if err != nil {
		return err
	}

	// Create temp file with pattern to ensure unique name
	tmpFile, err := os.CreateTemp("", TokenCacheFileName)
	if err != nil {
		return err
	}
	defer tmpFile.Close()

	// Set correct file permissions
	if err := os.Chmod(tmpFile.Name(), TokenCacheFileMode); err != nil {
		return err
	}

	if _, err := tmpFile.Write(tokenBytes); err != nil {
		return err
	}

	return nil
}

func (c *HeadlampConfig) OIDCTokenRefreshMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// skip if not cluster request
		if !strings.HasPrefix(r.URL.String(), "/clusters/") {
			next.ServeHTTP(w, r)
			return
		}

		// parse cluster and token
		cluster, token := parseClusterAndToken(r)
		if cluster == "" || token == "" {
			next.ServeHTTP(w, r)
			return
		}

		// get oidc config
		kContext, err := c.kubeConfigStore.GetContext(cluster)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"cluster": cluster},
				err, "failed to get context")
			next.ServeHTTP(w, r)

			return
		}

		// skip if cluster is not using OIDC auth
		oidcAuthConfig, err := kContext.OidcConfig()
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		// skip if token is not about to expire
		if !isTokenAboutToExpire(token) {
			next.ServeHTTP(w, r)
			return
		}

		// refresh and cache new token
		newToken, err := refreshAndCacheNewToken(
			oidcAuthConfig.ClientID,
			oidcAuthConfig.ClientSecret,
			token,
			c.oidcIdpIssuerURL,
		)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"cluster": cluster},
				err, "failed to refresh token")
		}

		if newToken != nil {
			w.Header().Set("X-Authorization", newToken.AccessToken)
		}

		next.ServeHTTP(w, r)
	})
}

func StartHeadlampServer(config *HeadlampConfig) {
	// Copy static files as squashFS is read-only (AppImage)
	if config.staticDir != "" {
		dir, err := os.MkdirTemp(os.TempDir(), ".headlamp")
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to create static dir")
			os.Exit(1)
		}

		err = os.CopyFS(dir, os.DirFS(config.staticDir))
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "Failed to copy files from static dir")
			os.Exit(1)
		}

		config.staticDir = dir
	}

	handler := createHeadlampHandler(config)

	handler = config.OIDCTokenRefreshMiddleware(handler)

	addr := fmt.Sprintf("%s:%d", config.listenAddr, config.port)

	// Start server
	err := http.ListenAndServe(addr, handler) //nolint:gosec
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "Failed to start server")
		os.Exit(1)
	}
}

// Returns the helm.Handler given the config and request. Writes http.NotFound if clusterName is not there.
func getHelmHandler(c *HeadlampConfig, w http.ResponseWriter, r *http.Request) (*helm.Handler, error) {
	clusterName := mux.Vars(r)["clusterName"]

	context, err := c.kubeConfigStore.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterName": clusterName},
			err, "failed to get context")
		http.NotFound(w, r)

		return nil, errors.New("not found")
	}

	namespace := r.URL.Query().Get("namespace")

	helmHandler, err := helm.NewHandler(context.ClientConfig(), c.cache, namespace)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to create helm handler")
		http.Error(w, "failed to create helm handler", http.StatusInternalServerError)

		return nil, err
	}

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

//nolint:gocognit,funlen
func handleClusterHelm(c *HeadlampConfig, router *mux.Router) {
	router.PathPrefix("/clusters/{clusterName}/helm/{.*}").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := checkHeadlampBackendToken(w, r); err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to check headlamp backend token")

			return
		}

		helmHandler, err := getHelmHandler(c, w, r)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to get helm handler")

			return
		}

		// we used nolint:gocognit in this function because...
		//  Perhaps there's a better way to dispatch these?
		path := r.URL.Path

		if strings.HasSuffix(path, "/releases/list") && r.Method == http.MethodGet {
			helmHandler.ListRelease(w, r)
			return
		}

		if strings.HasSuffix(path, "/release/install") && r.Method == http.MethodPost {
			helmHandler.InstallRelease(w, r)
			return
		}

		if strings.HasSuffix(path, "/release/history") && r.Method == http.MethodGet {
			helmHandler.GetReleaseHistory(w, r)
			return
		}

		if strings.HasSuffix(path, "/releases/uninstall") && r.Method == http.MethodDelete {
			helmHandler.UninstallRelease(w, r)
			return
		}

		if strings.HasSuffix(path, "/releases/rollback") && r.Method == http.MethodPut {
			helmHandler.RollbackRelease(w, r)
			return
		}

		if strings.HasSuffix(path, "/releases/upgrade") && r.Method == http.MethodPut {
			helmHandler.UpgradeRelease(w, r)
			return
		}

		if strings.HasSuffix(path, "/releases") && r.Method == http.MethodGet {
			helmHandler.GetRelease(w, r)
			return
		}

		if strings.HasSuffix(path, "/repositories") && r.Method == http.MethodGet {
			helmHandler.ListRepo(w, r)
			return
		}

		if strings.HasSuffix(path, "/repositories") && r.Method == http.MethodPost {
			helmHandler.AddRepo(w, r)
			return
		}

		if strings.HasSuffix(path, "/repositories/remove") && r.Method == http.MethodDelete {
			helmHandler.RemoveRepo(w, r)
			return
		}

		if strings.HasSuffix(path, "/repositories/update") && r.Method == http.MethodPut {
			helmHandler.UpdateRepository(w, r)
			return
		}

		if strings.HasSuffix(path, "/charts") && r.Method == http.MethodGet {
			helmHandler.ListCharts(w, r)
			return
		}

		if strings.HasSuffix(path, "/action/status") && r.Method == http.MethodGet {
			helmHandler.GetActionStatus(w, r)
			return
		}
	})
}

// handleClusterAPI handles cluster API requests. It is responsible for
// all the requests made to /clusters/{clusterName}/{api:.*} endpoint.
// It parses the request and creates a proxy request to the cluster.
// That proxy is saved in the cache with the context key.
func handleClusterAPI(c *HeadlampConfig, router *mux.Router) {
	router.PathPrefix("/clusters/{clusterName}/{api:.*}").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contextKey, err := c.getContextKeyForRequest(r)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"key": contextKey},
				err, "failed to get context key")
			http.NotFound(w, r)

			return
		}

		kContext, err := c.kubeConfigStore.GetContext(contextKey)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"key": contextKey},
				err, "failed to get context")
			http.NotFound(w, r)

			return
		}

		if kContext.Error != "" {
			logger.Log(logger.LevelError, map[string]string{"key": contextKey},
				errors.New(kContext.Error), "context has error")
			http.Error(w, kContext.Error, http.StatusBadRequest)

			return
		}

		clusterURL, err := url.Parse(kContext.Cluster.Server)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"ClusterURL": kContext.Cluster.Server},
				err, "failed to parse cluster URL")
			http.NotFound(w, r)

			return
		}

		r.Host = clusterURL.Host
		r.Header.Set("X-Forwarded-Host", r.Host)
		r.Header.Del("User-Agent")
		r.URL.Host = clusterURL.Host
		r.URL.Path = mux.Vars(r)["api"]
		r.URL.Scheme = clusterURL.Scheme

		// Process WebSocket protocol headers if present
		processWebSocketProtocolHeader(r)

		plugins.HandlePluginReload(c.cache, w)

		err = kContext.ProxyRequest(w, r)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"key": contextKey},
				err, "failed to proxy request")
			http.Error(w, err.Error(), http.StatusInternalServerError)

			return
		}
	})
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
	if c.enableHelm {
		handleClusterHelm(c, router)
	}

	handleClusterAPI(c, router)
}

func (c *HeadlampConfig) getClusters() []Cluster {
	clusters := []Cluster{}

	contexts, err := c.kubeConfigStore.GetContexts()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get contexts")

		return clusters
	}

	for _, context := range contexts {
		context := context

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

		clusters = append(clusters, Cluster{
			Name:     context.Name,
			Server:   context.Cluster.Server,
			AuthType: context.AuthType(),
			Metadata: map[string]interface{}{
				"source":     context.SourceStr(),
				"namespace":  context.KubeContext.Namespace,
				"extensions": context.KubeContext.Extensions,
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
		context := context

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

	clientConfig := clientConfig{c.getClusters(), c.enableDynamicClusters}

	if err := json.NewEncoder(w).Encode(&clientConfig); err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding config")
	}
}

// addCluster adds cluster to store and updates the kubeconfig file.
func (c *HeadlampConfig) addCluster(w http.ResponseWriter, r *http.Request) {
	if err := checkHeadlampBackendToken(w, r); err != nil {
		logger.Log(logger.LevelError, nil, err, "invalid token")
		return
	}

	clusterReq, err := decodeClusterRequest(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	contexts, setupErrors := c.processClusterRequest(clusterReq)

	if len(contexts) == 0 {
		logger.Log(logger.LevelError, nil, errors.New("no contexts found in kubeconfig"), "getting contexts from kubeconfig")
		http.Error(w, "getting contexts from kubeconfig", http.StatusBadRequest)

		return
	}

	setupErrors = c.addContextsToStore(contexts, setupErrors)

	if len(setupErrors) > 0 {
		logger.Log(logger.LevelError, nil, setupErrors, "setting up contexts from kubeconfig")
		http.Error(w, "setting up contexts from kubeconfig", http.StatusBadRequest)

		return
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

	kubeConfigPersistenceDir, err := defaultKubeConfigPersistenceDir()
	if err != nil {
		return fmt.Errorf("getting default kubeconfig persistence dir: %w", err)
	}

	return kubeconfig.WriteToFile(*config, kubeConfigPersistenceDir)
}

// addContextsToStore adds the contexts to the store.
func (c *HeadlampConfig) addContextsToStore(contexts []kubeconfig.Context, setupErrors []error) []error {
	for i := range contexts {
		contexts[i].Source = kubeconfig.DynamicCluster
		if err := c.kubeConfigStore.AddContext(&contexts[i]); err != nil {
			setupErrors = append(setupErrors, err)
		}
	}

	return setupErrors
}

// deleteCluster deletes the cluster from the store and updates the kubeconfig file.
func (c *HeadlampConfig) deleteCluster(w http.ResponseWriter, r *http.Request) {
	if err := checkHeadlampBackendToken(w, r); err != nil {
		logger.Log(logger.LevelError, nil, err, "invalid token")

		return
	}

	name := mux.Vars(r)["name"]

	err := c.kubeConfigStore.RemoveContext(name)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": name},
			err, "deleting cluster")
		http.Error(w, "deleting cluster", http.StatusInternalServerError)

		return
	}

	kubeConfigPersistenceFile, err := defaultKubeConfigPersistenceFile()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": name},
			err, "getting default kubeconfig persistence file")
		http.Error(w, "getting default kubeconfig persistence file", http.StatusInternalServerError)

		return
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster":                   name,
		"kubeConfigPersistenceFile": kubeConfigPersistenceFile,
	},
		nil, "Removing cluster from kubeconfig")

	err = kubeconfig.RemoveContextFromFile(name, kubeConfigPersistenceFile)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": name},
			err, "removing cluster from kubeconfig")
		http.Error(w, "removing cluster from kubeconfig", http.StatusInternalServerError)

		return
	}

	logger.Log(logger.LevelInfo, map[string]string{"cluster": name, "proxy": name},
		nil, "Removed cluster proxy")

	c.getConfig(w, r)
}

// Get path of kubeconfig from source.
func (c *HeadlampConfig) getKubeConfigPath(source string) (string, error) {
	if source == "kubeconfig" {
		return c.kubeConfigPath, nil
	}

	return defaultKubeConfigPersistenceFile()
}

// Handler for renaming a stateless cluster.
func (c *HeadlampConfig) handleStatelessClusterRename(w http.ResponseWriter, r *http.Request, clusterName string) {
	if err := c.kubeConfigStore.RemoveContext(clusterName); err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName},
			err, "decoding request body")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	w.WriteHeader(http.StatusCreated)
	c.getConfig(w, r)
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
		context := context

		// Remove the old context from the store
		if err := c.kubeConfigStore.RemoveContext(clusterName); err != nil {
			logger.Log(logger.LevelError, nil, err, "Removing context from the store")
			errs = append(errs, err)
		}

		// Add the new context to the store
		if err := c.kubeConfigStore.AddContext(&context); err != nil {
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
	vars := mux.Vars(r)
	clusterName := vars["name"]
	// Parse request body.
	var reqBody RenameClusterRequest
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": clusterName},
			err, "decoding request body")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	if reqBody.Stateless {
		// For stateless clusters we just need to remove cluster from cache
		c.handleStatelessClusterRename(w, r, clusterName)

		return
	}

	// Get path of kubeconfig from source
	path, config, err := c.getPathAndLoadKubeconfig(reqBody.Source, clusterName)
	if err != nil {
		http.Error(w, "getting kubeconfig file", http.StatusInternalServerError)
		return
	}

	// Find the context with the given cluster name
	contextName := clusterName

	// Iterate over the contexts to find the context with the given cluster name
	for k, v := range config.Contexts {
		info := v.Extensions["headlamp_info"]
		if info != nil {
			customObj, err := MarshalCustomObject(info, contextName)
			if err != nil {
				logger.Log(logger.LevelError, map[string]string{"cluster": contextName},
					err, "marshaling custom object")

				return
			}

			// Check if the CustomName field matches the cluster name
			if customObj.CustomName != "" && customObj.CustomName == clusterName {
				contextName = k
			}
		}
	}

	if err := customNameToExtenstions(config, contextName, reqBody.NewClusterName, path); err != nil {
		http.Error(w, "writing custom extension to kubeconfig", http.StatusInternalServerError)
		return
	}

	if errs := c.updateCustomContextToCache(config, clusterName); len(errs) > 0 {
		http.Error(w, "setting up contexts from kubeconfig", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusCreated)
	c.getConfig(w, r)
}

func (c *HeadlampConfig) addClusterSetupRoute(r *mux.Router) {
	// Do not add the route if dynamic clusters are disabled
	if !c.enableDynamicClusters {
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
	var drainPayload struct {
		Cluster  string `json:"cluster"`
		NodeName string `json:"nodeName"`
	}
	// get nodeName and cluster from request body
	err := json.NewDecoder(r.Body).Decode(&drainPayload)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "decoding payload")
		http.Error(w, "decoding payload", http.StatusBadRequest)

		return
	}

	if drainPayload.NodeName == "" {
		logger.Log(logger.LevelError, nil, errors.New("nodeName not found"), "nodeName is required")
		http.Error(w, "nodeName is required", http.StatusBadRequest)

		return
	}

	if drainPayload.Cluster == "" {
		logger.Log(logger.LevelError, nil, errors.New("clusterName not found"), "clusterName is required")
		http.Error(w, "clusterName is required", http.StatusBadRequest)

		return
	}
	// get token from header
	token := r.Header.Get("Authorization")

	ctxtProxy, err := c.kubeConfigStore.GetContext(drainPayload.Cluster)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": drainPayload.Cluster},
			err, "getting context")
		http.Error(w, "Cluster not found", http.StatusNotFound)

		return
	}

	clientset, err := ctxtProxy.ClientSetWithToken(token)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting client")
		http.Error(w, "getting client", http.StatusInternalServerError)

		return
	}

	var responsePayload struct {
		Message string `json:"message"`
		Cluster string `json:"cluster"`
	}

	responsePayload.Cluster = drainPayload.Cluster
	responsePayload.Message = "Drain node request submitted successfully"

	if err = json.NewEncoder(w).Encode(responsePayload); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing response")
		http.Error(w, "writing response", http.StatusInternalServerError)

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
	var drainPayload struct {
		Cluster  string `json:"cluster"`
		NodeName string `json:"nodeName"`
	}

	drainPayload.Cluster = r.URL.Query().Get("cluster")
	drainPayload.NodeName = r.URL.Query().Get("nodeName")

	if drainPayload.NodeName == "" {
		logger.Log(logger.LevelError, nil, errors.New("nodeName not found"), "nodeName is required")
		http.Error(w, "nodeName is required", http.StatusBadRequest)

		return
	}

	if drainPayload.Cluster == "" {
		logger.Log(logger.LevelError, nil, errors.New("clusterName not found"), "clusterName is required")
		http.Error(w, "clusterName is required", http.StatusBadRequest)

		return
	}

	cacheKey := uuid.NewSHA1(uuid.Nil, []byte(drainPayload.NodeName+drainPayload.Cluster)).String()
	ctx := context.Background()

	cacheItem, err := c.cache.Get(ctx, cacheKey)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cacheKey": cacheKey},
			err, "getting cache item")
		w.WriteHeader(http.StatusNotFound)

		return
	}

	var responsePayload struct {
		ID      string `json:"id"`
		Cluster string `json:"cluster"`
	}

	responsePayload.ID = cacheItem.(string)
	responsePayload.Cluster = drainPayload.Cluster

	if err = json.NewEncoder(w).Encode(responsePayload); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing response")
		http.Error(w, "writing response", http.StatusInternalServerError)

		return
	}
}
