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

//nolint:testpackage // tests cover unexported discovery state.
package clusterinventory

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	clientfeatures "k8s.io/client-go/features"
	clientfeaturestesting "k8s.io/client-go/features/testing"
	"k8s.io/client-go/rest"
	k8stesting "k8s.io/client-go/testing"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	clientcmdv1 "k8s.io/client-go/tools/clientcmd/api/v1"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	apisv1alpha1 "sigs.k8s.io/cluster-inventory-api/apis/v1alpha1"
	ciaclient "sigs.k8s.io/cluster-inventory-api/client/clientset/versioned"
	ciafake "sigs.k8s.io/cluster-inventory-api/client/clientset/versioned/fake"
)

func writeProviderFile(t *testing.T, providers ...string) string {
	t.Helper()

	if len(providers) == 0 {
		providers = []string{"static-token"}
	}

	providerJSON := ""

	for i, provider := range providers {
		if i > 0 {
			providerJSON += ","
		}

		providerJSON += `{
			"name": "` + provider + `",
			"execConfig": {
				"apiVersion": "client.authentication.k8s.io/v1",
				"command": "/bin/echo",
				"provideClusterInfo": true
			}
		}`
	}

	path := filepath.Join(t.TempDir(), "providers.json")
	err := os.WriteFile(path, []byte(`{"providers":[`+providerJSON+`]}`), 0o600)
	require.NoError(t, err)

	return path
}

func newTestRunner(t *testing.T, opts Options) *Runner {
	t.Helper()

	if opts.Store == nil {
		opts.Store = kubeconfig.NewContextStore()
	}

	if opts.ProviderFile == "" {
		opts.ProviderFile = writeProviderFile(t)
	}

	runner, err := NewRunner(opts)
	require.NoError(t, err)

	return runner
}

func clusterProfile(name, providerName, server string) *apisv1alpha1.ClusterProfile {
	cp := &apisv1alpha1.ClusterProfile{
		ObjectMeta: metav1.ObjectMeta{
			Namespace: "default",
			Name:      name,
		},
	}

	if providerName != "" {
		cp.Status.AccessProviders = []apisv1alpha1.AccessProvider{
			{
				Name: providerName,
				Cluster: clientcmdv1.Cluster{
					Server:                   server,
					CertificateAuthorityData: []byte("ca-" + name),
				},
			},
		}
	}

	return cp
}

func listErrorClient(err error) *ciafake.Clientset {
	client := ciafake.NewSimpleClientset()
	client.PrependReactor("list", "clusterprofiles", func(k8stesting.Action) (bool, k8sruntime.Object, error) {
		return true, nil, err
	})

	return client
}

func getProfileContext(store kubeconfig.ContextStore, profileKey string) (*kubeconfig.Context, error) {
	return store.GetContext(contextNameFromProfileKey(profileKey))
}

func testStoreContext(name string, source int, server, token string, internal bool) *kubeconfig.Context {
	return &kubeconfig.Context{
		Name:        name,
		Source:      source,
		KubeContext: &clientcmdapi.Context{Cluster: name, AuthInfo: name},
		Cluster:     &clientcmdapi.Cluster{Server: server},
		AuthInfo:    &clientcmdapi.AuthInfo{Token: token},
		Internal:    internal,
	}
}

func testRunnerContext(t *testing.T, runner *Runner) context.Context {
	t.Helper()

	ctx, cancel := context.WithCancel(context.Background())

	t.Cleanup(func() {
		cancel()
		runner.stopAllRoots()
	})

	return ctx
}

func reconcileAndWaitForRoot(t *testing.T, ctx context.Context, runner *Runner, rootID string) {
	t.Helper()

	runner.reconcileRoots(ctx)
	waitForRootSync(t, runner, rootID)
}

func waitForRootSync(t *testing.T, runner *Runner, rootID string) {
	t.Helper()

	require.Eventually(t, func() bool {
		runner.mu.Lock()
		state := runner.roots[rootID]
		runner.mu.Unlock()

		return state != nil && state.informer.HasSynced()
	}, 2*time.Second, 10*time.Millisecond)
}

