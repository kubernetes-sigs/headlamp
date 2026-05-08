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

package clusterinventory

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"net/http"
	"net/url"
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

	clusterInventoryContextPrefix = "cluster-inventory-"
	clusterInventoryIDPrefix      = "cluster-inventory/"
	inClusterRootID               = "in-cluster"
	storeRootPrefix               = "store/"

	clusterExecConfigExtensionKey = "client.authentication.k8s.io/exec"
)

// Options controls Cluster Inventory discovery.
type Options struct {
	Store                 kubeconfig.ContextStore
	ProviderFile          string
	LabelSelector         string
	RootReconcileInterval time.Duration
	NoCRDCacheTTL         time.Duration
	HubConfig             *rest.Config
	DiscoverFromStore     bool
}

// Runner watches ClusterProfile resources and syncs them into Headlamp's context store.
type Runner struct {
	store                 kubeconfig.ContextStore
	accessConfig          *access.Config
	rootReconcileInterval time.Duration
	noCRDCacheTTL         time.Duration
	labelSelector         labels.Selector
	hubConfig             *rest.Config
	discoverFromStore     bool

	clientForConfig func(*rest.Config) (ciaclient.Interface, error)
	now             func() time.Time

	mu                sync.Mutex
	roots             map[string]*rootState
	profiles          map[string]profileState
	profileKeysByRoot map[string]map[string]struct{}
	noCRD             map[string]time.Time
}

type rootState struct {
	rootID      string
	serverURL   string
	fingerprint string
	ctx         context.Context
	cancel      context.CancelFunc
	informer    cache.SharedIndexInformer
}

type rootInformer struct {
	state   *rootState
	factory externalversions.SharedInformerFactory
}

type profileState struct {
	contextName string
}

// NewRunner validates options, parses the provider file, and returns a discovery runner.
func NewRunner(opts Options) (*Runner, error) {
	if opts.Store == nil {
		return nil, errors.New("context store is required")
	}

	if opts.ProviderFile == "" {
		return nil, errors.New("cluster inventory provider file is required")
	}

	accessConfig, err := access.NewFromFile(opts.ProviderFile)
	if err != nil {
		return nil, fmt.Errorf("load cluster inventory provider file: %w", err)
	}

	labelSelector, err := normalizeLabelSelector(opts.LabelSelector)
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
		store:                 opts.Store,
		accessConfig:          accessConfig,
		rootReconcileInterval: rootReconcileInterval,
		noCRDCacheTTL:         noCRDCacheTTL,
		labelSelector:         labelSelector,
		hubConfig:             opts.HubConfig,
		discoverFromStore:     opts.DiscoverFromStore,
		clientForConfig: func(config *rest.Config) (ciaclient.Interface, error) {
			return ciaclient.NewForConfig(config)
		},
		now:               time.Now,
		roots:             map[string]*rootState{},
		profiles:          map[string]profileState{},
		profileKeysByRoot: map[string]map[string]struct{}{},
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

func (r *Runner) reconcileRoots(ctx context.Context) {
	if err := ctx.Err(); err != nil {
		return
	}

	presentRoots := map[string]struct{}{}
	desiredRoots := map[string]*rest.Config{}
	storeRootsLoaded := true

	if r.hubConfig != nil {
		presentRoots[inClusterRootID] = struct{}{}
		desiredRoots[inClusterRootID] = r.hubConfig
	}

	if r.discoverFromStore {
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

func (r *Runner) collectStoreSeedRoots(
	desiredRoots map[string]*rest.Config,
	presentRoots map[string]struct{},
) bool {
	contexts, err := r.store.GetContexts()
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "cluster-inventory: failed to get seed contexts")

		return false
	}

	sort.Slice(contexts, func(i, j int) bool {
		return contexts[i].Name < contexts[j].Name
	})

	for _, headlampContext := range contexts {
		if headlampContext.Source == kubeconfig.ClusterInventory {
			continue
		}

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

		desiredRoots[rootID] = seedConfig
	}

	return true
}

func (r *Runner) reconcileRoot(ctx context.Context, rootID string, config *rest.Config) {
	if config == nil {
		return
	}

	if err := ctx.Err(); err != nil {
		return
	}

	serverURL := normalizeServerURL(config.Host)
	if r.hasNoCRD(serverURL) {
		r.stopRoot(rootID, true)

		return
	}

	fingerprint := restConfigFingerprint(config)
	if r.rootMatches(rootID, serverURL, fingerprint) {
		return
	}

	rootInformer, ok := r.newRootInformer(ctx, rootID, serverURL, fingerprint, config)
	if !ok {
		return
	}

	previous, current := r.activateRoot(rootInformer.state)
	if current {
		rootInformer.state.cancel()

		return
	}

	if previous != nil {
		previous.cancel()
	}

	go r.runRootInformer(rootInformer.state, rootInformer.factory)
}

func (r *Runner) rootMatches(rootID, serverURL, fingerprint string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	current := r.roots[rootID]

	return current != nil && current.serverURL == serverURL && current.fingerprint == fingerprint
}

func (r *Runner) newRootInformer(
	ctx context.Context,
	rootID string,
	serverURL string,
	fingerprint string,
	config *rest.Config,
) (*rootInformer, bool) {
	client, err := r.clientForConfig(rest.CopyConfig(config))
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"root": rootID, "server": config.Host}, err,
			"cluster-inventory: failed to create client")

		return nil, false
	}

	rootCtx, cancel := context.WithCancel(ctx)
	factory := r.newClusterProfileInformerFactory(client)
	informer := factory.Apis().V1alpha1().ClusterProfiles().Informer()
	state := &rootState{
		rootID:      rootID,
		serverURL:   serverURL,
		fingerprint: fingerprint,
		ctx:         rootCtx,
		cancel:      cancel,
		informer:    informer,
	}

	_, err = informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
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
		cancel()
		logger.Log(logger.LevelWarn, map[string]string{"root": rootID, "server": config.Host}, err,
			"cluster-inventory: failed to add ClusterProfile event handler")

		return nil, false
	}

	if err := informer.SetWatchErrorHandler(func(_ *cache.Reflector, err error) {
		r.handleRootWatchError(state, err)
	}); err != nil {
		cancel()
		logger.Log(logger.LevelWarn, map[string]string{"root": rootID, "server": config.Host}, err,
			"cluster-inventory: failed to set ClusterProfile watch error handler")

		return nil, false
	}

	return &rootInformer{state: state, factory: factory}, true
}

