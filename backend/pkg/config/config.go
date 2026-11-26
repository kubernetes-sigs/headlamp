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

package config

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/knadh/koanf"
	"github.com/knadh/koanf/providers/basicflag"
	"github.com/knadh/koanf/providers/env"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterdiscovery"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/spa"
	"k8s.io/apimachinery/pkg/labels"
)

const (
	defaultPort               = 4466
	defaultSessionTTL         = 86400 // 24 hours in seconds
	defaultCacheMaxClientsets = 256
	maxPort                   = 65535
	osWindows                 = "windows"
)

const (
	DefaultCacheMaxClientsets = defaultCacheMaxClientsets
)

const (
	DefaultMeUsernamePath = "preferred_username,upn,username,name"
	DefaultMeEmailPath    = "email"
	DefaultMeGroupsPath   = "groups,realm_access.roles"
	DefaultMeUserInfoURL  = ""
)

type Config struct {
	Version              bool   `koanf:"version"`
	AppName              string `koanf:"app-name"`
	InCluster            bool   `koanf:"in-cluster"`
	InClusterContextName string `koanf:"in-cluster-context-name"`
	DevMode              bool   `koanf:"dev"`
	InsecureSsl          bool   `koanf:"insecure-ssl"`
	LogLevel             string `koanf:"log-level"`
	// NoBrowser disables automatically opening the default browser when running
	// a locally embedded Headlamp binary (non in-cluster with spa.UseEmbeddedFiles == true).
	// It has no effect in in-cluster mode or when running without embedded frontend.
	NoBrowser                  bool   `koanf:"no-browser"`
	CacheEnabled               bool   `koanf:"cache-enabled"`
	CacheMaxClientsets         int    `koanf:"cache-max-clientsets"`
	CacheMaxClientsetsExplicit bool   `koanf:"-"`
	EnableHelm                 bool   `koanf:"enable-helm"`
	EnableDynamicClusters      bool   `koanf:"enable-dynamic-clusters"`
	AllowKubeconfigChanges     bool   `koanf:"allow-kubeconfig-changes"`
	ListenAddr                 string `koanf:"listen-addr"`
	WatchPluginsChanges        bool   `koanf:"watch-plugins-changes"`
	Port                       uint   `koanf:"port"`
	KubeConfigPath             string `koanf:"kubeconfig"`
	KubeConfigDir              string `koanf:"kubeconfig-dir"`
	SkippedKubeContexts        string `koanf:"skipped-kube-contexts"`
	StaticDir                  string `koanf:"html-static-dir"`
	PluginsDir                 string `koanf:"plugins-dir"`
	UserPluginsDir             string `koanf:"user-plugins-dir"`
	BaseURL                    string `koanf:"base-url"`
	SessionTTL                 int    `koanf:"session-ttl"`
	PodDebugImage              string `koanf:"pod-debug-image"`
	NodeShellImage             string `koanf:"node-shell-image"`
	NodeShellNamespace         string `koanf:"node-shell-namespace"`
	ProxyURLs                  string `koanf:"proxy-urls"`
	BackstageOrigin            string `koanf:"backstage-origin"`

	ClusterInventoryProviderFile string `koanf:"cluster-inventory-provider-file"`

	DiscoverySources map[string]clusterdiscovery.Settings `koanf:"-"`

	OidcClientID                 string `koanf:"oidc-client-id"`
	OidcClientIDFile             string `koanf:"oidc-client-id-file"`
	OidcValidatorClientID        string `koanf:"oidc-validator-client-id"`
	OidcClientSecret             string `koanf:"oidc-client-secret"`
	OidcClientSecretFile         string `koanf:"oidc-client-secret-file"`
	OidcIdpIssuerURL             string `koanf:"oidc-idp-issuer-url"`
	OidcCallbackURL              string `koanf:"oidc-callback-url"`
	OidcValidatorIdpIssuerURL    string `koanf:"oidc-validator-idp-issuer-url"`
	OidcScopes                   string `koanf:"oidc-scopes"`
	OidcUseAccessToken           bool   `koanf:"oidc-use-access-token"`
	OidcUseCookie                bool   `koanf:"oidc-use-cookie"`
	OidcUseTokenBroadcast        bool   `koanf:"oidc-use-token-broadcast"`
	OidcSkipTLSVerify            bool   `koanf:"oidc-skip-tls-verify"`
	OidcSkipLogout               bool   `koanf:"oidc-skip-logout"`
	OidcCAFile                   string `koanf:"oidc-ca-file"`
	MeUsernamePath               string `koanf:"me-username-path"`
	MeEmailPath                  string `koanf:"me-email-path"`
	MeGroupsPath                 string `koanf:"me-groups-path"`
	MeUserInfoURL                string `koanf:"me-user-info-url"`
	OidcUsePKCE                  bool   `koanf:"oidc-use-pkce"`
	ProxyAuthEnabled             bool   `koanf:"proxy-auth"`
	ProxyAuthUsernameHeader      string `koanf:"proxy-auth-username-header"`
	ProxyAuthGroupHeader         string `koanf:"proxy-auth-group-header"`
	ProxyAuthEmailHeader         string `koanf:"proxy-auth-email-header"`
	ProxyAuthTokenHeader         string `koanf:"proxy-auth-token-header"`
	UnsafeUseServiceAccountToken bool   `koanf:"unsafe-use-service-account-token"`
	ServiceAccountTokenPath      string `koanf:"service-account-token-path"`
	EnableNamespaceDiscovery     bool   `koanf:"enable-namespace-discovery"`
	OidcAutoLogin                bool   `koanf:"oidc-auto-login"`

	// Limits of one namespace discovery run (see addNamespaceDiscoveryFlags).
	NamespaceDiscoveryQPS     float64       `koanf:"namespace-discovery-qps"`
	NamespaceDiscoveryTimeout time.Duration `koanf:"namespace-discovery-timeout"`

	// OidcAPIProxy is the URL of an external Kubernetes API proxy through
	// which all Kubernetes API requests are routed instead of the
	// kube-apiserver directly. The OIDC bearer token is forwarded as-is
	// in the Authorization header.
	OidcAPIProxy string `koanf:"oidc-api-proxy"`
	// OidcAPIProxyCAFile is the path to a PEM-encoded CA bundle used to
	// verify the TLS certificate of the api-proxy. Optional.
	OidcAPIProxyCAFile string `koanf:"oidc-api-proxy-ca-file"`
	// OidcAPIProxySkipTLSVerify disables TLS verification for the api-proxy
	// connection. Use only for testing.
	OidcAPIProxySkipTLSVerify bool `koanf:"oidc-api-proxy-skip-tls-verify"`

	// telemetry configs
	ServiceName        string   `koanf:"service-name"`
	ServiceVersion     *string  `koanf:"service-version"`
	TracingEnabled     *bool    `koanf:"tracing-enabled"`
	MetricsEnabled     *bool    `koanf:"metrics-enabled"`
	JaegerEndpoint     *string  `koanf:"jaeger-endpoint"`
	OTLPEndpoint       *string  `koanf:"otlp-endpoint"`
	UseOTLPHTTP        *bool    `koanf:"use-otlp-http"`
	StdoutTraceEnabled *bool    `koanf:"stdout-trace-enabled"`
	SamplingRate       *float64 `koanf:"sampling-rate"`
	// Admin settings
	SettingsPath string `koanf:"settings"`
	// TLS config
	TLSCertPath string `koanf:"tls-cert-path"`
	TLSKeyPath  string `koanf:"tls-key-path"`
	// Theme config
	DefaultLightTheme string `koanf:"default-light-theme"`
	DefaultDarkTheme  string `koanf:"default-dark-theme"`
	ForceTheme        string `koanf:"force-theme"`
}

