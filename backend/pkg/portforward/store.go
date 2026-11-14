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
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const storeKeyPrefix = "PORT_FORWARD_"

// keyPartDelimiter separates the cluster portion of a persistent-cache key
// (portforwardKeyGenerator) from the ID/service/pod portion that follows it, using the same NUL
// byte livePortForwardKey already uses for the same reason: without a delimiter, concatenation
// alone is ambiguous both between cluster names (cluster "prod" is a textual prefix of
// "prod-eu"'s keys, so getPortForwardList's prefix match would return prod-eu's entries for a
// request naming only "prod") and between whole (cluster, id) pairs (cluster "prod"+id "1x" and
// cluster "prod1"+id "x" concatenate to the identical key, so getPortForwardByID could return a
// different cluster's record entirely). A NUL byte cannot appear in a cluster name, ID, service,
// or pod name, so it is unambiguous.
const keyPartDelimiter = "\x00"

// livePortForwards indexes the actual, running *portForward object by livePortForwardKey, so a
// later request for the same cluster/ID can reach the goroutine's own object -- not a cache
// snapshot, which GetPortForwards/GetPortForwardByID return by value -- to extend
// impersonationExpiry (see ExtendImpersonationExpiryForID/-Cluster). An entry is added once,
// in startPortForward, and removed as soon as the port-forward reaches a terminal STOPPED
// status or is explicitly deleted, both of which always go through portforwardstore or
// stopOrDeletePortForward below.
var livePortForwards sync.Map // key: livePortForwardKey(cluster, id) -> *portForward

// livePortForwardKey builds livePortForwards' key for p, using a NUL byte between cluster and
// ID. portforwardKeyGenerator below (the persistent cache's own, separately pre-existing key
// scheme) concatenates the two fields with no delimiter at all, which is fine for an exact
// cache.Get(key) lookup but makes any prefix match over those keys ambiguous: a cluster name
// that is a textual prefix of another's (e.g. "prod" / "prod-eu") collides. Because this
// registry is only ever used for prefix/exact matches (see Extend* below) and nothing else
// reads its keys, it is free to use a safer scheme of its own instead of inheriting that
// ambiguity -- NUL cannot appear in either a cluster name or a generated ID, so this delimiter
// is unambiguous.
func livePortForwardKey(cluster, id string) string {
	return cluster + "\x00" + id
}

// registerLivePortForward makes pf reachable by the Extend* functions below, keyed by its
// cluster and ID. Callers always supply a non-empty ID (StartPortForward generates one when the
// request left it blank, before this is ever called).
func registerLivePortForward(pf *portForward) {
	cluster := pf.cacheKey
	if cluster == "" {
		cluster = pf.Cluster
	}

	livePortForwards.Store(livePortForwardKey(cluster, pf.ID), pf)
}

// sameGroupSet reports whether a and b contain the same group membership, ignoring order and
// duplicates: group membership is a set, not a sequence, and a refreshed token's claims are not
// guaranteed to repeat the same order (or dedupe identically) as the token it replaces, even for
// the identical identity. This mirrors cmd/multiplexer.go's own sameGroups, which solves the
// identical problem for WebSocket connection identity binding; it is duplicated rather than
// shared because pkg/portforward cannot import the main package.
func sameGroupSet(a, b []string) bool {
	sortedA := slices.Clone(a)
	sortedB := slices.Clone(b)

	slices.Sort(sortedA)
	slices.Sort(sortedB)

	return slices.Equal(slices.Compact(sortedA), slices.Compact(sortedB))
}