func requireProfileContextEventually(
	t *testing.T,
	store kubeconfig.ContextStore,
	profileKey string,
) *kubeconfig.Context {
	t.Helper()

	var headlampContext *kubeconfig.Context

	require.Eventually(t, func() bool {
		ctx, err := getProfileContext(store, profileKey)
		if err != nil {
			return false
		}

		headlampContext = ctx

		return true
	}, 2*time.Second, 10*time.Millisecond)

	return headlampContext
}

func requireNoProfileContextEventually(t *testing.T, store kubeconfig.ContextStore, profileKey string) {
	t.Helper()

	require.Eventually(t, func() bool {
		_, err := getProfileContext(store, profileKey)

		return err != nil
	}, 2*time.Second, 10*time.Millisecond)
}

type watchListClient struct {
	ciaclient.Interface
}

func (watchListClient) IsWatchListSemanticsUnSupported() bool {
	return false
}

type removeLockDetectingStore struct {
	kubeconfig.ContextStore
	runner            *Runner
	removeWhileLocked atomic.Bool
}

func (s *removeLockDetectingStore) RemoveContext(name string) error {
	if s.runner != nil {
		if s.runner.mu.TryLock() {
			s.runner.mu.Unlock()
		} else {
			s.removeWhileLocked.Store(true)
		}
	}

	return s.ContextStore.RemoveContext(name)
}

func TestNewRunnerValidatesProviderFile(t *testing.T) {
	store := kubeconfig.NewContextStore()

	_, err := NewRunner(Options{Store: store})
	require.ErrorContains(t, err, "provider file is required")

	_, err = NewRunner(Options{Store: store, ProviderFile: "/does/not/exist"})
	require.ErrorContains(t, err, "load cluster inventory provider file")

	malformed := filepath.Join(t.TempDir(), "malformed.json")
	require.NoError(t, os.WriteFile(malformed, []byte("{"), 0o600))

	_, err = NewRunner(Options{Store: store, ProviderFile: malformed})
	require.ErrorContains(t, err, "load cluster inventory provider file")

	_, err = NewRunner(Options{
		Store:         store,
		ProviderFile:  writeProviderFile(t),
		LabelSelector: "headlamp.dev/ignore in (",
	})
	require.ErrorContains(t, err, "invalid cluster-inventory-label-selector")
}

func TestRestConfigToContextPreservesConfig(t *testing.T) {
	proxyURL, err := url.Parse("http://proxy.example.com:8080")
	require.NoError(t, err)

	execConfig := &clientcmdapi.ExecConfig{
		APIVersion:         "client.authentication.k8s.io/v1",
		Command:            "/bin/token",
		Args:               []string{"--cluster", "spoke"},
		Env:                []clientcmdapi.ExecEnvVar{{Name: "TOKEN", Value: "redacted"}},
		ProvideClusterInfo: true,
		Config:             &k8sruntime.Unknown{Raw: []byte(`{"kind":"ExecConfig"}`)},
	}

	restConfig := &rest.Config{
		Host: "https://spoke.example.com",
		TLSClientConfig: rest.TLSClientConfig{
			CAData:     []byte("ca-data"),
			CAFile:     "/tmp/ca.pem",
			Insecure:   true,
			ServerName: "spoke.internal",
		},
		ExecProvider: execConfig,
		Proxy: func(req *http.Request) (*url.URL, error) {
			assert.Equal(t, "https://spoke.example.com", req.URL.String())

			return proxyURL, nil
		},
	}

	ctx, err := restConfigToContext(restConfig, "ctx-name", "root/ns/spoke")
	require.NoError(t, err)

	assert.Equal(t, "ctx-name", ctx.Name)
	assert.Equal(t, "https://spoke.example.com", ctx.Cluster.Server)
	assert.Equal(t, []byte("ca-data"), ctx.Cluster.CertificateAuthorityData)
	assert.Equal(t, "/tmp/ca.pem", ctx.Cluster.CertificateAuthority)
	assert.True(t, ctx.Cluster.InsecureSkipTLSVerify)
	assert.Equal(t, "spoke.internal", ctx.Cluster.TLSServerName)
	assert.Equal(t, "http://proxy.example.com:8080", ctx.Cluster.ProxyURL)
	assert.Equal(t, kubeconfig.ClusterInventory, ctx.Source)
	assert.Equal(t, "cluster-inventory/root/ns/spoke", ctx.ClusterID)
	require.NotNil(t, ctx.AuthInfo.Exec)
	assert.Equal(t, "/bin/token", ctx.AuthInfo.Exec.Command)
	assert.Equal(t, clientcmdapi.NeverExecInteractiveMode, ctx.AuthInfo.Exec.InteractiveMode)
	assert.Equal(t, execConfig.Config, ctx.Cluster.Extensions[clusterExecConfigExtensionKey])
}