func (c *Config) warnRedundantThemeDefaults() {
	if c.ForceTheme != "" && (c.DefaultLightTheme != "" || c.DefaultDarkTheme != "") {
		logger.Log(logger.LevelWarn, nil, nil,
			"force-theme is set together with default-light-theme/default-dark-theme, "+
				"default themes will be ignored when force-theme is active")
	}
}

// validateOIDC rejects OIDC flags outside in-cluster mode, cookie mode and cluster
// discovery, and validates the OIDC CA file and API proxy settings.
func (c *Config) validateOIDC() error {
	if !c.InCluster && !c.OidcUseCookie && !c.discoveryEnabled() &&
		(c.OidcClientID != "" || c.OidcClientSecret != "" || c.OidcIdpIssuerURL != "" ||
			c.OidcValidatorClientID != "" || c.OidcValidatorIdpIssuerURL != "") {
		return errors.New("oidc-client-id, oidc-client-secret, oidc-idp-issuer-url, " +
			"oidc-validator-client-id, oidc-validator-idp-issuer-url, flags are only " +
			"meant to be used in inCluster mode, with --oidc-use-cookie, or with " +
			"enabled cluster discovery")
	}

	// OIDC TLS verification warning.
	if c.OidcSkipTLSVerify {
		logger.Log(logger.LevelWarn, nil, nil, "oidc-skip-tls-verify is set, this is not safe for production")
	}

	if err := c.validateOIDCCAFile(); err != nil {
		return err
	}

	return c.validateAPIProxy()
}

// validateAPIProxy validates the oidc-api-proxy-* configuration options.
func (c *Config) validateAPIProxy() error {
	if c.OidcAPIProxy != "" {
		proxyURL, err := url.Parse(c.OidcAPIProxy)
		if err != nil || proxyURL.Host == "" || (proxyURL.Scheme != "http" && proxyURL.Scheme != "https") {
			return errors.New("oidc-api-proxy must be a valid http(s) URL")
		}

		if c.OidcClientID == "" || c.OidcIdpIssuerURL == "" {
			return errors.New("oidc-api-proxy requires oidc-client-id and oidc-idp-issuer-url to be set")
		}

		// The api-proxy transport authenticates with the user's OIDC token
		// only; it never carries the service account token.
		if c.UnsafeUseServiceAccountToken {
			return errors.New("oidc-api-proxy cannot be used together with unsafe-use-service-account-token")
		}
	}

	if err := validateCAFile(c.OidcAPIProxyCAFile, "oidc-api-proxy-ca-file"); err != nil {
		return err
	}

	if c.OidcAPIProxySkipTLSVerify {
		logger.Log(logger.LevelWarn, nil, nil,
			"oidc-api-proxy-skip-tls-verify is set, this is not safe for production")
	}

	return nil
}

