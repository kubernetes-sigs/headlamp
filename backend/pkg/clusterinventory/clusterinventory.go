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

package clusterinventory

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	apisv1alpha1 "sigs.k8s.io/cluster-inventory-api/apis/v1alpha1"
	ciaclient "sigs.k8s.io/cluster-inventory-api/client/clientset/versioned"
	apistyped "sigs.k8s.io/cluster-inventory-api/client/clientset/versioned/typed/apis/v1alpha1"
	ciascredentials "sigs.k8s.io/cluster-inventory-api/pkg/credentials"
)

const clusterInventoryPrefix = "cluster-inventory-"

// Reserved extension key defined by Kubernetes exec auth API (SIG Auth).
// This is used to pass per-cluster exec plugin config through to ExecCredential.Spec.Cluster.Config.
const clusterExecConfigExtensionKey = "client.authentication.k8s.io/exec"

// clusterDiscoverer holds state for recursive ClusterProfile discovery with cycle detection.
type clusterDiscoverer struct {
	store          kubeconfig.ContextStore
	credProvider   *ciascredentials.CredentialsProvider
	visited        sync.Map // key: server URL (string), value: struct{} — for loop detection
	mu             sync.Mutex
	contextNames   map[string]string // key = path (e.g. "ns/name" or "parent--ns--name"), value = context name
	rescanInterval time.Duration
}

// WatchAndSync loads the ClusterProfile access-provider config, lists and watches
// ClusterProfile resources on the hub (and recursively on spokes), and syncs them
// into the given context store. It runs until the context is cancelled.
// Loop detection is done by tracking visited API server URLs; spokes are rescanned periodically.
func WatchAndSync(
	ctx context.Context,
	store kubeconfig.ContextStore,
	providerFile string,
	rescanInterval time.Duration,
) {
	if providerFile == "" {
		logger.Log(logger.LevelWarn, nil, nil, "cluster-inventory: provider file path is empty; skipping ClusterProfile sync")
		return
	}

	credProvider, err := ciascredentials.NewFromFile(providerFile)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"path": providerFile}, err,
			"cluster-inventory: failed to load provider file")
		return
	}

	hubConfig, err := rest.InClusterConfig()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "cluster-inventory: failed to get in-cluster config")
		return
	}

	d := &clusterDiscoverer{
		store:          store,
		credProvider:   credProvider,
		contextNames:   make(map[string]string),
		rescanInterval: rescanInterval,
	}

	// Mark hub as visited so we never recurse back to it from a spoke (loop detection).
	d.visited.Store(normalizeServerURL(hubConfig.Host), struct{}{})

	cic, err := ciaclient.NewForConfig(hubConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "cluster-inventory: failed to create ClusterProfile client")
		return
	}

	cpInterface := cic.ApisV1alpha1().ClusterProfiles(metav1.NamespaceAll)

	// Initial full discovery (hub + recursive spokes).
	d.runFullDiscovery(ctx, hubConfig, cpInterface)

	// Periodic rescan of spokes (full discovery again to pick up changes on spokes).
	if d.rescanInterval > 0 {
		go d.periodicRescan(ctx, hubConfig, cpInterface)
	}

	// Watch hub for add/modify/delete.
	d.watchHub(ctx, cpInterface)
}

func (d *clusterDiscoverer) watchHub(ctx context.Context, cpInterface apistyped.ClusterProfileInterface) {
	watcher, err := cpInterface.Watch(ctx, metav1.ListOptions{})
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "cluster-inventory: failed to watch ClusterProfiles")
		return
	}
	defer watcher.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-watcher.ResultChan():
			if !ok {
				logger.Log(logger.LevelWarn, nil, nil, "cluster-inventory: watch channel closed")
				return
			}

			d.handleHubEvent(ctx, event)
		}
	}
}

func (d *clusterDiscoverer) handleHubEvent(ctx context.Context, event watch.Event) {
	switch event.Type {
	case watch.Added, watch.Modified:
		if cp, ok := event.Object.(*apisv1alpha1.ClusterProfile); ok {
			d.syncOneHub(ctx, cp)
		}
	case watch.Deleted:
		if cp, ok := event.Object.(*apisv1alpha1.ClusterProfile); ok {
			d.removeOne(cp.Namespace + "/" + cp.Name)
		}
	case watch.Bookmark:
		// no-op
	case watch.Error:
		if status, ok := event.Object.(*metav1.Status); ok {
			logger.Log(logger.LevelWarn, map[string]string{
				"reason":  string(status.Reason),
				"message": status.Message,
			}, nil, "cluster-inventory: watch error event")

			return
		}

		logger.Log(logger.LevelWarn, nil, nil, "cluster-inventory: watch error event")
	}
}

