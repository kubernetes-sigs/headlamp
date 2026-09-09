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

// Package clusterinventory discovers ClusterProfile resources and registers the
// clusters they publish.
package clusterinventory

import (
	"cmp"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"net/http"
	"net/url"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd/api"
	clientcmdlatest "k8s.io/client-go/tools/clientcmd/api/latest"

	inventorymetadata "github.com/kubernetes-sigs/headlamp/backend/pkg/clusterinventory/metadata"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterregistration"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	apisv1alpha1 "sigs.k8s.io/cluster-inventory-api/apis/v1alpha1"
	ciaclient "sigs.k8s.io/cluster-inventory-api/client/clientset/versioned"
	externalversions "sigs.k8s.io/cluster-inventory-api/client/informers/externalversions"
	"sigs.k8s.io/cluster-inventory-api/pkg/access"
)

const (
	// DefaultRootReconcileInterval is the default interval for reconciling Cluster Inventory roots.
	DefaultRootReconcileInterval = 5 * time.Minute
	// DefaultNoCRDCacheTTL is the default TTL for API servers that do not have the ClusterProfile CRD.
	DefaultNoCRDCacheTTL = 2 * time.Hour

	inClusterRootID = "in-cluster"
	storeRootPrefix = "store/"

	clusterExecConfigExtensionKey = "client.authentication.k8s.io/exec"

	// AuthTypeAccessProvider uses the configured Cluster Inventory exec provider.
	AuthTypeAccessProvider = "access-provider"

	registrationSource = "cluster-inventory"
)

// Structured-log field names that recur across many log sites.
const (
	logFieldRoot           = "root"
	logFieldClusterProfile = "clusterprofile"
	logFieldServer         = "server"
	logFieldNamespace      = "namespace"
	logFieldRegistration   = "registration"
)

// Options controls Cluster Inventory discovery.
type Options struct {
	// SeedStore holds the non-internal contexts that seed discovery roots. Nil discovers
	// from HubConfig only.
	SeedStore kubeconfig.ContextStore
	// Registry stores source-independent, routable cluster registrations.
	Registry *clusterregistration.Registry
	// ProviderFile is the Cluster Inventory access provider configuration file.
	ProviderFile string
	// AuthType selects per-user OIDC or access-provider authentication.
	AuthType string
	// AccessProviders is a comma-separated, ordered, exact provider-name allowlist.
	AccessProviders string
	// OIDCConfig is copied to OIDC-backed discovered contexts.
	OIDCConfig *kubeconfig.OidcConfig
	// LabelSelector filters ClusterProfile resources before they are synced.
	LabelSelector string
	// Namespaces limits ClusterProfile discovery as parsed by
	// [clusterregistration.ParseNamespaces]. Empty watches each root's default namespace.
	Namespaces string
	// RootReconcileInterval controls how often root clusters are reconciled.
	// Values less than or equal to zero use DefaultRootReconcileInterval.
	RootReconcileInterval time.Duration
	// NoCRDCacheTTL controls how long API servers without the ClusterProfile CRD are skipped.
	// Values less than or equal to zero use DefaultNoCRDCacheTTL.
	NoCRDCacheTTL time.Duration
	// HubConfig enables discovery from the in-cluster root when set.
	HubConfig *rest.Config
	// HubNamespace is the default namespace for the in-cluster root.
	HubNamespace string
	// HubCluster is the Headlamp cluster ID for the in-cluster discovery root.
	HubCluster string
}

// Runner watches ClusterProfile resources and syncs them into the shared registry.
type Runner struct {
	seedStore             kubeconfig.ContextStore
	registry              *clusterregistration.Registry
	accessConfig          *access.Config
	accessProviders       []string
	oidcConfig            *kubeconfig.OidcConfig
	rootReconcileInterval time.Duration
	noCRDCacheTTL         time.Duration
	labelSelector         labels.Selector
	namespaces            []string
	hubConfig             *rest.Config
	hubNamespace          string
	hubCluster            string

	clientForConfig func(*rest.Config) (ciaclient.Interface, error)
	now             func() time.Time

	mu                sync.Mutex
	roots             map[string]*rootState
	profiles          map[string]string
	profileKeysByRoot map[string]map[string]string
	noCRD             map[string]time.Time
}

// rootState tracks the active informers and identity for one discovery root.
type rootState struct {
	rootID        string
	serverURL     string
	fingerprint   string
	ctx           context.Context
	cancel        context.CancelFunc
	watches       []rootWatch
	originCluster string
}

// rootWatch pairs a ClusterProfile informer with the factory that owns it.
type rootWatch struct {
	namespace string
	factory   externalversions.SharedInformerFactory
	informer  cache.SharedIndexInformer
}

// rootConfig contains the Kubernetes client config and watched namespaces for one root.
type rootConfig struct {
	restConfig    *rest.Config
	namespaces    []string
	originCluster string
}

