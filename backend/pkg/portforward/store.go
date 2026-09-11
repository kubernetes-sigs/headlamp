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

package portforward

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const storeKeyPrefix = "PORT_FORWARD_"

// portforwardKeyGenerator generates a unique key
// based on the cluster name, id,service name, and pod name.
func portforwardKeyGenerator(p portForward) string {
	clusterKey := p.cacheKey
	if clusterKey == "" {
		// Fallback for entries created before the cacheKey field existed
		// (cacheKey unset), where the cache key was derived from Cluster.
		clusterKey = p.Cluster
	}

	if p.ID != "" {
		return storeKeyPrefix + clusterKey + p.ID
	}

	key := storeKeyPrefix + clusterKey

	if p.Service != "" {
		key += p.Service
	} else if p.Pod != "" {
		key += p.Pod
	}

	return key
}

// portforwardstore stores a port forward in the cache.
func portforwardstore(cache cache.Cache[interface{}], p portForward) {
	key := portforwardKeyGenerator(p)

	err := cache.Set(context.Background(), key, p)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "storing portforward")
	}
}

// lifecycleLocks holds one mutex per port-forward key, serializing the
// lifecycle operations of that key: registering a live instance, writing a
// status, and stopping or deleting the cached entry.
//
// Cache reads and writes take separate locks internally, so a check-then-write
// is not atomic on its own: a delete can land between them and the write then
// resurrects the deleted entry. Every path that inspects liveness and then
// writes must hold this lock across both steps.
//
// Entries are keyed by cluster and port-forward ID and are intentionally never
// removed: a mutex may still be held by a goroutine that is about to exit, and
// the map is bounded by the number of distinct forwards the user creates.
var lifecycleLocks sync.Map

// lockLifecycle locks the lifecycle mutex for key and returns its unlock
// function, so callers can `defer lockLifecycle(key)()`.
func lockLifecycle(key string) func() {
	value, _ := lifecycleLocks.LoadOrStore(key, &sync.Mutex{})

	mu, ok := value.(*sync.Mutex)
	if !ok {
		// Unreachable: only *sync.Mutex values are ever stored.
		return func() {}
	}

	mu.Lock()

	return mu.Unlock
}

// deletedForward is the tombstone left in activePortForwards by a delete. It
// has to outlive the entry itself: an absent key cannot mean "deleted", or
// every forward that was never registered (test-built structs, and any path
// that does not go through startPortForward) would silently lose its status
// writes.
type deletedForward struct{}

// isLivePortForward reports whether pf may still write its status for key.
// Callers must hold the key's lifecycle lock.
//
// A delete tombstones the key and a same-ID restart replaces the registered
// instance, so in both cases the value under the key is no longer pf and the
// write is refused. Comparing identity rather than mere cache presence is what
// stops a stale goroutine from resurrecting a deleted forward or overwriting a
// freshly restarted one that happens to share its ID.
//
// An untracked key is writable, which keeps the behaviour of forwards that
// were never registered unchanged.
func isLivePortForward(key string, pf *portForward) bool {
	value, ok := activePortForwards.Load(key)
	if !ok {
		return true
	}

	livePF, ok := value.(*portForward)

	return ok && livePF == pf
}

// storeIfLive applies update to pf and persists the result, but only while pf
// is still the live instance for its key. update reports whether the change
// should be written; it runs with pf's mutex held, so it must not lock it.
//
// The liveness check and the store share the key's lifecycle lock, so a
// concurrent stop or delete happens either entirely before this call (and the
// write is skipped) or entirely after it.
func storeIfLive(c cache.Cache[interface{}], pf *portForward, update func(*portForward) bool) {
	key := portforwardKeyGenerator(*pf)

	defer lockLifecycle(key)()

	if !isLivePortForward(key, pf) {
		return
	}

	if pf.mu != nil {
		pf.mu.Lock()
		defer pf.mu.Unlock()
	}

	if !update(pf) {
		return
	}

	portforwardstore(c, *pf)
}