func (c *Config) Validate() error {
	if err := c.validateOptionValues(); err != nil {
		return err
	}

	if err := c.validateAppName(); err != nil {
		return err
	}

	if err := c.validateOIDC(); err != nil {
		return err
	}

	// Extracted to keep Validate's cognitive complexity within the linter limit.
	c.warnRedundantThemeDefaults()

	if err := c.validateServiceAccountTokenFlags(); err != nil {
		return err
	}

	if c.BaseURL != "" && !strings.HasPrefix(c.BaseURL, "/") {
		return errors.New("base-url needs to start with a '/' or be empty")
	}

	if err := c.validateTTLAndCache(); err != nil {
		return err
	}

	if c.TracingEnabled != nil && *c.TracingEnabled {
		if c.ServiceName == "" {
			return errors.New("service-name is required when tracing is enabled")
		}

		if (c.JaegerEndpoint != nil && *c.JaegerEndpoint == "") &&
			(c.OTLPEndpoint != nil && *c.OTLPEndpoint == "") &&
			(c.StdoutTraceEnabled != nil && *c.StdoutTraceEnabled) {
			return errors.New("at least one tracing exporter (jaeger, otlp, or stdout) must be configured")
		}

		if (c.UseOTLPHTTP != nil && *c.UseOTLPHTTP) &&
			(c.OTLPEndpoint == nil || *c.OTLPEndpoint == "") {
			return errors.New("otlp-endpoint must be configured when use-otlp-http is enabled")
		}
	}

	if err := c.validateClusterInventory(); err != nil {
		return err
	}

	if err := c.validateDiscoverySources(); err != nil {
		return err
	}

	return nil
}

// validateTTLAndCache ensures session-ttl and cache-max-clientsets are within valid bounds.
func (c *Config) validateTTLAndCache() error {
	if c.SessionTTL <= 0 {
		return errors.New("session-ttl cannot be negative or equal to zero")
	}

	const oneYearInSeconds = 31536000
	if c.SessionTTL > oneYearInSeconds {
		return errors.New("session-ttl cannot be greater than 1 year")
	}

	if c.CacheMaxClientsets <= 0 {
		return errors.New("cache-max-clientsets cannot be negative or equal to zero")
	}

	return nil
}

// validateAppName ensures the application name is safe for use in Kubernetes User-Agent headers.
func (c *Config) validateAppName() error {
	for index := 0; index < len(c.AppName); index++ {
		character := c.AppName[index]
		if (character < ' ' && character != '\t') || character == 0x7f {
			return errors.New("app-name contains invalid HTTP header characters")
		}
	}

	return nil
}

func (c *Config) validateOIDCCAFile() error {
	return validateCAFile(c.OidcCAFile, "oidc-ca-file")
}

// validateCAFile checks that the given path, when set, points to a readable
// file containing at least one PEM-encoded CA certificate. flagName is used
// in error messages.
func validateCAFile(path, flagName string) error {
	if path == "" {
		return nil
	}

	caFileContents, err := os.ReadFile(path) //nolint:gosec // path comes from a CLI flag set by the operator
	if err != nil {
		return fmt.Errorf("error reading %s: %w", flagName, err)
	}

	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caFileContents) {
		return fmt.Errorf("invalid %s", flagName)
	}

	return nil
}

func readSecretFromFile(path string) (string, error) {
	data, err := os.ReadFile(path) //nolint:gosec // credential path is configured by the operator
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(string(data)), nil
}

func (c *Config) loadOIDCSecretFiles(explicitFlags map[string]bool) error {
	// Explicit direct flags take precedence, so skip reading the file entirely.
	if c.OidcClientIDFile != "" && !explicitFlags["oidc-client-id"] {
		clientID, err := readSecretFromFile(c.OidcClientIDFile)
		if err != nil {
			return fmt.Errorf("error reading oidc-client-id-file: %w", err)
		}

		if clientID == "" {
			return errors.New("oidc-client-id-file must contain a non-empty client ID")
		}

		c.OidcClientID = clientID
	}

	if c.OidcClientSecretFile != "" && !explicitFlags["oidc-client-secret"] {
		clientSecret, err := readSecretFromFile(c.OidcClientSecretFile)
		if err != nil {
			return fmt.Errorf("error reading oidc-client-secret-file: %w", err)
		}

		c.OidcClientSecret = clientSecret
	}

	return nil
}

func (c *Config) validateClusterInventory() error {
	if c.ClusterInventoryProviderFile != "" {
		return errors.New("cluster-inventory-provider-file is no longer supported; Cluster Inventory requires per-user OIDC")
	}

	return nil
}

func (c *Config) validateServiceAccountTokenFlags() error {
	if !c.InCluster && (c.UnsafeUseServiceAccountToken || c.ServiceAccountTokenPath != "") {
		return errors.New("--unsafe-use-service-account-token and --service-account-token-path " +
			"flags are only meant to be used with --in-cluster")
	}

	if c.EnableNamespaceDiscovery && !c.InCluster {
		return errors.New("--enable-namespace-discovery is only meant to be used with --in-cluster")
	}

	if c.EnableNamespaceDiscovery && (c.NamespaceDiscoveryQPS <= 0 || c.NamespaceDiscoveryTimeout <= 0) {
		return errors.New("--namespace-discovery-qps and --namespace-discovery-timeout must be greater than zero")
	}

	if c.ServiceAccountTokenPath != "" && !c.UnsafeUseServiceAccountToken {
		return errors.New("--service-account-token-path requires " +
			"--unsafe-use-service-account-token to be enabled")
	}

	return nil
}

