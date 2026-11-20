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

package helm

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/kube"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

// Helm's kube client puts objects without metadata.namespace into
// Factory.ToRawKubeConfigLoader().Namespace(), so that has to be the
// namespace the request asked for, not the kubeconfig context namespace.
func TestNewActionConfigKubeClientUsesRequestedNamespace(t *testing.T) {
	actionConfig, err := NewActionConfig(fakeClientConfig(), "apps")
	require.NoError(t, err)

	kubeClient, ok := actionConfig.KubeClient.(*kube.Client)
	require.True(t, ok)

	ns, overridden, err := kubeClient.Factory.ToRawKubeConfigLoader().Namespace()
	require.NoError(t, err)
	assert.Equal(t, "apps", ns)
	assert.True(t, overridden)
}

func TestRestConfigGetterToRawKubeConfigLoaderNamespace(t *testing.T) {
	g := &restConfigGetter{clientConfig: fakeClientConfig(), namespace: "apps"}

	ns, _, err := g.ToRawKubeConfigLoader().Namespace()
	require.NoError(t, err)
	assert.Equal(t, "apps", ns)
}

func TestRestConfigGetterToRawKubeConfigLoaderKeepsContextNamespace(t *testing.T) {
	// An empty namespace (e.g. listing releases in all namespaces) keeps the
	// kubeconfig behavior.
	cc := fakeClientConfig()
	want, _, err := cc.Namespace()
	require.NoError(t, err)

	g := &restConfigGetter{clientConfig: cc, namespace: ""}

	got, _, err := g.ToRawKubeConfigLoader().Namespace()
	require.NoError(t, err)
	assert.Equal(t, want, got)
}

// namespacelessChart has one ConfigMap template without metadata.namespace,
// like many charts that rely on Helm to set the namespace.
func namespacelessChart() *chart.Chart {
	return &chart.Chart{
		Metadata: &chart.Metadata{APIVersion: chart.APIVersionV2, Name: "ns-test", Version: "0.1.0"},
		Templates: []*chart.File{{
			Name: "templates/configmap.yaml",
			Data: []byte("apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: {{ .Release.Name }}-cm\ndata:\n  key: value\n"),
		}},
	}
}

// Installs and uninstalls a real chart. Needs a cluster from KUBECONFIG and
// HEADLAMP_RUN_INTEGRATION_TESTS=true, like the other backend integration tests.
func TestInstallAndUninstallUseRequestedNamespace(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	clientConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		clientcmd.NewDefaultClientConfigLoadingRules(), &clientcmd.ConfigOverrides{})

	restConfig, err := clientConfig.ClientConfig()
	require.NoError(t, err)

	clientset, err := kubernetes.NewForConfig(restConfig)
	require.NoError(t, err)

	ctx := context.Background()
	ns := fmt.Sprintf("helm-ns-test-%d", time.Now().UnixNano())
	// The release name comes from the unique namespace, so cleanup can only
	// touch objects this run created.
	releaseName := ns
	cmName := releaseName + "-cm"

	_, err = clientset.CoreV1().Namespaces().Create(ctx,
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: ns}}, metav1.CreateOptions{})
	require.NoError(t, err)

	contextNamespace, _, err := clientConfig.Namespace()
	require.NoError(t, err)

	t.Cleanup(func() {
		_ = clientset.CoreV1().Namespaces().Delete(ctx, ns, metav1.DeleteOptions{})
		// Remove the ConfigMap if it leaked into the context namespace.
		_ = clientset.CoreV1().ConfigMaps(contextNamespace).Delete(ctx, cmName, metav1.DeleteOptions{})
	})

	actionConfig, err := NewActionConfig(clientConfig, ns)
	require.NoError(t, err)

	install := action.NewInstall(actionConfig)
	install.ReleaseName = releaseName
	install.Namespace = ns

	_, err = install.Run(namespacelessChart(), nil)
	require.NoError(t, err)

	_, err = clientset.CoreV1().ConfigMaps(ns).Get(ctx, cmName, metav1.GetOptions{})
	require.NoError(t, err, "ConfigMap should be installed into the requested namespace %q", ns)

	_, err = clientset.CoreV1().ConfigMaps(contextNamespace).Get(ctx, cmName, metav1.GetOptions{})
	assert.True(t, apierrors.IsNotFound(err),
		"ConfigMap should not be installed into the kubeconfig namespace %q", contextNamespace)

	uninstallConfig, err := NewActionConfig(clientConfig, ns)
	require.NoError(t, err)

	_, err = action.NewUninstall(uninstallConfig).Run(releaseName)
	require.NoError(t, err)

	_, err = clientset.CoreV1().ConfigMaps(ns).Get(ctx, cmName, metav1.GetOptions{})
	assert.True(t, apierrors.IsNotFound(err), "uninstall should remove the ConfigMap from %q", ns)
}