func TestClusterProfileDeletePrunesContextOutsideRunnerLock(t *testing.T) {
	store := &removeLockDetectingStore{ContextStore: kubeconfig.NewContextStore()}
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})
	store.runner = runner

	state := &rootState{rootID: inClusterRootID}
	profileKey := makeProfileKey(state.rootID, "default/spoke-a")
	contextName := contextNameFromProfileKey(profileKey)
	require.NoError(t, store.AddContext(&kubeconfig.Context{Name: contextName}))

	runner.mu.Lock()
	runner.roots[state.rootID] = state
	runner.profileKeysByRoot[state.rootID] = map[string]struct{}{profileKey: {}}
	runner.profiles[profileKey] = profileState{contextName: contextName}
	runner.mu.Unlock()

	runner.handleClusterProfileDelete(state, &apisv1alpha1.ClusterProfile{
		ObjectMeta: metav1.ObjectMeta{
			Namespace: "default",
			Name:      "spoke-a",
		},
	})

	assert.False(t, store.removeWhileLocked.Load())

	_, err := store.GetContext(contextName)
	require.Error(t, err)

	runner.mu.Lock()
	_, profileExists := runner.profiles[profileKey]
	_, rootProfileExists := runner.profileKeysByRoot[state.rootID][profileKey]
	runner.mu.Unlock()

	assert.False(t, profileExists)
	assert.False(t, rootProfileExists)
}

func TestContextNameFromProfileKey(t *testing.T) {
	tests := []struct {
		profileKey string
		want       string
	}{
		{"in-cluster/ns/name", "cluster-inventory-in-cluster--ns--name--c2adabb8b734"},
		{"store/minikube/ns/name", "cluster-inventory-store--minikube--ns--name--f8b7bcd1f9fb"},
		{"store/seed/ns/name with space", "cluster-inventory-store--seed--ns--name__with__space--86a59f47f71a"},
		{"ns/a--b", "cluster-inventory-ns--a--b--3a9038b84ee9"},
		{"ns--a/b", "cluster-inventory-ns--a--b--7bc90dd90ccb"},
		{"ns/a_b + c", "cluster-inventory-ns--a_b__+__c--b955996621e2"},
	}

	for _, tt := range tests {
		t.Run(tt.profileKey, func(t *testing.T) {
			assert.Equal(t, tt.want, contextNameFromProfileKey(tt.profileKey))
		})
	}
}

func TestContextNameFromProfileKeyAvoidsSeparatorCollisions(t *testing.T) {
	assert.NotEqual(t,
		contextNameFromProfileKey("ns/a--b"),
		contextNameFromProfileKey("ns--a/b"),
	)
}

func TestInformerInitialSyncUsesAccessProviders(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	runner.clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return ciafake.NewSimpleClientset(
			clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com"),
			clusterProfile("no-access", "", "https://no-access.example.com"),
		), nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
	requireNoProfileContextEventually(t, store, "in-cluster/default/no-access")
}

func TestInformerInitialSyncIgnoresLabelSelectedProfiles(t *testing.T) {
	store := kubeconfig.NewContextStore()
	ignoredProfile := clusterProfile("ignored", "static-token", "https://ignored.example.com")
	ignoredProfile.Labels = map[string]string{"headlamp.dev/ignore": "true"}

	runner := newTestRunner(t, Options{
		Store:         store,
		HubConfig:     &rest.Config{Host: "https://hub.example.com"},
		LabelSelector: "!headlamp.dev/ignore",
	})

	runner.clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return ciafake.NewSimpleClientset(
			clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com"),
			ignoredProfile,
		), nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
	requireNoProfileContextEventually(t, store, "in-cluster/default/ignored")
}

