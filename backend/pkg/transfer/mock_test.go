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

package transfer_test

import (
	"fmt"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	k8sapi "k8s.io/client-go/tools/clientcmd/api"
)

const errClusterNotFound = "cluster not found"

// MockContextStore is a configurable mock of kubeconfig.ContextStore for testing.
type MockContextStore struct {
	kubeconfig.ContextStore
	MockContext *kubeconfig.Context
	ShouldError bool
	ErrorMsg    string
}

func (m *MockContextStore) GetContext(name string) (*kubeconfig.Context, error) {
	if m.ShouldError {
		msg := errClusterNotFound
		if m.ErrorMsg != "" {
			msg = m.ErrorMsg
		}

		return nil, fmt.Errorf("%s", msg)
	}

	return m.MockContext, nil
}

func createMockContextWithServer(serverURL string) *kubeconfig.Context {
	return &kubeconfig.Context{
		Name: "test-cluster",
		KubeContext: &k8sapi.Context{
			Cluster:  "test-cluster",
			AuthInfo: "test-user",
		},
		Cluster: &k8sapi.Cluster{
			Server:                serverURL,
			InsecureSkipTLSVerify: true,
		},
		AuthInfo: &k8sapi.AuthInfo{
			Token: "test-token",
		},
	}
}
