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

package server

import (
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/utils"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

func NewServerCmd() *cobra.Command {
	o := &Options{
		Config: config.Config{},
	}
	// checkCmd represents the check command
	cmd := &cobra.Command{
		Use:   "server",
		Short: "run headlamp server mode",
		Run: func(cmd *cobra.Command, args []string) {
			if err := o.complete(); err != nil {
				logger.Log(logger.LevelError, nil, err, "Failed to complete options")
				return
			}
			if err := o.validate(); err != nil {
				logger.Log(logger.LevelError, nil, err, "Failed to validate options")
				return
			}
			if err := o.run(); err != nil {
				logger.Log(logger.LevelError, nil, err, "Failed to run server")
				return
			}
		},
	}

	parseFlags(cmd, o)

	if err := bindFlagsAndEnvs(cmd); err != nil {
		logger.Log(logger.LevelError, nil, err, "Failed to bind flags and environment variables")
		return nil
	}
	return cmd
}

func parseFlags(cmd *cobra.Command, o *Options) {
	inClusterDesc := "Set when running from a k8s cluster"
	devModeDesc := "Allow connections from other origins"
	insecureSSLDesc := "Accept/Ignore all server SSL certificates"
	enableDynamicClustersDesc := "Enable dynamic clusters, which stores stateless clusters in the frontend."
	watchPluginsChangesDesc := "Reloads plugins when there are changes to them or their directory"
	kubeConfigDesc := "Absolute path to the kubeconfig file"
	skippedKubeContextsDesc := "Context name which should be ignored in kubeconfig file"
	staticDirDesc := "Static HTML directory to serve"
	pluginsDirDesc := "Specify the plugins directory to build the backend with"
	baseURLDesc := "Base URL path. eg. /headlamp"
	listenAddrDesc := "Address to listen on; default is empty, which means listening to any address"
	portDesc := "Port to listen from"
	proxyURLsDesc := "Allow proxy requests to specified URLs"
	oidcClientIDDesc := "ClientID for OIDC"
	oidcClientSecretDesc := "ClientSecret for OIDC"
	oidcValidatorClientIDDesc := "Override ClientID for OIDC during validation"
	oidcIdpIssuerURLDesc := "Identity provider issuer URL for OIDC"
	oidcValidatorIdpIssuerURLDesc := "Override Identity provider issuer URL for OIDC during validation"
	oidcScopesDesc := "A comma separated list of scopes needed from the OIDC provider"
	oidcUseAccessTokenDesc := "Setup oidc to pass through the access_token instead of the default id_token"
	serviceNameDesc := "Service name for telemetry"
	serviceVersionDesc := "Service version for telemetry"
	tracingEnabledDesc := "Enable distributed tracing"
	metricsEnabledDesc := "Enable metrics collection"
	jaegerEndpointDesc := "Jaeger endpoint"
	otlpEndpointDesc := "OTLP collector endpoint"
	useOTLPHTTPDesc := "Use HTTP instead of gRPC for OTLP export"
	stdoutTraceEnabledDesc := "Enable tracing output to stdout"
	samplingRateDesc := "Sampling rate for traces"

	cmd.Flags().BoolVar(&o.InCluster, "in-cluster", false, inClusterDesc)
	cmd.Flags().BoolVar(&o.DevMode, "dev", false, devModeDesc)
	cmd.Flags().BoolVar(&o.InsecureSsl, "insecure-ssl", false, insecureSSLDesc)
	cmd.Flags().BoolVar(&o.EnableDynamicClusters, "enable-dynamic-clusters", false, enableDynamicClustersDesc)
	cmd.Flags().BoolVar(&o.WatchPluginsChanges, "watch-plugins-changes", true, watchPluginsChangesDesc)
	cmd.Flags().StringVar(&o.KubeConfigPath, "kubeconfig", "", kubeConfigDesc)
	cmd.Flags().StringVar(&o.SkippedKubeContexts, "skipped-kube-contexts", "", skippedKubeContextsDesc)
	cmd.Flags().StringVar(&o.StaticDir, "html-static-dir", "", staticDirDesc)
	cmd.Flags().StringVar(&o.PluginsDir, "plugins-dir", defaultPluginDir(), pluginsDirDesc)
	cmd.Flags().StringVar(&o.BaseURL, "base-url", "", baseURLDesc)
	cmd.Flags().StringVar(&o.ListenAddr, "listen-addr", "", listenAddrDesc)
	cmd.Flags().UintVar(&o.Port, "port", 4466, portDesc)
	cmd.Flags().StringVar(&o.ProxyURLs, "proxy-urls", "", proxyURLsDesc)
	cmd.Flags().StringVar(&o.OidcClientID, "oidc-client-id", "", oidcClientIDDesc)
	cmd.Flags().StringVar(&o.OidcClientSecret, "oidc-client-secret", "", oidcClientSecretDesc)
	cmd.Flags().StringVar(&o.OidcValidatorClientID, "oidc-validator-client-id", "", oidcValidatorClientIDDesc)
	cmd.Flags().StringVar(&o.OidcIdpIssuerURL, "oidc-idp-issuer-url", "", oidcIdpIssuerURLDesc)
	cmd.Flags().StringVar(&o.OidcValidatorIdpIssuerURL, "oidc-validator-idp-issuer-url", "", oidcValidatorIdpIssuerURLDesc)
	cmd.Flags().StringVar(&o.OidcScopes, "oidc-scopes", "profile,email", oidcScopesDesc)
	cmd.Flags().BoolVar(&o.OidcUseAccessToken, "oidc-use-access-token", false, oidcUseAccessTokenDesc)
	cmd.Flags().StringVar(&o.ServiceName, "service-name", "headlamp", serviceNameDesc)
	cmd.Flags().StringVar(&o.ServiceVersion, "service-version", "0.30.0", serviceVersionDesc)
	cmd.Flags().BoolVar(&o.TracingEnabled, "tracing-enabled", false, tracingEnabledDesc)
	cmd.Flags().BoolVar(&o.MetricsEnabled, "metrics-enabled", false, metricsEnabledDesc)
	cmd.Flags().StringVar(&o.JaegerEndpoint, "jaeger-endpoint", "localhost:6831", jaegerEndpointDesc)
	cmd.Flags().StringVar(&o.OTLPEndpoint, "otlp-endpoint", "localhost:4317", otlpEndpointDesc)
	cmd.Flags().BoolVar(&o.UseOTLPHTTP, "use-otlp-http", false, useOTLPHTTPDesc)
	cmd.Flags().BoolVar(&o.StdoutTraceEnabled, "stdout-trace-enabled", false, stdoutTraceEnabledDesc)
	cmd.Flags().Float64Var(&o.SamplingRate, "sampling-rate", 1.0, samplingRateDesc)
}

func bindFlagsAndEnvs(cmd *cobra.Command) error {
	return utils.NewErrorAggerator().Append(
		viper.BindPFlag("in-cluster", cmd.Flags().Lookup("in-cluster")),
		viper.BindPFlag("dev-mode", cmd.Flags().Lookup("dev")),
		viper.BindPFlag("insecure-ssl", cmd.Flags().Lookup("insecure-ssl")),
		viper.BindPFlag("enable-dynamic-clusters", cmd.Flags().Lookup("enable-dynamic-clusters")),
		viper.BindPFlag("watch-plugins-changes", cmd.Flags().Lookup("watch-plugins-changes")),
		viper.BindPFlag("kubeconfig", cmd.Flags().Lookup("kubeconfig")),
		viper.BindPFlag("skipped-kube-contexts", cmd.Flags().Lookup("skipped-kube-contexts")),
		viper.BindPFlag("html-static-dir", cmd.Flags().Lookup("html-static-dir")),
		viper.BindPFlag("plugins-dir", cmd.Flags().Lookup("plugins-dir")),
		viper.BindPFlag("base-url", cmd.Flags().Lookup("base-url")),
		viper.BindPFlag("listen-addr", cmd.Flags().Lookup("listen-addr")),
		viper.BindPFlag("port", cmd.Flags().Lookup("port")),
		viper.BindPFlag("proxy-urls", cmd.Flags().Lookup("proxy-urls")),
		viper.BindPFlag("oidc-client-id", cmd.Flags().Lookup("oidc-client-id")),
		viper.BindPFlag("oidc-client-secret", cmd.Flags().Lookup("oidc-client-secret")),
		viper.BindPFlag("oidc-validator-client-id", cmd.Flags().Lookup("oidc-validator-client-id")),
		viper.BindPFlag("oidc-idp-issuer-url", cmd.Flags().Lookup("oidc-idp-issuer-url")),
		viper.BindPFlag("oidc-validator-idp-issuer-url", cmd.Flags().Lookup("oidc-validator-idp-issuer-url")),
		viper.BindPFlag("oidc-scopes", cmd.Flags().Lookup("oidc-scopes")),
		viper.BindPFlag("oidc-use-access-token", cmd.Flags().Lookup("oidc-use-access-token")),
		viper.BindPFlag("service-name", cmd.Flags().Lookup("service-name")),
		viper.BindPFlag("service-version", cmd.Flags().Lookup("service-version")),
		viper.BindPFlag("tracing-enabled", cmd.Flags().Lookup("tracing-enabled")),
		viper.BindPFlag("metrics-enabled", cmd.Flags().Lookup("metrics-enabled")),
		viper.BindPFlag("jaeger-endpoint", cmd.Flags().Lookup("jaeger-endpoint")),
		viper.BindPFlag("otlp-endpoint", cmd.Flags().Lookup("otlp-endpoint")),
		viper.BindPFlag("use-otlp-http", cmd.Flags().Lookup("use-otlp-http")),
		viper.BindPFlag("stdout-trace-enabled", cmd.Flags().Lookup("stdout-trace-enabled")),
		viper.BindPFlag("sampling-rate", cmd.Flags().Lookup("sampling-rate")),
		viper.BindEnv("in-cluster", "HEADLAMP_CONFIG_IN_CLUSTER"),
		viper.BindEnv("dev-mode", "HEADLAMP_CONFIG_DEV_MODE"),
		viper.BindEnv("insecure-ssl", "HEADLAMP_CONFIG_INSECURE_SSL"),
		viper.BindEnv("enable-dynamic-clusters", "HEADLAMP_CONFIG_ENABLE_DYNAMIC_CLUSTERS"),
		viper.BindEnv("watch-plugins-changes", "HEADLAMP_CONFIG_WATCH_PLUGINS_CHANGES"),
		viper.BindEnv("kubeconfig", "HEADLAMP_CONFIG_KUBECONFIG"),
		viper.BindEnv("skipped-kube-contexts", "HEADLAMP_CONFIG_SKIPPED_KUBE_CONTEXTS"),
		viper.BindEnv("html-static-dir", "HEADLAMP_CONFIG_HTML_STATIC_DIR"),
		viper.BindEnv("plugins-dir", "HEADLAMP_CONFIG_PLUGINS_DIR"),
		viper.BindEnv("base-url", "HEADLAMP_CONFIG_BASE_URL"),
		viper.BindEnv("listen-addr", "HEADLAMP_CONFIG_LISTEN_ADDR"),
		viper.BindEnv("port", "HEADLAMP_CONFIG_PORT"),
		viper.BindEnv("proxy-urls", "HEADLAMP_CONFIG_PROXY_URLS"),
		viper.BindEnv("oidc-client-id", "HEADLAMP_CONFIG_OIDC_CLIENT_ID"),
		viper.BindEnv("oidc-client-secret", "HEADLAMP_CONFIG_OIDC_CLIENT_SECRET"),
		viper.BindEnv("oidc-validator-client-id", "HEADLAMP_CONFIG_OIDC_VALIDATOR_CLIENT_ID"),
		viper.BindEnv("oidc-idp-issuer-url", "HEADLAMP_CONFIG_OIDC_IDP_ISSUER_URL"),
		viper.BindEnv("oidc-validator-idp-issuer-url", "HEADLAMP_CONFIG_OIDC_VALIDATOR_IDP_ISSUER_URL"),
		viper.BindEnv("oidc-scopes", "HEADLAMP_CONFIG_OIDC_SCOPES"),
		viper.BindEnv("oidc-use-access-token", "HEADLAMP_CONFIG_OIDC_USE_ACCESS_TOKEN"),
		viper.BindEnv("service-name", "HEADLAMP_CONFIG_SERVICE_NAME"),
		viper.BindEnv("service-version", "HEADLAMP_CONFIG_SERVICE_VERSION"),
		viper.BindEnv("tracing-enabled", "HEADLAMP_CONFIG_TRACING_ENABLED"),
		viper.BindEnv("metrics-enabled", "HEADLAMP_CONFIG_METRICS_ENABLED"),
		viper.BindEnv("jaeger-endpoint", "HEADLAMP_CONFIG_JAEGER_ENDPOINT"),
		viper.BindEnv("otlp-endpoint", "HEADLAMP_CONFIG_OTLP_ENDPOINT"),
		viper.BindEnv("use-otlp-http", "HEADLAMP_CONFIG_USE_OTLP_HTTP"),
		viper.BindEnv("stdout-trace-enabled", "HEADLAMP_CONFIG_STDOUT_TRACE_ENABLED"),
		viper.BindEnv("sampling-rate", "HEADLAMP_CONFIG_SAMPLING_RATE"),
	).Aggregate()
}

type Options struct {
	config.Config
}

func NewOptions(conf config.Config) *Options {
	return &Options{
		Config: conf,
	}
}

func (o *Options) complete() error {
	// If running in-cluster and the user did not explicitly set the watch flag,
	// then force WatchPluginsChanges to false.
	if o.InCluster && !o.WatchPluginsChanges {
		o.WatchPluginsChanges = false
	}

	if !o.InCluster {
		o.KubeConfigPath = config.GetDefaultKubeConfigPath()
	}

	return nil
}

func (o *Options) validate() error {
	return o.Config.Validate()
}

func (o *Options) run() error {
	cache := cache.New[any]()
	kubeConfigStore := kubeconfig.NewContextStore()
	multiplexer := NewMultiplexer(kubeConfigStore)

	return StartHeadlampServer(&HeadlampConfig{
		HeadlampCFG: &headlampconfig.HeadlampCFG{
			UseInCluster:          o.InCluster,
			KubeConfigPath:        o.KubeConfigPath,
			SkippedKubeContexts:   o.SkippedKubeContexts,
			ListenAddr:            o.ListenAddr,
			Port:                  o.Port,
			DevMode:               o.DevMode,
			StaticDir:             o.StaticDir,
			Insecure:              o.InsecureSsl,
			PluginDir:             o.PluginsDir,
			EnableHelm:            o.EnableHelm,
			EnableDynamicClusters: o.EnableDynamicClusters,
			WatchPluginsChanges:   o.WatchPluginsChanges,
			KubeConfigStore:       kubeConfigStore,
			BaseURL:               o.BaseURL,
			ProxyURLs:             strings.Split(o.ProxyURLs, ","),
		},
		oidcClientID:              o.OidcClientID,
		oidcValidatorClientID:     o.OidcValidatorClientID,
		oidcClientSecret:          o.OidcClientSecret,
		oidcIdpIssuerURL:          o.OidcIdpIssuerURL,
		oidcValidatorIdpIssuerURL: o.OidcValidatorIdpIssuerURL,
		oidcScopes:                strings.Split(o.OidcScopes, ","),
		oidcUseAccessToken:        o.OidcUseAccessToken,
		cache:                     cache,
		multiplexer:               multiplexer,
		telemetryConfig: config.Config{
			ServiceName:        o.ServiceName,
			ServiceVersion:     o.ServiceVersion,
			TracingEnabled:     o.TracingEnabled,
			MetricsEnabled:     o.MetricsEnabled,
			JaegerEndpoint:     o.JaegerEndpoint,
			OTLPEndpoint:       o.OTLPEndpoint,
			UseOTLPHTTP:        o.UseOTLPHTTP,
			StdoutTraceEnabled: o.StdoutTraceEnabled,
			SamplingRate:       o.SamplingRate,
		},
	})
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