func (r *Runner) newClusterProfileInformerFactory(client ciaclient.Interface) externalversions.SharedInformerFactory {
	return externalversions.NewSharedInformerFactoryWithOptions(client, 0, r.clusterProfileInformerOptions()...)
}

func (r *Runner) clusterProfileInformerOptions() []externalversions.SharedInformerOption {
	if r.labelSelector == nil {
		return nil
	}

	selector := r.labelSelector.String()

	return []externalversions.SharedInformerOption{
		externalversions.WithTweakListOptions(func(options *metav1.ListOptions) {
			options.LabelSelector = selector
		}),
	}
}

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

func (r *Runner) runRootInformer(state *rootState, factory externalversions.SharedInformerFactory) {
	defer factory.Shutdown()

	factory.Start(state.ctx.Done())

	if !cache.WaitForCacheSync(state.ctx.Done(), state.informer.HasSynced) {
		return
	}

	r.completeRootSyncFromCache(state)

	<-state.ctx.Done()
}

func (r *Runner) handleClusterProfileUpsert(state *rootState, obj interface{}) {
	cp, ok := clusterProfileFromObject(obj)
	if !ok {
		logger.Log(logger.LevelWarn, map[string]string{"root": state.rootID}, nil,
			"cluster-inventory: ignored non-ClusterProfile informer event")

		return
	}

	profileKey := makeProfileKey(state.rootID, cp.Namespace+"/"+cp.Name)
	if !r.clusterProfileMatchesSelector(cp) {
		r.pruneClusterProfile(state, profileKey)

		return
	}

	if !r.recordRootProfile(state, profileKey) {
		return
	}

	r.syncClusterProfile(state.ctx, state, profileKey, cp)
}