// NewRunner validates options and returns a discovery runner.
func NewRunner(opts Options) (*Runner, error) {
	if opts.HubConfig != nil && opts.HubCluster == "" {
		return nil, errors.New("hub cluster is required for in-cluster discovery")
	}

	var accessConfig *access.Config

	if opts.AuthType == AuthTypeAccessProvider {
		var err error

		accessConfig, err = access.NewFromFile(opts.ProviderFile)
		if err != nil {
			return nil, fmt.Errorf("load provider file: %w", err)
		}
	}

	labelSelector, namespaces, err := clusterregistration.ParseSelectors(opts.LabelSelector, opts.Namespaces)
	if err != nil {
		return nil, err
	}

	rootReconcileInterval := opts.RootReconcileInterval
	if rootReconcileInterval <= 0 {
		rootReconcileInterval = DefaultRootReconcileInterval
	}

	noCRDCacheTTL := opts.NoCRDCacheTTL
	if noCRDCacheTTL <= 0 {
		noCRDCacheTTL = DefaultNoCRDCacheTTL
	}

	return &Runner{
		seedStore:             opts.SeedStore,
		registry:              opts.Registry,
		accessConfig:          accessConfig,
		accessProviders:       parseAccessProviders(opts.AccessProviders),
		oidcConfig:            opts.OIDCConfig,
		rootReconcileInterval: rootReconcileInterval,
		noCRDCacheTTL:         noCRDCacheTTL,
		labelSelector:         labelSelector,
		namespaces:            namespaces,
		hubConfig:             opts.HubConfig,
		hubNamespace:          opts.HubNamespace,
		hubCluster:            opts.HubCluster,
		clientForConfig: func(config *rest.Config) (ciaclient.Interface, error) {
			return ciaclient.NewForConfig(config)
		},
		now:               time.Now,
		roots:             map[string]*rootState{},
		profiles:          map[string]string{},
		profileKeysByRoot: map[string]map[string]string{},
		noCRD:             map[string]time.Time{},
	}, nil
}

// Run blocks until ctx is cancelled and reconciles long-lived root informers.
func (r *Runner) Run(ctx context.Context) {
	defer r.stopAllRoots()

	r.reconcileRoots(ctx)

	ticker := time.NewTicker(r.rootReconcileInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.reconcileRoots(ctx)
		}
	}
}

// reconcileRoots computes the desired discovery roots and reconciles informers for them.
func (r *Runner) reconcileRoots(ctx context.Context) {
	if err := ctx.Err(); err != nil {
		return
	}

	presentRoots := map[string]struct{}{}
	desiredRoots := map[string]rootConfig{}
	storeRootsLoaded := true

	if r.hubConfig != nil {
		presentRoots[inClusterRootID] = struct{}{}
		desiredRoots[inClusterRootID] = rootConfig{
			restConfig:    r.hubConfig,
			namespaces:    clusterregistration.NamespacesOrDefault(r.namespaces, r.hubNamespace),
			originCluster: r.hubCluster,
		}
	}

	if r.seedStore != nil {
		storeRootsLoaded = r.collectStoreSeedRoots(desiredRoots, presentRoots)
	}

	r.stopMissingRoots(presentRoots, storeRootsLoaded)

	rootIDs := make([]string, 0, len(desiredRoots))
	for rootID := range desiredRoots {
		rootIDs = append(rootIDs, rootID)
	}

	sort.Strings(rootIDs)

	for _, rootID := range rootIDs {
		r.reconcileRoot(ctx, rootID, desiredRoots[rootID])
	}
}

// collectStoreSeedRoots adds existing non-internal Headlamp contexts as discovery roots.
func (r *Runner) collectStoreSeedRoots(
	desiredRoots map[string]rootConfig,
	presentRoots map[string]struct{},
) bool {
	contexts, err := r.seedStore.GetContexts()
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "cluster-inventory: failed to get seed contexts")

		return false
	}

	sort.Slice(contexts, func(i, j int) bool {
		return contexts[i].Name < contexts[j].Name
	})

	for _, headlampContext := range contexts {
		if headlampContext.Internal {
			continue
		}

		rootID := storeRootPrefix + headlampContext.Name
		presentRoots[rootID] = struct{}{}

		seedConfig, err := headlampContext.RESTConfig()
		if err != nil {
			logger.Log(logger.LevelWarn, map[string]string{"context": headlampContext.Name}, err,
				"cluster-inventory: failed to build seed rest config")

			continue
		}

		desiredRoots[rootID] = rootConfig{
			restConfig: seedConfig,
			namespaces: clusterregistration.NamespacesOrDefault(
				r.namespaces, headlampContext.KubeContext.Namespace),
			originCluster: headlampContext.Name,
		}
	}

	return true
}

// reconcileRoot ensures one discovery root has a matching active ClusterProfile informer.
func (r *Runner) reconcileRoot(ctx context.Context, rootID string, root rootConfig) {
	if root.restConfig == nil {
		return
	}

	if err := ctx.Err(); err != nil {
		return
	}

	serverURL := normalizeServerURL(root.restConfig.Host)
	if r.hasNoCRD(serverURL) {
		r.stopRoot(rootID, true)

		return
	}

	fingerprint := rootFingerprint(root)
	if r.rootMatches(rootID, serverURL, fingerprint) {
		return
	}

	state, ok := r.newRootState(ctx, rootID, serverURL, fingerprint, root)
	if !ok {
		return
	}

	previous, current := r.activateRoot(state)
	if current {
		state.cancel()

		return
	}

	if previous != nil {
		previous.cancel()
	}

	go r.runRootInformer(state)
}

