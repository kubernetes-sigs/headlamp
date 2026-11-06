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

// Package clusterdiscovery runs registered cluster sources through the shared kubeconfig path.
package clusterdiscovery

import (
	"cmp"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"net/url"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/validation"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	// DefaultRootReconcileInterval is the default interval for reconciling cluster roots.
	DefaultRootReconcileInterval = 5 * time.Minute
	// DefaultNoCRDCacheTTL is the default TTL for API servers that do not have the owner CRD.
	DefaultNoCRDCacheTTL = 2 * time.Hour
	inClusterRootID      = "in-cluster"
	storeRootPrefix      = "store/"
)

// Structured-log field names that recur across many log sites.
const (
	logFieldRoot      = "root"
	logFieldOwner     = "owner"
	logFieldServer    = "server"
	logFieldNamespace = "namespace"
)

// Options controls cluster discovery.
type Options struct {
	// Store is the Headlamp context store that receives discovered contexts.
	Store kubeconfig.ContextStore
	// OIDC carries Headlamp's global OIDC settings for every discovered cluster.
	OIDC *kubeconfig.OidcConfig
	// LabelSelector filters owner resources before they are synced.
	LabelSelector string
	// Namespaces limits owner discovery to a comma-separated list of namespaces.
	// A value of "*" watches all namespaces; empty watches each root's default namespace.
	Namespaces string
	// RootReconcileInterval controls how often root clusters are reconciled.
	// Values less than or equal to zero use DefaultRootReconcileInterval.
	RootReconcileInterval time.Duration
	// NoCRDCacheTTL controls how long API servers without the owner CRD are skipped.
	// Values less than or equal to zero use DefaultNoCRDCacheTTL.
	NoCRDCacheTTL time.Duration
	// HubConfig enables discovery from the in-cluster root when set.
	HubConfig *rest.Config
	// HubNamespace is the default namespace for the in-cluster root.
	HubNamespace string
	// DiscoverFromStore enables discovery from non-internal contexts already in Store.
	DiscoverFromStore bool
}

// Runner watches owner resources and syncs them into Headlamp's context store.
type Runner struct {
	store                 kubeconfig.ContextStore
	oidcConfig            *kubeconfig.OidcConfig
	rootReconcileInterval time.Duration
	noCRDCacheTTL         time.Duration
	labelSelector         labels.Selector
	namespaces            []string
	hubConfig             *rest.Config
	hubNamespace          string
	discoverFromStore     bool

	source Source
	now    func() time.Time

	mutationMu      sync.Mutex
	mu              sync.Mutex
	roots           map[string]*rootState
	owners          map[string]ownerState
	ownerKeysByRoot map[string]map[string]string
	noCRD           map[string]time.Time
}

// rootState tracks the active informers and identity for one discovery root.
type rootState struct {
	rootID      string
	serverURL   string
	fingerprint string
	ctx         context.Context
	cancel      context.CancelFunc
	watches     []rootWatch
}

// rootWatch pairs a resource informer with the factory that owns it.
type rootWatch struct {
	namespace string
	resources []ResourceWatch
	informer  cache.SharedIndexInformer
}

// rootConfig contains the Kubernetes client config and watched namespaces for one root.
type rootConfig struct {
	restConfig *rest.Config
	namespaces []string
}

// ownerState tracks the Headlamp context created from one owner.
type ownerState struct {
	contextNames []string
}

// ValidateOIDC checks that the OIDC settings discovery needs to authenticate users are present.
func ValidateOIDC(clientID, issuerURL string, scopes []string) error {
	hasScope := slices.ContainsFunc(scopes, func(scope string) bool {
		return strings.TrimSpace(scope) != ""
	})
	if strings.TrimSpace(clientID) == "" || strings.TrimSpace(issuerURL) == "" || !hasScope {
		return errors.New("cluster discovery requires oidc-client-id, oidc-idp-issuer-url and oidc-scopes")
	}

	return nil
}

