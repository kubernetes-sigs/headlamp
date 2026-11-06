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
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

func capiFixture(t *testing.T) (*unstructured.Unstructured, *unstructured.Unstructured) {
	t.Helper()

	cluster := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "cluster.x-k8s.io/v1beta2",
			"kind":       "Cluster",
			"metadata":   map[string]interface{}{"name": "spoke", "namespace": "default"},
		},
	}
	config := ConfigForCluster(
		"admin",
		&api.Cluster{
			Server:                   "https://spoke.example.com",
			CertificateAuthorityData: testCAPEM(),
			TLSServerName:            "api.internal",
			ProxyURL:                 "http://proxy.example.com:8080",
		},
		"apps",
	)
	config.Contexts["admin"].AuthInfo = "administrator"
	config.AuthInfos = map[string]*api.AuthInfo{
		"administrator": {
			Token:                 "never-forward-this-token",
			ClientCertificateData: []byte("private-client-cert"),
			ClientKeyData:         []byte("private-key"),
			Exec: &api.ExecConfig{
				Command:    "never-run-this",
				APIVersion: "client.authentication.k8s.io/v1",
			},
		},
	}
	data, err := clientcmd.Write(*config)
	require.NoError(t, err)

	secret := &corev1.Secret{
		TypeMeta: metav1.TypeMeta{APIVersion: "v1", Kind: "Secret"},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "spoke-kubeconfig",
			Namespace: "default",
			Labels:    map[string]string{clusterNameLabel: "spoke"},
		},
		Type: "cluster.x-k8s.io/secret",
		Data: map[string][]byte{"value": data},
	}
	obj, err := runtime.DefaultUnstructuredConverter.ToUnstructured(secret)
	require.NoError(t, err)

	return cluster, &unstructured.Unstructured{Object: obj}
}

func capiRunner(t *testing.T, objects ...runtime.Object) (*Runner, *dynamicfake.FakeDynamicClient) {
	t.Helper()

	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			clusterAPIResource: "ClusterList",
			secretResource:     "SecretList",
		},
		objects...,
	)
	source := NewClusterAPISource().(*clusterAPISource)
	source.clientForConfig = func(*rest.Config) (dynamic.Interface, error) { return client, nil }
	runner, err := NewRunner(
		Options{
			Store:     kubeconfig.NewContextStore(),
			OIDC:      testOIDCOptions(),
			HubConfig: &rest.Config{Host: "https://hub.example.com"},
		},
		source,
	)
	require.NoError(t, err)

	return runner, client
}

func requireDiscovered(t *testing.T, runner *Runner) *kubeconfig.Context {
	t.Helper()

	var contexts []*kubeconfig.Context

	require.Eventually(
		t,
		func() bool {
			contexts, _ = runner.store.GetContexts()
			return len(contexts) == 1
		},
		5*time.Second,
		10*time.Millisecond,
	)

	return contexts[0]
}