// rootMatches reports whether the active root already matches the given connection identity.
func (r *Runner) rootMatches(rootID, serverURL, fingerprint string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.roots[rootID]

	return current != nil && current.serverURL == serverURL && current.fingerprint == fingerprint
}

// newRootState creates unstarted ClusterProfile informers for a discovery root.
func (r *Runner) newRootState(
	ctx context.Context,
	rootID string,
	serverURL string,
	fingerprint string,
	root rootConfig,
) (*rootState, bool) {
	client, err := r.clientForConfig(rest.CopyConfig(root.restConfig))
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{logFieldRoot: rootID, logFieldServer: serverURL}, err,
			"cluster-inventory: failed to create client")

		return nil, false
	}

	rootCtx, cancel := context.WithCancel(ctx)
	state := &rootState{
		rootID:        rootID,
		serverURL:     serverURL,
		fingerprint:   fingerprint,
		ctx:           rootCtx,
		cancel:        cancel,
		watches:       make([]rootWatch, 0, len(root.namespaces)),
		originCluster: root.originCluster,
	}

	for _, namespace := range root.namespaces {
		watch, ok := r.newRootWatch(state, client, namespace)
		if !ok {
			cancel()

			return nil, false
		}

		state.watches = append(state.watches, watch)
	}

	return state, true
}

// newRootWatch creates an unstarted ClusterProfile informer for one namespace of a root.
func (r *Runner) newRootWatch(
	state *rootState,
	client ciaclient.Interface,
	namespace string,
) (rootWatch, bool) {
	options := r.clusterProfileInformerOptions(namespace)
	factory := externalversions.NewSharedInformerFactoryWithOptions(client, 0, options...)
	informer := factory.Apis().V1alpha1().ClusterProfiles().Informer()

	_, err := informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			r.handleClusterProfileUpsert(state, obj)
		},
		UpdateFunc: func(_, newObj interface{}) {
			r.handleClusterProfileUpsert(state, newObj)
		},
		DeleteFunc: func(obj interface{}) {
			r.handleClusterProfileDelete(state, obj)
		},
	})
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{logFieldRoot: state.rootID, logFieldServer: state.serverURL}, err,
			"cluster-inventory: failed to add ClusterProfile event handler")

		return rootWatch{}, false
	}

	if err := informer.SetWatchErrorHandler(func(_ *cache.Reflector, err error) {
		r.handleRootWatchError(state, namespace, err)
	}); err != nil {
		logger.Log(logger.LevelWarn, map[string]string{logFieldRoot: state.rootID, logFieldServer: state.serverURL}, err,
			"cluster-inventory: failed to set ClusterProfile watch error handler")

		return rootWatch{}, false
	}

	return rootWatch{namespace: namespace, factory: factory, informer: informer}, true
}

// clusterProfileInformerOptions returns informer options for one namespace of a root.
func (r *Runner) clusterProfileInformerOptions(namespace string) []externalversions.SharedInformerOption {
	selector := r.labelSelector.String()

	return []externalversions.SharedInformerOption{
		externalversions.WithNamespace(namespace),
		externalversions.WithTweakListOptions(func(listOptions *metav1.ListOptions) {
			listOptions.LabelSelector = selector
		}),
	}
}

// activateRoot records a root as active and returns any previous active root.
func (r *Runner) activateRoot(state *rootState) (*rootState, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	previous := r.roots[state.rootID]
	if previous != nil && previous.serverURL == state.serverURL && previous.fingerprint == state.fingerprint {
		return nil, true
	}

	r.roots[state.rootID] = state

	return previous, false
}

// runRootInformer starts each namespace informer and waits for shutdown.
func (r *Runner) runRootInformer(state *rootState) {
	defer func() {
		for _, watch := range state.watches {
			watch.factory.Shutdown()
		}
	}()

	for _, watch := range state.watches {
		logger.Log(logger.LevelInfo, map[string]string{
			logFieldRoot:      state.rootID,
			logFieldServer:    state.serverURL,
			logFieldNamespace: namespaceLogValue(watch.namespace),
		}, nil, "cluster-inventory: starting ClusterProfile watch")

		watch.factory.Start(state.ctx.Done())

		go r.waitForRootWatchSync(state, watch)
	}

	<-state.ctx.Done()
}

// waitForRootWatchSync prunes stale profiles after one namespace cache has synced.
func (r *Runner) waitForRootWatchSync(state *rootState, watch rootWatch) {
	if !cache.WaitForCacheSync(state.ctx.Done(), watch.informer.HasSynced) {
		return
	}

	r.completeRootWatchSyncFromCache(state, watch)
}

// handleClusterProfileUpsert registers an added or updated ClusterProfile.
func (r *Runner) handleClusterProfileUpsert(state *rootState, obj interface{}) {
	cp, ok := clusterregistration.ObjectFromEvent[*apisv1alpha1.ClusterProfile](obj)
	if !ok {
		logger.Log(logger.LevelWarn, map[string]string{logFieldRoot: state.rootID}, nil,
			"cluster-inventory: ignored non-ClusterProfile informer event")

		return
	}

	profileKey := makeProfileKey(state.rootID, cp)
	if !r.labelSelector.Matches(labels.Set(cp.Labels)) {
		r.dropClusterProfile(state, profileKey, true)

		return
	}

	if !r.recordRootProfile(state, profileKey, cp.Namespace) {
		return
	}

	r.syncClusterProfile(state.ctx, state, profileKey, cp)
}