// DiscoverFromStore discovers ClusterProfiles from every context already in the store
// (e.g. kubeconfig, dynamic clusters). It does not require in-cluster mode. Each
// context is used as a seed: list ClusterProfiles on that cluster, add any found,
// and recursively discover from those. Periodic rescans walk all current contexts again.
// Use this for local runs (npm start) or desktop app so that ClusterProfile-based
// clusters appear alongside kubeconfig contexts.
func DiscoverFromStore(
	ctx context.Context,
	store kubeconfig.ContextStore,
	providerFile string,
	rescanInterval time.Duration,
) {
	if providerFile == "" {
		logger.Log(logger.LevelWarn, nil, nil,
			"cluster-inventory: provider file path is empty; skipping ClusterProfile discovery from store")
		return
	}

	credProvider, err := ciascredentials.NewFromFile(providerFile)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"path": providerFile}, err,
			"cluster-inventory: failed to load provider file")
		return
	}

	d := &clusterDiscoverer{
		store:          store,
		credProvider:   credProvider,
		contextNames:   make(map[string]string),
		rescanInterval: rescanInterval,
	}

	if d.rescanInterval <= 0 {
		d.rescanInterval = 5 * time.Minute
	}

	ticker := time.NewTicker(d.rescanInterval)
	defer ticker.Stop()

	d.discoverFromStoreOnce(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.discoverFromStoreOnce(ctx)
		}
	}
}

func (d *clusterDiscoverer) discoverFromStoreOnce(ctx context.Context) {
	d.mu.Lock()
	oldKeys := make(map[string]string, len(d.contextNames))

	for k, v := range d.contextNames {
		oldKeys[k] = v
	}

	d.contextNames = make(map[string]string)
	d.mu.Unlock()

	d.visited.Range(func(k, _ interface{}) bool {
		d.visited.Delete(k)
		return true
	})

	contexts, err := d.store.GetContexts()
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "cluster-inventory: failed to get contexts from store")
		return
	}

	for _, hctx := range contexts {
		seedConfig, err := hctx.RESTConfig()
		if err != nil {
			logger.Log(logger.LevelInfo, map[string]string{"context": hctx.Name}, err,
				"cluster-inventory: failed to get rest config for seed context; skipping")
			continue
		}

		d.runFullDiscoveryFromSeed(ctx, hctx.Name, seedConfig)
	}

	d.mu.Lock()
	defer d.mu.Unlock()

	for key, ctxName := range oldKeys {
		if _, stillPresent := d.contextNames[key]; !stillPresent {
			_ = d.store.RemoveContext(ctxName)
		}
	}
}

// runFullDiscoveryFromSeed lists ClusterProfiles on the given seed cluster (from store)
// and syncs each, then recursively discovers from spokes.
func (d *clusterDiscoverer) runFullDiscoveryFromSeed(ctx context.Context, seedName string, seedConfig *rest.Config) {
	serverURL := normalizeServerURL(seedConfig.Host)
	if _, loaded := d.visited.LoadOrStore(serverURL, struct{}{}); loaded {
		return
	}

	cic, err := ciaclient.NewForConfig(seedConfig)
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"seed": seedName, "server": seedConfig.Host}, err,
			"cluster-inventory: failed to create ClusterProfile client for seed")
		return
	}

	list, err := cic.ApisV1alpha1().ClusterProfiles(metav1.NamespaceAll).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrNoResource(err) {
			logger.Log(logger.LevelInfo, map[string]string{"seed": seedName}, nil,
				"cluster-inventory: ClusterProfile CRD not present on seed; skipping")
			return
		}

		logger.Log(logger.LevelWarn, map[string]string{"seed": seedName}, err,
			"cluster-inventory: failed to list ClusterProfiles on seed")

		return
	}

	for i := range list.Items {
		d.syncOneFromSeed(ctx, seedName, &list.Items[i])
	}
}

// syncOneFromSeed adds or updates one ClusterProfile discovered from a seed context and recursively discovers spokes.
func (d *clusterDiscoverer) syncOneFromSeed(ctx context.Context, seedName string, cp *apisv1alpha1.ClusterProfile) {
	key := seedName + "--" + cp.Namespace + "/" + cp.Name
	d.syncOneClusterProfile(ctx, key, key, cp)
}

