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
	"maps"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	apisv1alpha1 "sigs.k8s.io/cluster-inventory-api/apis/v1alpha1"
	ciaclient "sigs.k8s.io/cluster-inventory-api/client/clientset/versioned"
	ciascredentials "sigs.k8s.io/cluster-inventory-api/pkg/credentials"
)

const clusterInventoryPrefix = "cluster-inventory-"

// Reserved extension key defined by Kubernetes exec auth API (SIG Auth).
// This is used to pass per-cluster exec plugin config through to ExecCredential.Spec.Cluster.Config.
const clusterExecConfigExtensionKey = "client.authentication.k8s.io/exec"

// clusterDiscoverer holds state for recursive ClusterProfile discovery with cycle detection.
type clusterDiscoverer struct {
	store        kubeconfig.ContextStore
	credProvider *ciascredentials.CredentialsProvider
	visited      atomic.Pointer[sync.Map] // key: server URL (string), value: struct{} — for loop detection
	mu           sync.Mutex
	// contextNames maps a discovery path to the context name stored in the ContextStore.
	// Keys use "/" as separator throughout; contextNameFromPath converts all "/" to "--"
	// when generating the DNS-friendly context name.
	// Key formats:
	//   hubConfig (in-cluster): "ns/name"             (e.g. "kube-system/prod-cluster")
	//   seedsFromStore:         "seedName/ns/name"     (e.g. "minikube/default/remote")
	//   Spoke:                  "parent/ns/name"       (e.g. "kube-system/hub/default/spoke1")
	contextNames   map[string]string
	rescanInterval time.Duration
	// noCRDServers tracks server URLs where the ClusterProfile CRD is not installed.
	// Checked before attempting API calls to avoid repeated 404/discovery errors.
	// Cleared periodically based on noCRDCacheTTL so that newly installed CRDs are detected.
	noCRDServers     sync.Map // key: normalized server URL (string), value: struct{}
	noCRDCacheTTL    time.Duration
	noCRDLastCleared time.Time
}

func newClusterDiscoverer(
	store kubeconfig.ContextStore,
	credProvider *ciascredentials.CredentialsProvider,
	rescanInterval time.Duration,
	noCRDCacheTTL time.Duration,
) *clusterDiscoverer {
	d := &clusterDiscoverer{
		store:            store,
		credProvider:     credProvider,
		contextNames:     make(map[string]string),
		rescanInterval:   rescanInterval,
		noCRDCacheTTL:    noCRDCacheTTL,
		noCRDLastCleared: time.Now(),
	}
	d.resetVisited() // initialize with empty map

	return d
}

// loadVisited returns the current visited map.
func (d *clusterDiscoverer) loadVisited() *sync.Map {
	return d.visited.Load()
}

// resetVisited atomically replaces the visited map with a new empty one.
func (d *clusterDiscoverer) resetVisited() {
	d.visited.Store(&sync.Map{})
}

const (
	defaultRescanInterval = 5 * time.Minute
	defaultNoCRDCacheTTL  = 2 * time.Hour
)

// Discover periodically discovers ClusterProfile resources and syncs them
// into the context store. It runs until ctx is cancelled.
//
// hubConfig, when non-nil, is used as the primary seed for discovery (e.g.
// an in-cluster REST config). Keys use the short form "ns/name".
//
// When seedsFromStore is true, contexts already in the store (kubeconfig,
// dynamic clusters) are also used as seeds; contexts with Source ==
// ClusterInventory are skipped to avoid re-scanning previously-discovered
// clusters. Keys use "seedName/ns/name" to disambiguate.
func Discover(
	ctx context.Context,
	store kubeconfig.ContextStore,
	providerFile string,
	rescanInterval time.Duration,
	noCRDCacheTTL time.Duration,
	hubConfig *rest.Config,
	seedsFromStore bool,
) {
	if providerFile == "" {
		logger.Log(logger.LevelWarn, nil, nil,
			"cluster-inventory: provider file path is empty; skipping ClusterProfile discovery")
		return
	}

	credProvider, err := ciascredentials.NewFromFile(providerFile)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"path": providerFile}, err,
			"cluster-inventory: failed to load provider file")
		return
	}

	if noCRDCacheTTL <= 0 {
		noCRDCacheTTL = defaultNoCRDCacheTTL
	}

	d := newClusterDiscoverer(store, credProvider, rescanInterval, noCRDCacheTTL)

	if d.rescanInterval <= 0 {
		d.rescanInterval = defaultRescanInterval
	}

	// Initial discovery pass.
	d.discoverOnce(ctx, hubConfig, seedsFromStore)

	ticker := time.NewTicker(d.rescanInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.discoverOnce(ctx, hubConfig, seedsFromStore)
		}
	}
}

