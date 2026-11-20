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

//nolint:testpackage // tests exercise shared discovery state through a source defined outside the engine.
package clusterdiscovery

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"
)

// The tests in this file add a source that exists only here. Nothing outside
// this file knows about it, so they show what a new source costs: one type that
// implements Source. Production code registers it with one line in BuiltinSources.

const (
	sampleFleetID          = "sample_fleet"
	sampleFleetLeakedToken = "sample-fleet-must-not-forward-this-token"
	sampleFleetEventually  = 5 * time.Second
	sampleFleetTick        = 10 * time.Millisecond
)

var sampleFleetResource = schema.GroupVersionResource{Group: "example.com", Version: "v1", Resource: "fleetmembers"}

// sampleFleetSource discovers FleetMember resources that carry a server URL and a region.
type sampleFleetSource struct {
	client dynamic.Interface
	// mutate lets a test make the source break the output contract.
	mutate func(owner types.NamespacedName, g *GeneratedKubeconfig)
}

func (*sampleFleetSource) Descriptor() Descriptor {
	return Descriptor{
		ID:          sampleFleetID,
		DisplayName: "Sample Fleet",
		Resource:    sampleFleetResource,
		View: SourceView{
			NameLabel:     "Member",
			Columns:       []SourceColumn{{Key: "region", Label: "Region"}},
			SummaryFields: []string{"region"},
		},
	}
}

func (s *sampleFleetSource) Watches(_ *rest.Config, namespace, selector string) ([]ResourceWatch, error) {
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(
		s.client, 0, namespace, func(opts *metav1.ListOptions) { opts.LabelSelector = selector },
	)

	return []ResourceWatch{{
		Resource: sampleFleetResource,
		Factory:  factory,
		Informer: factory.ForResource(sampleFleetResource).Informer(),
	}}, nil
}

func (*sampleFleetSource) OwnersForChange(_ schema.GroupVersionResource, obj interface{}) []types.NamespacedName {
	return objectOwner(obj)
}

func (s *sampleFleetSource) Build(
	root string,
	owner types.NamespacedName,
	snapshot Snapshot,
) ([]GeneratedKubeconfig, error) {
	obj, exists := snapshot.Get(sampleFleetResource, owner)
	if !exists {
		return nil, nil
	}

	member, ok := obj.(*unstructured.Unstructured)
	if !ok {
		return nil, fmt.Errorf("unexpected FleetMember object %T", obj)
	}

	server, _, _ := unstructured.NestedString(member.Object, "spec", "server")
	region, _, _ := unstructured.NestedString(member.Object, "spec", "region")
	key := makeOwnerKey(root, owner.Namespace+"/"+owner.Name)
	name := "sample-fleet-" + kubeconfig.MakeDNSFriendly(key)

	// A careless source may copy credentials into its output. The engine has to drop them.
	config := ConfigForCluster(name, &api.Cluster{Server: server, CertificateAuthorityData: testCAPEM()}, "")
	config.Contexts[name].AuthInfo = "member"
	config.AuthInfos = map[string]*api.AuthInfo{"member": {Token: sampleFleetLeakedToken}}

	metadata, err := json.Marshal(map[string]string{"region": region})
	if err != nil {
		return nil, err
	}

	generated := GeneratedKubeconfig{
		Key:          "default",
		Name:         name,
		ClusterID:    "sample-fleet/" + key,
		Config:       config,
		Metadata:     map[string]json.RawMessage{"sampleFleet": metadata},
		Presentation: &kubeconfig.ConnectionPresentation{Fields: map[string]string{"region": region}},
	}

	if s.mutate != nil {
		s.mutate(owner, &generated)
	}

	return []GeneratedKubeconfig{generated}, nil
}

func sampleFleetMember(name, server, region string) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]interface{}{
		"apiVersion": "example.com/v1",
		"kind":       "FleetMember",
		"metadata":   map[string]interface{}{"name": name, "namespace": "default"},
		"spec":       map[string]interface{}{"server": server, "region": region},
	}}
}

