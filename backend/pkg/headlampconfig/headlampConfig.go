package headlampconfig

import (
	"net/http"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
)

// WebSocketMultiplexer handles client websocket connections. Implemented in cmd to avoid circular import.
type WebSocketMultiplexer interface {
	HandleClientWebSocket(http.ResponseWriter, *http.Request)
}

// HeadlampConfig holds full server config. Lives here so packages (e.g. k8cache) can import without cmd.
type HeadlampConfig struct {
	*HeadlampCFG
	OidcClientID              string
	OidcValidatorClientID     string
	OidcClientSecret          string
	OidcIdpIssuerURL          string
	OidcCallbackURL           string
	OidcValidatorIdpIssuerURL string
	OidcUseAccessToken        bool
	OidcSkipTLSVerify         bool
	OidcCACert                string
	OidcUsePKCE               bool
	OidcScopes                []string
	Cache                     cache.Cache[interface{}]
	Multiplexer               WebSocketMultiplexer
	TelemetryConfig           config.Config
	TelemetryHandler          *telemetry.RequestHandler
	MeUsernamePaths           string
	MeEmailPaths              string
	MeGroupsPaths             string
	MeUserInfoURL             string
}

type HeadlampCFG struct {
	UseInCluster          bool
	InClusterContextName  string
	ListenAddr            string
	CacheEnabled          bool
	DevMode               bool
	Insecure              bool
	EnableHelm            bool
	EnableDynamicClusters bool
	WatchPluginsChanges   bool
	Port                  uint
	KubeConfigPath        string
	SkippedKubeContexts   string
	StaticDir             string
	PluginDir             string
	UserPluginDir         string
	StaticPluginDir       string
	KubeConfigStore       kubeconfig.ContextStore
	Telemetry             *telemetry.Telemetry
	Metrics               *telemetry.Metrics
	BaseURL               string
	ProxyURLs             []string
	TLSCertPath           string
	TLSKeyPath            string
}