// handleClusterProfileDelete removes the registration of a deleted ClusterProfile.
func (r *Runner) handleClusterProfileDelete(state *rootState, obj interface{}) {
	cp, ok := clusterregistration.ObjectFromEvent[*apisv1alpha1.ClusterProfile](obj)
	if !ok {
		logger.Log(logger.LevelWarn, map[string]string{logFieldRoot: state.rootID}, nil,
			"cluster-inventory: ignored non-ClusterProfile delete event")

		return
	}

	profileKey := makeProfileKey(state.rootID, cp)
	r.dropClusterProfile(state, profileKey, true)
}

// handleRootWatchError reacts to ClusterProfile watch errors for one namespace of a root.
func (r *Runner) handleRootWatchError(state *rootState, namespace string, err error) {
	if isNoCRDError(err) {
		r.markRootNoCRD(state)

		return
	}

	logger.Log(logger.LevelWarn, map[string]string{
		logFieldRoot:      state.rootID,
		logFieldServer:    state.serverURL,
		logFieldNamespace: namespace,
	}, err, "cluster-inventory: ClusterProfile watch error")
}

// syncClusterProfile converts a ClusterProfile to a Headlamp context and registers it.
func (r *Runner) syncClusterProfile(
	ctx context.Context,
	state *rootState,
	profileKey string,
	cp *apisv1alpha1.ClusterProfile,
) {
	if err := ctx.Err(); err != nil {
		return
	}

	if !r.isCurrentRoot(state) {
		return
	}

	headlampContext, ok := r.contextFromClusterProfile(profileKey, cp)
	if !ok {
		// Keep tracking the profile, so it is registered again once it recovers.
		r.dropClusterProfile(state, profileKey, false)

		return
	}

	registrationID, err := r.registry.Upsert(clusterregistration.Candidate{
		DisplayName: cmp.Or(strings.TrimSpace(cp.Spec.DisplayName), cp.Name),
		Source:      registrationSource,
		Origin: clusterregistration.OriginFor(
			state.originCluster,
			apisv1alpha1.GroupVersion.WithKind(apisv1alpha1.ClusterProfileKind),
			cp,
		),
		Context: headlampContext,
	})
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{logFieldClusterProfile: profileKey}, err,
			"cluster-inventory: failed to register cluster")

		return
	}

	if orphaned := r.recordSyncedProfile(state, profileKey, registrationID); orphaned != "" {
		r.removeRegistrations(orphaned)
	}
}

// contextFromClusterProfile builds a Headlamp context from a ClusterProfile access provider.
func (r *Runner) contextFromClusterProfile(
	profileKey string,
	cp *apisv1alpha1.ClusterProfile,
) (*kubeconfig.Context, bool) {
	provider, ok := selectAccessProvider(cp, r.accessProviders)
	if !ok {
		logger.Log(logger.LevelInfo, map[string]string{logFieldClusterProfile: profileKey}, nil,
			"cluster-inventory: ClusterProfile has no allowed access provider")

		return nil, false
	}

	if strings.TrimSpace(provider.Cluster.Server) == "" {
		logger.Log(logger.LevelInfo, map[string]string{logFieldClusterProfile: profileKey}, nil,
			"cluster-inventory: ClusterProfile access provider has no API server endpoint")

		return nil, false
	}

	headlampContext, err := r.clusterContext(provider, cp)
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{logFieldClusterProfile: profileKey}, err,
			"cluster-inventory: failed to build cluster connection")

		return nil, false
	}

	headlampContext.ClusterInventory = clusterInventoryMetadataFromProfile(profileKey, cp)

	return headlampContext, true
}

// clusterInventoryMetadataFromProfile copies non-sensitive ClusterProfile status metadata.
func clusterInventoryMetadataFromProfile(
	profileKey string,
	cp *apisv1alpha1.ClusterProfile,
) *inventorymetadata.Metadata {
	metadata := &inventorymetadata.Metadata{
		Profile: inventorymetadata.Profile{
			Namespace: cp.Namespace,
			Name:      cp.Name,
			Key:       profileKey,
		},
		Conditions: append([]metav1.Condition(nil), cp.Status.Conditions...),
	}

	if cp.Status.Version.Kubernetes != "" {
		metadata.Version = &inventorymetadata.Version{
			Kubernetes: cp.Status.Version.Kubernetes,
		}
	}

	if len(cp.Status.Properties) > 0 {
		metadata.Properties = make([]inventorymetadata.Property, len(cp.Status.Properties))
		for i, property := range cp.Status.Properties {
			metadata.Properties[i] = inventorymetadata.Property{
				Name:             property.Name,
				Value:            property.Value,
				LastObservedTime: property.LastObservedTime,
			}
		}
	}

	return metadata
}