func (r *Runner) handleClusterProfileDelete(state *rootState, obj interface{}) {
	cp, ok := clusterProfileFromObject(obj)
	if !ok {
		logger.Log(logger.LevelWarn, map[string]string{"root": state.rootID}, nil,
			"cluster-inventory: ignored non-ClusterProfile delete event")

		return
	}

	profileKey := makeProfileKey(state.rootID, cp.Namespace+"/"+cp.Name)
	r.pruneClusterProfile(state, profileKey)
}

func (r *Runner) handleRootWatchError(state *rootState, err error) {
	if isNoCRDError(err) {
		r.markRootNoCRD(state)
		logger.Log(logger.LevelInfo, map[string]string{"root": state.rootID, "server": state.serverURL}, nil,
			"cluster-inventory: ClusterProfile CRD is not available")

		return
	}

	logger.Log(logger.LevelWarn, map[string]string{"root": state.rootID, "server": state.serverURL}, err,
		"cluster-inventory: ClusterProfile watch error")
}

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
		return
	}

	if !r.isCurrentRoot(state) {
		return
	}

	if err := r.store.AddContext(headlampContext); err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"clusterprofile": profileKey}, err,
			"cluster-inventory: failed to add context")

		return
	}

	r.recordSyncedProfile(state, profileKey, headlampContext.Name)
}

func (r *Runner) contextFromClusterProfile(
	profileKey string,
	cp *apisv1alpha1.ClusterProfile,
) (*kubeconfig.Context, bool) {
	if len(cp.Status.AccessProviders) == 0 {
		logger.Log(logger.LevelInfo, map[string]string{"clusterprofile": profileKey}, nil,
			"cluster-inventory: ClusterProfile has no access providers")

		return nil, false
	}

	restConfig, err := copyAccessConfig(r.accessConfig).BuildConfigFromCP(accessOnlyClusterProfile(cp))
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"clusterprofile": profileKey}, err,
			"cluster-inventory: failed to build rest config")

		return nil, false
	}

	contextName := contextNameFromProfileKey(profileKey)

	headlampContext, err := restConfigToContext(restConfig, contextName, profileKey)
	if err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"clusterprofile": profileKey}, err,
			"cluster-inventory: failed to convert rest config")

		return nil, false
	}

	if err := headlampContext.SetupProxy(); err != nil {
		logger.Log(logger.LevelWarn, map[string]string{"clusterprofile": profileKey}, err,
			"cluster-inventory: failed to setup proxy")

		return nil, false
	}

	return headlampContext, true
}

func (r *Runner) recordSyncedProfile(state *rootState, profileKey string, contextName string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.roots[state.rootID] != state {
		return
	}

	r.profiles[profileKey] = profileState{contextName: contextName}
}

func (r *Runner) completeRootSyncFromCache(state *rootState) {
	seen := map[string]struct{}{}

	for _, obj := range state.informer.GetIndexer().List() {
		cp, ok := clusterProfileFromObject(obj)
		if !ok {
			continue
		}

		if !r.clusterProfileMatchesSelector(cp) {
			continue
		}

		profileKey := makeProfileKey(state.rootID, cp.Namespace+"/"+cp.Name)
		seen[profileKey] = struct{}{}
	}

	r.mu.Lock()

	if r.roots[state.rootID] != state {
		r.mu.Unlock()
		return
	}

	previous := r.profileKeysByRoot[state.rootID]
	r.profileKeysByRoot[state.rootID] = seen

	var contextNames []string

	for profileKey := range previous {
		if _, ok := seen[profileKey]; ok {
			continue
		}

		contextNames = append(contextNames, r.pruneProfileLocked(profileKey)...)
	}
	r.mu.Unlock()

	r.removeContexts(contextNames)
}

func (r *Runner) recordRootProfile(state *rootState, profileKey string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.roots[state.rootID] != state {
		return false
	}

	if r.profileKeysByRoot[state.rootID] == nil {
		r.profileKeysByRoot[state.rootID] = map[string]struct{}{}
	}

	r.profileKeysByRoot[state.rootID][profileKey] = struct{}{}

	return true
}

func (r *Runner) clusterProfileMatchesSelector(cp *apisv1alpha1.ClusterProfile) bool {
	return r.labelSelector == nil || r.labelSelector.Matches(labels.Set(cp.Labels))
}

