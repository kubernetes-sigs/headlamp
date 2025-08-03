package config

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

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
	ServiceName        string  `koanf:"service-name"`
	ServiceVersion     string  `koanf:"service-version"`
	TracingEnabled     bool    `koanf:"tracing-enabled"`
	MetricsEnabled     bool    `koanf:"metrics-enabled"`
	JaegerEndpoint     string  `koanf:"jaeger-endpoint"`
	OTLPEndpoint       string  `koanf:"otlp-endpoint"`
	UseOTLPHTTP        bool    `koanf:"use-otlp-http"`
	StdoutTraceEnabled bool    `koanf:"stdout-trace-enabled"`
	SamplingRate       float64 `koanf:"sampling-rate"`
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

	if c.TracingEnabled {
		if c.ServiceName == "" {
			return errors.New("service-name is required when tracing is enabled")
		}

		if c.JaegerEndpoint == "" && c.OTLPEndpoint == "" && c.StdoutTraceEnabled {
			return errors.New("at least one tracing exporter (jaeger, otlp, or stdout) must be configured")
		}

		if c.UseOTLPHTTP && c.OTLPEndpoint == "" {
			return errors.New("otlp-endpoint must be configured when use-otlp-http is enabled")
		}
	}

	return nil
}

// MakeHeadlampKubeConfigsDir returns the default directory to store kubeconfig
// files of clusters that are loaded in Headlamp.
func MakeHeadlampKubeConfigsDir() (string, error) {
	userConfigDir, err := os.UserConfigDir()

	if err == nil {
		kubeConfigDir := filepath.Join(userConfigDir, "Headlamp", "kubeconfigs")
		if runtime.GOOS == "windows" {
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

func DefaultHeadlampKubeConfigFile() (string, error) {
	kubeConfigDir, err := MakeHeadlampKubeConfigsDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(kubeConfigDir, "config"), nil
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