// recordSyncedProfile stores the registration ID of a successfully synced ClusterProfile
// and returns the registration that is now orphaned, if any.
func (r *Runner) recordSyncedProfile(state *rootState, profileKey, registrationID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.roots[state.rootID] != state {
		return registrationID
	}

	previousID := r.profiles[profileKey]
	r.profiles[profileKey] = registrationID

	if previousID == registrationID {
		return ""
	}

	return previousID
}

// completeRootWatchSyncFromCache prunes profiles missing from one synced namespace cache.
func (r *Runner) completeRootWatchSyncFromCache(state *rootState, watch rootWatch) {
	seen := r.profileKeysFromRootWatch(state.rootID, watch)

	r.mu.Lock()
	if r.roots[state.rootID] != state {
		r.mu.Unlock()

		return
	}

	previous := r.profileKeysByRoot[state.rootID]

	var registrationIDs []string

	if watch.namespace == metav1.NamespaceAll {
		registrationIDs = r.syncAllNamespaceProfilesLocked(state.rootID, previous, seen)
	} else {
		registrationIDs = r.syncNamedNamespaceProfilesLocked(state, watch.namespace, previous, seen)
	}

	r.mu.Unlock()

	r.removeRegistrations(registrationIDs...)
}

func (r *Runner) profileKeysFromRootWatch(rootID string, watch rootWatch) map[string]string {
	seen := map[string]string{}

	for _, obj := range watch.informer.GetIndexer().List() {
		cp, ok := clusterregistration.ObjectFromEvent[*apisv1alpha1.ClusterProfile](obj)
		if !ok || !r.labelSelector.Matches(labels.Set(cp.Labels)) {
			continue
		}

		profileKey := makeProfileKey(rootID, cp)
		seen[profileKey] = cp.Namespace
	}

	return seen
}

func (r *Runner) syncAllNamespaceProfilesLocked(
	rootID string,
	previous map[string]string,
	seen map[string]string,
) []string {
	r.profileKeysByRoot[rootID] = seen
	registrationIDs := []string{}

	for profileKey := range previous {
		if _, ok := seen[profileKey]; ok {
			continue
		}

		registrationIDs = append(registrationIDs, r.pruneProfileLocked(profileKey)...)
	}

	return registrationIDs
}

func (r *Runner) syncNamedNamespaceProfilesLocked(
	state *rootState,
	namespace string,
	previous map[string]string,
	seen map[string]string,
) []string {
	next := make(map[string]string, len(previous)+len(seen))
	for profileKey, profileNamespace := range previous {
		next[profileKey] = profileNamespace
	}

	registrationIDs := []string{}

	for profileKey, profileNamespace := range previous {
		_, stillPresent := seen[profileKey]

		if profileNamespace != namespace && r.rootWatchesNamespace(state, profileNamespace) {
			continue
		}

		if profileNamespace == namespace && stillPresent {
			continue
		}

		delete(next, profileKey)
		registrationIDs = append(registrationIDs, r.pruneProfileLocked(profileKey)...)
	}

	for profileKey, profileNamespace := range seen {
		next[profileKey] = profileNamespace
	}

	r.profileKeysByRoot[state.rootID] = next

	return registrationIDs
}

// rootWatchesNamespace reports whether a root state intentionally watches a namespace.
func (r *Runner) rootWatchesNamespace(state *rootState, namespace string) bool {
	for _, watch := range state.watches {
		if watch.namespace == metav1.NamespaceAll || watch.namespace == namespace {
			return true
		}
	}

	return false
}

// recordRootProfile records that a current root has seen a ClusterProfile.
func (r *Runner) recordRootProfile(state *rootState, profileKey string, namespace string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.roots[state.rootID] != state {
		return false
	}

	if r.profileKeysByRoot[state.rootID] == nil {
		r.profileKeysByRoot[state.rootID] = map[string]string{}
	}

	r.profileKeysByRoot[state.rootID][profileKey] = namespace

	return true
}

// dropClusterProfile removes the registration of one ClusterProfile of a current root,
// and stops tracking the profile unless it is expected to come back.
func (r *Runner) dropClusterProfile(state *rootState, profileKey string, stopTracking bool) {
	var registrationIDs []string

	r.mu.Lock()
	if r.roots[state.rootID] == state {
		if stopTracking {
			delete(r.profileKeysByRoot[state.rootID], profileKey)
		}

		registrationIDs = r.pruneProfileLocked(profileKey)
	}
	r.mu.Unlock()

	r.removeRegistrations(registrationIDs...)
}

// stopMissingRoots stops roots that are no longer present in the desired root set.
func (r *Runner) stopMissingRoots(presentRoots map[string]struct{}, storeRootsLoaded bool) {
	r.mu.Lock()

	cancels := make([]context.CancelFunc, 0, len(r.roots))

	var registrationIDs []string

	for rootID, state := range r.roots {
		if _, ok := presentRoots[rootID]; ok {
			continue
		}

		if rootID != inClusterRootID && (!storeRootsLoaded || !strings.HasPrefix(rootID, storeRootPrefix)) {
			continue
		}

		cancels = append(cancels, state.cancel)

		delete(r.roots, rootID)
		registrationIDs = append(registrationIDs, r.pruneRootLocked(rootID)...)
	}

	r.mu.Unlock()

	r.removeRegistrations(registrationIDs...)

	for _, cancel := range cancels {
		cancel()
	}
}