func (d *clusterDiscoverer) syncOneClusterProfile(
	ctx context.Context,
	key, path string,
	cp *apisv1alpha1.ClusterProfile,
) {
	ctxName := contextNameFromPath(path)

	restCfg, err := d.credProvider.BuildConfigFromCP(cp)
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"clusterprofile": key}, err,
			"cluster-inventory: failed to build config for ClusterProfile")
		return
	}

	headlampContext, err := restConfigToContext(restCfg, ctxName, key)
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"clusterprofile": key}, err,
			"cluster-inventory: failed to build context")
		return
	}

	if err := headlampContext.SetupProxy(); err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"clusterprofile": key}, err,
			"cluster-inventory: failed to setup proxy")
		return
	}

	if err := d.store.AddContext(headlampContext); err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"clusterprofile": key}, err,
			"cluster-inventory: failed to add context")
		return
	}

	d.mu.Lock()
	d.contextNames[key] = ctxName
	d.mu.Unlock()

	d.discoverSpokeClusters(ctx, restCfg, path)
}

// periodicRescan runs full discovery at rescanInterval to pick up spoke changes.
func (d *clusterDiscoverer) periodicRescan(
	ctx context.Context,
	hubConfig *rest.Config,
	cpInterface apistyped.ClusterProfileInterface,
) {
	ticker := time.NewTicker(d.rescanInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.runFullDiscovery(ctx, hubConfig, cpInterface)
		}
	}
}

// runFullDiscovery lists hub ClusterProfiles, syncs each (and recursively spokes),
// then removes any context no longer present.
func (d *clusterDiscoverer) runFullDiscovery(
	ctx context.Context,
	hubConfig *rest.Config,
	cpInterface apistyped.ClusterProfileInterface,
) {
	d.mu.Lock()
	oldKeys := make(map[string]string, len(d.contextNames))

	for k, v := range d.contextNames {
		oldKeys[k] = v
	}

	d.contextNames = make(map[string]string)
	d.mu.Unlock()

	// Clear visited so this rescan re-discovers all spokes; re-mark hub as visited.
	d.visited.Range(func(k, _ interface{}) bool {
		d.visited.Delete(k)
		return true
	})
	d.visited.Store(normalizeServerURL(hubConfig.Host), struct{}{})

	list, err := cpInterface.List(ctx, metav1.ListOptions{})
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "cluster-inventory: failed to list ClusterProfiles")
		return
	}

	for i := range list.Items {
		d.syncOneHub(ctx, &list.Items[i])
	}

	d.mu.Lock()
	defer d.mu.Unlock()

	for key, ctxName := range oldKeys {
		if _, stillPresent := d.contextNames[key]; !stillPresent {
			_ = d.store.RemoveContext(ctxName)
		}
	}
}

// syncOneHub adds or updates one hub ClusterProfile and recursively discovers spokes.
func (d *clusterDiscoverer) syncOneHub(ctx context.Context, cp *apisv1alpha1.ClusterProfile) {
	key := cp.Namespace + "/" + cp.Name
	d.syncOneClusterProfile(ctx, key, key, cp)
}

// discoverSpokeClusters lists ClusterProfiles on the given spoke cluster and recursively syncs and discovers.
// Already-visited server URLs are skipped to prevent loops.
func (d *clusterDiscoverer) discoverSpokeClusters(ctx context.Context, spokeConfig *rest.Config, parentPath string) {
	serverURL := normalizeServerURL(spokeConfig.Host)
	if _, loaded := d.visited.LoadOrStore(serverURL, struct{}{}); loaded {
		return // already visited — loop detected, skip
	}

	cic, err := ciaclient.NewForConfig(spokeConfig)
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"server": spokeConfig.Host}, err,
			"cluster-inventory: failed to create ClusterProfile client for spoke")
		return
	}

	list, err := cic.ApisV1alpha1().ClusterProfiles(metav1.NamespaceAll).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrNoResource(err) {
			logger.Log(logger.LevelInfo, map[string]string{"server": spokeConfig.Host}, nil,
				"cluster-inventory: ClusterProfile CRD not present on spoke; skipping")
			return
		}

		logger.Log(logger.LevelWarn, map[string]string{"server": spokeConfig.Host}, err,
			"cluster-inventory: failed to list ClusterProfiles on spoke")

		return
	}

	for i := range list.Items {
		d.syncOneSpoke(ctx, parentPath, &list.Items[i])
	}
}