func (c *Config) validateOptionValues() error {
	if c.Port == 0 || c.Port > maxPort {
		return fmt.Errorf("port must be between 1 and %d", maxPort)
	}

	if !isValidLogLevel(c.LogLevel) {
		return errors.New("log-level must be one of debug, info, warn, or error")
	}

	return validateTLSPaths(c.TLSCertPath, c.TLSKeyPath)
}

func isValidLogLevel(logLevel string) bool {
	switch strings.ToLower(strings.TrimSpace(logLevel)) {
	case "", "debug", "info", "warn", "error":
		return true
	default:
		return false
	}
}

func validateTLSPaths(certPath, keyPath string) error {
	if certPath == "" && keyPath == "" {
		return nil
	}

	if certPath == "" || keyPath == "" {
		return errors.New("tls-cert-path and tls-key-path must be configured together")
	}

	if _, err := tls.LoadX509KeyPair(certPath, keyPath); err != nil {
		return fmt.Errorf("invalid tls certificate or key path: %w", err)
	}

	return nil
}

// normalizeArgs skips the first arg for flag parsing.
func normalizeArgs(args []string) []string {
	if len(args) == 0 {
		return []string{}
	}

	return args[1:]
}

// loadDefaultsFromFlags loads default flag values into koanf.
func loadDefaultsFromFlags(k *koanf.Koanf, f *flag.FlagSet) error {
	if err := k.Load(basicflag.Provider(f, "."), nil); err != nil {
		logger.Log(logger.LevelError, nil, err, "loading default config from flags")

		return fmt.Errorf("error loading default config from flags: %w", err)
	}

	return nil
}

// parseFlags parses command-line flags using the provided flagset.
func parseFlags(f *flag.FlagSet, args []string) error {
	if err := f.Parse(args); err != nil {
		logger.Log(logger.LevelError, nil, err, "parsing flags")
		return fmt.Errorf("error parsing flags: %w", err)
	}

	return nil
}

// recordExplicitFlags reloads only explicitly-set flag values to override env.
func recordExplicitFlags(f *flag.FlagSet) map[string]bool {
	explicitFlags := make(map[string]bool)

	f.Visit(func(f *flag.Flag) {
		explicitFlags[f.Name] = true
	})

	return explicitFlags
}

func hasWatchPluginsChangesEnv() bool {
	_, ok := os.LookupEnv("HEADLAMP_CONFIG_WATCH_PLUGINS_CHANGES")
	return ok
}

func isCacheMaxClientsetsExplicit(explicitFlags map[string]bool) bool {
	_, envSet := os.LookupEnv("HEADLAMP_CONFIG_CACHE_MAX_CLIENTSETS")
	return explicitFlags["cache-max-clientsets"] || envSet
}

// loadConfigFromEnv loads config values from environment variables into koanf.
func loadConfigFromEnv(k *koanf.Koanf) error {
	err := k.Load(env.Provider("HEADLAMP_CONFIG_", ".", func(s string) string {
		return strings.ReplaceAll(strings.ToLower(strings.TrimPrefix(s, "HEADLAMP_CONFIG_")), "_", "-")
	}), nil)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "loading config from env")
		return fmt.Errorf("error loading config from env: %w", err)
	}

	return nil
}

// reloadExplicitFlags reloads only explicitly-set flag values to override env.
func reloadExplicitFlags(k *koanf.Koanf, f *flag.FlagSet, explicitFlags map[string]bool) error {
	err := k.Load(basicflag.ProviderWithValue(f, ".", func(key, value string) (string, interface{}) {
		if explicitFlags[key] {
			return key, value
		}

		return "", nil
	}), nil)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "loading config from flags")
		return fmt.Errorf("error loading config from flags: %w", err)
	}

	return nil
}

// unmarshalConfig unmarshals the config from koanf into our struct.
func unmarshalConfig(k *koanf.Koanf, config *Config) error {
	if err := k.Unmarshal("", config); err != nil {
		logger.Log(logger.LevelError, nil, err, "unmarshalling config")
		return fmt.Errorf("error unmarshal config: %w", err)
	}

	return nil
}

// patchWatchPluginsChanges disables plugin watching if running in-cluster and user didn't set the flag or env var.
func patchWatchPluginsChanges(config *Config, explicitFlags map[string]bool, watchPluginsChangesEnvSet bool) {
	if config.InCluster && !explicitFlags["watch-plugins-changes"] && !watchPluginsChangesEnvSet {
		config.WatchPluginsChanges = false
	}
}

// setKubeConfigPath sets the kubeconfig path if not set, using env or default.
func setKubeConfigPath(config *Config) error {
	// If a specific path was set, use it. Otherwise, determine default.
	if config.KubeConfigPath != "" {
		return nil
	}

	if config.InCluster {
		return nil
	}

	kubeConfigEnv := os.Getenv("KUBECONFIG")
	if kubeConfigEnv != "" {
		config.KubeConfigPath = kubeConfigEnv
	} else {
		defaultPath, err := GetDefaultKubeConfigPath()
		if err != nil {
			return fmt.Errorf("getting default kubeconfig path: %w", err)
		}

		config.KubeConfigPath = defaultPath
	}

	return nil
}