// stopRoot stops one active root and optionally prunes its registrations.
func (r *Runner) stopRoot(rootID string, prune bool) {
	var (
		cancel          context.CancelFunc
		registrationIDs []string
	)

	r.mu.Lock()
	if state := r.roots[rootID]; state != nil {
		cancel = state.cancel

		delete(r.roots, rootID)
	}

	if prune {
		registrationIDs = r.pruneRootLocked(rootID)
	}
	r.mu.Unlock()

	r.removeRegistrations(registrationIDs...)

	if cancel != nil {
		cancel()
	}
}

// stopAllRoots cancels all active root informers without pruning their registrations.
func (r *Runner) stopAllRoots() {
	r.mu.Lock()

	cancels := make([]context.CancelFunc, 0, len(r.roots))

	for rootID, state := range r.roots {
		cancels = append(cancels, state.cancel)

		delete(r.roots, rootID)
	}
	r.mu.Unlock()

	for _, cancel := range cancels {
		cancel()
	}
}

// pruneRootLocked removes all profile tracking for a root and returns the registrations to remove.
func (r *Runner) pruneRootLocked(rootID string) []string {
	registrationIDs := make([]string, 0, len(r.profileKeysByRoot[rootID]))

	for profileKey := range r.profileKeysByRoot[rootID] {
		registrationIDs = append(registrationIDs, r.pruneProfileLocked(profileKey)...)
	}

	delete(r.profileKeysByRoot, rootID)

	return registrationIDs
}

// pruneProfileLocked removes one profile from tracking and returns its registration to remove.
func (r *Runner) pruneProfileLocked(profileKey string) []string {
	registrationID, ok := r.profiles[profileKey]
	if !ok {
		return nil
	}

	delete(r.profiles, profileKey)

	return []string{registrationID}
}

// removeRegistrations removes registrations and their materialized contexts.
func (r *Runner) removeRegistrations(registrationIDs ...string) {
	for _, registrationID := range registrationIDs {
		if err := r.registry.Remove(registrationID); err != nil {
			logger.Log(logger.LevelWarn, map[string]string{logFieldRegistration: registrationID}, err,
				"cluster-inventory: failed to prune registration")
		}
	}
}

// hasNoCRD reports whether a server is still cached as missing the ClusterProfile CRD.
func (r *Runner) hasNoCRD(serverURL string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	expiresAt, ok := r.noCRD[serverURL]
	if !ok {
		return false
	}

	if !r.now().Before(expiresAt) {
		delete(r.noCRD, serverURL)
		return false
	}

	return true
}

// markRootNoCRD stops a root once and caches its server as missing the ClusterProfile CRD.
func (r *Runner) markRootNoCRD(state *rootState) {
	var (
		cancel          context.CancelFunc
		registrationIDs []string
	)

	r.mu.Lock()
	if r.roots[state.rootID] == state {
		r.noCRD[state.serverURL] = r.now().Add(r.noCRDCacheTTL)
		cancel = state.cancel
		delete(r.roots, state.rootID)
		registrationIDs = r.pruneRootLocked(state.rootID)
	}
	r.mu.Unlock()

	r.removeRegistrations(registrationIDs...)

	if cancel != nil {
		cancel()
		logger.Log(logger.LevelInfo, map[string]string{logFieldRoot: state.rootID, logFieldServer: state.serverURL}, nil,
			"cluster-inventory: ClusterProfile CRD is not available")
	}
}

// isCurrentRoot reports whether state is still the active root state.
func (r *Runner) isCurrentRoot(state *rootState) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.roots[state.rootID] == state
}

// makeProfileKey combines a root ID and ClusterProfile into a stable profile key.
func makeProfileKey(rootID string, cp *apisv1alpha1.ClusterProfile) string {
	return rootID + "/" + cache.NewObjectName(cp.Namespace, cp.Name).String()
}

// namespaceLogValue renders the all-namespace sentinel in a human-readable form.
func namespaceLogValue(namespace string) string {
	if namespace == metav1.NamespaceAll {
		return "*"
	}

	return namespace
}

// normalizeServerURL normalizes a REST config host for root identity and CRD caching.
func normalizeServerURL(host string) string {
	parsed, err := url.Parse(host)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return strings.TrimRight(host, "/")
	}

	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawQuery = ""
	parsed.Fragment = ""

	return strings.TrimRight(parsed.String(), "/")
}

// rootFingerprint hashes the connection and namespace settings that affect root identity.
func rootFingerprint(root rootConfig) string {
	fingerprintHash := sha256.New()

	writeHashString(fingerprintHash, root.originCluster)
	writeRestConfigFingerprint(fingerprintHash, root.restConfig)
	writeTLSConfigFingerprint(fingerprintHash, root.restConfig)
	writeImpersonateFingerprint(fingerprintHash, root.restConfig)
	writeExecFingerprint(fingerprintHash, root.restConfig.ExecProvider)

	for _, namespace := range root.namespaces {
		writeHashString(fingerprintHash, namespace)
	}

	return hex.EncodeToString(fingerprintHash.Sum(nil))
}

