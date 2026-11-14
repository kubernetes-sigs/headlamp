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
	"errors"
	"fmt"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

var (
	clusterAPIResource = schema.GroupVersionResource{Group: "cluster.x-k8s.io", Version: "v1beta2", Resource: "clusters"}
	secretResource     = schema.GroupVersionResource{Version: "v1", Resource: "secrets"}
)

const clusterNameLabel = "cluster.x-k8s.io/cluster-name"

// clusterAPISource discovers Cluster API workload clusters from Clusters and their
// kubeconfig Secrets.
type clusterAPISource struct {
	// clientForConfig creates the client for a discovery root. Tests replace it.
	clientForConfig func(*rest.Config) (dynamic.Interface, error)
}

// NewClusterAPISource discovers v1beta2 workload clusters without importing their credentials.
func NewClusterAPISource() Source {
	return &clusterAPISource{
		clientForConfig: func(config *rest.Config) (dynamic.Interface, error) {
			return dynamic.NewForConfig(config)
		},
	}
}

// Descriptor identifies the source and the fields shown for its connections.
func (*clusterAPISource) Descriptor() Descriptor {
	return Descriptor{
		ID: "cluster_api", DisplayName: "Cluster API", Resource: clusterAPIResource,
		View: SourceView{
			NameLabel: "Cluster",
			Columns: []SourceColumn{
				{Key: logFieldNamespace, Label: "Resource namespace"}, {Key: logFieldRoot, Label: "Management context"},
			},
			DetailFields:  []SourceColumn{{Key: "secret", Label: "Kubeconfig Secret"}},
			SummaryFields: []string{logFieldNamespace, logFieldRoot},
		},
	}
}

// Watches watches the Clusters matching the selector, and the Secrets that carry a
// Cluster API cluster name label.
func (s *clusterAPISource) Watches(config *rest.Config, namespace, selector string) ([]ResourceWatch, error) {
	client, err := s.clientForConfig(config)
	if err != nil {
		return nil, err
	}

	clusters := dynamicinformer.NewFilteredDynamicSharedInformerFactory(
		client,
		0,
		namespace,
		func(opts *metav1.ListOptions) {
			opts.LabelSelector = selector
		},
	)
	secrets := dynamicinformer.NewFilteredDynamicSharedInformerFactory(
		client,
		0,
		namespace,
		func(opts *metav1.ListOptions) {
			opts.LabelSelector = clusterNameLabel
		},
	)

	return []ResourceWatch{
		{Resource: clusterAPIResource, Factory: clusters, Informer: clusters.ForResource(clusterAPIResource).Informer()},
		{Resource: secretResource, Factory: secrets, Informer: secrets.ForResource(secretResource).Informer()},
	}, nil
}

// OwnersForChange maps a Cluster to itself and a "<cluster>-kubeconfig" Secret to its
// Cluster. Other Secrets have no owner.
func (*clusterAPISource) OwnersForChange(resource schema.GroupVersionResource, obj interface{}) []types.NamespacedName {
	owners := objectOwner(obj)
	if resource == secretResource {
		if len(owners) != 1 || !strings.HasSuffix(owners[0].Name, "-kubeconfig") {
			return nil
		}

		owners[0].Name = strings.TrimSuffix(owners[0].Name, "-kubeconfig")
	}

	return owners
}

// Build returns the connection of a Cluster from its kubeconfig Secret, or none while
// either of them is missing. Only the endpoint, TLS settings and namespace of the
// selected kubeconfig context are used.
func (*clusterAPISource) Build(
	root string,
	owner types.NamespacedName,
	snapshot Snapshot,
) ([]GeneratedKubeconfig, error) {
	if _, exists := snapshot.Get(clusterAPIResource, owner); !exists {
		return nil, nil
	}

	secretName := owner.Name + "-kubeconfig"

	obj, exists := snapshot.Get(secretResource, types.NamespacedName{Namespace: owner.Namespace, Name: secretName})
	if !exists {
		return nil, nil
	}

	config, err := clusterAPIKubeconfig(owner, secretName, obj)
	if err != nil {
		return nil, err
	}

	selected, err := selectedKubeconfigContext(config)
	if err != nil {
		return nil, err
	}

	cluster, err := ConnectionCluster(config.Clusters[selected.Cluster])
	if err != nil {
		return nil, err
	}

	key := makeOwnerKey(root, owner.Namespace+"/"+owner.Name)
	sum := sha256.Sum256([]byte(key))
	name := "cluster-api-" + kubeconfig.MakeDNSFriendly(key) + "--" + hex.EncodeToString(sum[:6])

	metadata, err := clusterAPIMetadata(root, owner, secretName)
	if err != nil {
		return nil, err
	}

	return []GeneratedKubeconfig{
		{
			Key:          "default",
			Name:         name,
			ClusterID:    "cluster-api/" + key,
			Config:       ConfigForCluster(name, cluster, selected.Namespace),
			Metadata:     map[string]json.RawMessage{"clusterAPI": metadata},
			Presentation: &kubeconfig.ConnectionPresentation{Fields: map[string]string{"secret": secretName}},
		},
	}, nil
}

// clusterAPIMetadata returns the public metadata that identifies a Cluster and its
// kubeconfig Secret.
func clusterAPIMetadata(root string, owner types.NamespacedName, secretName string) (json.RawMessage, error) {
	return json.Marshal(
		map[string]interface{}{
			"cluster": map[string]string{
				"root":      root,
				"namespace": owner.Namespace,
				"name":      owner.Name,
				"key":       makeOwnerKey(root, owner.Namespace+"/"+owner.Name),
			},
			"kubeconfigSecret": map[string]string{
				"namespace": owner.Namespace,
				"name":      secretName,
			},
		},
	)
}

// selectedKubeconfigContext returns the current context of config, or its only context
// when no current context is set.
func selectedKubeconfigContext(config *api.Config) (*api.Context, error) {
	if config.CurrentContext != "" {
		selected := config.Contexts[config.CurrentContext]
		if selected == nil {
			return nil, fmt.Errorf("kubeconfig current-context %q is missing", config.CurrentContext)
		}

		return selected, nil
	}

	if len(config.Contexts) != 1 {
		return nil, errors.New("workload kubeconfig requires current-context or exactly one context")
	}

	for _, selected := range config.Contexts {
		if selected != nil {
			return selected, nil
		}
	}

	return nil, errors.New("workload kubeconfig context is nil")
}

// clusterAPIKubeconfig parses the kubeconfig of a Cluster API Secret after checking that
// its name, type, cluster name label and value key match the Cluster.
func clusterAPIKubeconfig(owner types.NamespacedName, secretName string, obj interface{}) (*api.Config, error) {
	secret := &corev1.Secret{}

	switch value := obj.(type) {
	case *corev1.Secret:
		secret = value
	case *unstructured.Unstructured:
		if err := runtime.DefaultUnstructuredConverter.FromUnstructured(value.Object, secret); err != nil {
			return nil, errors.New("invalid Cluster API kubeconfig Secret")
		}
	default:
		return nil, errors.New("unexpected Cluster API Secret object")
	}

	if secret.Namespace != owner.Namespace || secret.Name != secretName ||
		secret.Type != corev1.SecretType("cluster.x-k8s.io/secret") ||
		secret.Labels[clusterNameLabel] != owner.Name ||
		len(secret.Data["value"]) == 0 {
		return nil, errors.New("cluster API kubeconfig Secret must match its Cluster, type, label and value key")
	}

	config, err := clientcmd.Load(secret.Data["value"])
	if err != nil {
		return nil, errors.New("invalid kubeconfig in Cluster API Secret")
	}

	return config, nil
}
