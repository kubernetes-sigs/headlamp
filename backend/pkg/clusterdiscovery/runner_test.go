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

//nolint:testpackage // exercises source isolation in the shared engine.
package clusterdiscovery

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/rest"
	ciaclient "sigs.k8s.io/cluster-inventory-api/client/clientset/versioned"
	ciafake "sigs.k8s.io/cluster-inventory-api/client/clientset/versioned/fake"
)

func TestSourcesKeepConnectionsAndCRDAvailabilityIndependent(t *testing.T) {
	cluster, secret := capiFixture(t)
	capi, client := capiRunner(t, cluster, secret)
	inventory := newTestRunner(t, Options{Store: capi.store, HubConfig: capi.hubConfig, DiscoverFromStore: true})
	inventory.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return ciafake.NewSimpleClientset(clusterProfile("spoke", "oidc", "https://spoke.example.com")), nil
	}
	ctx := testRunnerContext(t, inventory)
	capiCtx := testRunnerContext(t, capi)
	reconcileAndWaitForRoot(t, ctx, inventory, inClusterRootID)
	requireProfileContextEventually(t, inventory.store, "in-cluster/default/spoke")
	reconcileAndWaitForRoot(t, capiCtx, capi, inClusterRootID)
	require.Eventually(t, func() bool { connections, _ := capi.store.GetContexts(); return len(connections) == 2 },
		5*time.Second, 10*time.Millisecond)
	inventory.reconcileRoots(ctx)
	inventory.mu.Lock()
	require.Len(t, inventory.roots, 1)
	state := inventory.roots[inClusterRootID]
	inventory.mu.Unlock()
	inventory.handleRootWatchError(state, "default", apierrors.NewNotFound(schema.GroupResource{
		Group: "multicluster.x-k8s.io", Resource: "clusterprofiles",
	}, "clusterprofiles"))

	connection := requireDiscovered(t, capi)
	require.Equal(t, "cluster_api", connection.SourceStr())
	require.True(t, inventory.hasNoCRD(state.serverURL))
	require.False(t, capi.hasNoCRD(state.serverURL))
	capi.reconcileRoots(capiCtx)
	require.NoError(t, client.Resource(clusterAPIResource).Namespace("default").Delete(
		capiCtx, "spoke", metav1.DeleteOptions{}))
	require.Eventually(t, func() bool { connections, _ := capi.store.GetContexts(); return len(connections) == 0 },
		5*time.Second, 10*time.Millisecond)
}

func TestCancelledRootCallbacksCannotRecreateConnections(t *testing.T) {
	cluster, secret := capiFixture(t)
	runner, _ := capiRunner(t, cluster, secret)
	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)
	requireDiscovered(t, runner)
	runner.mu.Lock()
	state := runner.roots[inClusterRootID]
	runner.mu.Unlock()
	runner.stopRoot(inClusterRootID, true)
	runner.handleChange(state, state.watches[0], clusterAPIResource, cluster, false)
	connections, err := runner.store.GetContexts()
	require.NoError(t, err)
	require.Empty(t, connections)
}