// writeRestConfigFingerprint writes the core REST config fields into the fingerprint hash.
func writeRestConfigFingerprint(fingerprintHash hash.Hash, config *rest.Config) {
	writeHashString(fingerprintHash, config.Host)
	writeHashString(fingerprintHash, config.APIPath)
	writeHashString(fingerprintHash, config.Username)
	writeHashString(fingerprintHash, config.Password)
	writeHashString(fingerprintHash, config.BearerToken)
	writeHashString(fingerprintHash, config.BearerTokenFile)
}

// writeTLSConfigFingerprint writes TLS-related REST config fields into the fingerprint hash.
func writeTLSConfigFingerprint(fingerprintHash hash.Hash, config *rest.Config) {
	writeHashString(fingerprintHash, config.ServerName)
	writeHashString(fingerprintHash, config.CAFile)
	writeHashString(fingerprintHash, config.CertFile)
	writeHashString(fingerprintHash, config.KeyFile)
	writeHashString(fingerprintHash, fmt.Sprintf("%t", config.Insecure))
	writeHashBytes(fingerprintHash, config.CAData)
	writeHashBytes(fingerprintHash, config.CertData)
	writeHashBytes(fingerprintHash, config.KeyData)
}

// writeImpersonateFingerprint writes impersonation settings into the fingerprint hash.
func writeImpersonateFingerprint(fingerprintHash hash.Hash, config *rest.Config) {
	writeHashString(fingerprintHash, config.Impersonate.UserName)

	for _, group := range config.Impersonate.Groups {
		writeHashString(fingerprintHash, group)
	}

	extraKeys := make([]string, 0, len(config.Impersonate.Extra))
	for key := range config.Impersonate.Extra {
		extraKeys = append(extraKeys, key)
	}

	sort.Strings(extraKeys)

	for _, key := range extraKeys {
		writeHashString(fingerprintHash, key)

		for _, value := range config.Impersonate.Extra[key] {
			writeHashString(fingerprintHash, value)
		}
	}
}

// writeExecFingerprint writes exec credential configuration into the fingerprint hash.
func writeExecFingerprint(fingerprintHash hash.Hash, execProvider *api.ExecConfig) {
	if execProvider == nil {
		return
	}

	writeHashString(fingerprintHash, execProvider.APIVersion)
	writeHashString(fingerprintHash, execProvider.Command)
	writeHashString(fingerprintHash, execProvider.InstallHint)
	writeHashString(fingerprintHash, fmt.Sprintf("%t", execProvider.ProvideClusterInfo))

	for _, arg := range execProvider.Args {
		writeHashString(fingerprintHash, arg)
	}

	for _, env := range execProvider.Env {
		writeHashString(fingerprintHash, env.Name)
		writeHashString(fingerprintHash, env.Value)
	}

	writeExecConfigFingerprint(fingerprintHash, execProvider.Config)
}

// writeExecConfigFingerprint writes exec plugin extension config into the fingerprint hash.
func writeExecConfigFingerprint(fingerprintHash hash.Hash, config k8sruntime.Object) {
	if config == nil {
		return
	}

	writeHashString(fingerprintHash, fmt.Sprintf("%T", config))

	configJSON, err := json.Marshal(config)
	if err != nil {
		writeHashString(fingerprintHash, fmt.Sprintf("%#v", config))

		return
	}

	writeHashBytes(fingerprintHash, configJSON)
}

// writeHashString writes a string value with a separator into a fingerprint hash.
func writeHashString(fingerprintHash hash.Hash, value string) {
	_, _ = fingerprintHash.Write([]byte(value))
	_, _ = fingerprintHash.Write([]byte{0})
}

// writeHashBytes writes bytes with a separator into a fingerprint hash.
func writeHashBytes(fingerprintHash hash.Hash, value []byte) {
	_, _ = fingerprintHash.Write(value)
	_, _ = fingerprintHash.Write([]byte{0})
}

// parseAccessProviders parses a comma-separated, ordered provider allowlist. Names are
// matched exactly, so they are neither sorted nor deduplicated.
func parseAccessProviders(value string) []string {
	var providers []string

	for _, item := range strings.Split(value, ",") {
		if name := strings.TrimSpace(item); name != "" {
			providers = append(providers, name)
		}
	}

	return providers
}

// selectAccessProvider returns the first exact allowlist match. AccessProviders
// takes precedence over the deprecated CredentialProviders field.
func selectAccessProvider(
	cp *apisv1alpha1.ClusterProfile,
	allowed []string,
) (apisv1alpha1.AccessProvider, bool) {
	providers := slices.Concat(cp.Status.AccessProviders, cp.Status.CredentialProviders)

	for _, name := range allowed {
		for _, provider := range providers {
			if provider.Name == name {
				return provider, true
			}
		}
	}

	return apisv1alpha1.AccessProvider{}, false
}

// accessConfigForProvider returns an access config holding only the named provider.
func accessConfigForProvider(in *access.Config, providerName string) *access.Config {
	index := slices.IndexFunc(in.Providers, func(provider access.Provider) bool {
		return provider.Name == providerName
	})
	if index < 0 {
		return access.New(nil)
	}

	provider := in.Providers[index]
	provider.ExecConfig = provider.ExecConfig.DeepCopy()

	return access.New([]access.Provider{provider})
}

