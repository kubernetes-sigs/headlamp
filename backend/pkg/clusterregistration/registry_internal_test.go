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

package clusterregistration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func testCandidate(uid, server string) Candidate {
	return Candidate{
		DisplayName: "spoke-a",
		Source:      "cluster-inventory",
		Origin: Origin{
			Cluster: "hub",
			Resource: Resource{
				APIVersion: "multicluster.x-k8s.io/v1alpha1",
				Kind:       "ClusterProfile",
				Namespace:  "headlamp",
				Name:       "spoke-a",
				UID:        uid,
			},
		},
		Context: &kubeconfig.Context{
			Name:        "temporary",
			KubeContext: &api.Context{Cluster: "temporary", AuthInfo: "temporary"},
			Cluster:     &api.Cluster{Server: server},
			AuthInfo:    &api.AuthInfo{},
		},
	}
}

func TestIDForIsStableAndSourceSpecific(t *testing.T) {
	candidate := testCandidate("uid-a", "https://spoke.example")

	first := idFor(candidate.Source, candidate.Origin)
	assert.Equal(t, first, idFor(candidate.Source, candidate.Origin))
	assert.NotEqual(t, first, idFor("cluster-api", candidate.Origin))

	candidate.Origin.Resource.UID = "uid-b"
	recreated := idFor(candidate.Source, candidate.Origin)
	assert.NotEqual(t, first, recreated)

	candidate.Origin.Resource.Namespace = ""
	assert.NotEqual(t, recreated, idFor(candidate.Source, candidate.Origin),
		"cluster-scoped origin resources must get their own ID")
}

func TestRegistryNotifiesOnMetadataChange(t *testing.T) {
	store := kubeconfig.NewContextStore()
	registry := New(store)

	changes, unsubscribe := registry.subscribe()
	t.Cleanup(unsubscribe)

	candidate := testCandidate("uid-a", "https://spoke.example")
	id, err := registry.Upsert(candidate)
	require.NoError(t, err)
	require.Len(t, changes, 1)
	<-changes

	candidate.DisplayName = "renamed-spoke"
	_, err = registry.Upsert(candidate)
	require.NoError(t, err)
	require.Len(t, changes, 1)
	<-changes

	require.NoError(t, registry.Remove(id))
	assert.Len(t, changes, 1)

	_, err = store.GetContext(id)
	assert.Error(t, err)
}

func TestRegistryDoesNotNotifyOnConnectionOnlyChange(t *testing.T) {
	store := kubeconfig.NewContextStore()
	registry := New(store)

	candidate := testCandidate("uid-a", "https://spoke.example")
	id, err := registry.Upsert(candidate)
	require.NoError(t, err)

	changes, unsubscribe := registry.subscribe()
	t.Cleanup(unsubscribe)

	_, err = registry.Upsert(candidate)
	require.NoError(t, err)
	assert.Empty(t, changes)

	candidate.Context.Cluster.Server = "https://new-spoke.example"
	_, err = registry.Upsert(candidate)
	require.NoError(t, err)
	assert.Empty(t, changes)

	routed, err := store.GetContext(id)
	require.NoError(t, err)
	assert.Equal(t, "https://new-spoke.example", routed.Cluster.Server,
		"a connection-only change must still be routed")
}

func TestRegistryListUsesDisplayNameThenID(t *testing.T) {
	store := kubeconfig.NewContextStore()
	registry := New(store)

	second := testCandidate("uid-b", "https://b.example")
	second.DisplayName = "zeta"
	_, err := registry.Upsert(second)
	require.NoError(t, err)

	first := testCandidate("uid-a", "https://a.example")
	first.DisplayName = "alpha"
	first.Origin.Resource.Name = "alpha"
	_, err = registry.Upsert(first)
	require.NoError(t, err)

	registrations := registry.Snapshot().Items
	require.Len(t, registrations, 2)
	assert.Equal(t, "alpha", registrations[0].DisplayName)
	assert.Equal(t, "zeta", registrations[1].DisplayName)
}

func TestHTTPHandlersExposeSnapshotAndStreamChanges(t *testing.T) {
	store := kubeconfig.NewContextStore()
	registry := New(store)

	id, err := registry.Upsert(testCandidate("uid-a", "https://spoke.example"))
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	registry.ServeSnapshot(recorder, httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/cluster-registrations", nil))
	assert.Equal(t, http.StatusOK, recorder.Code)

	var snapshot Snapshot
	require.NoError(t, json.NewDecoder(recorder.Body).Decode(&snapshot))
	require.Len(t, snapshot.Items, 1)
	assert.Equal(t, id, snapshot.Items[0].ID)

	// A cancelled context returns from the stream right after the initial event.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	recorder = httptest.NewRecorder()
	registry.ServeEvents(recorder, httptest.NewRequestWithContext(
		ctx, http.MethodGet, "/cluster-registrations/events", nil))
	assert.Equal(t, "text/event-stream", recorder.Header().Get("Content-Type"))
	assert.Equal(t, registrationFrame, recorder.Body.String())
}

// lockDetectingStore records whether the registry held its lock while calling the store.
type lockDetectingStore struct {
	kubeconfig.ContextStore
	registry          *Registry
	calledWhileLocked atomic.Bool
}

func (s *lockDetectingStore) record() {
	if s.registry.mu.TryLock() {
		s.registry.mu.Unlock()
	} else {
		s.calledWhileLocked.Store(true)
	}
}

func (s *lockDetectingStore) AddContext(headlampContext *kubeconfig.Context) error {
	s.record()

	return s.ContextStore.AddContext(headlampContext)
}

func (s *lockDetectingStore) RemoveContext(name string) error {
	s.record()

	return s.ContextStore.RemoveContext(name)
}

func TestRegistryCallsStoreOutsideItsLock(t *testing.T) {
	store := &lockDetectingStore{ContextStore: kubeconfig.NewContextStore()}
	registry := New(store)
	store.registry = registry

	id, err := registry.Upsert(testCandidate("uid-a", "https://spoke.example"))
	require.NoError(t, err)
	require.NoError(t, registry.Remove(id))

	assert.False(t, store.calledWhileLocked.Load(),
		"context store listeners run synchronously, so the registry lock must not be held")
}
