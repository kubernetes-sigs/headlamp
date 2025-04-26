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

// stopOrDeletePortForward stops or deletes a port forward by its cluster and id.
// It takes three parameters: cluster is the name of the cluster, id is the unique identifier of the port forward,
// isStopRequest is a boolean value indicating whether to stop or delete the port forward.
// It returns an error value indicating whether the operation is successful or not.
func stopOrDeletePortForward(cache cache.Cache[interface{}], cluster string, id string, isStopRequest bool) error {
	portforward, err := getPortForwardByID(cache, cluster, id)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": cluster, "id": id},
			err, "getting portforward")

		return err
	}

	if isStopRequest {
		// close the channel to stop the portforward
		portforward.closeChan <- struct{}{}
		portforward.Status = STOPPED
		portforwardstore(cache, portforward)
	} else {
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
		return portForward{}, fmt.Errorf("failed to get portforward from cache: %v", err)
	}

	pf, ok := cacheValue.(portForward)
	if !ok {
		return portForward{}, fmt.Errorf("failed to convert cache value to portforward")
	}

	return pf, nil
}