func TestClusterAPIUsesSharedOIDCLifecycle(t *testing.T) { //nolint:funlen // exercises the complete informer lifecycle.
	cluster, secret := capiFixture(t)
	runner, client := capiRunner(t, cluster, secret)
	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)
	connection := requireDiscovered(t, runner)
	require.Equal(t, "cluster_api", connection.SourceStr())
	require.Equal(t, "apps", connection.KubeContext.Namespace)
	require.True(t, connection.RequiresUserAuthentication())
	require.False(t, connection.CanRename())
	require.Empty(t, connection.AuthInfo.Token)
	require.Empty(t, connection.AuthInfo.ClientKeyData)
	require.Nil(t, connection.AuthInfo.Exec)
	require.Equal(t, "oidc", connection.AuthType())
	require.Equal(t, "api.internal", connection.Cluster.TLSServerName)
	require.Equal(t, "http://proxy.example.com:8080", connection.Cluster.ProxyURL)
	serialized, err := json.Marshal(connection)
	require.NoError(t, err)

	for _, credential := range []string{
		"never-forward-this-token",
		"private-key",
		"never-run-this",
		testOIDCOptions().ClientSecret,
	} {
		require.NotContains(t, string(serialized), credential)
	}

	raw, found, err := unstructured.NestedString(secret.Object, "data", "value")
	require.NoError(t, err)
	require.True(t, found)

	bytes, err := base64.StdEncoding.DecodeString(raw)
	require.NoError(t, err)
	updated, err := clientcmd.Load(bytes)
	require.NoError(t, err)

	updated.Clusters["admin"].Server = "https://replacement.example.com"
	bytes, err = clientcmd.Write(*updated)
	require.NoError(t, err)
	require.NoError(
		t,
		unstructured.SetNestedField(
			secret.Object,
			base64.StdEncoding.EncodeToString(bytes),
			"data",
			"value",
		),
	)
	_, err = client.Resource(secretResource).Namespace("default").Update(ctx, secret, metav1.UpdateOptions{})
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		contexts, _ := runner.store.GetContexts()

		return len(contexts) == 1 && contexts[0].Cluster.Server == "https://replacement.example.com" &&
			contexts[0].Name == connection.Name &&
			contexts[0].ClusterID == connection.ClusterID
	}, 5*time.Second, 10*time.Millisecond)
	secret.SetLabels(map[string]string{clusterNameLabel: "wrong-cluster"})
	_, err = client.Resource(secretResource).Namespace("default").Update(ctx, secret, metav1.UpdateOptions{})
	require.NoError(t, err)
	require.Eventually(
		t,
		func() bool {
			contexts, _ := runner.store.GetContexts()
			return len(contexts) == 0
		},
		5*time.Second,
		10*time.Millisecond,
	)
	secret.SetLabels(map[string]string{clusterNameLabel: "spoke"})
	_, err = client.Resource(secretResource).Namespace("default").Update(ctx, secret, metav1.UpdateOptions{})
	require.NoError(t, err)
	restored := requireDiscovered(t, runner)
	require.Equal(t, connection.Name, restored.Name)
	require.Equal(t, connection.ClusterID, restored.ClusterID)
	require.NoError(
		t,
		client.Resource(secretResource).Namespace("default").Delete(
			ctx,
			"spoke-kubeconfig",
			metav1.DeleteOptions{},
		),
	)
	require.Eventually(
		t,
		func() bool {
			contexts, _ := runner.store.GetContexts()
			return len(contexts) == 0
		},
		5*time.Second,
		10*time.Millisecond,
	)

	_, err = client.Resource(secretResource).Namespace("default").Create(ctx, secret, metav1.CreateOptions{})
	require.NoError(t, err)
	requireDiscovered(t, runner)
	require.NoError(
		t,
		client.Resource(clusterAPIResource).Namespace("default").Delete(ctx, "spoke", metav1.DeleteOptions{}),
	)
	require.Eventually(
		t,
		func() bool {
			contexts, _ := runner.store.GetContexts()
			return len(contexts) == 0
		},
		5*time.Second,
		10*time.Millisecond,
	)
}

func setSecretClusterTLS(t *testing.T, secret *corev1.Secret, ca []byte, insecure bool) {
	t.Helper()

	config, err := clientcmd.Load(secret.Data["value"])
	require.NoError(t, err)

	for _, cluster := range config.Clusters {
		cluster.CertificateAuthorityData = ca
		cluster.InsecureSkipTLSVerify = insecure
	}

	secret.Data["value"], err = clientcmd.Write(*config)
	require.NoError(t, err)
}

