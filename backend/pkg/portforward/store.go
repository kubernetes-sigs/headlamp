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
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const storeKeyPrefix = "PORT_FORWARD_"

// livePortForwards indexes the actual, running *portForward object behind each cache key, so
// a later request for the same cluster/ID can reach the goroutine's own object -- not a cache
// snapshot, which GetPortForwards/GetPortForwardByID return by value -- to extend
// impersonationExpiry (see ExtendImpersonationExpiryForID/-Cluster). An entry is added once,
// in startPortForward, and removed as soon as the port-forward reaches a terminal STOPPED
// status or is explicitly deleted, both of which always go through portforwardstore or
// stopOrDeletePortForward below.
var livePortForwards sync.Map // key: same string portforwardKeyGenerator returns -> *portForward

// registerLivePortForward makes pf reachable by the Extend* functions under the same key
// portforwardstore uses for it.
func registerLivePortForward(pf *portForward) {
	livePortForwards.Store(portforwardKeyGenerator(*pf), pf)
}

// extendImpersonationExpiry extends the impersonationExpiry of every live port-forward whose
// cache key starts with keyPrefix and whose impersonatedUsername equals username, to newExpiry
// -- but only when that is later than its current expiry, so this can only extend, never
// shorten, and only when it was started under impersonation in the first place
// (impersonationExpiry.IsZero() otherwise, meaning this field does not apply to it at all).
func extendImpersonationExpiry(keyPrefix, username string, newExpiry time.Time) {
	if username == "" || newExpiry.IsZero() {
		return
	}

	livePortForwards.Range(func(key, value interface{}) bool {
		keyStr, ok := key.(string)
		if !ok || !strings.HasPrefix(keyStr, keyPrefix) {
			return true
		}

		pf, ok := value.(*portForward)
		if !ok {
			return true
		}

		if pf.mu != nil {
			pf.mu.Lock()
		}

		sameIdentity := !pf.impersonationExpiry.IsZero() && pf.impersonatedUsername == username
		if sameIdentity && newExpiry.After(pf.impersonationExpiry) {
			pf.impersonationExpiry = newExpiry
		}

		if pf.mu != nil {
			pf.mu.Unlock()
		}

		return true
	})
}

// ExtendImpersonationExpiryForID extends the impersonation expiry of the single live
// port-forward identified by cluster and id, when its impersonated identity is username. GET
// .../portforward (by ID) calls this with the identity it just re-verified for this request, so
// an actively-refreshing browser session keeps its port-forward alive past the lifetime of any
// one verified ID token.
func ExtendImpersonationExpiryForID(cluster, id, username string, newExpiry time.Time) {
	extendImpersonationExpiry(storeKeyPrefix+cluster+id, username, newExpiry)
}

// ExtendImpersonationExpiryForCluster extends the impersonation expiry of every live
// port-forward in cluster whose impersonated identity is username. GET .../portforward/list
// calls this the same way ExtendImpersonationExpiryForID does for a single ID.
func ExtendImpersonationExpiryForCluster(cluster, username string, newExpiry time.Time) {
	extendImpersonationExpiry(storeKeyPrefix+cluster, username, newExpiry)
}

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

	if p.Status == STOPPED {
		livePortForwards.Delete(key)
	}

	err := cache.Set(context.Background(), key, p)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "storing portforward")
	}
}

// stopOrDeletePortForward stops or deletes a port forward by its cluster and id.
// It takes three parameters: cluster is the name of the cluster, id is the unique identifier of the port forward,
// isStopRequest is a boolean value indicating whether to stop or delete the port forward.
// It returns an error value indicating whether the operation is successful or not.
func stopOrDeletePortForward(cache cache.Cache[interface{}], cluster string, id string, isStopRequest bool) error {
	portforward, err := getPortForwardByID(cache, cluster, id)
	if err != nil {
		//nolint:goconst // Repeated log message keys are clearer inline than as package constants
		logger.Log(logger.LevelError, map[string]string{"cluster": cluster, "id": id},
			err, "getting portforward")

		return err
	}

	// Always signal the portforward to stop, whether it's a stop or delete request.
	// This prevents orphaned goroutines and leaked ports.
	safeCloseChan(portforward.closeChan)

	if isStopRequest {
		portforward.Status = STOPPED
		portforwardstore(cache, portforward)
	} else {
		livePortForwards.Delete(portforwardKeyGenerator(portforward))

		err := cache.Delete(context.Background(), portforwardKeyGenerator(portforward))
		if err != nil {
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
