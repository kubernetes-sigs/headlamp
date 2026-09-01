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

package clusterapi

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	discoveryfake "k8s.io/client-go/discovery/fake"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	clienttesting "k8s.io/client-go/testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterregistration"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
)

func discoveryFor(groupVersions ...string) *discoveryfake.FakeDiscovery {
	resources := make([]*metav1.APIResourceList, 0, len(groupVersions))
	for _, groupVersion := range groupVersions {
		resources = append(resources, &metav1.APIResourceList{
			GroupVersion: groupVersion,
			APIResources: []metav1.APIResource{{Name: "clusters"}},
		})
	}

	return &discoveryfake.FakeDiscovery{Fake: &clienttesting.Fake{Resources: resources}}
}

func capiCluster(name, host string) *unstructured.Unstructured {
	cluster := &unstructured.Unstructured{Object: map[string]interface{}{
		"apiVersion": "cluster.x-k8s.io/v1beta1",
		"kind":       "Cluster",
		"metadata": map[string]interface{}{
			"name":      name,
			"namespace": "headlamp",
			"uid":       "uid-" + name,
		},
	}}
	if host != "" {
		cluster.Object["spec"] = map[string]interface{}{
			"controlPlaneEndpoint": map[string]interface{}{
				"host": host,
				"port": int64(6443),
			},
		}
	}

	return cluster
}

func TestRunnerListsWatchesAndExcludesEndpointlessClusters(t *testing.T) {
	store := kubeconfig.NewContextStore()
	registry := clusterregistration.New(store)

	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{clusterGVR("v1beta1"): "ClusterList"},
		capiCluster("ready", "ready.example.com"),
		capiCluster("pending", ""),
	)
	runner, err := newRunner(Options{
		Registry:      registry,
		OriginCluster: "hub",
		Namespaces:    "headlamp",
		OIDCConfig:    &kubeconfig.OidcConfig{ClientID: "headlamp"},
	}, discoveryFor("cluster.x-k8s.io/v1beta1"), client)
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	go runner.Run(ctx)

	require.Eventually(t, func() bool {
		return len(registry.Snapshot().Items) == 1
	}, 5*time.Second, 20*time.Millisecond)

	registration := registry.Snapshot().Items[0]
	assert.Equal(t, "ready", registration.DisplayName)
	assert.Equal(t, registrationSource, registration.Source)
	assert.Equal(t, "hub", registration.Origin.Cluster)
	assert.Equal(t, "Cluster", registration.Origin.Resource.Kind)
	assert.Equal(t, "uid-ready", registration.Origin.Resource.UID)

	pending := capiCluster("pending", "pending.example.com")
	pending.SetUID(types.UID("uid-pending"))
	_, err = client.Resource(clusterGVR("v1beta1")).Namespace("headlamp").Update(ctx, pending, metav1.UpdateOptions{})
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		return len(registry.Snapshot().Items) == 2
	}, 5*time.Second, 20*time.Millisecond)

	err = client.Resource(clusterGVR("v1beta1")).Namespace("headlamp").Delete(ctx, "ready", metav1.DeleteOptions{})
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		registrations := registry.Snapshot().Items
		return len(registrations) == 1 && registrations[0].DisplayName == "pending"
	}, 5*time.Second, 20*time.Millisecond)
}

func TestResolveClusterGVRPrefersV1Beta2AndFallsBackToV1Beta1(t *testing.T) {
	t.Run("prefers v1beta2", func(t *testing.T) {
		got, err := resolveClusterGVR(discoveryFor("cluster.x-k8s.io/v1beta2", "cluster.x-k8s.io/v1beta1"))
		require.NoError(t, err)
		assert.Equal(t, clusterGVR("v1beta2"), got)
	})

	t.Run("falls back to v1beta1", func(t *testing.T) {
		got, err := resolveClusterGVR(discoveryFor("cluster.x-k8s.io/v1beta1"))
		require.NoError(t, err)
		assert.Equal(t, clusterGVR("v1beta1"), got)
	})

	t.Run("fails without a clusters resource", func(t *testing.T) {
		_, err := resolveClusterGVR(discoveryFor())
		require.Error(t, err)
	})
}

func TestRunReturnsWithoutAServedClusterResource(t *testing.T) {
	runner, err := newRunner(Options{
		Registry:      clusterregistration.New(kubeconfig.NewContextStore()),
		OriginCluster: "hub",
		Namespaces:    "headlamp",
	}, discoveryFor(), nil)
	require.NoError(t, err)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	done := make(chan struct{})

	go func() {
		defer close(done)

		runner.Run(ctx)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Run did not return after its context was cancelled")
	}
}

func TestControlPlaneServer(t *testing.T) {
	const (
		host        = "ready.example.com"
		defaultedTo = "https://ready.example.com:6443"
	)

	endpoint := func(host string, port int64) map[string]interface{} {
		return map[string]interface{}{"host": host, "port": port}
	}

	tests := []struct {
		name     string
		endpoint map[string]interface{}
		want     string
		wantOK   bool
	}{
		{name: "host and port", endpoint: endpoint(host, 6443), want: defaultedTo, wantOK: true},
		{
			name:     "ipv6 host",
			endpoint: endpoint("2001:db8::1", 8443),
			want:     "https://[2001:db8::1]:8443",
			wantOK:   true,
		},
		{name: "zero port defaults", endpoint: endpoint(host, 0), want: defaultedTo, wantOK: true},
		{
			name:     "missing port defaults",
			endpoint: map[string]interface{}{"host": host},
			want:     defaultedTo,
			wantOK:   true,
		},
		{name: "missing endpoint"},
		{name: "blank host", endpoint: endpoint("   ", 6443)},
		{name: "port out of range", endpoint: endpoint(host, 70000)},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cluster := capiCluster("cluster", "")
			if tc.endpoint != nil {
				cluster.Object["spec"] = map[string]interface{}{"controlPlaneEndpoint": tc.endpoint}
			}

			server, ok := controlPlaneServer(cluster)
			assert.Equal(t, tc.wantOK, ok)
			assert.Equal(t, tc.want, server)
		})
	}
}