func TestTransientWatchFailureDoesNotPrunePreviousContexts(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	client := ciafake.NewSimpleClientset(
		clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com"),
	)
	client.PrependWatchReactor("clusterprofiles", func(k8stesting.Action) (bool, watch.Interface, error) {
		return true, nil, errors.New("temporary outage")
	})

	runner.clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return client, nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
}

func TestInitialSyncFailureDoesNotPrunePreviousContexts(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	runner.clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
		if config.Host == "https://temporary-outage.example.com" {
			return listErrorClient(errors.New("temporary outage")), nil
		}

		return ciafake.NewSimpleClientset(
			clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com"),
		), nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)
	requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")

	runner.hubConfig = &rest.Config{Host: "https://temporary-outage.example.com"}
	runner.reconcileRoots(ctx)

	requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
}

func TestProviderFailureDoesNotPrunePreviousContext(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	client := ciafake.NewSimpleClientset(
		clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com"),
	)

	runner.clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return client, nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)
	headlampContext := requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
	require.Equal(t, "https://spoke-a.example.com", headlampContext.Cluster.Server)

	updated := clusterProfile("spoke-a", "missing-provider", "https://spoke-a-updated.example.com")
	_, err := client.ApisV1alpha1().ClusterProfiles("default").Update(ctx, updated, metav1.UpdateOptions{})
	require.NoError(t, err)

	headlampContext = requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
	assert.Equal(t, "https://spoke-a.example.com", headlampContext.Cluster.Server)
}

func TestInformerDoesNotDiscoverClusterProfilesFromDiscoveredClusters(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	clientRequests := map[string]int{}
	runner.clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
		clientRequests[config.Host]++

		switch config.Host {
		case "https://hub.example.com":
			return ciafake.NewSimpleClientset(
				clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com"),
				clusterProfile("hub2", "static-token", "https://hub2.example.com"),
			), nil
		default:
			t.Fatalf("unexpected root watcher for %s", config.Host)

			return nil, nil
		}
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
	requireProfileContextEventually(t, store, "in-cluster/default/hub2")
	requireNoProfileContextEventually(t, store, "in-cluster/default/hub2/default/spoke-b")
	assert.Equal(t, 1, clientRequests["https://hub.example.com"])
	assert.Zero(t, clientRequests["https://hub2.example.com"])
}

func TestInitialSyncPrunesMissingDirectProfiles(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	runner.clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
		if config.Host == "https://hub-next.example.com" {
			return ciafake.NewSimpleClientset(
				clusterProfile("spoke-b", "static-token", "https://spoke-b.example.com"),
			), nil
		}

		return ciafake.NewSimpleClientset(
			clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com"),
			clusterProfile("spoke-b", "static-token", "https://spoke-b.example.com"),
		), nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)
	requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
	requireProfileContextEventually(t, store, "in-cluster/default/spoke-b")

	runner.hubConfig = &rest.Config{Host: "https://hub-next.example.com"}
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	requireNoProfileContextEventually(t, store, "in-cluster/default/spoke-a")
	requireProfileContextEventually(t, store, "in-cluster/default/spoke-b")
}

