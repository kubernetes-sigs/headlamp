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

package kubeconfig_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
)

func kubeadmConfigMap(data map[string]string) *corev1.ConfigMap {
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "kubeadm-config",
			Namespace: "kube-system",
		},
		Data: data,
	}
}

var deriveInClusterNameTests = []struct {
	name      string
	configMap *corev1.ConfigMap
	expected  string
	expectErr bool
}{
	{
		name: "derives clusterName from ClusterConfiguration",
		configMap: kubeadmConfigMap(map[string]string{
			"ClusterConfiguration": "apiVersion: kubeadm.k8s.io/v1beta3\nkind: ClusterConfiguration\nclusterName: my-cluster\n",
		}),
		expected: "my-cluster",
	},
	{
		name:      "ConfigMap not found",
		configMap: nil,
		expectErr: true,
	},
	{
		name: "missing ClusterConfiguration entry",
		configMap: kubeadmConfigMap(map[string]string{
			"other": "value",
		}),
		expectErr: true,
	},
	{
		name: "ClusterConfiguration without clusterName",
		configMap: kubeadmConfigMap(map[string]string{
			"ClusterConfiguration": "apiVersion: kubeadm.k8s.io/v1beta3\nkind: ClusterConfiguration\n",
		}),
		expectErr: true,
	},
	{
		name: "empty clusterName",
		configMap: kubeadmConfigMap(map[string]string{
			"ClusterConfiguration": "clusterName: \"   \"\n",
		}),
		expectErr: true,
	},
	{
		name: "kubeadm default clusterName is treated as unset",
		configMap: kubeadmConfigMap(map[string]string{
			"ClusterConfiguration": "clusterName: kubernetes\n",
		}),
		expectErr: true,
	},
	{
		name: "malformed YAML",
		configMap: kubeadmConfigMap(map[string]string{
			"ClusterConfiguration": "clusterName: [unterminated",
		}),
		expectErr: true,
	},
}

func TestDeriveInClusterName(t *testing.T) {
	for _, tt := range deriveInClusterNameTests {
		t.Run(tt.name, func(t *testing.T) {
			var clientset *fake.Clientset
			if tt.configMap != nil {
				clientset = fake.NewSimpleClientset(tt.configMap)
			} else {
				clientset = fake.NewSimpleClientset()
			}

			name, err := kubeconfig.DeriveInClusterName(context.Background(), clientset)
			if tt.expectErr {
				require.Error(t, err)
				assert.Empty(t, name)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.expected, name)
		})
	}
}
