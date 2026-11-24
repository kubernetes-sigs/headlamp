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
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
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

const (
	clusterNameLabel        = "cluster.x-k8s.io/cluster-name"
	clusterKubeconfigSuffix = "-kubeconfig"
)

// clusterAPISource discovers Cluster API workload clusters from Clusters and their
// kubeconfig Secrets.
type clusterAPISource struct {
	// clientForConfig creates the client for a discovery root. Tests replace it.
	clientForConfig func(*rest.Config) (dynamic.Interface, error)
}

// clusterAPISecretConnection is the projection stored by the Secret informer.
type clusterAPISecretConnection struct {
	metav1.TypeMeta
	metav1.ObjectMeta
	cluster          *api.Cluster
	defaultNamespace string
	validationErr    error
}

// DeepCopyObject implements runtime.Object for client-go's cache checks.
func (s *clusterAPISecretConnection) DeepCopyObject() runtime.Object {
	result := *s
	result.ObjectMeta = *s.DeepCopy()
	result.cluster = s.cluster.DeepCopy()

	return &result
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

	secretInformer := secrets.ForResource(secretResource).Informer()
	if err := secretInformer.SetTransform(projectClusterAPISecret); err != nil {
		return nil, err
	}

	return []ResourceWatch{
		{Resource: clusterAPIResource, Factory: clusters, Informer: clusters.ForResource(clusterAPIResource).Informer()},
		{Resource: secretResource, Factory: secrets, Informer: secretInformer},
	}, nil
}

// OwnersForChange maps a Cluster to itself and a "<cluster>-kubeconfig" Secret to its
// Cluster. Other Secrets have no owner.
func (*clusterAPISource) OwnersForChange(resource schema.GroupVersionResource, obj interface{}) []types.NamespacedName {
	owners := objectOwner(obj)
	if resource == secretResource {
		if len(owners) != 1 || !strings.HasSuffix(owners[0].Name, clusterKubeconfigSuffix) {
			return nil
		}

		owners[0].Name = strings.TrimSuffix(owners[0].Name, clusterKubeconfigSuffix)
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

	secretName := owner.Name + clusterKubeconfigSuffix

	obj, exists := snapshot.Get(secretResource, types.NamespacedName{Namespace: owner.Namespace, Name: secretName})
	if !exists {
		return nil, nil
	}

	connection, ok := obj.(*clusterAPISecretConnection)
	if !ok || connection.Name != secretName || connection.Namespace != owner.Namespace {
		return nil, errors.New("unexpected Cluster API Secret connection")
	}

	if connection.validationErr != nil {
		return nil, connection.validationErr
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
			Config:       ConfigForCluster(name, connection.cluster.DeepCopy(), connection.defaultNamespace),
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
			return nil, errors.New("workload kubeconfig current-context does not reference a context")
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

// projectClusterAPISecret replaces full Secrets before client-go queues or caches them.
// A malformed kubeconfig still produces an update so the runner can remove a stale connection.
func projectClusterAPISecret(obj interface{}) (interface{}, error) {
	switch secret := obj.(type) {
	case *clusterAPISecretConnection:
		return secret, nil
	case *unstructured.Unstructured:
		connection := &clusterAPISecretConnection{
			TypeMeta: metav1.TypeMeta{APIVersion: secret.GetAPIVersion(), Kind: secret.GetKind()},
			ObjectMeta: metav1.ObjectMeta{
				Name:            secret.GetName(),
				Namespace:       secret.GetNamespace(),
				UID:             secret.GetUID(),
				ResourceVersion: secret.GetResourceVersion(),
			},
		}
		if strings.HasSuffix(connection.Name, clusterKubeconfigSuffix) {
			connection.cluster, connection.defaultNamespace, connection.validationErr = clusterAPIConnection(secret)
		}

		return connection, nil
	default:
		return nil, errors.New("unexpected Cluster API Secret object")
	}
}

// clusterAPIConnection reads only the kubeconfig of a matching Cluster API Secret and
// returns the selected connection fields. Validation errors never include Secret data.
func clusterAPIConnection(secret *unstructured.Unstructured) (*api.Cluster, string, error) {
	clusterName := secret.GetLabels()[clusterNameLabel]
	if secret.Object["type"] != "cluster.x-k8s.io/secret" || clusterName == "" ||
		secret.GetName() != clusterName+clusterKubeconfigSuffix {
		return nil, "", errors.New("kubeconfig Secret must match its Cluster API Cluster by type and label")
	}

	value, _, err := unstructured.NestedString(secret.Object, "data", "value")
	if err != nil || value == "" {
		return nil, "", errors.New("kubeconfig Secret requires data.value")
	}

	data, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, "", errors.New("invalid kubeconfig in Cluster API Secret")
	}

	config, err := clientcmd.Load(data)
	if err != nil {
		return nil, "", errors.New("invalid kubeconfig in Cluster API Secret")
	}

	selected, err := selectedKubeconfigContext(config)
	if err != nil {
		return nil, "", err
	}

	cluster, err := ConnectionCluster(config.Clusters[selected.Cluster])

	return cluster, selected.Namespace, err
}