// sampleFleetRunner runs the sample source through the unmodified engine.
func sampleFleetRunner(
	t *testing.T,
	store kubeconfig.ContextStore,
	source *sampleFleetSource,
	members ...runtime.Object,
) (*Runner, *dynamicfake.FakeDynamicClient) {
	t.Helper()

	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{sampleFleetResource: "FleetMemberList"},
		members...,
	)
	source.client = client

	if store == nil {
		store = kubeconfig.NewContextStore()
	}

	runner, err := NewRunner(
		Options{Store: store, OIDC: testOIDCOptions(), HubConfig: &rest.Config{Host: "https://hub.example.com"}},
		source,
	)
	require.NoError(t, err)

	return runner, client
}

func requireContextCount(t *testing.T, store kubeconfig.ContextStore, want int) {
	t.Helper()

	require.Eventually(t, func() bool {
		contexts, _ := store.GetContexts()

		return len(contexts) == want
	}, sampleFleetEventually, sampleFleetTick)
}

func TestSampleSourceJoinsRegistryAndClientViews(t *testing.T) {
	registry := BuiltinSources()
	require.NoError(t, registry.Register(&sampleFleetSource{}))
	require.ErrorContains(t, registry.Register(&sampleFleetSource{}), "already registered")
	require.Equal(t, "sample-fleet", Descriptor{ID: sampleFleetID}.FlagPrefix())

	var offered []string

	for _, view := range ClientSourceViews(registry, map[string]Settings{sampleFleetID: {Enabled: true}}) {
		offered = append(offered, view.ID)

		if view.ID != sampleFleetID {
			continue
		}

		require.Equal(t, SourceView{
			ID:            sampleFleetID,
			Label:         "Sample Fleet",
			NameLabel:     "Member",
			Columns:       []SourceColumn{{Key: "region", Label: "Region"}},
			SummaryFields: []string{"region"},
			Configured:    true,
		}, view)
	}

	require.Contains(t, offered, sampleFleetID)

	for _, view := range ClientSourceViews(registry, nil) {
		require.NotEqual(t, sampleFleetID, view.ID, "a disabled source must not be offered")
	}
}

func TestSampleSourceUsesSharedOIDCLifecycle(t *testing.T) {
	runner, client := sampleFleetRunner(t, nil, &sampleFleetSource{},
		sampleFleetMember("edge-1", "https://edge-1.example.com", "eu"))
	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	connection := requireDiscovered(t, runner)
	require.Equal(t, sampleFleetID, connection.SourceStr())
	require.Equal(t, kubeconfig.DiscoveredCluster, connection.Source)
	require.True(t, connection.IsDiscovered())
	require.False(t, connection.CanRename())
	require.Equal(t, "oidc", connection.AuthType())
	require.True(t, connection.RequiresUserAuthentication())
	require.Equal(t, testOIDCOptions().ClientID, connection.OidcConf.ClientID)
	require.Equal(t, "https://edge-1.example.com", connection.Cluster.Server)
	require.Equal(t, &kubeconfig.DiscoveryOrigin{
		Source: sampleFleetID, DisplayName: "Sample Fleet", Root: inClusterRootID,
		Namespace: "default", Name: "edge-1", Entry: "default",
	}, connection.Discovery)
	require.Equal(t, "sample-fleet/in-cluster/default/edge-1", connection.ClusterID)
	require.JSONEq(t, `{"region":"eu"}`, string(connection.DiscoveryMetadata["sampleFleet"]))
	require.Equal(t, map[string]string{
		"region": "eu", "namespace": "default", "root": inClusterRootID,
	}, connection.PublicPresentation().Fields)
	require.Equal(t, "edge-1", connection.PublicPresentation().DisplayName)

	// The engine, not the source, decides which credentials a connection carries.
	require.Empty(t, connection.AuthInfo.Token)
	serialized, err := json.Marshal(connection)
	require.NoError(t, err)
	require.NotContains(t, string(serialized), sampleFleetLeakedToken)
	require.NotContains(t, string(serialized), testOIDCOptions().ClientSecret)

	// An update keeps the connection name and ID but follows the resource.
	moved := sampleFleetMember("edge-1", "https://edge-1-new.example.com", "us")
	_, err = client.Resource(sampleFleetResource).Namespace("default").Update(ctx, moved, metav1.UpdateOptions{})
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		contexts, _ := runner.store.GetContexts()

		return len(contexts) == 1 && contexts[0].Cluster.Server == "https://edge-1-new.example.com" &&
			contexts[0].Name == connection.Name && contexts[0].ClusterID == connection.ClusterID &&
			contexts[0].PublicPresentation().Fields["region"] == "us"
	}, sampleFleetEventually, sampleFleetTick)

	// Deleting the resource removes the connection.
	require.NoError(t, client.Resource(sampleFleetResource).Namespace("default").Delete(
		ctx, "edge-1", metav1.DeleteOptions{}))
	requireContextCount(t, runner.store, 0)
}

