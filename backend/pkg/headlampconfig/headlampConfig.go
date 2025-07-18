package headlampconfig

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

const DrainNodeCacheTTL = 20 // seconds

const ContextCacheTTL = 5 * time.Minute // minutes

const ContextUpdateCacheTTL = 20 * time.Second // seconds

const JWTExpirationTTL = 10 * time.Second // seconds

const kubeConfigSource = "kubeconfig" // source for kubeconfig contexts

type HeadlampCFG struct {
	UseInCluster              bool
	ListenAddr                string
	DevMode                   bool
	Insecure                  bool
	EnableHelm                bool
	EnableDynamicClusters     bool
	WatchPluginsChanges       bool
	Port                      uint
	KubeConfigPath            string
	SkippedKubeContexts       string
	StaticDir                 string
	PluginDir                 string
	StaticPluginDir           string
	KubeConfigStore           kubeconfig.ContextStore
	Telemetry                 *telemetry.Telemetry
	Metrics                   *telemetry.Metrics
	BaseURL                   string
	ProxyURLs                 []string
	TelemetryHandler          *telemetry.RequestHandler
	TelemetryConfig           cfg.Config
	OidcClientID              string
	OidcValidatorClientID     string
	OidcClientSecret          string
	OidcIdpIssuerURL          string
	OidcValidatorIdpIssuerURL string
	OidcUseAccessToken        bool
	Cache                     cache.Cache[interface{}]
	OidcScopes                []string
}

type Cluster struct {
	Name     string                 `json:"name"`
	Server   string                 `json:"server,omitempty"`
	AuthType string                 `json:"auth_type"`
	Metadata map[string]interface{} `json:"meta_data"`
	Error    string                 `json:"error,omitempty"`
}

type ClusterReq struct {
	Name   *string `json:"name"`
	Server *string `json:"server"`
	// InsecureSkipTLSVerify skips the validity check for the server's certificate.
	// This will make your HTTPS connections insecure.
	// +optional
	InsecureSkipTLSVerify bool `json:"insecure-skip-tls-verify,omitempty"`
	// CertificateAuthorityData contains PEM-encoded certificate authority certificates. Overrides CertificateAuthority
	// +optional
	CertificateAuthorityData []byte                 `json:"certificate-authority-data,omitempty"`
	Metadata                 map[string]interface{} `json:"meta_data"`
	KubeConfig               *string                `json:"kubeconfig,omitempty"`
}

var ClusterRe ClusterReq

type KubeconfigRequest struct {
	Kubeconfigs []string `json:"kubeconfigs"`
}

// RenameClusterRequest is the request body structure for renaming a cluster.
type RenameClusterRequest struct {
	NewClusterName string `json:"newClusterName"`
	Source         string `json:"source"`
	Stateless      bool   `json:"stateless"`
}

type clientConfig struct {
	Clusters                []Cluster `json:"clusters"`
	IsDynamicClusterEnabled bool      `json:"isDynamicClusterEnabled"`
}

// websocketConnContextKey handles websocket requests. It returns context key
// which is used to store the context in the cache. The context key is
// unique for each user. It is found in the "base64url.headlamp.authorization.k8s.io" protocol
// of the websocket.
func WebsocketConnContextKey(r *http.Request, clusterName string) string {
	// Expected number of submatches in the regular expression
	const expectedSubmatches = 2

	var contextKey string
	// Define a regular expression pattern for base64url.headlamp.authorization.k8s.io
	pattern := `base64url\.headlamp\.authorization\.k8s\.io\.([a-zA-Z0-9_-]+)`

	// Compile the regular expression
	re := regexp.MustCompile(pattern)

	// Find the match in the header value
	matches := re.FindStringSubmatch(r.Header.Get("Sec-Websocket-Protocol"))

	// Check if a match is found
	if len(matches) >= expectedSubmatches {
		// Extract the value after the specified prefix
		contextKey = clusterName + matches[1]
	} else {
		contextKey = clusterName
	}

	// Remove the base64url.headlamp.authorization.k8s.io subprotocol from the list
	// because it is unrecognized by the k8s server.
	protocols := strings.Split(r.Header.Get("Sec-Websocket-Protocol"), ", ")

	var updatedProtocols []string

	for _, protocol := range protocols {
		if !strings.HasPrefix(protocol, "base64url.headlamp.authorization.k8s.io.") {
			updatedProtocols = append(updatedProtocols, protocol)
		}
	}

	updatedProtocol := strings.Join(updatedProtocols, ", ")

	// Remove the existing Sec-Websocket-Protocol header
	r.Header.Del("Sec-Websocket-Protocol")

	// Add the updated Sec-Websocket-Protocol header
	r.Header.Add("Sec-Websocket-Protocol", updatedProtocol)

	return contextKey
}