func TestStoreSeedsSkipClusterInventoryAndAllowSameServerPerRoot(t *testing.T) {
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(testStoreContext(
		"seed-a", kubeconfig.KubeConfig, "https://shared.example.com", "token-a", false)))
	require.NoError(t, store.AddContext(testStoreContext(
		"seed-b", kubeconfig.DynamicCluster, "https://shared.example.com", "token-b", false)))
	require.NoError(t, store.AddContext(testStoreContext(
		"internal-seed", kubeconfig.DynamicCluster, "https://internal.example.com", "token-internal", true)))
	require.NoError(t, store.AddContext(testStoreContext(
		"discovered", kubeconfig.ClusterInventory, "https://ignored.example.com", "", false)))

	runner := newTestRunner(t, Options{
		Store:             store,
		DiscoverFromStore: true,
	})

	requestedTokens := map[string]int{}
	requestedHosts := map[string]int{}
	runner.clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
		requestedTokens[config.BearerToken]++
		requestedHosts[config.Host]++

		switch config.BearerToken {
		case "token-a":
			return ciafake.NewSimpleClientset(
				clusterProfile("from-a", "static-token", "https://a.example.com"),
			), nil
		case "token-b":
			return ciafake.NewSimpleClientset(
				clusterProfile("from-b", "static-token", "https://b.example.com"),
			), nil
		default:
			return ciafake.NewSimpleClientset(), nil
		}
	}

	ctx := testRunnerContext(t, runner)
	runner.reconcileRoots(ctx)
	waitForRootSync(t, runner, "store/seed-a")
	waitForRootSync(t, runner, "store/seed-b")

	assert.Equal(t, 1, requestedTokens["token-a"])
	assert.Equal(t, 1, requestedTokens["token-b"])
	assert.Zero(t, requestedTokens["token-internal"])
	assert.Zero(t, requestedHosts["https://ignored.example.com"])
	assert.Zero(t, requestedHosts["https://internal.example.com"])
	requireProfileContextEventually(t, store, "store/seed-a/default/from-a")
	requireProfileContextEventually(t, store, "store/seed-b/default/from-b")
}

func TestRemovedStoreSeedStopsWatcherAndPrunesDiscoveredContexts(t *testing.T) {
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(testStoreContext(
		"seed-a", kubeconfig.KubeConfig, "https://seed-a.example.com", "token-a", false)))

	runner := newTestRunner(t, Options{
		Store:             store,
		DiscoverFromStore: true,
	})

	requestedHosts := map[string]int{}
	runner.clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
		requestedHosts[config.Host]++

		switch config.Host {
		case "https://seed-a.example.com":
			return ciafake.NewSimpleClientset(
				clusterProfile("from-a", "static-token", "https://from-a.example.com"),
			), nil
		default:
			t.Fatalf("unexpected root watcher for %s", config.Host)

			return nil, nil
		}
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, "store/seed-a")
	requireProfileContextEventually(t, store, "store/seed-a/default/from-a")
	assert.Equal(t, 1, requestedHosts["https://seed-a.example.com"])
	assert.Zero(t, requestedHosts["https://from-a.example.com"])

	require.NoError(t, store.RemoveContext("seed-a"))

	runner.reconcileRoots(ctx)

	requireNoProfileContextEventually(t, store, "store/seed-a/default/from-a")
	require.Eventually(t, func() bool {
		runner.mu.Lock()
		defer runner.mu.Unlock()

		return runner.roots["store/seed-a"] == nil
	}, 2*time.Second, 10*time.Millisecond)
}

func TestStoreSeedConfigChangeRestartsWatcher(t *testing.T) {
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(testStoreContext(
		"seed-a", kubeconfig.KubeConfig, "https://seed.example.com", "token-a", false)))

	runner := newTestRunner(t, Options{
		Store:             store,
		DiscoverFromStore: true,
	})

	requestedTokens := map[string]int{}
	runner.clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
		requestedTokens[config.BearerToken]++

		switch config.BearerToken {
		case "token-a":
			return ciafake.NewSimpleClientset(
				clusterProfile("from-a", "static-token", "https://from-a.example.com"),
			), nil
		case "token-b":
			return ciafake.NewSimpleClientset(
				clusterProfile("from-b", "static-token", "https://from-b.example.com"),
			), nil
		default:
			t.Fatalf("unexpected token %q", config.BearerToken)

			return nil, nil
		}
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, "store/seed-a")
	requireProfileContextEventually(t, store, "store/seed-a/default/from-a")

	require.NoError(t, store.AddContext(testStoreContext(
		"seed-a", kubeconfig.KubeConfig, "https://seed.example.com", "token-b", false)))

	reconcileAndWaitForRoot(t, ctx, runner, "store/seed-a")

	assert.Equal(t, 1, requestedTokens["token-a"])
	assert.Equal(t, 1, requestedTokens["token-b"])
	requireNoProfileContextEventually(t, store, "store/seed-a/default/from-a")
	requireProfileContextEventually(t, store, "store/seed-a/default/from-b")
}