// ApplyMeDefaults trims and applies defaults to the JMESPath expressions used for the /me endpoint.
func ApplyMeDefaults(usernamePath, emailPath, groupsPath, userInfoURL string) (string, string, string, string) {
	username := strings.TrimSpace(usernamePath)
	if username == "" {
		username = DefaultMeUsernamePath
	}

	email := strings.TrimSpace(emailPath)
	if email == "" {
		email = DefaultMeEmailPath
	}

	groups := strings.TrimSpace(groupsPath)
	if groups == "" {
		groups = DefaultMeGroupsPath
	}

	userInfo := strings.TrimSpace(userInfoURL)
	if userInfo == "" {
		userInfo = DefaultMeUserInfoURL
	}

	return username, email, groups, userInfo
}

// setMeDefaults ensures the /clusters/{clusterName}/me claim paths fall back to defaults when unset.
func setMeDefaults(config *Config) {
	config.MeUsernamePath, config.MeEmailPath, config.MeGroupsPath, config.MeUserInfoURL = ApplyMeDefaults(
		config.MeUsernamePath,
		config.MeEmailPath,
		config.MeGroupsPath,
		config.MeUserInfoURL,
	)
}

// Parse Loads the config from flags and env.
// env vars should start with HEADLAMP_CONFIG_ and use _ as separator
// If a value is set both in flags and env then flag takes priority.
// eg:
// export HEADLAMP_CONFIG_PORT=2344
// go run ./cmd --port=3456
// the value of port will be 3456.

func Parse(args []string) (*Config, error) {
	return ParseWithAppNameDefault(args, "Headlamp")
}

// ParseWithAppNameDefault loads the config using appName as the application name default.
func ParseWithAppNameDefault(args []string, appName string) (*Config, error) {
	var config Config

	f := flagset(appName)

	k := koanf.New(".")

	args = normalizeArgs(args)

	// 1. Load default flag values into koanf.
	if err := loadDefaultsFromFlags(k, f); err != nil {
		return nil, err
	}

	// 2. Parse command-line arguments.
	if err := parseFlags(f, args); err != nil {
		return nil, err
	}

	// 3. Track explicitly set flags.
	explicitFlags := recordExplicitFlags(f)

	// 4. Load config from environment variables.
	if err := loadConfigFromEnv(k); err != nil {
		return nil, err
	}

	watchPluginsChangesEnvSet := hasWatchPluginsChangesEnv()

	// 5. Reload explicitly-set flags to override env values.
	if err := reloadExplicitFlags(k, f, explicitFlags); err != nil {
		return nil, err
	}

	// 6. Unmarshal into config struct.
	if err := unmarshalConfig(k, &config); err != nil {
		return nil, err
	}

	config.CacheMaxClientsetsExplicit = isCacheMaxClientsetsExplicit(explicitFlags)

	config.loadDiscoverySettings(k)

	// 7. Post-process: patch plugin flag and kubeconfig path.
	patchWatchPluginsChanges(&config, explicitFlags, watchPluginsChangesEnvSet)

	if err := setKubeConfigPath(&config); err != nil {
		return nil, err
	}

	if err := config.loadOIDCSecretFiles(explicitFlags); err != nil {
		logger.Log(logger.LevelError, nil, err, "reading OIDC secret files")
		return nil, err
	}

	setMeDefaults(&config)

	// 8. Validate flags that depend on build-time behaviour.
	if err := validateOpenBrowser(&config, explicitFlags); err != nil {
		logger.Log(logger.LevelError, nil, err, "validating open-browser flag")
		return nil, err
	}

	// 9. Validate parsed config.
	if err := config.Validate(); err != nil {
		logger.Log(logger.LevelError, nil, err, "validating config")
		return nil, err
	}

	return &config, nil
}

// MakeHeadlampKubeConfigsDir returns the default directory to store kubeconfig
// files of clusters that are loaded in Headlamp.
func MakeHeadlampKubeConfigsDir() (string, error) {
	return MakeKubeConfigsDir("")
}

