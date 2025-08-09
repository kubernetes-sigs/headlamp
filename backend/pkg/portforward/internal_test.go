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
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestPortforwardKeyGenerator tests portforwardKeyGenerator function.
func TestPortforwardKeyGenerator(t *testing.T) {
	tests := []struct {
		name string
		p    portForward
		want string
	}{
		{"only_cluster_id", portForward{ID: "id", Cluster: "cluster"}, "PORT_FORWARD_clusterid"},
		{"only_service", portForward{Cluster: "cluster", Service: "service"}, "PORT_FORWARD_clusterservice"},
		{"only_pod", portForward{Cluster: "cluster", Pod: "pod"}, "PORT_FORWARD_clusterpod"},
		{"service_and_pod", portForward{Cluster: "cluster", Service: "service", Pod: "pod"}, "PORT_FORWARD_clusterservice"},
		{"id_and_service", portForward{Cluster: "cluster", ID: "id", Service: "service"}, "PORT_FORWARD_clusterid"},
		{"id_and_pod", portForward{Cluster: "cluster", ID: "id", Pod: "pod"}, "PORT_FORWARD_clusterid"},
		{
			"id_and_service_and_pod",
			portForward{Cluster: "cluster", ID: "id", Service: "service", Pod: "pod"},
			"PORT_FORWARD_clusterid",
		},
	}

	for _, tt := range tests {
		testname := tt.name
		t.Run(testname, func(t *testing.T) {
			key := portforwardKeyGenerator(tt.p)
			assert.Equal(t, tt.want, key)
		})
	}
}

// TestPortforwardStore tests portforwardstore function.
func TestPortforwardStore(t *testing.T) {
	cache := cache.New[interface{}]()
	p := portForward{ID: "id", Cluster: "cluster"}
	portforwardstore(cache, p)

	key := portforwardKeyGenerator(p)

	pFromCache, err := cache.Get(context.Background(), key)
	require.NoError(t, err)
	assert.Equal(t, p, pFromCache.(portForward))
}

// TestGetPortForwardByID tests getPortForwardByID function.
func TestGetPortForwardByID(t *testing.T) {
	cache := cache.New[interface{}]()
	p := portForward{ID: "id", Cluster: "cluster"}
	err := cache.Set(context.Background(), portforwardKeyGenerator(p), p)
	require.NoError(t, err)

	pFromCache, err := getPortForwardByID(cache, "cluster", "id")
	require.NoError(t, err)
	assert.Equal(t, p, pFromCache)

	_, err = getPortForwardByID(cache, "cluster", "id2")
	assert.Error(t, err)

	err = cache.Set(context.Background(), portforwardKeyGenerator(portForward{ID: "id2", Cluster: "cluster"}), "test")
	require.NoError(t, err)

	_, err = getPortForwardByID(cache, "cluster", "id2")
	assert.Error(t, err)
}

// TestStopOrDeletePortForward tests stopOrDeletePortForward function.
func TestStopOrDeletePortForward(t *testing.T) {
	cache := cache.New[interface{}]()
	ch := make(chan struct{}, 1)

	p := portForward{ID: "id", Cluster: "cluster", closeChan: ch}

	err := cache.Set(context.Background(), portforwardKeyGenerator(p), p)
	require.NoError(t, err)

	err = stopOrDeletePortForward(cache, "cluster", "id", true)
	assert.NoError(t, err)

	chanValue := <-ch
	assert.Equal(t, struct{}{}, chanValue)

	pFromCache, err := getPortForwardByID(cache, "cluster", "id")
	require.NoError(t, err)
	assert.NotEqual(t, portForward{}, pFromCache)
	assert.Equal(t, STOPPED, pFromCache.Status)

	err = stopOrDeletePortForward(cache, "cluster", "id", false)
	require.NoError(t, err)

	_, err = cache.Get(context.Background(), portforwardKeyGenerator(p))
	assert.Error(t, err)
}

// TestGetPortForwardList tests getPortForwardList function.
func TestGetPortForwardList(t *testing.T) {
	p1 := portForward{ID: "id1", Cluster: "cluster1"}
	p2 := portForward{ID: "id2", Cluster: "cluster1"}
	p3 := portForward{ID: "id3", Cluster: "cluster2"}

	cache := cache.New[interface{}]()

	err := cache.Set(context.Background(), portforwardKeyGenerator(p1), p1)
	require.NoError(t, err)

	err = cache.Set(context.Background(), portforwardKeyGenerator(p2), p2)
	require.NoError(t, err)

	err = cache.Set(context.Background(), portforwardKeyGenerator(p3), p3)
	require.NoError(t, err)

	pfList := getPortForwardList(cache, "cluster1")
	assert.ElementsMatch(t, []portForward{p1, p2}, pfList)

	pfList = getPortForwardList(cache, "cluster2")

	require.NoError(t, err)
	assert.ElementsMatch(t, []portForward{p3}, pfList)
}

// Test portForwardRequest.Validate() function.
func TestPortForwardRequestValidate(t *testing.T) {
	req := portForwardRequest{}

	err := req.Validate()
	assert.EqualError(t, err, "namespace is required")

	req.Namespace = "namespace"

	err = req.Validate()
	assert.EqualError(t, err, "pod name is required")

	req.Pod = "pod"

	err = req.Validate()
	assert.EqualError(t, err, "targetPort is required")

	req.TargetPort = "targetPort"

	err = req.Validate()
	assert.NoError(t, err)
}

// TestStopOrDeletePortForwardRequest.Validate() function.
func TestStopOrDeletePortForwardRequestValidate(t *testing.T) {
	req := stopOrDeletePortForwardRequest{}

	err := req.Validate()
	assert.EqualError(t, err, "invalid request, id is required")

	req.ID = "id"

	err = req.Validate()
	assert.NoError(t, err)
}