func (d *clusterDiscoverer) syncOneSpoke(ctx context.Context, parentPath string, cp *apisv1alpha1.ClusterProfile) {
	path := parentPath + "--" + cp.Namespace + "--" + cp.Name
	d.syncOneClusterProfile(ctx, path, path, cp)
}

func isNotFoundOrNoResource(err error) bool {
	if err == nil {
		return false
	}
	// NoResourceMatch / 404 when CRD or API not installed
	return strings.Contains(err.Error(), "404") ||
		strings.Contains(err.Error(), "the server could not find the requested resource") ||
		strings.Contains(err.Error(), "no matches for kind")
}

func normalizeServerURL(host string) string {
	return strings.TrimRight(host, "/")
}

// removeOne removes a context by its key (e.g. "namespace/name" for hub).
func (d *clusterDiscoverer) removeOne(key string) {
	d.mu.Lock()
	ctxName, ok := d.contextNames[key]

	if ok {
		delete(d.contextNames, key)
	}
	d.mu.Unlock()

	if !ok {
		return
	}

	if err := d.store.RemoveContext(ctxName); err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"context": ctxName}, err,
			"cluster-inventory: failed to remove context")
	}
}

func contextNameForClusterProfile(cp *apisv1alpha1.ClusterProfile) string {
	name := clusterInventoryPrefix + cp.Namespace + "-" + cp.Name
	return makeDNSFriendly(name)
}

// contextNameFromPath builds a DNS-friendly context name from a path (e.g. "ns/name" or "parent--ns--name").
func contextNameFromPath(path string) string {
	name := clusterInventoryPrefix + strings.ReplaceAll(path, "/", "--")
	return makeDNSFriendly(name)
}

func makeDNSFriendly(name string) string {
	name = strings.ReplaceAll(name, "/", "--")
	name = strings.ReplaceAll(name, " ", "__")

	return name
}

// restConfigToContext builds a Headlamp kubeconfig.Context from a rest.Config
// produced by cluster-inventory-api credentials.BuildConfigFromCP (exec plugin).
func restConfigToContext(restConfig *rest.Config, contextName, clusterID string) (*kubeconfig.Context, error) {
	if restConfig == nil {
		return nil, errors.New("restConfig is nil")
	}

	if contextName == "" {
		return nil, errors.New("contextName is empty")
	}

	if clusterID == "" {
		return nil, errors.New("clusterID is empty")
	}

	cluster := &api.Cluster{
		Server:                   restConfig.Host,
		CertificateAuthorityData: restConfig.TLSClientConfig.CAData,
		InsecureSkipTLSVerify:    restConfig.TLSClientConfig.Insecure,
	}
	if restConfig.TLSClientConfig.CAFile != "" {
		cluster.CertificateAuthority = restConfig.TLSClientConfig.CAFile
	}

	// ExecConfig.Config is not serialized; it is sourced from Cluster extensions.
	// Ensure the reserved exec extension is propagated so client-go passes it to the exec plugin.
	if restConfig.ExecProvider != nil && restConfig.ExecProvider.Config != nil {
		if cluster.Extensions == nil {
			cluster.Extensions = map[string]k8sruntime.Object{}
		}

		cluster.Extensions[clusterExecConfigExtensionKey] = restConfig.ExecProvider.Config
	}

	authInfo := &api.AuthInfo{}
	if restConfig.ExecProvider != nil {
		authInfo.Exec = &api.ExecConfig{
			APIVersion:         restConfig.ExecProvider.APIVersion,
			Command:            restConfig.ExecProvider.Command,
			Args:               restConfig.ExecProvider.Args,
			Env:                restConfig.ExecProvider.Env,
			InteractiveMode:    api.NeverExecInteractiveMode,
			ProvideClusterInfo: restConfig.ExecProvider.ProvideClusterInfo,
			Config:             restConfig.ExecProvider.Config,
		}
	} else if restConfig.BearerToken != "" {
		authInfo.Token = restConfig.BearerToken
	}

	kubeContext := &api.Context{
		Cluster:  contextName,
		AuthInfo: contextName,
	}

	return &kubeconfig.Context{
		Name:           contextName,
		KubeContext:    kubeContext,
		Cluster:        cluster,
		AuthInfo:       authInfo,
		Source:         kubeconfig.ClusterInventory,
		KubeConfigPath: "",
		ClusterID:      "cluster-inventory/" + clusterID,
	}, nil
}
