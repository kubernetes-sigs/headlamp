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
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const defaultPort = 4466

type Config struct {
	InCluster             bool   `koanf:"in-cluster"`
	DevMode               bool   `koanf:"dev"`
	InsecureSsl           bool   `koanf:"insecure-ssl"`
	EnableHelm            bool   `koanf:"enable-helm"`
	EnableDynamicClusters bool   `koanf:"enable-dynamic-clusters"`
	ListenAddr            string `koanf:"listen-addr"`
	Port                  uint   `koanf:"port"`
	KubeConfigPath        string `koanf:"kubeconfig"`
	SkippedKubeContexts   string `koanf:"skipped-kube-contexts"`
	StaticDir             string `koanf:"html-static-dir"`
	PluginsDir            string `koanf:"plugins-dir"`
	BaseURL               string `koanf:"base-url"`
	ProxyURLs             string `koanf:"proxy-urls"`
	OidcClientID          string `koanf:"oidc-client-id"`
	OidcClientSecret      string `koanf:"oidc-client-secret"`
	OidcIdpIssuerURL      string `koanf:"oidc-idp-issuer-url"`
	OidcScopes            string `koanf:"oidc-scopes"`
}

func (c *Config) Validate() error {
	if !c.InCluster && (c.OidcClientID != "" || c.OidcClientSecret != "" || c.OidcIdpIssuerURL != "") {
		return errors.New(`oidc-client-id, oidc-client-secret, oidc-idp-issuer-url flags
		are only meant to be used in inCluster mode`)
	}

	if c.BaseURL != "" && !strings.HasPrefix(c.BaseURL, "/") {
		return errors.New("base-url needs to start with a '/' or be empty")
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
	f.String("oidc-idp-issuer-url", "", "Identity provider issuer URL for OIDC")
	f.String("oidc-scopes", "profile,email",
		"A comma separated list of scopes needed from the OIDC provider")

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

// DefaultKubeConfigPersistenceDir returns the default directory to store kubeconfig
// files of clusters that are loaded in Headlamp.
func DefaultKubeConfigPersistenceDir() (string, error) {
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

func DefaultKubeConfigPersistenceFile() (string, error) {
	kubeConfigDir, err := DefaultKubeConfigPersistenceDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(kubeConfigDir, "config"), nil
}

// collectMultiConfigPaths looks at the default dynamic directory
// (e.g. ~/.config/Headlamp/kubeconfigs) and returns any files found there.
// This is called from the 'else' block in deleteCluster().
//
//nolint:prealloc
func CollectMultiConfigPaths() ([]string, error) {
	dynamicDir, err := DefaultKubeConfigPersistenceDir()
	if err != nil {
		return nil, fmt.Errorf("getting default kubeconfig persistence dir: %w", err)
	}

	entries, err := os.ReadDir(dynamicDir)
	if err != nil {
		return nil, fmt.Errorf("reading dynamic kubeconfig directory: %w", err)
	}

	var configPaths []string

	for _, entry := range entries {
		// Optionally skip directories or non-kubeconfig files, if needed.
		if entry.IsDir() {
			continue
		}

		// Validate known kubeconfig file extensions
		if !strings.HasSuffix(entry.Name(), ".yaml") && !strings.HasSuffix(entry.Name(), ".yml") {
			continue
		}

		filePath := filepath.Join(dynamicDir, entry.Name())

		configPaths = append(configPaths, filePath)
	}

	return configPaths, nil
}

// RemoveContextFromConfigs does the real iteration over the configPaths.
func RemoveContextFromConfigs(contextName string, configPaths []string) error {
	var removed bool

	for _, filePath := range configPaths {
		logger.Log(
			logger.LevelInfo,
			map[string]string{
				"cluster":                   contextName,
				"kubeConfigPersistenceFile": filePath,
			},
			nil,
			"Trying to remove context from kubeconfig",
		)

		err := kubeconfig.RemoveContextFromFile(contextName, filePath)
		if err == nil {
			removed = true

			logger.Log(logger.LevelInfo,
				map[string]string{"cluster": contextName, "file": filePath},
				nil, "Removed context from kubeconfig",
			)

			break
		}

		if strings.Contains(err.Error(), "context not found") {
			logger.Log(logger.LevelInfo,
				map[string]string{"cluster": contextName, "file": filePath},
				nil, "Context not in this file; checking next.",
			)

			continue
		}

		logger.Log(logger.LevelError,
			map[string]string{"cluster": contextName},
			err, "removing cluster from kubeconfig",
		)

		return err
	}

	if !removed {
		e := fmt.Errorf("context %q not found in any provided kubeconfig file(s)", contextName)

		logger.Log(
			logger.LevelError,
			map[string]string{"cluster": contextName},
			e,
			"context not found in any file",
		)

		return e
	}

	return nil
}

func RemoveContextFromDefaultKubeConfig(
	contextName string,
	configPaths ...string,
) error {
	// Check if contextName is empty
	if contextName == "" {
		return fmt.Errorf("context name cannot be empty")
	}

	// If no specific paths passed, fallback to the default.
	if len(configPaths) == 0 {
		discoveredPath, err := DefaultKubeConfigPersistenceFile()
		if err != nil {
			logger.Log(
				logger.LevelError,
				map[string]string{"cluster": contextName},
				err,
				"getting default kubeconfig persistence file",
			)

			return fmt.Errorf("getting default kubeconfig persistence file: %w", err)
		}

		configPaths = []string{discoveredPath}
	}

	// Check if configPaths is empty
	if len(configPaths) == 0 {
		return fmt.Errorf("no config paths provided")
	}

	// Hand off to a small helper function that handles multi-file iteration.
	return RemoveContextFromConfigs(contextName, configPaths)
}