// clusterContext builds the connection for an access provider. It uses the configured
// Cluster Inventory exec provider when there is one, and the end user's OIDC token otherwise.
func (r *Runner) clusterContext(
	provider apisv1alpha1.AccessProvider,
	cp *apisv1alpha1.ClusterProfile,
) (*kubeconfig.Context, error) {
	if r.accessConfig == nil {
		return oidcContextFromAccessProvider(provider, r.oidcConfig)
	}

	restConfig, err := accessConfigForProvider(r.accessConfig, provider.Name).BuildConfigFromCP(cp)
	if err != nil {
		return nil, fmt.Errorf("build rest config: %w", err)
	}

	return restConfigToContext(restConfig)
}

// oidcContextFromAccessProvider builds a context that forwards the end user's OIDC token.
func oidcContextFromAccessProvider(
	provider apisv1alpha1.AccessProvider,
	oidcConfig *kubeconfig.OidcConfig,
) (*kubeconfig.Context, error) {
	cluster := api.NewCluster()
	if err := clientcmdlatest.Scheme.Convert(&provider.Cluster, cluster, nil); err != nil {
		return nil, fmt.Errorf("convert access provider cluster: %w", err)
	}

	return &kubeconfig.Context{
		Cluster:  cluster,
		OidcConf: oidcConfig,
		Source:   kubeconfig.ClusterInventory,
	}, nil
}

// isNoCRDError reports whether an error means the ClusterProfile CRD is unavailable.
func isNoCRDError(err error) bool {
	if err == nil {
		return false
	}

	if meta.IsNoMatchError(err) {
		return true
	}

	if apierrors.IsNotFound(err) {
		return isClusterProfileNotFound(err)
	}

	message := err.Error()

	return strings.Contains(message, "no matches for kind") &&
		strings.Contains(message, apisv1alpha1.ClusterProfileKind)
}

// isClusterProfileNotFound reports whether a not-found error refers to ClusterProfiles.
func isClusterProfileNotFound(err error) bool {
	statusErr := &apierrors.StatusError{}
	if errors.As(err, &statusErr) && statusDetailsMatchClusterProfiles(statusErr.ErrStatus.Details) {
		return true
	}

	message := err.Error()

	return strings.Contains(message, "clusterprofiles") ||
		(strings.Contains(message, "ClusterProfile") && strings.Contains(message, apisv1alpha1.Group))
}

// statusDetailsMatchClusterProfiles reports whether status details identify ClusterProfiles.
func statusDetailsMatchClusterProfiles(details *metav1.StatusDetails) bool {
	if details == nil || details.Group != apisv1alpha1.Group {
		return false
	}

	return details.Kind == apisv1alpha1.ClusterProfileKind || details.Name == "clusterprofiles"
}

// proxyURLFromRestConfig resolves the kubeconfig proxy URL for a REST config host.
func proxyURLFromRestConfig(restConfig *rest.Config) (string, error) {
	if restConfig.Proxy == nil {
		return "", nil
	}

	proxyRequestURL, err := url.Parse(restConfig.Host)
	if err != nil {
		return "", fmt.Errorf("proxy request URL: %w", err)
	}

	if proxyRequestURL.Scheme == "" || proxyRequestURL.Host == "" {
		return "", fmt.Errorf("proxy request URL missing scheme or host: %q", restConfig.Host)
	}

	proxyURL, err := restConfig.Proxy(&http.Request{URL: proxyRequestURL})
	if err != nil {
		return "", fmt.Errorf("proxy URL: %w", err)
	}

	if proxyURL == nil {
		return "", nil
	}

	return proxyURL.String(), nil
}

// restConfigToContext builds a Headlamp kubeconfig.Context from a generated rest.Config.
func restConfigToContext(restConfig *rest.Config) (*kubeconfig.Context, error) {
	cluster := &api.Cluster{
		Server:                   restConfig.Host,
		CertificateAuthorityData: restConfig.CAData,
		CertificateAuthority:     restConfig.CAFile,
		InsecureSkipTLSVerify:    restConfig.Insecure,
		TLSServerName:            restConfig.ServerName,
	}

	proxyURL, err := proxyURLFromRestConfig(restConfig)
	if err != nil {
		return nil, err
	}

	cluster.ProxyURL = proxyURL

	if restConfig.ExecProvider != nil && restConfig.ExecProvider.Config != nil {
		cluster.Extensions = map[string]k8sruntime.Object{
			clusterExecConfigExtensionKey: restConfig.ExecProvider.Config,
		}
	}

	authInfo := &api.AuthInfo{}
	// Cluster Inventory access semantics live in the SDK/provider. Headlamp stores
	// the exec bridge for client-go instead of materializing provider credentials.
	if restConfig.ExecProvider != nil {
		authInfo.Exec = restConfig.ExecProvider.DeepCopy()
		authInfo.Exec.InteractiveMode = api.NeverExecInteractiveMode
	}

	return &kubeconfig.Context{
		Cluster:  cluster,
		AuthInfo: authInfo,
		Source:   kubeconfig.ClusterInventory,
	}, nil
}