// MakeKubeConfigsDir returns the configured directory for persisted kubeconfigs.
// When kubeConfigDir is empty, it uses Headlamp's platform-specific default.
func MakeKubeConfigsDir(kubeConfigDir string) (string, error) {
	if kubeConfigDir != "" {
		return makeConfiguredKubeConfigsDir(kubeConfigDir)
	}

	userConfigDir, err := os.UserConfigDir()
	if err == nil {
		kubeConfigDir := filepath.Join(userConfigDir, "Headlamp", "kubeconfigs")
		if runtime.GOOS == osWindows {
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

	return "", fmt.Errorf("failed to get default kubeconfig persistence directory: %w", err)
}

// makeConfiguredKubeConfigsDir creates and returns the configured kubeconfig directory.
func makeConfiguredKubeConfigsDir(kubeConfigDir string) (string, error) {
	if err := os.MkdirAll(kubeConfigDir, fs.FileMode(0o755)); err != nil {
		return "", fmt.Errorf("creating kubeconfig persistence directory: %w", err)
	}

	return kubeConfigDir, nil
}

// DefaultHeadlampKubeConfigFile returns Headlamp's default persisted kubeconfig file.
func DefaultHeadlampKubeConfigFile() (string, error) {
	return DefaultKubeConfigFile("")
}

// DefaultKubeConfigFile returns the persisted kubeconfig file in kubeConfigDir.
func DefaultKubeConfigFile(kubeConfigDir string) (string, error) {
	kubeConfigDir, err := MakeKubeConfigsDir(kubeConfigDir)
	if err != nil {
		return "", err
	}

	return filepath.Join(kubeConfigDir, "config"), nil
}

// validateOpenBrowser ensures the open-browser option is only used when the
// binary was built with embedded static files.
func validateOpenBrowser(config *Config, explicitFlags map[string]bool) error {
	// no-browser is only meaningful when running locally (non in-cluster) with
	// an embedded frontend. Validate explicit usage accordingly.
	if explicitFlags["no-browser"] {
		if config.InCluster {
			return errors.New("no-browser cannot be used in in-cluster mode")
		}

		if !spa.UseEmbeddedFiles {
			return errors.New("no-browser cannot be used when running without embedded frontend")
		}
	}

	return nil
}

func flagset(appName string) *flag.FlagSet {
	f := flag.NewFlagSet("config", flag.ContinueOnError)

	addGeneralFlags(f, appName)
	addCacheFlags(f)
	addOIDCFlags(f)
	addProxyAuthFlags(f)
	addTelemetryFlags(f)
	addTLSFlags(f)
	addNamespaceDiscoveryFlags(f)

	return f
}

func addCacheFlags(f *flag.FlagSet) {
	f.Bool("cache-enabled", false, "K8s cache in backend")
	f.Int("cache-max-clientsets", defaultCacheMaxClientsets,
		"Maximum number of Kubernetes clientsets to keep in the authorization cache")
}

func addGeneralFlags(f *flag.FlagSet, appName string) {
	f.Bool("version", false, "Print version information and exit")
	f.String(
		"app-name",
		appName,
		"Application name used in version output, the browser title, and Kubernetes User-Agent headers",
	)
	f.Bool("in-cluster", false, "Set when running from a k8s cluster")
	f.String("in-cluster-context-name", "",
		"Name to use for the in-cluster Kubernetes context. "+
			"If unset, it is derived from the kube-system/kubeadm-config ConfigMap (treating \"kubernetes\" as unset), "+
			"falling back to \"main\"")
	f.Bool("dev", false, "Allow connections from other origins")
	f.Bool("no-browser", false, "Disable automatically opening the browser when using embedded frontend")
	f.Bool("insecure-ssl", false, "Accept/Ignore all server SSL certificates")
	f.String("log-level", "info", "Set backend log verbosity. Options: debug, info (default), warn, error")
	f.Bool("enable-dynamic-clusters", false, "Enable dynamic clusters, which stores stateless clusters in the frontend.")
	f.Bool("allow-kubeconfig-changes", false,
		"Allow Headlamp to make changes to the known kubeconfigs when needed. "+
			"E.g. to remove a cluster via the UI. May not be recommendable when Headlamp is deployed as a service.")
	// Note: When running in-cluster and if not explicitly set, this flag defaults to false.
	f.Bool("watch-plugins-changes", true, "Reloads plugins when there are changes to them or their directory")

	f.String("kubeconfig", "", "Absolute path to the kubeconfig file")
	f.String("kubeconfig-dir", "", "Directory for Headlamp-managed kubeconfig files")
	f.String("skipped-kube-contexts", "", "Context name which should be ignored in kubeconfig file")
	f.String("html-static-dir", "", "Static HTML directory to serve")
	f.String("plugins-dir", defaultPluginDir(), "Specify the plugins directory to build the backend with")
	f.String("user-plugins-dir", defaultUserPluginDir(), "Specify the user-installed plugins directory")
	f.String("base-url", "", "Base URL path. eg. /headlamp")
	f.Int("session-ttl", defaultSessionTTL, "The time in seconds for the session to be valid"+
		"(Default: 86400/24h, Min: 1 , Max: 31536000/1yr )")
	f.String("pod-debug-image", "", "Default image to use when creating pod debug containers")
	f.String("node-shell-image", "", "Default image to use when creating node shell pods")
	f.String("node-shell-namespace", "", "Default namespace to use when creating node shell pods")
	f.String("listen-addr", "", "Address to listen on; default is empty, which means listening to any address")
	f.Uint("port", defaultPort, "Port to listen from")
	f.String("proxy-urls", "", "Allow proxy requests to specified URLs")
	f.String("backstage-origin", "",
		"Comma-separated list of trusted Backstage origins for postMessage integration")
	f.Bool("enable-helm", false, "Enable Helm operations")
	addClusterDiscoveryFlags(f)
	f.String("default-light-theme", "", "Default theme to use when user prefers light mode")
	f.String("default-dark-theme", "", "Default theme to use when user prefers dark mode")
	f.String("force-theme", "", "Force a specific theme, overriding user preferences")
	f.Bool("unsafe-use-service-account-token", false,
		"UNSAFE: use the pod's service account token to authenticate all users in-cluster. "+
			"Disables per-user auth; only safe behind an auth proxy")
	f.String("service-account-token-path", "",
		"Path to the service account token. "+
			"Only used when --unsafe-use-service-account-token is set and in-cluster")
	f.String("settings", "", "Path to admin settings JSON file")
}

func addOIDCFlags(f *flag.FlagSet) {
	f.Bool("oidc-auto-login", false, "Automatic Redirect to OIDC provider")
	f.String("oidc-client-id", "", "ClientID for OIDC")
	f.String("oidc-client-id-file", "", "Path to file containing ClientID for OIDC")
	f.String("oidc-client-secret", "", "ClientSecret for OIDC")
	f.String("oidc-client-secret-file", "", "Path to file containing ClientSecret for OIDC")
	f.String("oidc-validator-client-id", "", "Override ClientID for OIDC during validation")
	f.String("oidc-idp-issuer-url", "", "Identity provider issuer URL for OIDC")
	f.String("oidc-callback-url", "", "OIDC callback URL and trusted logout return origin")
	f.String("oidc-validator-idp-issuer-url", "", "Override Identity provider issuer URL for OIDC during validation")
	f.String("oidc-scopes", "profile,email", "A comma separated list of scopes needed from the OIDC provider")
	f.Bool("oidc-skip-tls-verify", false, "Skip TLS verification for OIDC")
	f.Bool("oidc-skip-logout", false, "Skip logout from OIDC provider")
	f.String("oidc-ca-file", "", "CA file for OIDC")
	f.String("oidc-api-proxy", "",
		"URL of an external Kubernetes API proxy. When set, "+
			"all Kubernetes API requests are routed through this URL instead of "+
			"the kube-apiserver. The OIDC bearer token is forwarded as-is.")
	f.String("oidc-api-proxy-ca-file", "",
		"PEM-encoded CA file used to verify the TLS certificate of the api-proxy")
	f.Bool("oidc-api-proxy-skip-tls-verify", false,
		"Skip TLS verification for the api-proxy connection (testing only)")
	f.Bool("oidc-use-access-token", false, "Setup oidc to pass through the access_token instead of the default id_token")
	f.Bool("oidc-use-cookie", false, "Enable OIDC cookie usage even when not running in-cluster")
	f.Bool("oidc-use-token-broadcast", false,
		"After a successful OIDC login, also set the auth cookie for other kubeconfig contexts "+
			"whose OIDC auth-provider has the same idp-issuer-url and client-id. Disabled by "+
			"default. Preconditions and caveats: "+
			"https://headlamp.dev/docs/latest/installation/in-cluster/oidc/")
	f.Bool("oidc-use-pkce", false, "Use PKCE (Proof Key for Code Exchange) for enhanced security in OIDC flow")
	f.String("me-username-path", DefaultMeUsernamePath,
		"Comma separated JMESPath expressions used to read username from the JWT payload")
	f.String("me-email-path", DefaultMeEmailPath,
		"Comma separated JMESPath expressions used to read email from the JWT payload")
	f.String("me-groups-path", DefaultMeGroupsPath,
		"Comma separated JMESPath expressions used to read groups from the JWT payload")
	f.String("me-user-info-url", DefaultMeUserInfoURL,
		"URL to fetch additional user info for the /me endpoint. For oauth2proxy /oauth2/userinfo can be used.")
}

func addProxyAuthFlags(f *flag.FlagSet) {
	f.Bool("proxy-auth", false, "Enable bypass of authentication when identity-aware proxy headers are present")
	f.String("proxy-auth-username-header", "X-Forwarded-User", "Header name to read the authenticated username from")
	f.String("proxy-auth-group-header", "X-Forwarded-Group", "Header name to read the authenticated groups from")
	f.String("proxy-auth-email-header", "X-Forwarded-Email", "Header name to read the authenticated email from")
	f.String("proxy-auth-token-header", "X-Forwarded-Id-Token", "Header name to read the proxy Id token from")
}

func addTelemetryFlags(f *flag.FlagSet) {
	// Telemetry flags.
	f.String("service-name", "headlamp", "Service name for telemetry")
	f.String("service-version", "0.30.0", "Service version for telemetry")
	f.Bool("tracing-enabled", false, "Enable distributed tracing")
	f.Bool("metrics-enabled", false, "Enable metrics collection")
	f.String("otlp-endpoint", "localhost:4317", "OTLP collector endpoint")
	f.Bool("use-otlp-http", false, "Use HTTP instead of gRPC for OTLP export")
	f.Bool("stdout-trace-enabled", false, "Enable tracing output to stdout")
	f.Float64("sampling-rate", 1.0, "Sampling rate for traces")
}

// Defaults for namespace discovery. A run needs up to 5 access reviews per
// namespace the user cannot access, so the defaults cover roughly 600 namespaces.
const (
	DefaultNamespaceDiscoveryQPS     = 100
	DefaultNamespaceDiscoveryTimeout = 30 * time.Second
)

func addNamespaceDiscoveryFlags(f *flag.FlagSet) {
	f.Bool("enable-namespace-discovery", false,
		"In-cluster only: list namespace names with the Headlamp service account and show users "+
			"who cannot list namespaces the ones they can access (checked with their own token)")
	f.Float64("namespace-discovery-qps", DefaultNamespaceDiscoveryQPS,
		"Access reviews per second for one namespace discovery run. A run needs up to "+
			"4 reviews per namespace, so raise this (or the timeout) for clusters with many namespaces")
	f.Duration("namespace-discovery-timeout", DefaultNamespaceDiscoveryTimeout,
		"Time limit for one namespace discovery run")
}

func addTLSFlags(f *flag.FlagSet) {
	// TLS flags
	f.String("tls-cert-path", "", "Certificate for serving TLS")
	f.String("tls-key-path", "", "Key for serving TLS")
}

// Gets the default plugins-dir depending on platform.
func defaultPluginDir() string {
	// This is the folder we use for the default plugin-dir:
	//  - ~/.config/Headlamp/plugins exists or it can be made
	// Windows: %APPDATA%\Headlamp\Config\plugins
	//   (for example, C:\Users\USERNAME\AppData\Roaming\Headlamp\Config\plugins)
	// https://www.npmjs.com/package/env-paths
	// https://pkg.go.dev/os#UserConfigDir
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting user config dir")

		return ""
	}

	pluginsConfigDir := filepath.Join(userConfigDir, "Headlamp", "plugins")
	if runtime.GOOS == osWindows {
		// golang is wrong for config folder on windows.
		// This matches env-paths and headlamp-plugin.
		pluginsConfigDir = filepath.Join(userConfigDir, "Headlamp", "Config", "plugins")
	}

	fileMode := 0o755

	err = os.MkdirAll(pluginsConfigDir, fs.FileMode(fileMode))
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating plugins directory")

		return ""
	}

	return pluginsConfigDir
}