// The engine validates every source's output, so a faulty source cannot publish a bad connection.
func TestEngineRejectsSampleSourceOutputThatBreaksTheContract(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(g *GeneratedKubeconfig)
	}{
		{"more than one context", func(g *GeneratedKubeconfig) {
			g.Config.Contexts["extra"] = &api.Context{Cluster: g.Name}
		}},
		{"plain HTTP server", func(g *GeneratedKubeconfig) {
			g.Config.Clusters[g.Name].Server = "http://bad.example.com"
		}},
		{"server URL with embedded credentials", func(g *GeneratedKubeconfig) {
			g.Config.Clusters[g.Name].Server = "https://user:pass@bad.example.com"
		}},
		{"missing connection ID", func(g *GeneratedKubeconfig) { g.ClusterID = "" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			source := &sampleFleetSource{mutate: func(owner types.NamespacedName, g *GeneratedKubeconfig) {
				if owner.Name == "bad" {
					tc.mutate(g)
				}
			}}
			runner, _ := sampleFleetRunner(t, nil, source,
				sampleFleetMember("good", "https://good.example.com", "eu"),
				sampleFleetMember("bad", "https://bad.example.com", "eu"))
			reconcileAndWaitForRoot(t, testRunnerContext(t, runner), runner, inClusterRootID)

			// The valid member proves events were processed before the invalid one is judged.
			good := requireDiscovered(t, runner)
			require.Equal(t, "default", good.Discovery.Namespace)
			require.Equal(t, "good", good.Discovery.Name)
			require.Never(t, func() bool {
				contexts, _ := runner.store.GetContexts()

				return len(contexts) > 1
			}, 300*time.Millisecond, sampleFleetTick)
		})
	}
}

// A new source shares the store with built-in sources and fails independently of them.
func TestSampleSourceCoexistsWithBuiltinSources(t *testing.T) {
	cluster, secret := capiFixture(t)
	capi, _ := capiRunner(t, cluster, secret)
	sample, _ := sampleFleetRunner(t, capi.store, &sampleFleetSource{},
		sampleFleetMember("edge-1", "https://edge-1.example.com", "eu"))

	reconcileAndWaitForRoot(t, testRunnerContext(t, capi), capi, inClusterRootID)
	sampleCtx := testRunnerContext(t, sample)
	reconcileAndWaitForRoot(t, sampleCtx, sample, inClusterRootID)
	requireContextCount(t, capi.store, 2)

	sources := map[string]bool{}

	contexts, err := capi.store.GetContexts()
	require.NoError(t, err)

	for _, connection := range contexts {
		sources[connection.SourceStr()] = true
	}

	require.Equal(t, map[string]bool{"cluster_api": true, sampleFleetID: true}, sources)

	sample.mu.Lock()
	state := sample.roots[inClusterRootID]
	sample.mu.Unlock()

	// Losing the sample CRD removes only the sample source's connection.
	sample.handleRootWatchError(state, "default", apierrors.NewNotFound(schema.GroupResource{
		Group: "example.com", Resource: "fleetmembers",
	}, "fleetmembers"))
	require.True(t, sample.hasNoCRD(state.serverURL))
	require.False(t, capi.hasNoCRD(state.serverURL))
	requireContextCount(t, capi.store, 1)

	remaining := requireDiscovered(t, capi)
	require.Equal(t, "cluster_api", remaining.SourceStr())
}