func TestRestConfigFingerprintIncludesExecConfig(t *testing.T) {
	execConfig := func(raw string) *clientcmdapi.ExecConfig {
		return &clientcmdapi.ExecConfig{
			APIVersion: "client.authentication.k8s.io/v1",
			Command:    "/bin/token",
			Config:     &k8sruntime.Unknown{Raw: []byte(raw)},
		}
	}

	configA := &rest.Config{
		Host:         "https://seed.example.com",
		ExecProvider: execConfig(`{"audience":"a"}`),
	}
	configAAgain := &rest.Config{
		Host:         "https://seed.example.com",
		ExecProvider: execConfig(`{"audience":"a"}`),
	}
	configB := &rest.Config{
		Host:         "https://seed.example.com",
		ExecProvider: execConfig(`{"audience":"b"}`),
	}

	assert.Equal(t, restConfigFingerprint(configA), restConfigFingerprint(configAAgain))
	assert.NotEqual(t, restConfigFingerprint(configA), restConfigFingerprint(configB))
}

func TestSelfReferencingProfileDoesNotTriggerChildWatcher(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	clientRequests := 0
	runner.clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		clientRequests++

		return ciafake.NewSimpleClientset(
			clusterProfile("self", "static-token", "https://hub.example.com"),
		), nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	assert.Equal(t, 1, clientRequests)
	requireProfileContextEventually(t, store, "in-cluster/default/self")
}

func TestWatchAddUpdateDeleteSyncsContext(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	client := ciafake.NewSimpleClientset()
	runner.clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return client, nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	created, err := client.ApisV1alpha1().ClusterProfiles("default").Create(
		ctx,
		clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com"),
		metav1.CreateOptions{},
	)
	require.NoError(t, err)

	headlampContext := requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
	require.Equal(t, "https://spoke-a.example.com", headlampContext.Cluster.Server)

	updated := clusterProfile("spoke-a", "static-token", "https://spoke-a-updated.example.com")
	updated.ObjectMeta = created.ObjectMeta
	_, err = client.ApisV1alpha1().ClusterProfiles("default").Update(ctx, updated, metav1.UpdateOptions{})
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		headlampContext, err := getProfileContext(store, "in-cluster/default/spoke-a")

		return err == nil && headlampContext.Cluster.Server == "https://spoke-a-updated.example.com"
	}, 2*time.Second, 10*time.Millisecond)

	require.NoError(t, client.ApisV1alpha1().ClusterProfiles("default").Delete(
		ctx,
		"spoke-a",
		metav1.DeleteOptions{},
	))

	requireNoProfileContextEventually(t, store, "in-cluster/default/spoke-a")
}

func TestClusterProfileUpdateToIgnoredLabelPrunesContext(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:         store,
		HubConfig:     &rest.Config{Host: "https://hub.example.com"},
		LabelSelector: "!headlamp.dev/ignore",
	})

	client := ciafake.NewSimpleClientset()
	runner.clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return client, nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	created, err := client.ApisV1alpha1().ClusterProfiles("default").Create(
		ctx,
		clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com"),
		metav1.CreateOptions{},
	)
	require.NoError(t, err)

	requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")

	updated := clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com")
	updated.ObjectMeta = created.ObjectMeta
	updated.Labels = map[string]string{"headlamp.dev/ignore": "true"}
	_, err = client.ApisV1alpha1().ClusterProfiles("default").Update(ctx, updated, metav1.UpdateOptions{})
	require.NoError(t, err)

	requireNoProfileContextEventually(t, store, "in-cluster/default/spoke-a")
}