// discoverOnce performs one full discovery pass: processes the hub config
// and/or store-derived seeds, then removes any contexts that are no longer present.
func (d *clusterDiscoverer) discoverOnce(
	ctx context.Context,
	hubConfig *rest.Config,
	seedsFromStore bool,
) {
	d.mu.Lock()
	oldKeys := make(map[string]string, len(d.contextNames))
	maps.Copy(oldKeys, d.contextNames)

	d.contextNames = make(map[string]string)
	d.mu.Unlock()

	// resetVisited is called outside mu because visited is managed via atomic
	// pointer swap (independent of mu). Any race with concurrent
	// syncOneClusterProfile is benign: duplicate AddContext calls are idempotent
	// (the store overwrites with the latest config).
	d.resetVisited()

	// Clear the noCRD cache periodically so that newly installed CRDs are
	// eventually detected without requiring a pod restart.
	if time.Since(d.noCRDLastCleared) >= d.noCRDCacheTTL {
		d.noCRDServers.Clear()
		d.noCRDLastCleared = time.Now()
	}

	// Process hub config (in-cluster seed with empty name → short key format).
	if hubConfig != nil {
		d.discoverFromSeed(ctx, "", hubConfig)
	}

	// Process store-derived seeds.
	if seedsFromStore {
		d.discoverFromStoreSeeds(ctx)
	}

	// Remove contexts that were present in the old map but not the new one.
	d.mu.Lock()
	defer d.mu.Unlock()

	for key, ctxName := range oldKeys {
		if _, stillPresent := d.contextNames[key]; !stillPresent {
			if err := d.store.RemoveContext(ctxName); err != nil {
				logger.Log(logger.LevelError, map[string]string{"context": ctxName}, err,
					"cluster-inventory: error removing context")
			}
		}
	}
}

// discoverFromStoreSeeds iterates over contexts in the store, skipping
// ClusterInventory-sourced ones, and discovers ClusterProfiles from each.
func (d *clusterDiscoverer) discoverFromStoreSeeds(ctx context.Context) {
	contexts, err := d.store.GetContexts()
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err,
			"cluster-inventory: failed to get contexts from store")
		return
	}

	for _, hctx := range contexts {
		// Skip ClusterInventory-sourced contexts to avoid
		// re-scanning previously-discovered clusters as seeds.
		if hctx.Source == kubeconfig.ClusterInventory {
			continue
		}

		seedConfig, err := hctx.RESTConfig()
		if err != nil {
			logger.Log(logger.LevelInfo, map[string]string{"context": hctx.Name}, err,
				"cluster-inventory: skipping context; failed to get rest config")
			continue
		}

		d.discoverFromSeed(ctx, hctx.Name, seedConfig)
	}
}

