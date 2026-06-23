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

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const storeKeyPrefix = "PORT_FORWARD_"

// portforwardKeyGenerator generates a unique key
// based on the cluster name, id,service name, and pod name.
func portforwardKeyGenerator(p portForward) string {
	if p.ID != "" {
		return storeKeyPrefix + p.Cluster + p.ID
	}

	key := storeKeyPrefix + p.Cluster

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

// closePortForward looks up a port forward by its cluster and id and signals it
// to stop. Both stopPortForward and deletePortForward need this step to avoid
// orphaned goroutines and leaked ports, so they share it here.
func closePortForward(cache cache.Cache[interface{}], cluster string, id string) (portForward, error) {
	portforward, err := getPortForwardByID(cache, cluster, id)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": cluster, "id": id},
			err, "getting portforward")

		return portForward{}, err
	}

	safeCloseChan(portforward.closeChan)

	return portforward, nil
}

// stopPortForward stops a running port forward, keeping it in the store marked as
// STOPPED so it can be restarted later.
func stopPortForward(cache cache.Cache[interface{}], cluster string, id string) error {
	portforward, err := closePortForward(cache, cluster, id)
	if err != nil {
		return err
	}

	portforward.Status = STOPPED
	portforwardstore(cache, portforward)

	return nil
}

// deletePortForward stops a running port forward and removes it from the store.
func deletePortForward(cache cache.Cache[interface{}], cluster string, id string) error {
	portforward, err := closePortForward(cache, cluster, id)
	if err != nil {
		return err
	}

	if err := cache.Delete(context.Background(), portforwardKeyGenerator(portforward)); err != nil {
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
		return portForward{}, fmt.Errorf("failed to get portforward from cache: %v", err)
	}

	pf, ok := cacheValue.(portForward)
	if !ok {
		return portForward{}, fmt.Errorf("failed to convert cache value to portforward")
	}

	return pf, nil
}
