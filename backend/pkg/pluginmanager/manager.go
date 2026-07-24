/*
Copyright 2026 The Kubernetes Authors.

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

package pluginmanager

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const (
	// resyncInterval re-lists the ConfigMap to recover from missed events.
	resyncInterval = 5 * time.Minute
	// retryInterval re-runs reconciliation after a failed plugin operation.
	retryInterval = 30 * time.Second

	serviceAccountNamespaceFile = "/var/run/secrets/kubernetes.io/serviceaccount/namespace"
)

// Plugin sync phases reported per plugin in the status endpoint.
const (
	PhaseSynced  = "synced"
	PhasePending = "pending"
	PhaseError   = "error"
)

// logFieldPlugin is the structured-log field naming a plugin.
const logFieldPlugin = "plugin"

// PluginStatus is the local sync state of one desired plugin on this replica.
type PluginStatus struct {
	Phase   string `json:"phase"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

// Status describes the sync state of this replica.
type Status struct {
	ConfigMapFound bool                    `json:"configMapFound"`
	LastSync       string                  `json:"lastSync,omitempty"`
	Error          string                  `json:"error,omitempty"`
	Plugins        map[string]PluginStatus `json:"plugins"`
}

// Manager reconciles the user plugins directory against the desired state in
// a ConfigMap and serves catalog browsing requests.
type Manager struct {
	Namespace     string
	ConfigMapName string
	pluginsDir    string
	clientset     kubernetes.Interface

	mu     sync.Mutex
	state  *State
	status Status

	trigger chan struct{}
}

// validatePluginsDir ensures the plugins directory is usable before the
// reconciler starts writing into it.
func validatePluginsDir(pluginsDir string) error {
	if pluginsDir == "" {
		return fmt.Errorf("plugin manager needs -user-plugins-dir to be set")
	}

	if err := os.MkdirAll(pluginsDir, 0o750); err != nil {
		return fmt.Errorf("plugins directory %q is not writable: %w", pluginsDir, err)
	}

	probe, err := os.CreateTemp(pluginsDir, ".write-probe-*")
	if err != nil {
		return fmt.Errorf("plugins directory %q is not writable: %w", pluginsDir, err)
	}

	if err := probe.Close(); err != nil {
		return fmt.Errorf("plugins directory %q is not writable: %w", pluginsDir, err)
	}

	return os.Remove(probe.Name())
}

// New creates a Manager using in-cluster credentials.
func New(configMapName, pluginsDir string) (*Manager, error) {
	if err := validatePluginsDir(pluginsDir); err != nil {
		return nil, err
	}

	restConfig, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("plugin manager needs in-cluster credentials: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, err
	}

	namespace, err := ownNamespace()
	if err != nil {
		return nil, err
	}

	return newWithClient(clientset, namespace, configMapName, pluginsDir), nil
}

func newWithClient(clientset kubernetes.Interface, namespace, configMapName, pluginsDir string) *Manager {
	return &Manager{
		Namespace:     namespace,
		ConfigMapName: configMapName,
		pluginsDir:    pluginsDir,
		clientset:     clientset,
		status:        Status{Plugins: map[string]PluginStatus{}},
		trigger:       make(chan struct{}, 1),
	}
}

func ownNamespace() (string, error) {
	if ns := os.Getenv("POD_NAMESPACE"); ns != "" {
		return ns, nil
	}

	content, err := os.ReadFile(serviceAccountNamespaceFile)
	if err != nil {
		return "", fmt.Errorf("determining own namespace: %w", err)
	}

	return strings.TrimSpace(string(content)), nil
}

// Run watches the ConfigMap and reconciles until the context is cancelled.
func (m *Manager) Run(ctx context.Context) {
	selector := fields.OneTermEqualSelector("metadata.name", m.ConfigMapName).String()
	listWatch := &cache.ListWatch{
		ListFunc: func(options metav1.ListOptions) (runtime.Object, error) {
			options.FieldSelector = selector

			return m.clientset.CoreV1().ConfigMaps(m.Namespace).List(ctx, options)
		},
		WatchFunc: func(options metav1.ListOptions) (watch.Interface, error) {
			options.FieldSelector = selector

			return m.clientset.CoreV1().ConfigMaps(m.Namespace).Watch(ctx, options)
		},
	}

	_, informer := cache.NewInformerWithOptions(cache.InformerOptions{
		ListerWatcher: listWatch,
		ObjectType:    &corev1.ConfigMap{},
		ResyncPeriod:  resyncInterval,
		Handler: cache.ResourceEventHandlerFuncs{
			AddFunc:    func(obj interface{}) { m.onConfigMap(obj) },
			UpdateFunc: func(_, obj interface{}) { m.onConfigMap(obj) },
			DeleteFunc: func(interface{}) { m.onConfigMapDeleted() },
		},
	})

	go informer.Run(ctx.Done())
	go m.reconcileLoop(ctx)

	logger.Log(logger.LevelInfo, map[string]string{
		"namespace": m.Namespace,
		"configMap": m.ConfigMapName,
		"directory": m.pluginsDir,
	}, nil, "plugin manager: started")
}

func (m *Manager) onConfigMap(obj interface{}) {
	configMap, ok := obj.(*corev1.ConfigMap)
	if !ok {
		return
	}

	state, err := ParseState(configMap.Data[StateKey])

	m.mu.Lock()
	m.status.ConfigMapFound = true

	if err != nil {
		m.status.Error = err.Error()
		m.mu.Unlock()
		logger.Log(logger.LevelError, nil, err, "plugin manager: invalid state in ConfigMap")

		return
	}

	m.status.Error = ""
	m.state = state
	m.mu.Unlock()

	m.requestReconcile()
}

func (m *Manager) onConfigMapDeleted() {
	m.mu.Lock()
	m.status.ConfigMapFound = false
	m.status.Error = ""
	m.state = &State{}
	m.mu.Unlock()

	m.requestReconcile()
}

func (m *Manager) requestReconcile() {
	select {
	case m.trigger <- struct{}{}:
	default:
	}
}

func (m *Manager) reconcileLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-m.trigger:
		}

		if failed := m.reconcile(ctx); failed {
			go m.retryLater(ctx)
		}
	}
}

func (m *Manager) retryLater(ctx context.Context) {
	select {
	case <-ctx.Done():
	case <-time.After(retryInterval):
		m.requestReconcile()
	}
}

// reconcile converges the plugins directory to the desired state. It returns
// true if any operation failed and a retry should be scheduled.
func (m *Manager) reconcile(ctx context.Context) bool {
	m.mu.Lock()
	state := m.state
	m.mu.Unlock()

	if state == nil {
		return false
	}

	desired := map[string]DesiredPlugin{}
	for _, plugin := range state.Plugins {
		desired[plugin.Name] = plugin
	}

	failed := m.removeUndesired(desired)

	for _, plugin := range state.Plugins {
		if !m.syncPlugin(ctx, plugin) {
			failed = true
		}
	}

	m.mu.Lock()
	m.status.LastSync = time.Now().UTC().Format(time.RFC3339)
	m.pruneStatusLocked(desired)
	m.mu.Unlock()

	return failed
}

func (m *Manager) removeUndesired(desired map[string]DesiredPlugin) bool {
	managed, err := listManaged(m.pluginsDir)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "plugin manager: listing managed plugins")

		return true
	}

	failed := false

	for name := range managed {
		if _, ok := desired[name]; ok {
			continue
		}

		logger.Log(logger.LevelInfo, map[string]string{logFieldPlugin: name}, nil, "plugin manager: removing plugin")

		if err := remove(m.pluginsDir, name); err != nil {
			logger.Log(logger.LevelError, map[string]string{logFieldPlugin: name}, err, "plugin manager: removing plugin")

			failed = true
		}
	}

	return failed
}

// syncPlugin makes sure one plugin is installed at the desired version.
// It returns false if the installation failed.
func (m *Manager) syncPlugin(ctx context.Context, plugin DesiredPlugin) bool {
	current := readMarker(fmt.Sprintf("%s/%s", m.pluginsDir, plugin.Name))
	if current != nil && current.Checksum == plugin.Checksum {
		m.setPluginStatus(plugin.Name, PluginStatus{Phase: PhaseSynced, Version: plugin.Version})

		return true
	}

	m.setPluginStatus(plugin.Name, PluginStatus{Phase: PhasePending, Version: plugin.Version})
	logger.Log(logger.LevelInfo, map[string]string{
		logFieldPlugin: plugin.Name,
		"version":      plugin.Version,
	}, nil, "plugin manager: installing plugin")

	client, err := m.downloadClient(ctx, plugin)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldPlugin: plugin.Name}, err,
			"plugin manager: installing plugin")
		m.setPluginStatus(plugin.Name, PluginStatus{Phase: PhaseError, Version: plugin.Version, Error: err.Error()})

		return false
	}

	if err := install(ctx, client, m.pluginsDir, plugin); err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldPlugin: plugin.Name}, err,
			"plugin manager: installing plugin")
		m.setPluginStatus(plugin.Name, PluginStatus{Phase: PhaseError, Version: plugin.Version, Error: err.Error()})

		return false
	}

	m.setPluginStatus(plugin.Name, PluginStatus{Phase: PhaseSynced, Version: plugin.Version})

	return true
}

// downloadClient returns an HTTP client carrying the TLS and auth settings of
// the catalog the plugin came from, so downloads from a private and/or
// self-signed Nexus work. Plugins without a known catalog use the defaults.
func (m *Manager) downloadClient(ctx context.Context, plugin DesiredPlugin) (*http.Client, error) {
	if plugin.Catalog != "" {
		if catalog, err := m.FindCatalog(plugin.Catalog); err == nil {
			return m.clientForCatalog(ctx, *catalog, downloadTimeout)
		}
	}

	return httpClientFor(Catalog{}, "", "", downloadTimeout)
}

// clientForCatalog builds an HTTP client for a catalog, resolving the Basic
// auth password from the referenced Secret when one is configured.
func (m *Manager) clientForCatalog(ctx context.Context, catalog Catalog, timeout time.Duration,
) (*http.Client, error) {
	password, err := m.resolvePassword(ctx, catalog)
	if err != nil {
		return nil, err
	}

	return httpClientFor(catalog, catalog.Username, password, timeout)
}

// resolvePassword reads the Basic auth password from the catalog's Secret.
// It returns an empty string when the catalog references no Secret.
func (m *Manager) resolvePassword(ctx context.Context, catalog Catalog) (string, error) {
	if catalog.PasswordSecret == "" {
		return "", nil
	}

	secret, err := m.clientset.CoreV1().Secrets(m.Namespace).Get(ctx, catalog.PasswordSecret, metav1.GetOptions{})
	if err != nil {
		return "", fmt.Errorf("reading password secret %q: %w", catalog.PasswordSecret, err)
	}

	password, ok := secret.Data["password"]
	if !ok {
		return "", fmt.Errorf("password secret %q has no \"password\" key", catalog.PasswordSecret)
	}

	return string(password), nil
}

func (m *Manager) setPluginStatus(name string, status PluginStatus) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.status.Plugins[name] = status
}

func (m *Manager) pruneStatusLocked(desired map[string]DesiredPlugin) {
	for name := range m.status.Plugins {
		if _, ok := desired[name]; !ok {
			delete(m.status.Plugins, name)
		}
	}
}

// CurrentState returns a copy of the desired state and this replica's status.
func (m *Manager) CurrentState() (State, Status) {
	m.mu.Lock()
	defer m.mu.Unlock()

	state := State{}
	if m.state != nil {
		state = *m.state
	}

	status := m.status
	status.Plugins = map[string]PluginStatus{}

	for name, pluginStatus := range m.status.Plugins {
		status.Plugins[name] = pluginStatus
	}

	return state, status
}

// FindCatalog returns the catalog with the given ID from the current state.
func (m *Manager) FindCatalog(id string) (*Catalog, error) {
	state, _ := m.CurrentState()

	for i := range state.Catalogs {
		if state.Catalogs[i].ID == id {
			return &state.Catalogs[i], nil
		}
	}

	return nil, fmt.Errorf("catalog %q not found", id)
}