func TestClusterAPIRejectsInvalidSecrets(t *testing.T) {
	for _, change := range []func(*corev1.Secret){
		func(s *corev1.Secret) { s.Type = "Opaque" },
		func(s *corev1.Secret) { s.Data = nil },
		func(s *corev1.Secret) { s.Data["value"] = []byte("not-a-kubeconfig") },
		func(s *corev1.Secret) { s.Labels[clusterNameLabel] = "other" },
		// The common kubeconfig loader rejects unusable TLS settings.
		func(s *corev1.Secret) { setSecretClusterTLS(t, s, []byte("not a certificate"), false) },
		func(s *corev1.Secret) { setSecretClusterTLS(t, s, testCAPEM(), true) },
	} {
		cluster, obj := capiFixture(t)
		secret := &corev1.Secret{}
		require.NoError(t, runtime.DefaultUnstructuredConverter.FromUnstructured(obj.Object, secret))
		change(secret)
		data, err := runtime.DefaultUnstructuredConverter.ToUnstructured(secret)
		require.NoError(t, err)
		runner, _ := capiRunner(t, cluster, &unstructured.Unstructured{Object: data})
		ctx := testRunnerContext(t, runner)
		reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)
		runner.mutationMu.Lock()
		contexts, err := runner.store.GetContexts()
		runner.mutationMu.Unlock()
		require.NoError(t, err)
		require.Empty(t, contexts)
	}
}

func TestWorkloadKubeconfigContextSelection(t *testing.T) {
	config := ConfigForCluster("one", &api.Cluster{Server: "https://one.example.com"}, "")
	config.CurrentContext = ""
	selected, err := selectedKubeconfigContext(config)
	require.NoError(t, err)
	require.Equal(t, "one", selected.Cluster)
	config.Contexts["two"] = &api.Context{Cluster: "two"}
	_, err = selectedKubeconfigContext(config)
	require.Error(t, err)

	config.CurrentContext = "missing"
	_, err = selectedKubeconfigContext(config)
	require.Error(t, err)

	config.CurrentContext = "two"
	selected, err = selectedKubeconfigContext(config)
	require.NoError(t, err)
	require.Equal(t, "two", selected.Cluster)
}

// A third source uses the same engine, publication, OIDC and root filtering without built-in source branches.
type testSource struct{ Source }

func (s testSource) Descriptor() Descriptor {
	d := s.Source.Descriptor()
	d.ID = "third_source"
	d.DisplayName = "Third source"
	d.ContextSource = 0
	d.View = SourceView{
		NameLabel: "Fleet", Columns: []SourceColumn{{Key: "secret", Label: "Credential reference"}},
		SummaryFields: []string{"namespace", "secret"},
	}

	return d
}

func TestRegistryAcceptsAnotherSource(t *testing.T) {
	cluster, secret := capiFixture(t)
	runner, client := capiRunner(t, cluster, secret)
	source := testSource{runner.source}
	registry := BuiltinSources()
	require.NoError(t, registry.Register(source))
	require.Error(t, registry.Register(source))
	runner.source = registry.Sources()[2]
	runner.discoverFromStore = true
	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)
	connection := requireDiscovered(t, runner)
	require.Equal(t, "third_source", connection.SourceStr())
	require.Equal(t, "spoke", connection.Presentation.DisplayName)
	require.Equal(t, "default", connection.Presentation.Fields["namespace"])
	require.Equal(t, "in-cluster", connection.Presentation.Fields["root"])
	require.Equal(t, "spoke-kubeconfig", connection.Presentation.Fields["secret"])

	views := ClientSourceViews(registry, map[string]Settings{"third_source": {Enabled: true}})
	require.Len(t, views, 4)
	require.Equal(t, "third_source", views[3].ID)
	require.Equal(t, "Fleet", views[3].NameLabel)
	require.Equal(t, []SourceColumn{{Key: "secret", Label: "Credential reference"}}, views[3].Columns)
	require.True(t, views[3].Configured)
	require.True(t, connection.IsDiscovered())
	runner.reconcileRoots(ctx)
	runner.mu.Lock()
	require.Len(t, runner.roots, 1)
	runner.mu.Unlock()
	require.NoError(
		t,
		client.Resource(clusterAPIResource).Namespace("default").Delete(ctx, "spoke", metav1.DeleteOptions{}),
	)
	require.Eventually(
		t,
		func() bool {
			contexts, _ := runner.store.GetContexts()
			return len(contexts) == 0
		},
		5*time.Second,
		10*time.Millisecond,
	)
	require.True(t, strings.HasPrefix(connection.Name, "cluster-api-"))
}
