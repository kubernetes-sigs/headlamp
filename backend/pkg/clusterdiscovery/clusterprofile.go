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

package clusterdiscovery

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"

	inventorymetadata "github.com/kubernetes-sigs/headlamp/backend/pkg/clusterinventory/metadata"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"

	apisv1alpha1 "sigs.k8s.io/cluster-inventory-api/apis/v1alpha1"
	ciaclient "sigs.k8s.io/cluster-inventory-api/client/clientset/versioned"
	externalversions "sigs.k8s.io/cluster-inventory-api/client/informers/externalversions"
)

const (
	clusterInventoryContextPrefix = "cluster-inventory-"
	clusterInventoryIDPrefix      = "cluster-inventory/"
)

var clusterProfileResource = schema.GroupVersionResource{
	Group:    apisv1alpha1.Group,
	Version:  apisv1alpha1.Version,
	Resource: "clusterprofiles",
}

type clusterProfileSource struct {
	clientForConfig func(*rest.Config) (ciaclient.Interface, error)
}

func NewClusterProfileSource() Source {
	return &clusterProfileSource{
		clientForConfig: func(config *rest.Config) (ciaclient.Interface, error) {
			return ciaclient.NewForConfig(config)
		},
	}
}

func (*clusterProfileSource) Descriptor() Descriptor {
	return Descriptor{
		ID:          "cluster_inventory",
		DisplayName: "Cluster Inventory API",
		View: SourceView{NameLabel: "ClusterProfile", Columns: []SourceColumn{
			{Key: logFieldNamespace, Label: "Resource namespace"}, {Key: "provider", Label: "Access provider"},
		}, SummaryFields: []string{"namespace", "provider"}},
		Resource:      clusterProfileResource,
		ContextSource: kubeconfig.ClusterInventory,
	}
}

func (s *clusterProfileSource) Watches(config *rest.Config, namespace, selector string) ([]ResourceWatch, error) {
	client, err := s.clientForConfig(config)
	if err != nil {
		return nil, err
	}

	factory := externalversions.NewSharedInformerFactoryWithOptions(
		client,
		0,
		externalversions.WithNamespace(namespace),
		externalversions.WithTweakListOptions(
			func(opts *metav1.ListOptions) {
				opts.LabelSelector = selector
			},
		),
	)

	return []ResourceWatch{
		{
			Resource: clusterProfileResource,
			Factory:  factory,
			Informer: factory.Apis().V1alpha1().ClusterProfiles().Informer(),
		},
	}, nil
}

func (*clusterProfileSource) OwnersForChange(_ schema.GroupVersionResource, obj interface{}) []types.NamespacedName {
	return objectOwner(obj)
}

func (*clusterProfileSource) Build(
	root string,
	owner types.NamespacedName,
	snapshot Snapshot,
) ([]GeneratedKubeconfig, error) {
	obj, exists := snapshot.Get(clusterProfileResource, owner)
	if !exists {
		return nil, nil
	}

	cp, ok := obj.(*apisv1alpha1.ClusterProfile)
	if !ok {
		return nil, fmt.Errorf("unexpected ClusterProfile object %T", obj)
	}

	key := makeOwnerKey(root, cp.Namespace+"/"+cp.Name)

	metadata, err := json.Marshal(clusterInventoryMetadataFromProfile(key, cp))
	if err != nil {
		return nil, err
	}

	outputs := make([]GeneratedKubeconfig, 0, len(cp.Status.AccessProviders))
	for i := range cp.Status.AccessProviders {
		provider := &cp.Status.AccessProviders[i]

		entry, err := clusterProfileConnection(provider, key, metadata)
		if err != nil {
			logger.Log(
				logger.LevelWarn,
				map[string]string{
					"clusterprofile": key,
					"provider":       provider.Name,
				},
				err,
				"discovery: ignored invalid connection",
			)

			continue
		}

		outputs = append(outputs, entry)
	}

	return outputs, nil
}

func clusterInventoryMetadataFromProfile(
	profileKey string,
	cp *apisv1alpha1.ClusterProfile,
) *inventorymetadata.Metadata {
	metadata := &inventorymetadata.Metadata{
		Profile: inventorymetadata.Profile{
			Namespace: cp.Namespace,
			Name:      cp.Name,
			Key:       profileKey,
		},
		Conditions: append([]metav1.Condition(nil), cp.Status.Conditions...),
	}

	if cp.Status.Version.Kubernetes != "" {
		metadata.Version = &inventorymetadata.Version{
			Kubernetes: cp.Status.Version.Kubernetes,
		}
	}

	if len(cp.Status.Properties) > 0 {
		metadata.Properties = make([]inventorymetadata.Property, len(cp.Status.Properties))
		for i, property := range cp.Status.Properties {
			metadata.Properties[i] = inventorymetadata.Property{
				Name:             property.Name,
				Value:            property.Value,
				LastObservedTime: property.LastObservedTime,
			}
		}
	}

	return metadata
}

func contextNameFromProfileKey(profileKey, providerName string) string {
	return clusterInventoryContextPrefix + kubeconfig.MakeDNSFriendly(profileKey) + "--" +
		profileKeyHashSuffix(profileKey+"\x00"+providerName) + "-" + kubeconfig.MakeDNSFriendly(providerName)
}

func profileKeyHashSuffix(profileKey string) string {
	sum := sha256.Sum256([]byte(profileKey))

	return hex.EncodeToString(sum[:6])
}

func clusterProfileConnection(
	provider *apisv1alpha1.AccessProvider,
	key string,
	metadata json.RawMessage,
) (GeneratedKubeconfig, error) {
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
		return GeneratedKubeconfig{}, err
	}

	name := contextNameFromProfileKey(key, provider.Name)

	return GeneratedKubeconfig{
		Key:          provider.Name,
		Name:         name,
		ClusterID:    clusterInventoryIDPrefix + key + "/" + url.PathEscape(provider.Name),
		Config:       ConfigForCluster(name, cluster, ""),
		Metadata:     map[string]json.RawMessage{"clusterInventory": metadata},
		Presentation: &kubeconfig.ConnectionPresentation{Fields: map[string]string{"provider": provider.Name}},
	}, nil
}