func TestNoCRDPrunesAndSuppressesRootUntilTTL(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:         store,
		HubConfig:     &rest.Config{Host: "https://hub.example.com"},
		NoCRDCacheTTL: time.Minute,
	})

	now := time.Date(2026, time.May, 8, 0, 0, 0, 0, time.UTC)
	noCRDMode := true
	clientRequests := map[string]int{}
	runner.now = func() time.Time { return now }
	runner.clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
		clientRequests[config.Host]++

		if config.Host == "https://no-crd.example.com" {
			if noCRDMode {
				return listErrorClient(apierrors.NewNotFound(schema.GroupResource{
					Group:    apisv1alpha1.Group,
					Resource: "clusterprofiles",
				}, "clusterprofiles")), nil
			}

			return ciafake.NewSimpleClientset(
				clusterProfile("spoke-b", "static-token", "https://spoke-b.example.com"),
			), nil
		}

		return ciafake.NewSimpleClientset(
			clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com"),
		), nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)
	requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")

	runner.hubConfig = &rest.Config{Host: "https://no-crd.example.com"}
	runner.reconcileRoots(ctx)

	requireNoProfileContextEventually(t, store, "in-cluster/default/spoke-a")

	noCRDClientRequests := clientRequests["https://no-crd.example.com"]
	require.NotZero(t, noCRDClientRequests)

	runner.reconcileRoots(ctx)
	assert.Equal(t, noCRDClientRequests, clientRequests["https://no-crd.example.com"])

	now = now.Add(2 * time.Minute)
	noCRDMode = false

	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	requireProfileContextEventually(t, store, "in-cluster/default/spoke-b")
	assert.Greater(t, clientRequests["https://no-crd.example.com"], noCRDClientRequests)
}

func TestClusterProfileInformerUsesWatchListOptions(t *testing.T) {
	clientfeaturestesting.SetFeatureDuringTest(t, clientfeatures.WatchListClient, true)

	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:         store,
		HubConfig:     &rest.Config{Host: "https://hub.example.com"},
		LabelSelector: "!headlamp.dev/ignore",
	})

	client := ciafake.NewSimpleClientset()
	optionsCh := make(chan metav1.ListOptions, 1)
	fakeWatch := watch.NewFake()

	client.PrependWatchReactor("clusterprofiles", func(action k8stesting.Action) (bool, watch.Interface, error) {
		watchAction, ok := action.(interface {
			GetListOptions() metav1.ListOptions
		})
		require.True(t, ok)

		select {
		case optionsCh <- watchAction.GetListOptions():
		default:
		}

		return true, fakeWatch, nil
	})

	runner.clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return watchListClient{Interface: client}, nil
	}

	ctx := testRunnerContext(t, runner)
	runner.reconcileRoots(ctx)

	var options metav1.ListOptions
	select {
	case options = <-optionsCh:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for ClusterProfile watch-list request")
	}

	require.NotNil(t, options.SendInitialEvents)
	assert.True(t, *options.SendInitialEvents)
	assert.True(t, options.AllowWatchBookmarks)
	assert.Equal(t, metav1.ResourceVersionMatchNotOlderThan, options.ResourceVersionMatch)
	assert.Equal(t, "!headlamp.dev/ignore", options.LabelSelector)

	fakeWatch.Stop()
}

func TestNoCRDErrorClassification(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "clusterprofiles not found",
			err: apierrors.NewNotFound(schema.GroupResource{
				Group:    apisv1alpha1.Group,
				Resource: "clusterprofiles",
			}, "clusterprofiles"),
			want: true,
		},
		{
			name: "no match",
			err: &meta.NoResourceMatchError{
				PartialResource: schema.GroupVersionResource{
					Group:    apisv1alpha1.Group,
					Version:  apisv1alpha1.Version,
					Resource: "clusterprofiles",
				},
			},
			want: true,
		},
		{
			name: "forbidden",
			err: apierrors.NewForbidden(schema.GroupResource{
				Group:    apisv1alpha1.Group,
				Resource: "clusterprofiles",
			}, "clusterprofiles", errors.New("denied")),
			want: false,
		},
		{
			name: "transport",
			err:  errors.New("connection refused"),
			want: false,
		},
		{
			name: "other not found",
			err: apierrors.NewNotFound(schema.GroupResource{
				Group:    "",
				Resource: "pods",
			}, "pods"),
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isNoCRDError(tt.err))
		})
	}
}

func TestNoCRDCacheTTL(t *testing.T) {
	runner := newTestRunner(t, Options{
		NoCRDCacheTTL: time.Minute,
	})

	now := time.Date(2026, time.May, 8, 0, 0, 0, 0, time.UTC)
	runner.now = func() time.Time { return now }

	runner.markNoCRD("https://no-crd.example.com")
	assert.True(t, runner.hasNoCRD("https://no-crd.example.com"))

	now = now.Add(2 * time.Minute)

	assert.False(t, runner.hasNoCRD("https://no-crd.example.com"))
}
