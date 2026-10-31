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

var (
	storeMu             sync.Mutex
	nextGeneration      uint64
	stopOrDeleteBarrier func()
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

// portforwardstoreLocked stores a port forward in the cache, assuming storeMu is held.
func portforwardstoreLocked(cache cache.Cache[interface{}], p portForward) {
	key := portforwardKeyGenerator(p)

	err := cache.Set(context.Background(), key, p)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "storing portforward")
	}
}

// portforwardstore stores a port forward in the cache.
func portforwardstore(cache cache.Cache[interface{}], p portForward) {
	storeMu.Lock()
	defer storeMu.Unlock()

	portforwardstoreLocked(cache, p)
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

	// Retire the resolved instance before closing its channel so any pending or
	// waking terminal writer skips publishing STOPPED to the cache.
	if portforward.state != nil {
		portforward.state.mu.Lock()
		portforward.state.retired = true
		safeCloseChan(portforward.state.closeChan)
		portforward.state.mu.Unlock()
	}

	// Always signal the portforward to stop, whether it's a stop or delete request.
	// This prevents orphaned goroutines and leaked ports.
	safeCloseChan(portforward.closeChan)

	if stopOrDeleteBarrier != nil {
		stopOrDeleteBarrier()
	}

	storeMu.Lock()
	defer storeMu.Unlock()

	// Conditional cache update: only mutate if the cache entry is still this exact instance.
	current, err := getPortForwardByID(cache, cluster, id)
	if err != nil {
		// Entry no longer in cache; nothing to delete or update.
		return nil
	}

	if current.generation > portforward.generation ||
		(current.generation == portforward.generation && portforward.state != nil && current.state != portforward.state) {
		// A replacement instance has been stored under the same key; preserve it.
		return nil
	}

	key := portforwardKeyGenerator(current)

	if isStopRequest {
		current.Status = STOPPED

		if err := cache.Set(context.Background(), key, current); err != nil {
			logger.Log(logger.LevelError, map[string]string{"cluster": cluster, "id": id},
				err, "storing stopped portforward")

			return err
		}
	} else {
		if err := cache.Delete(context.Background(), key); err != nil {
			logger.Log(logger.LevelError, map[string]string{"cluster": cluster, "id": id},
				err, "deleting portforward")

			return err
		}
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
