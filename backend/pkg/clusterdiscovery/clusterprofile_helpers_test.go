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

//nolint:testpackage // tests exercise shared discovery state and source adapters.
package clusterdiscovery

import (
	"encoding/json"
	"strings"

	inventorymetadata "github.com/kubernetes-sigs/headlamp/backend/pkg/clusterinventory/metadata"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/clientcmd/api"
	apisv1alpha1 "sigs.k8s.io/cluster-inventory-api/apis/v1alpha1"
)

type profileSnapshot struct{ profile *apisv1alpha1.ClusterProfile }

func (s profileSnapshot) Get(resource schema.GroupVersionResource, owner types.NamespacedName) (interface{}, bool) {
	return s.profile, resource == clusterProfileResource && s.profile != nil && s.profile.Namespace == owner.Namespace &&
		s.profile.Name == owner.Name
}

func inventoryMetadata(context *kubeconfig.Context) *inventorymetadata.Metadata {
	if context == nil {
		return nil
	}

	var m inventorymetadata.Metadata
	if json.Unmarshal(context.DiscoveryMetadata["clusterInventory"], &m) != nil {
		return nil
	}

	for i := range m.Conditions {
		m.Conditions[i].LastTransitionTime.Time = m.Conditions[i].LastTransitionTime.UTC()
	}

	for i := range m.Properties {
		m.Properties[i].LastObservedTime.Time = m.Properties[i].LastObservedTime.UTC()
	}

	return &m
}

func (r *Runner) contextsFromClusterProfile(key string, cp *apisv1alpha1.ClusterProfile) []*kubeconfig.Context {
	root := strings.TrimSuffix(key, "/"+cp.Namespace+"/"+cp.Name)
	owner := types.NamespacedName{Namespace: cp.Namespace, Name: cp.Name}

	configs, err := r.source.Build(root, owner, profileSnapshot{cp})
	if err != nil {
		panic(err)
	}

	var contexts []*kubeconfig.Context

	for _, config := range configs {
		context, err := r.loadGenerated(root, owner, config)
		if err == nil {
			contexts = append(contexts, context)
		}
	}

	return contexts
}

func oidcContextFromAccessProvider(
	provider *apisv1alpha1.AccessProvider,
	key string,
	oidc *kubeconfig.OidcConfig,
) (*kubeconfig.Context, error) {
	name := "ctx-name"

	cluster, err := ConnectionCluster(
		&api.Cluster{
			Server:                   provider.Cluster.Server,
			TLSServerName:            provider.Cluster.TLSServerName,
			InsecureSkipTLSVerify:    provider.Cluster.InsecureSkipTLSVerify,
			CertificateAuthorityData: provider.Cluster.CertificateAuthorityData,
			ProxyURL:                 provider.Cluster.ProxyURL,
			DisableCompression:       provider.Cluster.DisableCompression,
		},
	)
	if err != nil {
		return nil, err
	}

	runner, err := NewRunner(Options{Store: kubeconfig.NewContextStore(), OIDC: oidc}, NewClusterProfileSource())
	if err != nil {
		return nil, err
	}

	return runner.loadGenerated(
		"root",
		types.NamespacedName{Namespace: "ns", Name: "name"},
		GeneratedKubeconfig{
			Key:       provider.Name,
			Name:      name,
			ClusterID: clusterInventoryIDPrefix + key + "/" + provider.Name,
			Config:    ConfigForCluster(name, cluster, ""),
		},
	)
}
