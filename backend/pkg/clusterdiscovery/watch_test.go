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

//nolint:testpackage // tests exercise root watches through a source that breaks the watch contract.
package clusterdiscovery

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
)

// sampleFleetWith returns the sample source over a fake API server that serves members.
func sampleFleetWith(members ...runtime.Object) *sampleFleetSource {
	return &sampleFleetSource{client: dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{sampleFleetResource: "FleetMemberList"},
		members...,
	)}
}

// brokenWatchSource is the sample source with the watches a test gives it, to break what
// the engine expects from Source.Watches.
type brokenWatchSource struct {
	*sampleFleetSource
	watches func() ([]ResourceWatch, error)
}

// Watches returns the watches of the test instead of those of the sample source.
func (s *brokenWatchSource) Watches(*rest.Config, string, string) ([]ResourceWatch, error) {
	return s.watches()
}

// startSampleWatches starts the watches of the sample source and waits for their caches.
// With stopped set, it also stops them again before returning.
func startSampleWatches(t *testing.T, sample *sampleFleetSource, stopped bool) []ResourceWatch {
	t.Helper()

	watches, err := sample.Watches(nil, metav1.NamespaceDefault, "")
	require.NoError(t, err)

	stop := make(chan struct{})
	shutdown := sync.OnceFunc(func() {
		close(stop)

		for _, watch := range watches {
			watch.Factory.Shutdown()
		}
	})
	t.Cleanup(shutdown)

	for _, watch := range watches {
		watch.Factory.Start(stop)
		require.True(t, cache.WaitForCacheSync(stop, watch.Informer.HasSynced))
	}

	if stopped {
		shutdown()
	}

	return watches
}

// sampleRootWatch returns a synchronized watch of the sample source's default namespace.
func sampleRootWatch(t *testing.T, sample *sampleFleetSource) rootWatch {
	t.Helper()

	watches := startSampleWatches(t, sample, false)

	return rootWatch{namespace: metav1.NamespaceDefault, resources: watches, informer: watches[0].Informer}
}

// The engine only starts a root whose watches follow the Source contract.
func TestNewRootStateRejectsUnusableWatches(t *testing.T) {
	for _, tc := range []struct {
		name    string
		watches func(t *testing.T, sample *sampleFleetSource) ([]ResourceWatch, error)
	}{
		{
			name: "the source cannot create watches",
			watches: func(*testing.T, *sampleFleetSource) ([]ResourceWatch, error) {
				return nil, errors.New("no client for the root")
			},
		},
		{
			name: "the owner resource is not watched",
			watches: func(_ *testing.T, sample *sampleFleetSource) ([]ResourceWatch, error) {
				watches, err := sample.Watches(nil, metav1.NamespaceDefault, "")
				watches[0].Resource = secretResource

				return watches, err
			},
		},
		{
			name: "an informer has already started",
			watches: func(t *testing.T, sample *sampleFleetSource) ([]ResourceWatch, error) {
				return startSampleWatches(t, sample, false), nil
			},
		},
		{
			name: "an informer has already stopped",
			watches: func(t *testing.T, sample *sampleFleetSource) ([]ResourceWatch, error) {
				return startSampleWatches(t, sample, true), nil
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sample := &sampleFleetSource{}
			runner, _ := sampleFleetRunner(t, nil, sample)
			runner.source = &brokenWatchSource{
				sampleFleetSource: sample,
				watches:           func() ([]ResourceWatch, error) { return tc.watches(t, sample) },
			}

			state, ok := runner.newRootState(
				context.Background(), inClusterRootID, "https://hub.example.com", "fingerprint",
				rootConfig{restConfig: &rest.Config{Host: "https://hub.example.com"}, namespaces: []string{"default"}},
			)

			require.False(t, ok)
			require.Nil(t, state)
		})
	}
}

// A root that was replaced must not publish connections from the watches it still has.
func TestReconcileOwnerIgnoresRootsThatAreNoLongerCurrent(t *testing.T) {
	sample := &sampleFleetSource{}
	store := kubeconfig.NewContextStore()
	runner, _ := sampleFleetRunner(t, store, sample, sampleFleetMember("member-a", "https://a.example.com", "eu"))
	watch := sampleRootWatch(t, sample)
	owner := types.NamespacedName{Namespace: "default", Name: "member-a"}

	runner.reconcileOwner(&rootState{rootID: inClusterRootID}, watch, owner)

	contexts, err := store.GetContexts()
	require.NoError(t, err)
	require.Empty(t, contexts)

	current := &rootState{rootID: inClusterRootID}

	runner.mu.Lock()
	runner.roots[current.rootID] = current
	runner.mu.Unlock()

	runner.reconcileOwner(current, watch, owner)

	contexts, err = store.GetContexts()
	require.NoError(t, err)
	require.Len(t, contexts, 1)
}

// Owners excluded by the label selector are not tracked, even when a watch caches them.
func TestOwnerKeysFromRootWatchSkipsOwnersOutsideTheSelector(t *testing.T) {
	selected := sampleFleetMember("member-a", "https://a.example.com", "eu")
	selected.SetLabels(map[string]string{"tier": "prod"})

	sample := &sampleFleetSource{}
	runner, _ := sampleFleetRunner(t, nil, sample, selected, sampleFleetMember("member-b", "https://b.example.com", "us"))

	var err error

	runner.labelSelector, err = normalizeLabelSelector("tier=prod")
	require.NoError(t, err)

	require.Equal(
		t,
		map[string]string{makeOwnerKey(inClusterRootID, "default/member-a"): "default"},
		runner.ownerKeysFromRootWatch(inClusterRootID, sampleRootWatch(t, sample)),
	)
}

// Only errors that say the API server lacks the owner resource stop a root from retrying.
func TestIsNoCRDError(t *testing.T) {
	notFound := func(group, kind string) error {
		return apierrors.NewNotFound(schema.GroupResource{Group: group, Resource: kind}, "")
	}
	notFoundWithoutDetails := func(message string) error {
		return &apierrors.StatusError{ErrStatus: metav1.Status{Reason: metav1.StatusReasonNotFound, Message: message}}
	}

	for _, tc := range []struct {
		name string
		err  error
		want bool
	}{
		{name: "no error", err: nil, want: false},
		{
			name: "no REST mapping for the kind",
			err:  &meta.NoKindMatchError{GroupKind: schema.GroupKind{Group: "example.com", Kind: "FleetMember"}},
			want: true,
		},
		{name: "resource not found", err: notFound("example.com", "fleetmembers"), want: true},
		{name: "kind not found", err: notFound("example.com", "FleetMember"), want: true},
		{name: "resource of another group not found", err: notFound("other.example.com", "fleetmembers"), want: false},
		{name: "another resource not found", err: notFound("example.com", "fleets"), want: false},
		{
			name: "not found without details that names the resource",
			err:  notFoundWithoutDetails("the server could not find the requested resource (get fleetmembers.example.com)"),
			want: true,
		},
		{
			name: "not found without details about something else",
			err:  notFoundWithoutDetails("the server could not find the requested resource"),
			want: false,
		},
		{
			name: "no matches for the kind in the group",
			err:  errors.New(`no matches for kind "FleetMember" in version "example.com/v1"`),
			want: true,
		},
		{
			name: "no matches for a kind in another group",
			err:  errors.New(`no matches for kind "Fleet" in version "other.io/v1"`),
			want: false,
		},
		{name: "unrelated failure", err: errors.New("connection refused"), want: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, isNoCRDError(tc.err, sampleFleetResource))
		})
	}
}
