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

package headlampconfig

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterdiscovery"
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
	OidcAutoLogin             bool
	OidcClientID              string
	OidcValidatorClientID     string
	OidcClientSecret          string
	OidcIdpIssuerURL          string
	OidcCallbackURL           string
	OidcValidatorIdpIssuerURL string
	OidcUseAccessToken        bool
	OidcSkipTLSVerify         bool
	OidcCACert                string
	// OidcAPIProxy is the URL of an external Kubernetes API proxy. When
	// set, cluster API requests are routed through this URL instead of
	// the kube-apiserver from the kubeconfig. The OIDC bearer token is
	// forwarded as-is in the Authorization header.
	OidcAPIProxy string
	// OidcAPIProxyCACert is the PEM-encoded CA bundle used to verify the
	// api-proxy TLS certificate. Optional.
	OidcAPIProxyCACert string
	// OidcAPIProxySkipTLSVerify disables TLS verification for the api-proxy.
	OidcAPIProxySkipTLSVerify bool
	OidcUsePKCE               bool
	OidcSkipLogout            bool
	OidcScopes                []string
	Cache                     cache.Cache[interface{}]
	Multiplexer               WebSocketMultiplexer
	TelemetryConfig           config.Config
	TelemetryHandler          *telemetry.RequestHandler
	MeUsernamePaths           string
	MeEmailPaths              string
	MeGroupsPaths             string
	MeUserInfoURL             string
	ProxyAuthEnabled          bool
	ProxyAuthUsernameHeader   string
	ProxyAuthGroupHeader      string
	ProxyAuthEmailHeader      string
	ProxyAuthTokenHeader      string
	ServerCtx                 context.Context
	AdminSettings             json.RawMessage
}

type HeadlampCFG struct {
	AppName                string
	UseInCluster           bool
	InClusterContextName   string
	ListenAddr             string
	CacheEnabled           bool
	CacheMaxClientsets     int
	DevMode                bool
	Insecure               bool
	EnableHelm             bool
	EnableDynamicClusters  bool
	AllowKubeconfigChanges bool
	WatchPluginsChanges    bool
	Port                   uint
	KubeConfigPath         string
	KubeConfigDir          string
	SkippedKubeContexts    string
	StaticDir              string
	PluginDir              string
	UserPluginDir          string
	StaticPluginDir        string
	KubeConfigStore        kubeconfig.ContextStore
	Telemetry              *telemetry.Telemetry
	Metrics                *telemetry.Metrics
	BaseURL                string
	ProxyURLs              []string
	BackstageOrigin        string

	TLSCertPath                  string
	TLSKeyPath                   string
	SessionTTL                   int
	PodDebugImage                string
	NodeShellImage               string
	NodeShellNamespace           string
	OidcUseCookie                bool
	OidcUseTokenBroadcast        bool
	DefaultLightTheme            string
	DefaultDarkTheme             string
	ForceTheme                   string
	UnsafeUseServiceAccountToken bool
	ServiceAccountTokenPath      string
	EnableNamespaceDiscovery     bool
	NamespaceDiscoveryQPS        float64
	NamespaceDiscoveryTimeout    time.Duration

	DiscoverySources map[string]clusterdiscovery.Settings
}
