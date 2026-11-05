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

package kubeconfig_test

import (
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestPresentationPreservesConnectionIdentityAndCopiesFields(t *testing.T) {
	context := &kubeconfig.Context{Name: "stable-id", Presentation: &kubeconfig.ConnectionPresentation{
		DisplayName: "production", Fields: map[string]string{"provider": "oidc"},
	}}
	copy := context.Copy()
	copy.Presentation.Fields["provider"] = "another"
	public := context.PublicPresentation()
	public.DisplayName = "renamed"
	public.Fields["provider"] = "mutated"

	require.Equal(t, "stable-id", context.Name)
	require.Equal(t, "production", context.Presentation.DisplayName)
	require.Equal(t, "oidc", context.Presentation.Fields["provider"])
}

func TestStaticPresentationUsesOriginalKubeconfigFields(t *testing.T) {
	context := &kubeconfig.Context{
		Name: "My production cluster", KubeConfigContextName: "production-admin",
		KubeConfigPath: "/home/user/.kube/config", KubeContext: &api.Context{Cluster: "production", Namespace: "team-a"},
	}
	presentation := context.PublicPresentation()
	require.Equal(t, "My production cluster", presentation.DisplayName)
	require.Equal(t, map[string]string{
		"context": "production-admin", "cluster": "production",
		"contextNamespace": "team-a", "file": "/home/user/.kube/config",
	}, presentation.Fields)
	require.Equal(t, "My production cluster", context.Name)
}