func (r *Runner) pruneClusterProfile(state *rootState, profileKey string) {
	r.mu.Lock()

	if r.roots[state.rootID] != state {
		r.mu.Unlock()
		return
	}

	delete(r.profileKeysByRoot[state.rootID], profileKey)
	contextNames := r.pruneProfileLocked(profileKey)
	r.mu.Unlock()

	r.removeContexts(contextNames)
}

func (r *Runner) stopMissingRoots(presentRoots map[string]struct{}, storeRootsLoaded bool) {
	r.mu.Lock()

	cancels := make([]context.CancelFunc, 0, len(r.roots))

	var contextNames []string

	for rootID, state := range r.roots {
		if _, ok := presentRoots[rootID]; ok {
			continue
		}

		if rootID != inClusterRootID && (!storeRootsLoaded || !strings.HasPrefix(rootID, storeRootPrefix)) {
			continue
		}

		cancels = append(cancels, state.cancel)

		delete(r.roots, rootID)
		contextNames = append(contextNames, r.pruneRootLocked(rootID)...)
	}

	r.mu.Unlock()

	r.removeContexts(contextNames)

	for _, cancel := range cancels {
		cancel()
	}
}

func (r *Runner) stopRoot(rootID string, prune bool) {
	var (
		cancel       context.CancelFunc
		contextNames []string
	)

	r.mu.Lock()
	if state := r.roots[rootID]; state != nil {
		cancel = state.cancel

		delete(r.roots, rootID)
	}

	if prune {
		contextNames = r.pruneRootLocked(rootID)
	}
	r.mu.Unlock()

	r.removeContexts(contextNames)

	if cancel != nil {
		cancel()
	}
}

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

func (r *Runner) pruneRootLocked(rootID string) []string {
	contextNames := make([]string, 0, len(r.profileKeysByRoot[rootID]))

	for profileKey := range r.profileKeysByRoot[rootID] {
		contextNames = append(contextNames, r.pruneProfileLocked(profileKey)...)
	}

	delete(r.profileKeysByRoot, rootID)

	return contextNames
}

func (r *Runner) pruneProfileLocked(profileKey string) []string {
	state, ok := r.profiles[profileKey]
	if !ok {
		return nil
	}

	delete(r.profiles, profileKey)

	return []string{state.contextName}
}

func (r *Runner) removeContexts(contextNames []string) {
	for _, contextName := range contextNames {
		if err := r.store.RemoveContext(contextName); err != nil {
			logger.Log(logger.LevelWarn, map[string]string{"context": contextName}, err,
				"cluster-inventory: failed to prune context")
		}
	}
}

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

func (r *Runner) markNoCRD(serverURL string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.noCRD[serverURL] = r.now().Add(r.noCRDCacheTTL)
}

func (r *Runner) markRootNoCRD(state *rootState) {
	var (
		cancel       context.CancelFunc
		contextNames []string
	)

	r.mu.Lock()
	if r.roots[state.rootID] == state {
		r.noCRD[state.serverURL] = r.now().Add(r.noCRDCacheTTL)
		cancel = state.cancel
		delete(r.roots, state.rootID)
		contextNames = r.pruneRootLocked(state.rootID)
	}
	r.mu.Unlock()

	r.removeContexts(contextNames)

	if cancel != nil {
		cancel()
	}
}

func (r *Runner) isCurrentRoot(state *rootState) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.roots[state.rootID] == state
}

func makeProfileKey(rootID, profilePath string) string {
	return rootID + "/" + profilePath
}

func normalizeLabelSelector(selector string) (labels.Selector, error) {
	selector = strings.TrimSpace(selector)
	if selector == "" {
		return nil, nil
	}

	parsed, err := labels.Parse(selector)
	if err != nil {
		return nil, fmt.Errorf("invalid cluster-inventory-label-selector: %w", err)
	}

	return parsed, nil
}

func contextNameFromProfileKey(profileKey string) string {
	return clusterInventoryContextPrefix +
		kubeconfig.MakeDNSFriendly(profileKey) +
		"--" +
		profileKeyHashSuffix(profileKey)
}