// discoverFromSeed lists ClusterProfiles on the given seed cluster and syncs
// each, then recursively discovers from spokes. The seedName is used as a key
// prefix (empty for in-cluster hub).
func (d *clusterDiscoverer) discoverFromSeed(ctx context.Context, seedName string, config *rest.Config) {
	serverURL := normalizeServerURL(config.Host)
	if _, loaded := d.loadVisited().LoadOrStore(serverURL, struct{}{}); loaded {
		return
	}

	// Skip servers that are known not to have the ClusterProfile CRD.
	if _, noCRD := d.noCRDServers.Load(serverURL); noCRD {
		return
	}

	cic, err := ciaclient.NewForConfig(config)
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"seed": seedName, "server": config.Host}, err,
			"cluster-inventory: failed to create ClusterProfile client for seed")
		return
	}

	list, err := cic.ApisV1alpha1().ClusterProfiles(metav1.NamespaceAll).List(ctx, metav1.ListOptions{})
	if err != nil {
		if isNotFoundOrNoResource(err) {
			d.noCRDServers.Store(serverURL, struct{}{})
			logger.Log(logger.LevelInfo, map[string]string{"seed": seedName}, nil,
				"cluster-inventory: ClusterProfile CRD not present on seed; skipping")

			return
		}

		logger.Log(logger.LevelWarn, map[string]string{"seed": seedName}, err,
			"cluster-inventory: failed to list ClusterProfiles on seed")

		return
	}

	for i := range list.Items {
		cp := &list.Items[i]
		key := buildKey(seedName, cp.Namespace, cp.Name)
		d.syncOneClusterProfile(ctx, key, cp)
	}
}

// buildKey creates the contextNames map key for a ClusterProfile.
// When seedName is empty (e.g. in-cluster mode), the key is "ns/name".
// When seedName is set (e.g. store mode), the key is "seedName/ns/name".
func buildKey(seedName, namespace, name string) string {
	if seedName == "" {
		return namespace + "/" + name
	}

	return seedName + "/" + namespace + "/" + name
}

func (d *clusterDiscoverer) syncOneClusterProfile(
	ctx context.Context,
	key string,
	cp *apisv1alpha1.ClusterProfile,
) {
	ctxName := contextNameFromPath(key)

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

	d.discoverSpokeClusters(ctx, restCfg, key)
}

// discoverSpokeClusters lists ClusterProfiles on the given spoke cluster and recursively syncs and discovers.
// Already-visited server URLs are skipped to prevent loops.
func (d *clusterDiscoverer) discoverSpokeClusters(ctx context.Context, spokeConfig *rest.Config, parentPath string) {
	serverURL := normalizeServerURL(spokeConfig.Host)
	if _, loaded := d.loadVisited().LoadOrStore(serverURL, struct{}{}); loaded {
		return // already visited — loop detected, skip
	}

	// Skip servers that are known not to have the ClusterProfile CRD.
	if _, noCRD := d.noCRDServers.Load(serverURL); noCRD {
		return
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
			d.noCRDServers.Store(serverURL, struct{}{})
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
	path := parentPath + "/" + cp.Namespace + "/" + cp.Name
	d.syncOneClusterProfile(ctx, path, cp)
}

func isNotFoundOrNoResource(err error) bool {
	if err == nil {
		return false
	}

	// Use typed API errors when the server returns a proper Status response.
	if apierrors.IsNotFound(err) {
		return true
	}

	// "no matches for kind" is returned by client-go's discovery layer as a plain error
	// (not a StatusError) when the CRD/API group is not installed, so we fall back to
	// string matching for this specific case.
	return strings.Contains(err.Error(), "no matches for kind")
}

func normalizeServerURL(host string) string {
	return strings.TrimRight(host, "/")
}

// contextNameFromPath builds a DNS-friendly context name from a path (e.g. "ns/name" or "parent--ns--name").
func contextNameFromPath(path string) string {
	name := clusterInventoryPrefix + strings.ReplaceAll(path, "/", "--")
	return kubeconfig.MakeDNSFriendly(name)
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
	// Note: BuildConfigFromCP guarantees that ExecProvider.Config satisfies k8sruntime.Object,
	// so the assignment to cluster.Extensions (map[string]k8sruntime.Object) is type-safe
	// without an additional type assertion.
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