// NewRunner validates discovery and OIDC settings and returns a discovery runner.
func NewRunner(opts Options, source Source) (*Runner, error) {
	if source == nil {
		return nil, errors.New("discovery source is required")
	}

	if opts.Store == nil {
		return nil, errors.New("context store is required")
	}

	oidc := cmp.Or(opts.OIDC, &kubeconfig.OidcConfig{})
	if err := ValidateOIDC(oidc.ClientID, oidc.IdpIssuerURL, oidc.Scopes); err != nil {
		return nil, err
	}

	labelSelector, err := normalizeLabelSelector(opts.LabelSelector)
	if err != nil {
		return nil, err
	}

	namespaces, err := normalizeNamespaces(opts.Namespaces)
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
		oidcConfig:            oidc.Copy(),
		rootReconcileInterval: rootReconcileInterval,
		noCRDCacheTTL:         noCRDCacheTTL,
		labelSelector:         labelSelector,
		namespaces:            namespaces,
		hubConfig:             opts.HubConfig,
		hubNamespace:          opts.HubNamespace,
		discoverFromStore:     opts.DiscoverFromStore,
		source:                source,
		now:                   time.Now,
		roots:                 map[string]*rootState{},
		owners:                map[string]ownerState{},
		ownerKeysByRoot:       map[string]map[string]string{},
		noCRD:                 map[string]time.Time{},
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
			restConfig: r.hubConfig,
			namespaces: r.namespacesForRoot(r.hubNamespace),
		}
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

// collectStoreSeedRoots adds existing non-internal Headlamp contexts as discovery roots.
func (r *Runner) collectStoreSeedRoots(
	desiredRoots map[string]rootConfig,
	presentRoots map[string]struct{},
) bool {
	contexts, err := r.store.GetContexts()
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "cluster-discovery: failed to get seed contexts")

		return false
	}

	sort.Slice(contexts, func(i, j int) bool {
		return contexts[i].Name < contexts[j].Name
	})

	for _, headlampContext := range contexts {
		if headlampContext.IsDiscovered() {
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
				"cluster-discovery: failed to build seed rest config")

			continue
		}

		desiredRoots[rootID] = rootConfig{
			restConfig: seedConfig,
			namespaces: r.namespacesForRoot(headlampContext.KubeContext.Namespace),
		}
	}

	return true
}

// reconcileRoot ensures one discovery root has a matching active resource informer.
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

// activateRoot records a root as active and returns any previous active root.
func (r *Runner) activateRoot(state *rootState) (*rootState, bool) {
	r.mutationMu.Lock()
	defer r.mutationMu.Unlock()

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
			for _, resource := range watch.resources {
				resource.Factory.Shutdown()
			}
		}
	}()

	for _, watch := range state.watches {
		logger.Log(logger.LevelInfo, map[string]string{
			logFieldRoot:      state.rootID,
			logFieldServer:    state.serverURL,
			logFieldNamespace: namespaceLogValue(watch.namespace),
		}, nil, "cluster-discovery: starting owner watch")

		for _, resource := range watch.resources {
			resource.Factory.Start(state.ctx.Done())
		}
		go r.waitForRootWatchSync(state, watch)
	}

	<-state.ctx.Done()
}

// waitForRootWatchSync prunes stale owners after one namespace cache has synced.
func (r *Runner) waitForRootWatchSync(state *rootState, watch rootWatch) {
	if !cache.WaitForCacheSync(state.ctx.Done(), watch.hasSynced) {
		return
	}

	r.completeRootWatchSyncFromCache(state, watch)
}

// handleRootWatchError reacts to owner watch errors for one namespace of a root.
func (r *Runner) handleRootWatchError(state *rootState, namespace string, err error) {
	if isNoCRDError(err, r.source.Descriptor().Resource) {
		r.markRootNoCRD(state)

		return
	}

	logger.Log(logger.LevelWarn, map[string]string{
		logFieldRoot:      state.rootID,
		logFieldServer:    state.serverURL,
		logFieldNamespace: namespace,
	}, err, "cluster-discovery: owner watch error")
}

// recordSyncedOwner records current connections and returns names no longer advertised.
func (r *Runner) recordSyncedOwner(state *rootState, ownerKey string, contextNames []string) []string {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.roots[state.rootID] != state {
		return nil
	}

	var removed []string

	for _, name := range r.owners[ownerKey].contextNames {
		if !slices.Contains(contextNames, name) {
			removed = append(removed, name)
		}
	}

	r.owners[ownerKey] = ownerState{contextNames: contextNames}

	return removed
}