// Gets the default user-plugins-dir depending on platform.
func defaultUserPluginDir() string {
	// This is the folder we use for the default user-plugin-dir:
	//  - ~/.config/Headlamp/user-plugins exists or it can be made
	// Windows: %APPDATA%\Headlamp\Config\user-plugins
	//   (for example, C:\Users\USERNAME\AppData\Roaming\Headlamp\Config\user-plugins)
	// https://www.npmjs.com/package/env-paths
	// https://pkg.go.dev/os#UserConfigDir
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting user config dir")

		return ""
	}

	userPluginsConfigDir := filepath.Join(userConfigDir, "Headlamp", "user-plugins")
	if runtime.GOOS == osWindows {
		// golang is wrong for config folder on windows.
		// This matches env-paths and headlamp-plugin.
		userPluginsConfigDir = filepath.Join(userConfigDir, "Headlamp", "Config", "user-plugins")
	}

	fileMode := 0o755

	err = os.MkdirAll(userPluginsConfigDir, fs.FileMode(fileMode))
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating user-plugins directory")

		return ""
	}

	return userPluginsConfigDir
}

func GetDefaultKubeConfigPath() (string, error) {
	homeDirectory, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to determine user home directory: %w", err)
	}

	return filepath.Join(homeDirectory, ".kube", "config"), nil
}