func (c *HeadlampCFG) HandleError(w http.ResponseWriter, ctx context.Context,
	span trace.Span, err error, msg string, status int,
) {
	logger.Log(logger.LevelError, nil, err, msg)
	c.TelemetryHandler.RecordError(span, err, msg)
	c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", msg))
	http.Error(w, err.Error(), status)
}

func (c *HeadlampCFG) handleSetupErrors(setupErrors []error,
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
func (c *HeadlampCFG) ProcessClusterRequest(clusterReq ClusterReq) ([]kubeconfig.Context, []error) {
	if clusterReq.KubeConfig != nil {
		return c.ProcessKubeConfig(clusterReq)
	}

	return c.ProcessManualConfig(clusterReq)
}

// processKubeConfig processes the kubeconfig request.
func (c *HeadlampCFG) ProcessKubeConfig(clusterReq ClusterReq) ([]kubeconfig.Context, []error) {
	contexts, contextLoadErrors, err := kubeconfig.LoadContextsFromBase64String(
		*clusterReq.KubeConfig,
		kubeconfig.DynamicCluster,
	)
	setupErrors := c.HandleLoadErrors(err, contextLoadErrors)

	if len(contextLoadErrors) == 0 {
		if err := c.WriteKubeConfig(*clusterReq.KubeConfig); err != nil {
			setupErrors = append(setupErrors, err)
		}
	}

	return contexts, setupErrors
}

// processManualConfig processes the manual config request.
func (c *HeadlampCFG) ProcessManualConfig(clusterReq ClusterReq) ([]kubeconfig.Context, []error) {
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
func (c *HeadlampCFG) HandleLoadErrors(err error, contextLoadErrors []kubeconfig.ContextLoadError) []error {
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
func (c *HeadlampCFG) WriteKubeConfig(kubeConfigBase64 string) error {
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
func (c *HeadlampCFG) AddContextsToStore(contexts []kubeconfig.Context, setupErrors []error) []error {
	for i := range contexts {
		contexts[i].Source = kubeconfig.DynamicCluster
		if err := c.KubeConfigStore.AddContext(&contexts[i]); err != nil {
			setupErrors = append(setupErrors, err)
		}
	}

	return setupErrors
}

// Check request for header "X-HEADLAMP_BACKEND-TOKEN" matches HEADLAMP_BACKEND_TOKEN env
// This check is to prevent access except for from the app.
// The app sets HEADLAMP_BACKEND_TOKEN, and gives the token to the frontend.
func CheckHeadlampBackendToken(w http.ResponseWriter, r *http.Request) error {
	backendToken := r.Header.Get("X-HEADLAMP_BACKEND-TOKEN")
	backendTokenEnv := os.Getenv("HEADLAMP_BACKEND_TOKEN")

	if backendToken != backendTokenEnv || backendTokenEnv == "" {
		http.Error(w, "access denied", http.StatusForbidden)
		return errors.New("X-HEADLAMP_BACKEND-TOKEN does not match HEADLAMP_BACKEND_TOKEN")
	}

	return nil
}

// deleteCluster deletes the cluster from the store and updates the kubeconfig file.
func (c *HeadlampCFG) DeleteCluster(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()

	// config := c.HeadlampCFG

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

	if err := CheckHeadlampBackendToken(w, r); err != nil {
		c.TelemetryHandler.RecordError(span, err, "invalid backend token")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "invalid_token"))
		logger.Log(logger.LevelError, nil, err, "invalid token")

		return
	}

	err := c.KubeConfigStore.RemoveContext(name)
	if err != nil {
		c.HandleError(w, ctx, span, err, "failed to delete cluster", http.StatusInternalServerError)

		return
	}

	c.HandleDeleteCluster(w, r, ctx, span, name)

	c.GetConfig(w, r)
}

func (c *HeadlampCFG) UpdateCustomContextToCache(config *api.Config, clusterName string) []error {
	contexts, errs := kubeconfig.LoadContextsFromAPIConfig(config, false)
	if len(contexts) == 0 {
		logger.Log(logger.LevelError, nil, errs, "no contexts found in kubeconfig")
		errs = append(errs, errors.New("no contexts found in kubeconfig"))

		return errs
	}

	for _, context := range contexts {
		context := context

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

func DecodeClusterRequest(r *http.Request) (ClusterReq, error) {
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

func RecordRequestCompletion(c *HeadlampCFG, ctx context.Context,
	start time.Time, r *http.Request,
) {
	// config := c.HeadlampCFG
	duration := time.Since(start).Seconds() * 1000 // duration in ms
	c.TelemetryHandler.RecordDuration(ctx, start,
		attribute.String("http.method", r.Method),
		attribute.String("http.path", r.URL.Path),
		attribute.String("cluster", mux.Vars(r)["clusterName"]))
	logger.Log(logger.LevelInfo,
		map[string]string{"duration_ms": fmt.Sprintf("%.2f", duration)},
		nil, "Request completed successfully")
}

func (c *HeadlampCFG) AddCluster(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	start := time.Now()

	_, span := telemetry.CreateSpan(ctx, r, "cluster-management", "addCluster")
	c.TelemetryHandler.RecordEvent(span, "Add cluster request started")
	defer span.End()
	// Defer recording the duration and logging when the request is complete.
	defer RecordRequestCompletion(c, ctx, start, r)
	c.TelemetryHandler.RecordRequestCount(ctx, r)

	if err := CheckHeadlampBackendToken(w, r); err != nil {
		c.TelemetryHandler.RecordError(span, err, "invalid backend token")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "invalid token"))
		logger.Log(logger.LevelError, nil, err, "invalid token")

		return
	}

	clusterReq, err := DecodeClusterRequest(r)
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

	contexts, setupErrors := c.ProcessClusterRequest(clusterReq)
	if len(contexts) == 0 {
		c.TelemetryHandler.RecordError(span, errors.New("no contexts found in kubeconfig"),
			"no contexts found in kubeconfig")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", "no_contexts_found"))
		http.Error(w, "getting contexts from kubeconfig", http.StatusBadRequest)
		logger.Log(logger.LevelError, nil, errors.New("no contexts found in kubeconfig"), "getting contexts from kubeconfig")

		return
	}

	setupErrors = c.AddContextsToStore(contexts, setupErrors)
	if err := c.handleSetupErrors(setupErrors, ctx, w, span); err != nil {
		return
	}

	if c.Telemetry != nil {
		span.SetAttributes(attribute.Int("contexts.added", len(contexts)))
		span.SetStatus(codes.Ok, "Cluster added successfully")
	}

	w.WriteHeader(http.StatusCreated)
	c.GetConfig(w, r)
}

// handleDeleteCluster handles the deletion of a cluster.
func (c *HeadlampCFG) HandleDeleteCluster(
	w http.ResponseWriter,
	r *http.Request,
	ctx context.Context,
	span trace.Span,
	name string,
) {
	removeKubeConfig := r.URL.Query().Get("removeKubeConfig") == "true"
	if removeKubeConfig {
		c.HandleRemoveKubeConfig(w, r, ctx, span, name)
		return
	}

	logger.Log(logger.LevelInfo, map[string]string{"cluster": name, "proxy": name},
		nil, "removed cluster successfully")
}

// handleRemoveKubeConfig removes the cluster from the kubeconfig file.
func (c *HeadlampCFG) HandleRemoveKubeConfig(
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
		c.HandleError(w, ctx, span, err, "failed to remove cluster from kubeconfig", http.StatusInternalServerError)
	}
}

func DefaultHeadlampKubeConfigFile() (string, error) {
	return cfg.DefaultHeadlampKubeConfigFile()
}

// Get path of kubeconfig we load headlamp with from source.
func (c *HeadlampCFG) GetKubeConfigPath(source string) (string, error) {
	if source == kubeConfigSource {
		return c.KubeConfigPath, nil
	}

	return DefaultHeadlampKubeConfigFile()
}

// Handler for renaming a stateless cluster.
func (c *HeadlampCFG) HandleStatelessClusterRename(w http.ResponseWriter, r *http.Request, clusterName string) {
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
	c.GetConfig(w, r)

	duration := time.Since(start).Milliseconds()
	c.TelemetryHandler.RecordDuration(ctx, start, attribute.String("api.route", "handleStatelessClusterRename"))
	logger.Log(logger.LevelInfo, map[string]string{
		"duration_ms": fmt.Sprintf("%d", duration),
		"api.route":   "handleStatelessClusterRename",
	}, nil, "Completed stateless cluster rename")
}

func (c *HeadlampCFG) GetClusters() []Cluster {
	clusters := []Cluster{}

	contexts, err := c.KubeConfigStore.GetContexts()
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

func (c *HeadlampCFG) GetConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	clientConfig := clientConfig{c.GetClusters(), c.EnableDynamicClusters}

	if err := json.NewEncoder(w).Encode(&clientConfig); err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding config")
	}
}
