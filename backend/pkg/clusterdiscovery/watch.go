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

package clusterdiscovery

import (
	"context"
	"errors"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
)

func (r *Runner) newRootState(
	ctx context.Context,
	rootID, serverURL, fingerprint string,
	root rootConfig,
) (*rootState, bool) {
	rootCtx, cancel := context.WithCancel(ctx)

	state := &rootState{rootID: rootID, serverURL: serverURL, fingerprint: fingerprint, ctx: rootCtx, cancel: cancel}
	for _, namespace := range root.namespaces {
		watch, ok := r.newRootWatch(state, namespace, root.restConfig)
		if !ok {
			cancel()
			return nil, false
		}

		state.watches = append(state.watches, watch)
	}

	return state, true
}

func (r *Runner) newRootWatch(state *rootState, namespace string, config *rest.Config) (rootWatch, bool) {
	selector := ""
	if r.labelSelector != nil {
		selector = r.labelSelector.String()
	}

	resources, err := r.source.Watches(rest.CopyConfig(config), namespace, selector)
	if err != nil {
		logger.Log(
			logger.LevelWarn,
			map[string]string{
				"discoverySource": r.source.Descriptor().ID,
				"root":            state.rootID,
			},
			err,
			"discovery: failed to create watches",
		)

		return rootWatch{}, false
	}

	watch := rootWatch{namespace: namespace, resources: resources}
	for _, resource := range resources {
		if resource.Resource == r.source.Descriptor().Resource {
			watch.informer = resource.Informer
		}
	}

	if watch.informer == nil {
		return rootWatch{}, false
	}

	for _, resource := range resources {
		if err := r.addResourceHandlers(state, watch, resource); err != nil {
			return rootWatch{}, false
		}
	}

	return watch, true
}

func (r *Runner) handleChange(
	state *rootState,
	watch rootWatch,
	resource schema.GroupVersionResource,
	obj interface{},
	deleted bool,
) {
	r.mutationMu.Lock()
	defer r.mutationMu.Unlock()

	if state.ctx.Err() != nil || !r.isCurrentRoot(state) || !watch.hasSynced() {
		return
	}

	for _, owner := range r.source.OwnersForChange(resource, obj) {
		if deleted && resource == r.source.Descriptor().Resource {
			r.pruneOwner(state, makeOwnerKey(state.rootID, owner.Namespace+"/"+owner.Name))
			continue
		}

		r.reconcileOwner(state, watch, owner)
	}
}

func (r *Runner) reconcileObject(state *rootState, watch rootWatch, obj interface{}) {
	for _, owner := range objectOwner(obj) {
		r.reconcileOwner(state, watch, owner)
	}
}

func (r *Runner) reconcileOwner(state *rootState, watch rootWatch, owner types.NamespacedName) {
	key := makeOwnerKey(state.rootID, owner.Namespace+"/"+owner.Name)
	obj, exists := watch.Get(r.source.Descriptor().Resource, owner)

	accessor, ok := obj.(metav1.Object)
	if !exists || !ok || !r.ownerMatchesSelector(accessor) {
		r.pruneOwner(state, key)
		return
	}

	if !r.recordRootOwner(state, key, owner.Namespace) {
		return
	}

	generated, err := r.source.Build(state.rootID, owner, watch)
	if err != nil {
		logger.Log(
			logger.LevelWarn,
			map[string]string{
				"discoverySource": r.source.Descriptor().ID,
				"owner":           key,
			},
			err,
			"discovery: could not build connection",
		)
		r.pruneOwner(state, key)

		return
	}

	names := make([]string, 0, len(generated))
	for _, entry := range generated {
		context, err := r.loadGenerated(state.rootID, owner, entry)
		if err != nil {
			logger.Log(
				logger.LevelWarn,
				map[string]string{
					"discoverySource": r.source.Descriptor().ID,
					"owner":           key,
				},
				err,
				"discovery: ignored invalid connection",
			)

			continue
		}

		if err = r.store.AddContext(context); err != nil {
			logger.Log(logger.LevelWarn, map[string]string{"owner": key}, err, "discovery: failed to store connection")
		}

		names = append(names, context.Name)
	}

	r.removeContexts(r.recordSyncedOwner(state, key, names))
}

func (r *Runner) handleOwnerDelete(state *rootState, obj interface{}) {
	r.mutationMu.Lock()
	defer r.mutationMu.Unlock()

	for _, owner := range objectOwner(obj) {
		r.pruneOwner(state, makeOwnerKey(state.rootID, owner.Namespace+"/"+owner.Name))
	}
}

func (r *Runner) ownerMatchesSelector(obj metav1.Object) bool {
	return r.labelSelector == nil || r.labelSelector.Matches(labels.Set(obj.GetLabels()))
}

func (r *Runner) ownerKeysFromRootWatch(rootID string, watch rootWatch) map[string]string {
	seen := map[string]string{}

	for _, obj := range watch.informer.GetIndexer().List() {
		accessor, ok := obj.(metav1.Object)
		if !ok || !r.ownerMatchesSelector(accessor) {
			continue
		}

		seen[makeOwnerKey(rootID, accessor.GetNamespace()+"/"+accessor.GetName())] = accessor.GetNamespace()
	}

	return seen
}

func isNoCRDError(err error, resource schema.GroupVersionResource) bool {
	if err == nil {
		return false
	}

	if meta.IsNoMatchError(err) {
		return true
	}

	if !apierrors.IsNotFound(err) {
		return strings.Contains(err.Error(), "no matches for kind") && strings.Contains(err.Error(), resource.Group)
	}

	statusErr := &apierrors.StatusError{}
	if errors.As(err, &statusErr) && statusErr.ErrStatus.Details != nil {
		details := statusErr.ErrStatus.Details

		return details.Group == resource.Group &&
			(details.Kind == resource.Resource || strings.EqualFold(
				details.Kind,
				strings.TrimSuffix(resource.Resource, "s"),
			))
	}

	return strings.Contains(err.Error(), resource.Resource)
}

func (r *Runner) addResourceHandlers(state *rootState, watch rootWatch, resource ResourceWatch) error {
	gvr := resource.Resource

	_, err := resource.Informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(obj interface{}) { r.handleChange(state, watch, gvr, obj, false) },
		UpdateFunc: func(_, obj interface{}) { r.handleChange(state, watch, gvr, obj, false) },
		DeleteFunc: func(obj interface{}) { r.handleChange(state, watch, gvr, obj, true) },
	})
	if err != nil {
		return err
	}

	err = resource.Informer.SetWatchErrorHandler(func(_ *cache.Reflector, err error) {
		if gvr == r.source.Descriptor().Resource {
			r.handleRootWatchError(state, watch.namespace, err)
		} else {
			logger.Log(
				logger.LevelWarn,
				map[string]string{
					"discoverySource": r.source.Descriptor().ID,
					"root":            state.rootID,
				},
				err,
				"discovery: dependency watch error",
			)
		}
	})
	if err != nil {
		return err
	}

	return nil
}
