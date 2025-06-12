package config

import (
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/knadh/koanf"
	"github.com/knadh/koanf/providers/basicflag"
	"github.com/knadh/koanf/providers/env"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const defaultPort = 4466

type Config struct {
	InCluster                 bool   `koanf:"in-cluster"`
	DevMode                   bool   `koanf:"dev"`
	InsecureSsl               bool   `koanf:"insecure-ssl"`
	EnableHelm                bool   `koanf:"enable-helm"`
	EnableDynamicClusters     bool   `koanf:"enable-dynamic-clusters"`
	ListenAddr                string `koanf:"listen-addr"`
	WatchPluginsChanges       bool   `koanf:"watch-plugins-changes"`
	Port                      uint   `koanf:"port"`
	KubeConfigPath            string `koanf:"kubeconfig"`
	SkippedKubeContexts       string `koanf:"skipped-kube-contexts"`
	StaticDir                 string `koanf:"html-static-dir"`
	PluginsDir                string `koanf:"plugins-dir"`
	BaseURL                   string `koanf:"base-url"`
	ProxyURLs                 string `koanf:"proxy-urls"`
	OidcClientID              string `koanf:"oidc-client-id"`
	OidcValidatorClientID     string `koanf:"oidc-validator-client-id"`
	OidcClientSecret          string `koanf:"oidc-client-secret"`
	OidcIdpIssuerURL          string `koanf:"oidc-idp-issuer-url"`
	OidcValidatorIdpIssuerURL string `koanf:"oidc-validator-idp-issuer-url"`
	OidcScopes                string `koanf:"oidc-scopes"`
	OidcUseAccessToken        bool   `koanf:"oidc-use-access-token"`
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
}

func (c *Config) Validate() error {
	if !c.InCluster && (c.OidcClientID != "" || c.OidcClientSecret != "" || c.OidcIdpIssuerURL != "" ||
		c.OidcValidatorClientID != "" || c.OidcValidatorIdpIssuerURL != "") {
		return errors.New(`oidc-client-id, oidc-client-secret, oidc-idp-issuer-url, oidc-validator-client-id, 
		oidc-validator-idp-issuer-url, flags are only meant to be used in inCluster mode`)
	}

	if c.BaseURL != "" && !strings.HasPrefix(c.BaseURL, "/") {
		return errors.New("base-url needs to start with a '/' or be empty")
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

	return nil
}

// Parse Loads the config from flags and env.
// env vars should start with HEADLAMP_CONFIG_ and use _ as separator
// If a value is set both in flags and env then flag takes priority.
// eg:
// export HEADLAMP_CONFIG_PORT=2344
// go run ./cmd --port=3456
// the value of port will be 3456.

//nolint:funlen
func Parse(args []string) (*Config, error) {
	var config Config

	f := flagset()

	k := koanf.New(".")

	if args == nil {
		args = []string{}
	} else if len(args) > 0 {
		args = args[1:]
	}

	// First Load default args from flags
	if err := k.Load(basicflag.Provider(f, "."), nil); err != nil {
		logger.Log(logger.LevelError, nil, err, "loading default config from flags")

		return nil, fmt.Errorf("error loading default config from flags: %w", err)
	}

	// Parse args
	if err := f.Parse(args); err != nil {
		logger.Log(logger.LevelError, nil, err, "parsing flags")

		return nil, fmt.Errorf("error parsing flags: %w", err)
	}

	explicitFlags := make(map[string]bool)

	// Record which flags were explicitly set by the user
	f.Visit(func(f *flag.Flag) {
		explicitFlags[f.Name] = true
	})

	// Load config from env
	if err := k.Load(env.Provider("HEADLAMP_CONFIG_", ".", func(s string) string {
		return strings.ReplaceAll(strings.ToLower(strings.TrimPrefix(s, "HEADLAMP_CONFIG_")), "_", "-")
	}), nil); err != nil {
		logger.Log(logger.LevelError, nil, err, "loading config from env")

		return nil, fmt.Errorf("error loading config from env: %w", err)
	}

	// Load only the flags that were set
	if err := k.Load(basicflag.ProviderWithValue(f, ".", func(key string, value string) (string, interface{}) {
		flagSet := false
		f.Visit(func(f *flag.Flag) {
			if f.Name == key {
				flagSet = true
			}
		})
		if flagSet {
			return key, value
		}
		return "", nil
	}), nil); err != nil {
		logger.Log(logger.LevelError, nil, err, "loading config from flags")

		return nil, fmt.Errorf("error loading config from flags: %w", err)
	}

	if err := k.Unmarshal("", &config); err != nil {
		logger.Log(logger.LevelError, nil, err, "unmarshalling config")

		return nil, fmt.Errorf("error unmarshal config: %w", err)
	}

	// If running in-cluster and the user did not explicitly set the watch flag,
	// then force WatchPluginsChanges to false.
	if config.InCluster && !explicitFlags["watch-plugins-changes"] {
		config.WatchPluginsChanges = false
	}

	// Validate parsed config
	if err := config.Validate(); err != nil {
		logger.Log(logger.LevelError, nil, err, "validating config")

		return nil, err
	}

	kubeConfigPath := ""

	// If we don't have a specified kubeConfig path, and we are not running
	// in-cluster, then use the default path.
	if config.KubeConfigPath != "" {
		kubeConfigPath = config.KubeConfigPath
	} else if !config.InCluster {
		kubeConfigEnv := os.Getenv("KUBECONFIG")
		if kubeConfigEnv != "" {
			kubeConfigPath = kubeConfigEnv
		} else {
			kubeConfigPath = GetDefaultKubeConfigPath()
		}
	}

	config.KubeConfigPath = kubeConfigPath

	return &config, nil
}

func flagset() *flag.FlagSet {
	f := flag.NewFlagSet("config", flag.ContinueOnError)

	f.Bool("in-cluster", false, "Set when running from a k8s cluster")
	f.Bool("dev", false, "Allow connections from other origins")
	f.Bool("insecure-ssl", false, "Accept/Ignore all server SSL certificates")
	f.Bool("enable-dynamic-clusters", false, "Enable dynamic clusters, which stores stateless clusters in the frontend.")
	// Note: When running in-cluster and if not explicitly set, this flag defaults to false.
	f.Bool("watch-plugins-changes", true, "Reloads plugins when there are changes to them or their directory")

	f.String("kubeconfig", "", "Absolute path to the kubeconfig file")
	f.String("skipped-kube-contexts", "", "Context name which should be ignored in kubeconfig file")
	f.String("html-static-dir", "", "Static HTML directory to serve")
	f.String("plugins-dir", defaultPluginDir(), "Specify the plugins directory to build the backend with")
	f.String("base-url", "", "Base URL path. eg. /headlamp")
	f.String("listen-addr", "", "Address to listen on; default is empty, which means listening to any address")
	f.Uint("port", defaultPort, "Port to listen from")
	f.String("proxy-urls", "", "Allow proxy requests to specified URLs")

	f.String("oidc-client-id", "", "ClientID for OIDC")
	f.String("oidc-client-secret", "", "ClientSecret for OIDC")
	f.String("oidc-validator-client-id", "", "Override ClientID for OIDC during validation")
	f.String("oidc-idp-issuer-url", "", "Identity provider issuer URL for OIDC")
	f.String("oidc-validator-idp-issuer-url", "", "Override Identity provider issuer URL for OIDC during validation")
	f.String("oidc-scopes", "profile,email",
		"A comma separated list of scopes needed from the OIDC provider")
	f.Bool("oidc-use-access-token", false, "Setup oidc to pass through the access_token instead of the default id_token")
	// Telemetry flags.
	f.String("service-name", "headlamp", "Service name for telemetry")
	f.String("service-version", "0.30.0", "Service version for telemetry")
	f.Bool("tracing-enabled", true, "Enable distributed tracing")
	f.Bool("metrics-enabled", false, "Enable metrics collection")
	f.String("otlp-endpoint", "localhost:4317", "OTLP collector endpoint")
	f.Bool("use-otlp-http", false, "Use HTTP instead of gRPC for OTLP export")
	f.Bool("stdout-trace-enabled", false, "Enable tracing output to stdout")
	f.Float64("sampling-rate", 1.0, "Sampling rate for traces")

	return f
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
	if runtime.GOOS == "windows" {
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

func GetDefaultKubeConfigPath() string {
	user, err := user.Current()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting current user")
		os.Exit(1)
	}

	homeDirectory := user.HomeDir

	return filepath.Join(homeDirectory, ".kube", "config")
}