// unregisterPortForward removes pf from the live instance map only when it is
// still the registered one, so a goroutine cleaning up after a same-ID restart
// cannot unregister the new instance, and cannot clear the tombstone a delete
// left behind. Callers must hold the lifecycle lock.
func unregisterPortForward(key string, pf *portForward) {
	activePortForwards.CompareAndDelete(key, pf)
}

// tombstonePortForward marks key as deleted, so any status still in flight for
// it is refused instead of resurrecting the entry. Callers must hold the
// lifecycle lock; a later start for the same key replaces the tombstone with
// its own live instance.
func tombstonePortForward(key string) {
	activePortForwards.Store(key, deletedForward{})
}

// markLivePortForwardStopped flips the live *portForward instance tracked in
// activePortForwards to STOPPED. The cache only holds value copies, so without
// this the forwarding goroutine's completion path still sees RUNNING and
// re-stores the entry after a delete removed it (resurrecting a ghost entry).
// Callers must hold the key's lifecycle lock.
func markLivePortForwardStopped(key string) {
	liveValue, ok := activePortForwards.Load(key)
	if !ok {
		return
	}

	livePF, ok := liveValue.(*portForward)
	if !ok {
		return
	}

	if livePF.mu != nil {
		livePF.mu.Lock()
		defer livePF.mu.Unlock()
	}

	if livePF.Status != RUNNING {
		return
	}

	livePF.Status = STOPPED

	if livePF.Error == "" {
		livePF.Error = "Port forward stopped."
	}
}

// stopOrDeletePortForward stops or deletes a port forward by its cluster and id.
// It takes three parameters: cluster is the name of the cluster, id is the unique identifier of the port forward,
// isStopRequest is a boolean value indicating whether to stop or delete the port forward.
// It returns an error value indicating whether the operation is successful or not.
func stopOrDeletePortForward(cache cache.Cache[interface{}], cluster string, id string, isStopRequest bool) error {
	portforward, err := getPortForwardByID(cache, cluster, id)
	if err != nil {
		//nolint:goconst
		logger.Log(logger.LevelError, map[string]string{"cluster": cluster, "id": id},
			err, "getting portforward")

		return err
	}

	key := portforwardKeyGenerator(portforward)

	// Hold the lifecycle lock across the whole transition: a terminal write
	// from the forwarding goroutine must not interleave between tombstoning the
	// key and deleting the cached entry, or it would resurrect it.
	defer lockLifecycle(key)()

	// Mark the live instance as STOPPED before signalling shutdown so its
	// completion path does not report RUNNING afterwards.
	markLivePortForwardStopped(key)

	// Always signal the portforward to stop, whether it's a stop or delete request.
	// This prevents orphaned goroutines and leaked ports.
	safeCloseChan(portforward.closeChan)

	if isStopRequest {
		portforward.Status = STOPPED
		portforwardstore(cache, portforward)

		return nil
	}

	// Tombstone first: once the key is marked deleted, storeIfLive refuses any
	// status the goroutine still has in flight, so the delete below is the last
	// word on this key.
	tombstonePortForward(key)

	if err := cache.Delete(context.Background(), key); err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": cluster, "id": id},
			err, "deleting portforward")

		return err
	}

	return nil
}

// getPortForwardList returns a list of port forwards by its cluster name.
func getPortForwardList(cache cache.Cache[interface{}], cluster string) []portForward {
	portforwards, err := cache.GetAll(context.Background(), func(key string) bool {
		return strings.HasPrefix(key, storeKeyPrefix+cluster)
	})
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": cluster},
			err, "getting portforward list")

		return nil
	}

	portForwards := []portForward{}
	for _, v := range portforwards {
		portForwards = append(portForwards, v.(portForward))
	}

	return portForwards
}

// getPortForwardByID returns a port forward by its cluster name and id.
func getPortForwardByID(cache cache.Cache[interface{}], cluster string, id string) (portForward, error) {
	cacheValue, err := cache.Get(context.Background(), storeKeyPrefix+cluster+id)
	if err != nil {
		return portForward{}, fmt.Errorf("failed to get portforward from cache: %w", err)
	}

	pf, ok := cacheValue.(portForward)
	if !ok {
		return portForward{}, fmt.Errorf("failed to convert cache value to portforward")
	}

	return pf, nil
}
