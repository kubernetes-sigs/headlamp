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

package clusterdiscovery

import (
	"context"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestRunnerValidationAndFingerprints(t *testing.T) {
	t.Run("ValidateNamespaces", func(t *testing.T) {
		require.NoError(t, ValidateNamespaces(""))
		require.NoError(t, ValidateNamespaces("default, kube-system"))
		require.Error(t, ValidateNamespaces("INVALID_NS!"))
	})

	t.Run("namespaceLogValue", func(t *testing.T) {
		assert.Equal(t, "*", namespaceLogValue(""))
		assert.Equal(t, "default", namespaceLogValue("default"))
	})

	t.Run("rootFingerprint includes impersonation and exec config", func(t *testing.T) {
		r1 := rootConfig{
			namespaces: []string{"default"},
			restConfig: &rest.Config{
				Host: "https://cluster.example.com",
				Impersonate: rest.ImpersonationConfig{
					UserName: "alice",
					Groups:   []string{"devs"},
					Extra:    map[string][]string{"team": {"platform"}},
				},
				ExecProvider: &api.ExecConfig{
					APIVersion:         "client.authentication.k8s.io/v1beta1",
					Command:            "aws",
					Args:               []string{"eks", "get-token"},
					Env:                []api.ExecEnvVar{{Name: "AWS_REGION", Value: "us-east-1"}},
					ProvideClusterInfo: true,
					Config:             &k8sruntime.Unknown{Raw: []byte(`{"clusterName":"prod"}`)},
				},
			},
		}
		r2 := rootConfig{
			namespaces: []string{"default"},
			restConfig: &rest.Config{
				Host: "https://cluster.example.com",
			},
		}

		fp1 := rootFingerprint(r1)
		fp2 := rootFingerprint(r2)

		assert.NotEmpty(t, fp1)
		assert.NotEqual(t, fp1, fp2)
	})
}

func TestClusterAPISourceHelpers(t *testing.T) {
	t.Run("NewClusterAPISource and NewClusterProfileSource", func(t *testing.T) {
		capi := NewClusterAPISource()
		require.NotNil(t, capi)

		cp := NewClusterProfileSource()
		require.NotNil(t, cp)
	})

	t.Run("Runner Run exits on cancelled context", func(t *testing.T) {
		runner, err := NewRunner(Options{
			Store: kubeconfig.NewContextStore(),
			OIDC: &kubeconfig.OidcConfig{
				ClientID:     "cid",
				IdpIssuerURL: "https://idp.example.com",
				Scopes:       []string{"openid"},
			},
		}, NewClusterAPISource())
		require.NoError(t, err)

		runner.rootReconcileInterval = time.Hour

		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		runner.Run(ctx)
	})

	t.Run("clusterAPISecretConnection DeepCopyObject", func(t *testing.T) {
		orig := &clusterAPISecretConnection{
			cluster:          &api.Cluster{Server: "https://example.com"},
			defaultNamespace: "default",
		}
		orig.Name = "sec-1"
		copied := orig.DeepCopyObject()
		require.NotNil(t, copied)

		connCopy, ok := copied.(*clusterAPISecretConnection)
		require.True(t, ok)
		assert.Equal(t, "https://example.com", connCopy.cluster.Server)
	})

	t.Run("syncAllNamespaceOwnersLocked handles empty roots", func(t *testing.T) {
		runner, err := NewRunner(Options{
			Store: kubeconfig.NewContextStore(),
			OIDC: &kubeconfig.OidcConfig{
				ClientID:     "cid",
				IdpIssuerURL: "https://idp.example.com",
				Scopes:       []string{"openid"},
			},
		}, NewClusterAPISource())
		require.NoError(t, err)

		runner.mu.Lock()
		runner.syncAllNamespaceOwnersLocked("r1", map[string]string{}, map[string]string{})
		runner.mu.Unlock()
	})
}
