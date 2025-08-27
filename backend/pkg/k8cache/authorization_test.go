// Copyright 2025 The Kubernetes Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package k8cache_test

import (
	"fmt"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

type MockKubeConfig struct {
	*kubeconfig.Context
}

func (k *MockKubeConfig) ClientSetWithToken(token string) (kubernetes.Interface, error) {
	return fake.NewSimpleClientset(), nil
}

type MockClientConfig struct{}

func (k *MockKubeConfig) ClientConfig() (clientcmd.ClientConfig, error) {
	conf := api.Config{
		Clusters: map[string]*api.Cluster{
			k.KubeContext.Cluster: k.Cluster,
		},
		AuthInfos: map[string]*api.AuthInfo{
			k.KubeContext.AuthInfo: k.AuthInfo,
		},
		Contexts: map[string]*api.Context{
			k.Name: k.KubeContext,
		},
	}

	return clientcmd.NewNonInteractiveClientConfig(conf, "kind-headlamp-admin", nil, nil), nil
}

func TestGetClientSet(t *testing.T) {
	tests := []struct {
		name          string
		mockK         MockKubeConfig
		token         string
		clientSet     *kubernetes.Clientset
		expectedError error
	}{
		{
			name: "valid ClusterID returns cached clientset",
			mockK: MockKubeConfig{
				&kubeconfig.Context{
					ClusterID:   "/home/user/.kubeconfig+kind-headlamp-admin",
					Cluster:     &api.Cluster{Server: "https://example.com"},
					AuthInfo:    &api.AuthInfo{Token: "abcdef"},
					KubeContext: &api.Context{Cluster: "kind-headlamp-admin"},
				},
			},
			token:         "token-1245",
			expectedError: nil,
		},
		{
			name: "return unexpected ClusterID format",
			mockK: MockKubeConfig{
				&kubeconfig.Context{
					ClusterID:   "/home/user/.kubeconfig/kind-headlamp-admin",
					Cluster:     &api.Cluster{Server: "https://example.com"},
					AuthInfo:    &api.AuthInfo{Token: "abcdef"},
					KubeContext: &api.Context{Cluster: "kind-headlamp-admin"},
				},
			},
			token: "token-54321",
			expectedError: fmt.Errorf("unexpected ClusterID format in getClientSet: " +
				"\"/home/user/.kubeconfig/kind-headlamp-admin\""),
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cs, err := k8cache.GetClientSet(tc.mockK.Context, tc.token)
			if tc.clientSet != nil {
				assert.NotEmpty(t, cs)
				assert.NoError(t, err)
			} else {
				assert.Equal(t, tc.expectedError, err)
			}
		})
	}
}