// completeRootWatchSyncFromCache prunes owners missing from one synced namespace cache.
func (r *Runner) completeRootWatchSyncFromCache(state *rootState, watch rootWatch) {
	r.mutationMu.Lock()
	defer r.mutationMu.Unlock()

	seen := r.ownerKeysFromRootWatch(state.rootID, watch)

	r.mu.Lock()
	if r.roots[state.rootID] != state {
		r.mu.Unlock()

		return
	}

	previous := r.ownerKeysByRoot[state.rootID]

	var contextNames []string

	if watch.namespace == metav1.NamespaceAll {
		contextNames = r.syncAllNamespaceOwnersLocked(state.rootID, previous, seen)
	} else {
		contextNames = r.syncNamedNamespaceOwnersLocked(state, watch.namespace, previous, seen)
	}

	r.mu.Unlock()

	r.removeContexts(contextNames)

	for _, obj := range watch.informer.GetIndexer().List() {
		r.reconcileObject(state, watch, obj)
	}
}

func (r *Runner) syncAllNamespaceOwnersLocked(
	rootID string,
	previous map[string]string,
	seen map[string]string,
) []string {
	r.ownerKeysByRoot[rootID] = seen
	contextNames := []string{}

	for ownerKey := range previous {
		if _, ok := seen[ownerKey]; ok {
			continue
		}

		contextNames = append(contextNames, r.pruneOwnerLocked(ownerKey)...)
	}

	return contextNames
}