// extendPortForwardExpiry extends pf's impersonationExpiry to newExpiry under pf.mu, but only
// when newExpiry is later than its current expiry (so this can only extend, never shorten),
// pf was started under impersonation in the first place (impersonationExpiry.IsZero()
// otherwise, meaning this field does not apply to it at all), and both username AND group
// membership match the identity pf was started under. Username alone is not enough: pf.rConf's
// own Impersonate.Groups -- the actual authorization a reconnect or ongoing monitor call
// carries -- is fixed at start and never updated, so a later re-verification for the same
// username but a group membership that has since shrunk must not extend this port-forward's
// expiry, or it would keep running under those now-stale, over-broad groups for longer than
// that smaller membership's own token would ever have allowed.
func extendPortForwardExpiry(pf *portForward, username string, groups []string, newExpiry time.Time) {
	if pf.mu != nil {
		pf.mu.Lock()
		defer pf.mu.Unlock()
	}

	sameIdentity := !pf.impersonationExpiry.IsZero() &&
		pf.impersonatedUsername == username && sameGroupSet(pf.impersonatedGroups, groups)
	if sameIdentity && newExpiry.After(pf.impersonationExpiry) {
		pf.impersonationExpiry = newExpiry
	}
}

// ExtendImpersonationExpiryForID extends the impersonation expiry of the single live
// port-forward identified by cluster and id, when its impersonated identity is username/groups.
// GET .../portforward (by ID) calls this with the identity it just re-verified for this
// request, so an actively-refreshing browser session keeps its port-forward alive past the
// lifetime of any one verified ID token.
func ExtendImpersonationExpiryForID(cluster, id, username string, groups []string, newExpiry time.Time) {
	if username == "" || newExpiry.IsZero() {
		return
	}

	value, ok := livePortForwards.Load(livePortForwardKey(cluster, id))
	if !ok {
		return
	}

	pf, ok := value.(*portForward)
	if !ok {
		return
	}

	extendPortForwardExpiry(pf, username, groups, newExpiry)
}

// ExtendImpersonationExpiryForCluster extends the impersonation expiry of every live
// port-forward in cluster whose impersonated identity is username/groups. GET
// .../portforward/list calls this the same way ExtendImpersonationExpiryForID does for a
// single ID.
func ExtendImpersonationExpiryForCluster(cluster, username string, groups []string, newExpiry time.Time) {
	if username == "" || newExpiry.IsZero() {
		return
	}

	prefix := cluster + "\x00"

	livePortForwards.Range(func(key, value interface{}) bool {
		keyStr, ok := key.(string)
		if !ok || !strings.HasPrefix(keyStr, prefix) {
			return true
		}

		pf, ok := value.(*portForward)
		if !ok {
			return true
		}

		extendPortForwardExpiry(pf, username, groups, newExpiry)

		return true
	})
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
		return storeKeyPrefix + clusterKey + keyPartDelimiter + p.ID
	}

	key := storeKeyPrefix + clusterKey + keyPartDelimiter

	if p.Service != "" {
		key += p.Service
	} else if p.Pod != "" {
		key += p.Pod
	}

	return key
}

// livePortForwardKeyFor builds livePortForwards' key for an existing portForward value, using
// the same cacheKey/Cluster fallback registerLivePortForward applies when it first registers it.
func livePortForwardKeyFor(p portForward) string {
	cluster := p.cacheKey
	if cluster == "" {
		cluster = p.Cluster
	}

	return livePortForwardKey(cluster, p.ID)
}

// portforwardstore stores a port forward in the cache.
func portforwardstore(cache cache.Cache[interface{}], p portForward) {
	key := portforwardKeyGenerator(p)

	if p.Status == STOPPED {
		livePortForwards.Delete(livePortForwardKeyFor(p))
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
		livePortForwards.Delete(livePortForwardKeyFor(portforward))

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
		return strings.HasPrefix(key, storeKeyPrefix+cluster+keyPartDelimiter)
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
	cacheValue, err := cache.Get(context.Background(), storeKeyPrefix+cluster+keyPartDelimiter+id)
	if err != nil {
		return portForward{}, fmt.Errorf("failed to get portforward from cache: %w", err)
	}

	pf, ok := cacheValue.(portForward)
	if !ok {
		return portForward{}, fmt.Errorf("failed to convert cache value to portforward")
	}

	return pf, nil
}
