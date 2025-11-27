package headlampconfig

import (
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
)

type HeadlampCFG struct {
	UseInCluster          bool
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