// loadDiscoverySettings reads the flags of every built-in discovery source into DiscoverySources.
func (c *Config) loadDiscoverySettings(k *koanf.Koanf) {
	c.DiscoverySources = make(map[string]clusterdiscovery.Settings)

	for _, source := range clusterdiscovery.BuiltinSources().Sources() {
		d := source.Descriptor()
		prefix := d.FlagPrefix()
		c.DiscoverySources[d.ID] = clusterdiscovery.Settings{
			Enabled:               k.Bool("enable-" + prefix),
			Namespaces:            k.String(prefix + "-namespaces"),
			LabelSelector:         strings.TrimSpace(k.String(prefix + "-label-selector")),
			RootReconcileInterval: k.Duration(prefix + "-root-reconcile-interval"),
			NoCRDCacheTTL:         k.Duration(prefix + "-no-crd-cache-ttl"),
		}
	}
}

// discoveryEnabled reports whether any discovery source is enabled.
func (c *Config) discoveryEnabled() bool {
	for _, settings := range c.DiscoverySources {
		if settings.Enabled {
			return true
		}
	}

	return false
}

// validateDiscoverySources checks the OIDC settings, namespaces and label selector of
// every enabled discovery source.
func (c *Config) validateDiscoverySources() error {
	for id, settings := range c.DiscoverySources {
		if !settings.Enabled {
			continue
		}

		if err := clusterdiscovery.ValidateOIDC(c.OidcClientID, c.OidcIdpIssuerURL,
			strings.Split(c.OidcScopes, ",")); err != nil {
			return fmt.Errorf("%s: %w", id, err)
		}

		prefix := clusterdiscovery.Descriptor{ID: id}.FlagPrefix()

		if err := clusterdiscovery.ValidateNamespaces(settings.Namespaces); err != nil {
			return fmt.Errorf("%s-namespaces: %w", prefix, err)
		}

		if _, err := labels.Parse(settings.LabelSelector); err != nil {
			return fmt.Errorf("invalid %s-label-selector: %w", prefix, err)
		}
	}

	return nil
}

// addClusterDiscoveryFlags registers the flags of every built-in discovery source. It
// keeps the removed provider-file flag, so that using it is reported as unsupported.
func addClusterDiscoveryFlags(f *flag.FlagSet) {
	for _, source := range clusterdiscovery.BuiltinSources().Sources() {
		d := source.Descriptor()
		prefix := d.FlagPrefix()
		f.Bool("enable-"+prefix, false, "Discover "+d.DisplayName+" connections with per-user OIDC")
		f.String(prefix+"-namespaces", "",
			"Namespaces watched for "+d.DisplayName+"; empty uses each root default, * watches all")
		f.String(prefix+"-label-selector", "", "Label selector for "+d.DisplayName+" resources")
		f.Duration(prefix+"-root-reconcile-interval", clusterdiscovery.DefaultRootReconcileInterval,
			"Interval for reconciling "+d.DisplayName+" roots")
		f.Duration(prefix+"-no-crd-cache-ttl", clusterdiscovery.DefaultNoCRDCacheTTL,
			"How long to cache that an API server has no "+d.DisplayName+" CRD")
	}

	f.String("cluster-inventory-provider-file", "",
		"Removed: Cluster Inventory requires per-user OIDC; provider files are no longer supported")
}
