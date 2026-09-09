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

// Package clusterregistration stores source-independent cluster registrations and serves
// them to clients.
package clusterregistration

import (
	"cmp"
	"crypto/sha256"
	"encoding/base32"
	"fmt"
	"maps"
	"slices"
	"strings"
	"sync"

	"k8s.io/apimachinery/pkg/runtime/schema"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
)

const (
	registrationIDPrefix = "hr-v1-"
	clusterIDPrefix      = "registration/"
)

// Snapshot is the list of registrations published to clients.
type Snapshot struct {
	Items []Metadata `json:"items"`
}

// Candidate is a discovered cluster and the metadata published for it.
type Candidate struct {
	DisplayName string
	Source      string
	Origin      Origin
	Context     *kubeconfig.Context
}

// Registry adds discovered cluster registrations to Headlamp's context store.
type Registry struct {
	store kubeconfig.ContextStore

	mu            sync.RWMutex
	registrations map[string]Metadata
	subscribers   map[chan struct{}]struct{}
}

// New returns an empty registry backed by store.
func New(store kubeconfig.ContextStore) *Registry {
	return &Registry{
		store:         store,
		registrations: map[string]Metadata{},
		subscribers:   map[chan struct{}]struct{}{},
	}
}

// idFor returns the stable, opaque ID for a discovered resource.
func idFor(source string, origin Origin) string {
	resource := origin.Resource

	// The version is left out so an apiVersion bump keeps the same ID.
	groupVersion, _ := schema.ParseGroupVersion(resource.APIVersion)

	values := []string{
		source, origin.Cluster, groupVersion.Group,
		resource.Kind, resource.Namespace, resource.Name, resource.UID,
	}
	hash := sha256.Sum256([]byte(strings.Join(values, "\x00")))
	encoded := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(hash[:20])

	return registrationIDPrefix + strings.ToLower(encoded)
}

// Upsert adds or updates a registration and returns its opaque ID.
func (r *Registry) Upsert(candidate Candidate) (string, error) {
	id := idFor(candidate.Source, candidate.Origin)

	routable := candidate.Context.Copy()
	if routable.KubeContext == nil {
		routable.KubeContext = &clientcmdapi.Context{}
	}

	if routable.AuthInfo == nil {
		routable.AuthInfo = &clientcmdapi.AuthInfo{}
	}

	routable.Name = id
	routable.ClusterID = clusterIDPrefix + id
	routable.KubeContext.Cluster = id
	routable.KubeContext.AuthInfo = id

	// Internal keeps registrations out of /config and out of discovery's seed roots, so
	// discovery never recurses into what it registered.
	routable.Internal = true

	if err := routable.SetupProxy(); err != nil {
		return "", fmt.Errorf("setup registration proxy: %w", err)
	}

	metadata := Metadata{
		ID:          id,
		DisplayName: candidate.DisplayName,
		Source:      candidate.Source,
		Origin:      candidate.Origin,
	}

	if err := r.store.AddContext(routable); err != nil {
		return "", fmt.Errorf("store registration context: %w", err)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// Only metadata is published, so a connection-only change needs no notification.
	if r.registrations[id] != metadata {
		r.registrations[id] = metadata
		r.notifyLocked()
	}

	return id, nil
}

// Remove deletes a registration and its context. Unknown IDs are ignored.
func (r *Registry) Remove(id string) error {
	if _, found := r.Get(id); !found {
		return nil
	}

	if err := r.store.RemoveContext(id); err != nil {
		return fmt.Errorf("remove registration context: %w", err)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.registrations, id)
	r.notifyLocked()

	return nil
}

// RemoveOrigin deletes the registration discovered from the given resource.
func (r *Registry) RemoveOrigin(source string, origin Origin) error {
	return r.Remove(idFor(source, origin))
}

// Get returns the published metadata for a registration.
func (r *Registry) Get(id string) (Metadata, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	metadata, found := r.registrations[id]

	return metadata, found
}

// Snapshot returns the current registrations, sorted by display name and ID.
func (r *Registry) Snapshot() Snapshot {
	r.mu.RLock()
	registrations := slices.Collect(maps.Values(r.registrations))
	r.mu.RUnlock()

	slices.SortFunc(registrations, func(a, b Metadata) int {
		return cmp.Or(cmp.Compare(a.DisplayName, b.DisplayName), cmp.Compare(a.ID, b.ID))
	})

	return Snapshot{Items: registrations}
}

func (r *Registry) subscribe() (<-chan struct{}, func()) {
	r.mu.Lock()
	defer r.mu.Unlock()

	changes := make(chan struct{}, 1)
	r.subscribers[changes] = struct{}{}

	return changes, func() {
		r.mu.Lock()
		delete(r.subscribers, changes)
		r.mu.Unlock()
	}
}

func (r *Registry) notifyLocked() {
	for subscriber := range r.subscribers {
		select {
		case subscriber <- struct{}{}:
		default:
		}
	}
}