func (r *Runner) syncNamedNamespaceOwnersLocked(
	state *rootState,
	namespace string,
	previous map[string]string,
	seen map[string]string,
) []string {
	next := make(map[string]string, len(previous)+len(seen))
	for ownerKey, ownerNamespace := range previous {
		next[ownerKey] = ownerNamespace
	}

	contextNames := []string{}

	for ownerKey, ownerNamespace := range previous {
		_, stillPresent := seen[ownerKey]

		if ownerNamespace != namespace && r.rootWatchesNamespace(state, ownerNamespace) {
			continue
		}

		if ownerNamespace == namespace && stillPresent {
			continue
		}

		delete(next, ownerKey)
		contextNames = append(contextNames, r.pruneOwnerLocked(ownerKey)...)
	}

	for ownerKey, ownerNamespace := range seen {
		next[ownerKey] = ownerNamespace
	}

	r.ownerKeysByRoot[state.rootID] = next

	return contextNames
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

// recordRootOwner records that a current root has seen an owner.
func (r *Runner) recordRootOwner(state *rootState, ownerKey string, namespace string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.roots[state.rootID] != state {
		return false
	}

	if r.ownerKeysByRoot[state.rootID] == nil {
		r.ownerKeysByRoot[state.rootID] = map[string]string{}
	}

	r.ownerKeysByRoot[state.rootID][ownerKey] = namespace

	return true
}

// pruneOwner removes tracking and context state for one owner.
func (r *Runner) pruneOwner(state *rootState, ownerKey string) {
	r.mu.Lock()

	if r.roots[state.rootID] != state {
		r.mu.Unlock()
		return
	}

	delete(r.ownerKeysByRoot[state.rootID], ownerKey)
	contextNames := r.pruneOwnerLocked(ownerKey)
	r.mu.Unlock()

	r.removeContexts(contextNames)
}

// stopMissingRoots stops roots that are no longer present in the desired root set.
func (r *Runner) stopMissingRoots(presentRoots map[string]struct{}, storeRootsLoaded bool) {
	r.mutationMu.Lock()
	defer r.mutationMu.Unlock()

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

// stopRoot stops one active root and optionally prunes its discovered contexts.
func (r *Runner) stopRoot(rootID string, prune bool) {
	r.mutationMu.Lock()
	defer r.mutationMu.Unlock()

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

// stopAllRoots cancels all active root informers without pruning their contexts.
func (r *Runner) stopAllRoots() {
	r.mutationMu.Lock()
	defer r.mutationMu.Unlock()

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

// pruneRootLocked removes all owner tracking for a root and returns contexts to remove.
func (r *Runner) pruneRootLocked(rootID string) []string {
	contextNames := make([]string, 0, len(r.ownerKeysByRoot[rootID]))

	for ownerKey := range r.ownerKeysByRoot[rootID] {
		contextNames = append(contextNames, r.pruneOwnerLocked(ownerKey)...)
	}

	delete(r.ownerKeysByRoot, rootID)

	return contextNames
}

// pruneOwnerLocked removes one owner from tracking and returns its context to remove.
func (r *Runner) pruneOwnerLocked(ownerKey string) []string {
	state, ok := r.owners[ownerKey]
	if !ok {
		return nil
	}

	delete(r.owners, ownerKey)

	return state.contextNames
}

// removeContexts removes contexts from the store and logs failures.
func (r *Runner) removeContexts(contextNames []string) {
	for _, contextName := range contextNames {
		if err := r.store.RemoveContext(contextName); err != nil {
			logger.Log(logger.LevelWarn, map[string]string{"context": contextName}, err,
				"cluster-discovery: failed to prune context")
		}
	}
}

// hasNoCRD reports whether a server is still cached as missing the owner CRD.
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

// markNoCRD caches a server as missing the owner CRD.
func (r *Runner) markNoCRD(serverURL string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.noCRD[serverURL] = r.now().Add(r.noCRDCacheTTL)
}

// markRootNoCRD stops a root once and caches its server as missing the owner CRD.
func (r *Runner) markRootNoCRD(state *rootState) {
	r.mutationMu.Lock()
	defer r.mutationMu.Unlock()

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
		logger.Log(logger.LevelInfo, map[string]string{logFieldRoot: state.rootID, logFieldServer: state.serverURL}, nil,
			"cluster-discovery: owner CRD is not available")
	}
}

// isCurrentRoot reports whether state is still the active root state.
func (r *Runner) isCurrentRoot(state *rootState) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	return r.roots[state.rootID] == state
}

// makeOwnerKey combines a root ID and owner path into a stable owner key.
func makeOwnerKey(rootID, ownerPath string) string {
	return rootID + "/" + ownerPath
}

// normalizeLabelSelector parses a user-provided label selector.
func normalizeLabelSelector(selector string) (labels.Selector, error) {
	selector = strings.TrimSpace(selector)
	if selector == "" {
		return nil, nil
	}

	parsed, err := labels.Parse(selector)
	if err != nil {
		return nil, fmt.Errorf("invalid cluster-discovery-label-selector: %w", err)
	}

	return parsed, nil
}

// normalizeNamespaces parses a user-provided comma-separated namespace list.
func normalizeNamespaces(value string) ([]string, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}

	var (
		namespaces    = make([]string, 0, strings.Count(value, ",")+1)
		allNamespaces bool
	)

	for _, namespace := range strings.Split(value, ",") {
		namespace = strings.TrimSpace(namespace)

		switch namespace {
		case "":
			return nil, errors.New("invalid cluster-discovery-namespaces: namespace must not be empty")
		case "*":
			if allNamespaces {
				return nil, errors.New(`invalid cluster-discovery-namespaces: "*" must be used on its own`)
			}

			allNamespaces = true
		default:
			if errs := validation.IsDNS1123Label(namespace); len(errs) > 0 {
				return nil, fmt.Errorf("invalid cluster-discovery-namespaces: %q: %s",
					namespace, strings.Join(errs, "; "))
			}

			namespaces = append(namespaces, namespace)
		}
	}

	if allNamespaces {
		if len(namespaces) > 0 {
			return nil, errors.New(`invalid cluster-discovery-namespaces: "*" must be used on its own`)
		}

		return []string{metav1.NamespaceAll}, nil
	}

	slices.Sort(namespaces)

	return slices.Compact(namespaces), nil
}

// ValidateNamespaces validates a comma-separated cluster namespace list.
func ValidateNamespaces(value string) error {
	_, err := normalizeNamespaces(value)

	return err
}

// namespacesForRoot returns the configured namespaces, or the root's default namespace.
func (r *Runner) namespacesForRoot(defaultNamespace string) []string {
	if len(r.namespaces) > 0 {
		return r.namespaces
	}

	if defaultNamespace == "" {
		defaultNamespace = metav1.NamespaceDefault
	}

	return []string{defaultNamespace}
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