func profileKeyHashSuffix(profileKey string) string {
	sum := sha256.Sum256([]byte(profileKey))

	return hex.EncodeToString(sum[:6])
}

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

func restConfigFingerprint(config *rest.Config) string {
	fingerprintHash := sha256.New()

	writeRestConfigFingerprint(fingerprintHash, config)
	writeTLSConfigFingerprint(fingerprintHash, config)
	writeImpersonateFingerprint(fingerprintHash, config)
	writeExecFingerprint(fingerprintHash, config.ExecProvider)

	return hex.EncodeToString(fingerprintHash.Sum(nil))
}

func writeRestConfigFingerprint(fingerprintHash hash.Hash, config *rest.Config) {
	writeHashString(fingerprintHash, config.Host)
	writeHashString(fingerprintHash, config.APIPath)
	writeHashString(fingerprintHash, config.Username)
	writeHashString(fingerprintHash, config.Password)
	writeHashString(fingerprintHash, config.BearerToken)
	writeHashString(fingerprintHash, config.BearerTokenFile)
}

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

func writeHashString(fingerprintHash hash.Hash, value string) {
	_, _ = fingerprintHash.Write([]byte(value))
	_, _ = fingerprintHash.Write([]byte{0})
}

func writeHashBytes(fingerprintHash hash.Hash, value []byte) {
	_, _ = fingerprintHash.Write(value)
	_, _ = fingerprintHash.Write([]byte{0})
}

func clusterProfileFromObject(obj interface{}) (*apisv1alpha1.ClusterProfile, bool) {
	switch typed := obj.(type) {
	case *apisv1alpha1.ClusterProfile:
		return typed, true
	case cache.DeletedFinalStateUnknown:
		return clusterProfileFromObject(typed.Obj)
	case *cache.DeletedFinalStateUnknown:
		return clusterProfileFromObject(typed.Obj)
	default:
		return nil, false
	}
}

func accessOnlyClusterProfile(cp *apisv1alpha1.ClusterProfile) *apisv1alpha1.ClusterProfile {
	return &apisv1alpha1.ClusterProfile{
		TypeMeta:   cp.TypeMeta,
		ObjectMeta: *cp.ObjectMeta.DeepCopy(),
		Spec:       cp.Spec,
		Status: apisv1alpha1.ClusterProfileStatus{
			AccessProviders: append([]apisv1alpha1.AccessProvider(nil), cp.Status.AccessProviders...),
		},
	}
}

func copyAccessConfig(in *access.Config) *access.Config {
	out := &access.Config{Providers: make([]access.Provider, len(in.Providers))}
	for i, provider := range in.Providers {
		out.Providers[i] = provider
		if provider.ExecConfig == nil {
			continue
		}

		execConfig := *provider.ExecConfig
		execConfig.Args = append([]string(nil), provider.ExecConfig.Args...)
		execConfig.Env = append([]api.ExecEnvVar(nil), provider.ExecConfig.Env...)
		out.Providers[i].ExecConfig = &execConfig
	}

	return out
}

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

func isClusterProfileNotFound(err error) bool {
	statusErr := &apierrors.StatusError{}
	if errors.As(err, &statusErr) && statusDetailsMatchClusterProfiles(statusErr.ErrStatus.Details) {
		return true
	}

	message := err.Error()

	return strings.Contains(message, "clusterprofiles") ||
		(strings.Contains(message, "ClusterProfile") && strings.Contains(message, apisv1alpha1.Group))
}

func statusDetailsMatchClusterProfiles(details *metav1.StatusDetails) bool {
	if details == nil || details.Group != apisv1alpha1.Group {
		return false
	}

	return details.Kind == apisv1alpha1.ClusterProfileKind || details.Name == "clusterprofiles"
}

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
func restConfigToContext(restConfig *rest.Config, contextName, profileKey string) (*kubeconfig.Context, error) {
	if restConfig == nil {
		return nil, errors.New("restConfig is nil")
	}

	if contextName == "" {
		return nil, errors.New("contextName is empty")
	}

	if profileKey == "" {
		return nil, errors.New("profileKey is empty")
	}

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
		ClusterID:      clusterInventoryIDPrefix + profileKey,
	}, nil
}
