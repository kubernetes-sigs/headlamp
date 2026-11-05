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
package clusterdiscovery

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
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

	inventorymetadata "github.com/kubernetes-sigs/headlamp/backend/pkg/clusterinventory/metadata"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	apisv1alpha1 "sigs.k8s.io/cluster-inventory-api/apis/v1alpha1"
	ciaclient "sigs.k8s.io/cluster-inventory-api/client/clientset/versioned"
	ciafake "sigs.k8s.io/cluster-inventory-api/client/clientset/versioned/fake"
)

const (
	clusterInventoryTestEventuallyTimeout = 10 * time.Second
	clusterInventoryTestEventuallyTick    = 20 * time.Millisecond
)

func newTestRunner(t *testing.T, opts Options) *Runner {
	t.Helper()

	if opts.Store == nil {
		opts.Store = kubeconfig.NewContextStore()
	}

	if opts.OIDC == nil {
		opts.OIDC = testOIDCOptions()
	}

	runner, err := NewRunner(opts, NewClusterProfileSource())
	require.NoError(t, err)

	return runner
}

func testOIDCOptions() *kubeconfig.OidcConfig {
	return &kubeconfig.OidcConfig{
		ClientID:     "headlamp",
		ClientSecret: "secret",
		IdpIssuerURL: "https://idp.example.com",
		Scopes:       []string{"profile", "email"},
	}
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
					CertificateAuthorityData: testCAPEM(),
				},
			},
		}
	}

	return cp
}

func clusterProfileWithControlPlaneCondition(
	status metav1.ConditionStatus,
	reason string,
	message string,
) *apisv1alpha1.ClusterProfile {
	cp := clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com")
	cp.Status.Conditions = []metav1.Condition{
		{
			Type:    apisv1alpha1.ClusterConditionControlPlaneHealthy,
			Status:  status,
			Reason:  reason,
			Message: message,
		},
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

func namespacedProfileClient() *ciafake.Clientset {
	fromDefault := clusterProfile("from-default", "static-token", "https://default.example.com")
	fromA := clusterProfile("from-a", "static-token", "https://a.example.com")
	fromA.Namespace = "team-a"
	fromB := clusterProfile("from-b", "static-token", "https://b.example.com")
	fromB.Namespace = "team-b"

	return ciafake.NewSimpleClientset(fromDefault, fromA, fromB)
}

func getProfileContext(store kubeconfig.ContextStore, profileKey string) (*kubeconfig.Context, error) {
	contexts, err := store.GetContexts()
	if err != nil {
		return nil, err
	}

	for _, k := range contexts {
		if inventoryMetadata(k) != nil && inventoryMetadata(k).Profile.Key == profileKey {
			return k, nil
		}
	}

	return nil, fmt.Errorf("profile context not found: %s", profileKey)
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

		if state == nil {
			return false
		}

		for _, watch := range state.watches {
			if !watch.informer.HasSynced() {
				return false
			}
		}

		return true
	}, clusterInventoryTestEventuallyTimeout, clusterInventoryTestEventuallyTick)
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
	}, clusterInventoryTestEventuallyTimeout, clusterInventoryTestEventuallyTick)

	return headlampContext
}

func requireNoProfileContextEventually(t *testing.T, store kubeconfig.ContextStore, profileKey string) {
	t.Helper()

	require.Eventually(t, func() bool {
		_, err := getProfileContext(store, profileKey)

		return err != nil
	}, clusterInventoryTestEventuallyTimeout, clusterInventoryTestEventuallyTick)
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

func TestNewRunnerValidatesOptions(t *testing.T) {
	store := kubeconfig.NewContextStore()
	_, err := NewRunner(Options{OIDC: testOIDCOptions()}, NewClusterProfileSource())
	require.ErrorContains(t, err, "context store is required")

	for _, opts := range []Options{
		{Store: store, OIDC: testOIDCOptions(), LabelSelector: "headlamp.dev/ignore in ("},
		{Store: store, OIDC: testOIDCOptions(), Namespaces: "team-a,Team B"},
		{Store: store, OIDC: testOIDCOptions(), Namespaces: "team-a,*"},
	} {
		_, err = NewRunner(opts, NewClusterProfileSource())
		require.Error(t, err)
	}
}

func TestNewRunnerOIDCValidatesOptions(t *testing.T) {
	store := kubeconfig.NewContextStore()
	_, err := NewRunner(Options{Store: store, OIDC: testOIDCOptions()}, NewClusterProfileSource())
	require.NoError(t, err)

	tests := []struct {
		name string
		opts Options
	}{
		{
			name: "oidc requires config",
			opts: Options{Store: store},
		},
		{
			name: "oidc requires client id",
			opts: Options{Store: store, OIDC: &kubeconfig.OidcConfig{
				IdpIssuerURL: "https://idp.example.com",
				Scopes:       []string{"profile"},
			}},
		},
		{
			name: "oidc requires issuer url",
			opts: Options{Store: store, OIDC: &kubeconfig.OidcConfig{
				ClientID: "headlamp",
				Scopes:   []string{"profile"},
			}},
		},
		{
			name: "oidc requires scopes",
			opts: Options{Store: store, OIDC: &kubeconfig.OidcConfig{
				ClientID:     "headlamp",
				IdpIssuerURL: "https://idp.example.com",
			}},
		},
		{
			name: "oidc rejects an empty scope",
			opts: Options{Store: store, OIDC: &kubeconfig.OidcConfig{
				ClientID:     "headlamp",
				IdpIssuerURL: "https://idp.example.com",
				Scopes:       []string{""},
			}},
		},
		{
			name: "oidc rejects whitespace-only scopes",
			opts: Options{Store: store, OIDC: &kubeconfig.OidcConfig{
				ClientID:     "headlamp",
				IdpIssuerURL: "https://idp.example.com",
				Scopes:       []string{" ", "\t"},
			}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewRunner(tt.opts, NewClusterProfileSource())
			require.ErrorContains(t, err, "cluster discovery requires")
		})
	}
}

func TestOIDCContextFromClusterProfile(t *testing.T) {
	oidcConf := testOIDCOptions()

	cp := clusterProfile("spoke-a", "unmatched-provider", "")
	cp.Status.AccessProviders = append(cp.Status.AccessProviders, apisv1alpha1.AccessProvider{
		Name: "with-server",
		Cluster: clientcmdv1.Cluster{
			Server:                   "https://spoke-a.example.com",
			CertificateAuthorityData: testCAPEM(),
		},
	})

	headlampContext, err := oidcContextFromAccessProvider(
		&cp.Status.AccessProviders[1], "in-cluster/default/spoke-a", oidcConf,
	)
	require.NoError(t, err)

	assert.Equal(t, "ctx-name", headlampContext.Name)
	assert.Equal(t, "https://spoke-a.example.com", headlampContext.Cluster.Server)
	assert.Equal(t, testCAPEM(), headlampContext.Cluster.CertificateAuthorityData)
	assert.Equal(t, kubeconfig.ClusterInventory, headlampContext.Source)
	assert.Equal(t, "cluster-inventory/in-cluster/default/spoke-a/with-server", headlampContext.ClusterID)
	assert.Nil(t, headlampContext.AuthInfo.Exec)
	assert.Equal(t, "oidc", headlampContext.AuthType())
	require.NotNil(t, headlampContext.AuthInfo.AuthProvider)
	assert.Equal(t, oidcConf.ClientID, headlampContext.AuthInfo.AuthProvider.Config["client-id"])
	serialized, err := json.Marshal(headlampContext)
	require.NoError(t, err)
	assert.NotContains(t, string(serialized), oidcConf.ClientSecret)

	require.NotNil(t, headlampContext.OidcConf)
	assert.Equal(t, oidcConf.ClientID, headlampContext.OidcConf.ClientID)
	assert.Equal(t, oidcConf.IdpIssuerURL, headlampContext.OidcConf.IdpIssuerURL)
	assert.Equal(t, oidcConf.Scopes, headlampContext.OidcConf.Scopes)

	// The context owns a deep copy of the shared OIDC config.
	headlampContext.OidcConf.ClientID = "mutated"
	headlampContext.OidcConf.Scopes[0] = "mutated"

	assert.Equal(t, "headlamp", oidcConf.ClientID)
	assert.Equal(t, "profile", oidcConf.Scopes[0])

	_, err = oidcContextFromAccessProvider(
		&apisv1alpha1.AccessProvider{Name: "no-server"},
		"in-cluster/default/no-server", oidcConf)
	require.ErrorContains(t, err, "access provider has no server URL")
}

func TestInformerSyncOIDCMode(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		OIDC:      testOIDCOptions(),
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	client := ciafake.NewSimpleClientset(
		// Provider names do not select credentials.
		clusterProfile("spoke-a", "unmatched-provider", "https://spoke-a.example.com"),
		clusterProfile("no-access", "", "https://no-access.example.com"),
	)
	runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return client, nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	headlampContext := requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
	assert.Equal(t, "oidc", headlampContext.AuthType())
	assert.Nil(t, headlampContext.AuthInfo.Exec)
	require.NotNil(t, headlampContext.OidcConf)
	assert.Equal(t, "headlamp", headlampContext.OidcConf.ClientID)
	require.NotNil(t, inventoryMetadata(headlampContext))

	requireNoProfileContextEventually(t, store, "in-cluster/default/no-access")

	profile, err := client.ApisV1alpha1().ClusterProfiles("default").Get(ctx, "spoke-a", metav1.GetOptions{})
	require.NoError(t, err)

	profile.Status.AccessProviders[0].Cluster.Server = "http://insecure.example.com"
	_, err = client.ApisV1alpha1().ClusterProfiles("default").UpdateStatus(ctx, profile, metav1.UpdateOptions{})
	require.NoError(t, err)
	requireNoProfileContextEventually(t, store, "in-cluster/default/spoke-a")

	profile.Status.AccessProviders[0].Cluster.Server = "https://spoke-a.example.com"
	_, err = client.ApisV1alpha1().ClusterProfiles("default").UpdateStatus(ctx, profile, metav1.UpdateOptions{})
	require.NoError(t, err)
	requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")

	err = client.ApisV1alpha1().ClusterProfiles("default").Delete(
		context.Background(), "spoke-a", metav1.DeleteOptions{})
	require.NoError(t, err)

	requireNoProfileContextEventually(t, store, "in-cluster/default/spoke-a")
}

func TestNormalizeNamespaces(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		want    []string
		wantErr string
	}{
		{name: "unset", value: "  "},
		{
			name:  "trimmed, sorted and deduplicated",
			value: " team-b,team-a, team-b ",
			want:  []string{"team-a", "team-b"},
		},
		{name: "all namespaces", value: "*", want: []string{metav1.NamespaceAll}},
		{
			name:    "repeated all namespaces are rejected",
			value:   "*,*",
			wantErr: `"*" must be used on its own`,
		},
		{
			name:    "all namespaces cannot be combined with a listed namespace",
			value:   "team-a,*",
			wantErr: `"*" must be used on its own`,
		},
		{
			name:    "empty entries are rejected",
			value:   "team-a,,team-b",
			wantErr: "namespace must not be empty",
		},
		{
			name:    "invalid namespaces are rejected",
			value:   "Team-A",
			wantErr: "invalid cluster-discovery-namespaces",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeNamespaces(tt.value)
			if tt.wantErr != "" {
				require.ErrorContains(t, err, tt.wantErr)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestOIDCContextPreservesOnlyConnectionMetadata(t *testing.T) {
	cp := clusterProfile("spoke", "provider", "https://spoke.example.com/clusters/spoke")
	cp.Status.AccessProviders[0].Cluster = clientcmdv1.Cluster{
		Server:                   "https://spoke.example.com/clusters/spoke",
		CertificateAuthorityData: testCAPEM(),
		CertificateAuthority:     "/etc/private/ca.pem",
		TLSServerName:            "spoke.internal",
		ProxyURL:                 "http://proxy.example.com:8080",
		DisableCompression:       true,
		Extensions: []clientcmdv1.NamedExtension{{
			Name:      "client.authentication.k8s.io/exec",
			Extension: k8sruntime.RawExtension{Raw: []byte(`{"command":"/bin/token"}`)},
		}},
	}

	ctx, err := oidcContextFromAccessProvider(
		&cp.Status.AccessProviders[0], "root/ns/spoke", testOIDCOptions(),
	)
	require.NoError(t, err)
	assert.Equal(t, cp.Status.AccessProviders[0].Cluster.Server, ctx.Cluster.Server)
	assert.Equal(t, testCAPEM(), ctx.Cluster.CertificateAuthorityData)
	assert.Empty(t, ctx.Cluster.CertificateAuthority)
	assert.False(t, ctx.Cluster.InsecureSkipTLSVerify)
	assert.Equal(t, "spoke.internal", ctx.Cluster.TLSServerName)
	assert.Equal(t, "http://proxy.example.com:8080", ctx.Cluster.ProxyURL)
	assert.True(t, ctx.Cluster.DisableCompression)
	assert.Empty(t, ctx.Cluster.Extensions)
	require.NotNil(t, ctx.AuthInfo.AuthProvider)
	assert.Equal(t, "oidc", ctx.AuthInfo.AuthProvider.Name)
	assert.Empty(t, ctx.AuthInfo.Token)
	assert.Nil(t, ctx.AuthInfo.Exec)
	assert.Empty(t, ctx.AuthInfo.AuthProvider.Config["id-token"])
	assert.Empty(t, ctx.AuthInfo.AuthProvider.Config["refresh-token"])
	assert.Empty(t, ctx.AuthInfo.AuthProvider.Config["client-secret"])
	assert.Equal(t, "oidc", ctx.AuthType())
	ctx.Cluster.CertificateAuthorityData[0] = 'X'
	assert.Equal(t, testCAPEM(), cp.Status.AccessProviders[0].Cluster.CertificateAuthorityData)
}

func TestInventoryRejectsInvalidConnectionMetadata(t *testing.T) {
	for _, server := range []string{
		"http://spoke.example.com", "https://", "file:///tmp/config",
		"https://user:password@spoke.example.com", "https://spoke.example.com?token=secret",
		"https://spoke.example.com#fragment",
	} {
		t.Run(server, func(t *testing.T) {
			cp := clusterProfile("spoke", "provider", server)
			// An invalid selected endpoint must not fall through to another endpoint.
			cp.Status.AccessProviders = append(cp.Status.AccessProviders, apisv1alpha1.AccessProvider{
				Name: "second", Cluster: clientcmdv1.Cluster{Server: "https://second.example.com"},
			})
			_, err := oidcContextFromAccessProvider(
				&cp.Status.AccessProviders[0], "root/ns/spoke", testOIDCOptions(),
			)
			require.ErrorContains(t, err, "server must be an HTTPS URL")
		})
	}

	for _, proxy := range []string{"not-a-proxy", "file:///tmp/proxy", "http://"} {
		t.Run(proxy, func(t *testing.T) {
			cp := clusterProfile("spoke", "provider", "https://spoke.example.com")
			cp.Status.AccessProviders[0].Cluster.ProxyURL = proxy
			_, err := oidcContextFromAccessProvider(
				&cp.Status.AccessProviders[0], "root/ns/spoke", testOIDCOptions(),
			)
			require.ErrorContains(t, err, "proxy must be an HTTP, HTTPS or SOCKS5 URL")
		})
	}

	// SetupProxy rejects unusable TLS settings instead of using Go's default transport.
	for name, mutate := range map[string]func(*clientcmdv1.Cluster){
		"CA data that is not PEM": func(c *clientcmdv1.Cluster) { c.CertificateAuthorityData = []byte("not a certificate") },
		"CA with the insecure flag": func(c *clientcmdv1.Cluster) {
			c.CertificateAuthorityData, c.InsecureSkipTLSVerify = testCAPEM(), true
		},
	} {
		t.Run(name, func(t *testing.T) {
			cp := clusterProfile("spoke", "provider", "https://spoke.example.com")
			mutate(&cp.Status.AccessProviders[0].Cluster)
			_, err := oidcContextFromAccessProvider(
				&cp.Status.AccessProviders[0], "root/ns/spoke", testOIDCOptions(),
			)
			require.ErrorContains(t, err, "build proxy transport")
		})
	}
}

func TestContextFromClusterProfilePreservesInventoryMetadata(t *testing.T) {
	runner := newTestRunner(t, Options{})
	profileKey := "in-cluster/default/spoke-a"
	cp := clusterProfile("spoke-a", "static-token", "https://spoke-a.example.com")
	cp.Status.Conditions = []metav1.Condition{
		{
			Type:               apisv1alpha1.ClusterConditionControlPlaneHealthy,
			Status:             metav1.ConditionFalse,
			Reason:             "HealthCheckFailed",
			Message:            "control plane endpoint is not ready",
			LastTransitionTime: metav1.NewTime(time.Date(2026, 5, 10, 0, 0, 0, 0, time.UTC)),
			ObservedGeneration: 3,
		},
	}
	cp.Status.Version = apisv1alpha1.ClusterVersion{Kubernetes: "v1.35.0"}
	cp.Status.Properties = []apisv1alpha1.Property{
		{
			Name:             "region",
			Value:            "us-west1",
			LastObservedTime: metav1.NewTime(time.Date(2026, 5, 10, 1, 0, 0, 0, time.UTC)),
		},
	}

	contexts := runner.contextsFromClusterProfile(profileKey, cp)
	require.Len(t, contexts, 1)
	headlampContext := contexts[0]

	require.NotNil(t, inventoryMetadata(headlampContext))
	assert.Equal(t, inventorymetadata.Profile{
		Namespace: "default",
		Name:      "spoke-a",
		Key:       profileKey,
	}, inventoryMetadata(headlampContext).Profile)
	assert.Equal(t, cp.Status.Conditions, inventoryMetadata(headlampContext).Conditions)
	require.NotNil(t, inventoryMetadata(headlampContext).Version)
	assert.Equal(t, "v1.35.0", inventoryMetadata(headlampContext).Version.Kubernetes)
	assert.Equal(t, []inventorymetadata.Property{
		{
			Name:             "region",
			Value:            "us-west1",
			LastObservedTime: cp.Status.Properties[0].LastObservedTime,
		},
	}, inventoryMetadata(headlampContext).Properties)
}

func TestClusterProfileDeletePrunesContextOutsideRunnerLock(t *testing.T) {
	store := &removeLockDetectingStore{ContextStore: kubeconfig.NewContextStore()}
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})
	store.runner = runner

	state := &rootState{rootID: inClusterRootID}
	profileKey := makeOwnerKey(state.rootID, "default/spoke-a")
	contextName := contextNameFromProfileKey(profileKey, "provider")
	require.NoError(t, store.AddContext(&kubeconfig.Context{Name: contextName}))

	runner.mu.Lock()
	runner.roots[state.rootID] = state
	runner.ownerKeysByRoot[state.rootID] = map[string]string{profileKey: "default"}
	runner.owners[profileKey] = ownerState{contextNames: []string{contextName}}
	runner.mu.Unlock()

	runner.handleOwnerDelete(state, &apisv1alpha1.ClusterProfile{
		ObjectMeta: metav1.ObjectMeta{
			Namespace: "default",
			Name:      "spoke-a",
		},
	})

	assert.False(t, store.removeWhileLocked.Load())

	_, err := store.GetContext(contextName)
	require.Error(t, err)

	runner.mu.Lock()
	_, profileExists := runner.owners[profileKey]
	_, rootProfileExists := runner.ownerKeysByRoot[state.rootID][profileKey]
	runner.mu.Unlock()

	assert.False(t, profileExists)
	assert.False(t, rootProfileExists)
}

func TestContextNameFromProfileKey(t *testing.T) {
	tests := []struct {
		profileKey string
		want       string
	}{
		{"in-cluster/ns/name", "cluster-inventory-in-cluster--ns--name--3173c78710df-provider"},
		{"store/minikube/ns/name", "cluster-inventory-store--minikube--ns--name--6a4aaa9ad6f7-provider"},
		{"store/seed/ns/name with space", "cluster-inventory-store--seed--ns--name__with__space--2a58213d9e31-provider"},
		{"ns/a--b", "cluster-inventory-ns--a--b--18cc3c73f65e-provider"},
		{"ns--a/b", "cluster-inventory-ns--a--b--dd8d0b5fd10f-provider"},
		{"ns/a_b + c", "cluster-inventory-ns--a_b__+__c--a2c927bc5c01-provider"},
	}

	for _, tt := range tests {
		t.Run(tt.profileKey, func(t *testing.T) {
			assert.Equal(t, tt.want, contextNameFromProfileKey(tt.profileKey, "provider"))
		})
	}
}

func TestContextNameFromProfileKeyAvoidsSeparatorCollisions(t *testing.T) {
	assert.NotEqual(t,
		contextNameFromProfileKey("ns/a--b", "provider"),
		contextNameFromProfileKey("ns--a/b", "provider"),
	)
}

func TestInformerWatchesNamespaces(t *testing.T) {
	tests := []struct {
		name         string
		hubNamespace string
		namespaces   string
		want         []string
		wantAbsent   []string
	}{
		{
			name:         "defaults to the hub namespace",
			hubNamespace: "team-a",
			want:         []string{"in-cluster/team-a/from-a"},
			wantAbsent:   []string{"in-cluster/default/from-default", "in-cluster/team-b/from-b"},
		},
		{
			name:       "watches the configured namespaces",
			namespaces: "team-a,team-b",
			want:       []string{"in-cluster/team-a/from-a", "in-cluster/team-b/from-b"},
			wantAbsent: []string{"in-cluster/default/from-default"},
		},
		{
			name:       "watches all namespaces",
			namespaces: "*",
			want: []string{
				"in-cluster/default/from-default",
				"in-cluster/team-a/from-a",
				"in-cluster/team-b/from-b",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := kubeconfig.NewContextStore()
			runner := newTestRunner(t, Options{
				Store:        store,
				HubConfig:    &rest.Config{Host: "https://hub.example.com"},
				HubNamespace: tt.hubNamespace,
				Namespaces:   tt.namespaces,
			})
			runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
				return namespacedProfileClient(), nil
			}

			ctx := testRunnerContext(t, runner)
			reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

			for _, profileKey := range tt.want {
				requireProfileContextEventually(t, store, profileKey)
			}

			for _, profileKey := range tt.wantAbsent {
				requireNoProfileContextEventually(t, store, profileKey)
			}
		})
	}
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

	runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
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

	runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
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

	runner.source.(*clusterProfileSource).clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
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

func TestNamespaceSyncFailureOnlyPreservesFailedNamespace(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:      store,
		HubConfig:  &rest.Config{Host: "https://hub.example.com"},
		Namespaces: "team-a,team-b",
	})

	runner.source.(*clusterProfileSource).clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
		if config.Host != "https://partial-outage.example.com" {
			return namespacedProfileClient(), nil
		}

		client := ciafake.NewSimpleClientset()
		client.PrependReactor("list", "clusterprofiles", func(action k8stesting.Action) (bool, k8sruntime.Object, error) {
			if action.GetNamespace() == "team-b" {
				return true, nil, errors.New("team-b is unavailable")
			}

			return false, nil, nil
		})

		return client, nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)
	requireProfileContextEventually(t, store, "in-cluster/team-a/from-a")
	requireProfileContextEventually(t, store, "in-cluster/team-b/from-b")

	runner.hubConfig = &rest.Config{Host: "https://partial-outage.example.com"}
	runner.reconcileRoots(ctx)

	require.Eventually(t, func() bool {
		runner.mu.Lock()
		defer runner.mu.Unlock()

		state := runner.roots[inClusterRootID]
		if state == nil || state.serverURL != "https://partial-outage.example.com" {
			return false
		}

		for _, watch := range state.watches {
			if watch.namespace == "team-a" {
				return watch.informer.HasSynced()
			}
		}

		return false
	}, clusterInventoryTestEventuallyTimeout, clusterInventoryTestEventuallyTick)

	requireNoProfileContextEventually(t, store, "in-cluster/team-a/from-a")
	requireProfileContextEventually(t, store, "in-cluster/team-b/from-b")
}

func TestInformerUpdatesConnectionMetadataAfterProviderNameChange(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	client := ciafake.NewSimpleClientset(
		clusterProfile("spoke-a", "original-provider", "https://spoke-a.example.com"),
	)

	runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return client, nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)
	previousContext := requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
	require.Equal(t, "https://spoke-a.example.com", previousContext.Cluster.Server)

	updated := clusterProfile("spoke-a", "another-provider", "https://spoke-a-updated.example.com")
	_, err := client.ApisV1alpha1().ClusterProfiles("default").Update(ctx, updated, metav1.UpdateOptions{})
	require.NoError(t, err)

	var headlampContext *kubeconfig.Context

	require.Eventually(t, func() bool {
		var err error

		headlampContext, err = getProfileContext(store, "in-cluster/default/spoke-a")

		return err == nil && headlampContext.Cluster.Server == updated.Status.AccessProviders[0].Cluster.Server
	}, clusterInventoryTestEventuallyTimeout, clusterInventoryTestEventuallyTick)

	assert.NotEqual(t, previousContext.Name, headlampContext.Name)
	assert.NotEqual(t, previousContext.ClusterID, headlampContext.ClusterID)
	assert.True(t, strings.HasSuffix(headlampContext.Name, "-another-provider"))
	_, err = store.GetContext(previousContext.Name)
	require.Error(t, err)
	assert.Equal(t, "oidc", headlampContext.AuthType())
	assert.Nil(t, headlampContext.AuthInfo.Exec)
}

func assertProviderPresentation(t *testing.T, connection *kubeconfig.Context, provider string) {
	t.Helper()
	require.Equal(t, &kubeconfig.ConnectionPresentation{DisplayName: "spoke", Fields: map[string]string{
		"provider": provider, "namespace": "default", "root": "in-cluster",
	}}, connection.Presentation)
}

func TestInformerSyncsEachAccessProvider(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{Store: store, HubConfig: &rest.Config{Host: "https://hub.example.com"}})
	profile := clusterProfile("spoke", "direct", "https://direct.example.com")
	profile.Status.AccessProviders = append(profile.Status.AccessProviders,
		apisv1alpha1.AccessProvider{Name: "gateway", Cluster: clientcmdv1.Cluster{Server: "https://gateway.example.com"}},
		apisv1alpha1.AccessProvider{Name: "unavailable"},
	)
	client := ciafake.NewSimpleClientset(profile)
	runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return client, nil
	}
	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	key := "in-cluster/default/spoke"
	directName := contextNameFromProfileKey(key, "direct")
	gatewayName := contextNameFromProfileKey(key, "gateway")

	require.Eventually(t, func() bool {
		contexts, _ := store.GetContexts()
		return len(contexts) == 2
	}, clusterInventoryTestEventuallyTimeout, clusterInventoryTestEventuallyTick)

	direct, err := store.GetContext(directName)
	require.NoError(t, err)
	gateway, err := store.GetContext(gatewayName)
	require.NoError(t, err)
	require.NotEqual(t, direct.ClusterID, gateway.ClusterID)
	assertProviderPresentation(t, direct, "direct")
	assertProviderPresentation(t, gateway, "gateway")
	require.True(t, strings.HasSuffix(direct.Name, "-direct"))
	require.True(t, strings.HasSuffix(gateway.Name, "-gateway"))
	require.Equal(t, "https://gateway.example.com", gateway.Cluster.Server)

	// Reordering providers and changing one endpoint preserve both connection identities.
	profile.Status.AccessProviders[0].Cluster.Server = "https://updated.example.com"
	profile.Status.AccessProviders = []apisv1alpha1.AccessProvider{
		profile.Status.AccessProviders[1], profile.Status.AccessProviders[0],
	}
	_, err = client.ApisV1alpha1().ClusterProfiles("default").Update(ctx, profile, metav1.UpdateOptions{})
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		current, err := store.GetContext(directName)
		return err == nil && current.Cluster.Server == "https://updated.example.com" && current.ClusterID == direct.ClusterID
	}, clusterInventoryTestEventuallyTimeout, clusterInventoryTestEventuallyTick)

	// Removing an endpoint removes only its connection.
	profile.Status.AccessProviders = profile.Status.AccessProviders[:1]
	_, err = client.ApisV1alpha1().ClusterProfiles("default").Update(ctx, profile, metav1.UpdateOptions{})
	require.NoError(t, err)
	require.Eventually(t, func() bool {
		_, err := store.GetContext(directName)
		return err != nil
	}, clusterInventoryTestEventuallyTimeout, clusterInventoryTestEventuallyTick)

	current, err := store.GetContext(gatewayName)
	require.NoError(t, err)
	require.Equal(t, gateway.ClusterID, current.ClusterID)

	require.NoError(t, client.ApisV1alpha1().ClusterProfiles("default").Delete(ctx, profile.Name, metav1.DeleteOptions{}))
	requireNoProfileContextEventually(t, store, key)
}

func TestInformerDoesNotDiscoverClusterProfilesFromDiscoveredClusters(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	clientRequests := map[string]int{}
	runner.source.(*clusterProfileSource).clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
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

	runner.source.(*clusterProfileSource).clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
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
	runner.source.(*clusterProfileSource).clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
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
	fromA := requireProfileContextEventually(t, store, "store/seed-a/default/from-a")
	fromB := requireProfileContextEventually(t, store, "store/seed-b/default/from-b")
	assert.Equal(t, "seed-a", fromA.Presentation.Fields["root"])
	assert.Equal(t, "seed-b", fromB.Presentation.Fields["root"])
	assert.Equal(t, "store/seed-a", fromA.Discovery.Root)
	assert.Equal(t, "store/seed-b", fromB.Discovery.Root)
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
	runner.source.(*clusterProfileSource).clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
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
	}, clusterInventoryTestEventuallyTimeout, clusterInventoryTestEventuallyTick)
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
	runner.source.(*clusterProfileSource).clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
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

func TestStoreSeedNamespaceChangeRestartsWatcher(t *testing.T) {
	store := kubeconfig.NewContextStore()
	seed := testStoreContext("seed-a", kubeconfig.KubeConfig, "https://seed.example.com", "token", false)
	seed.KubeContext.Namespace = "team-a"
	require.NoError(t, store.AddContext(seed))

	runner := newTestRunner(t, Options{
		Store:             store,
		DiscoverFromStore: true,
	})

	client := namespacedProfileClient()
	runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return client, nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, "store/seed-a")
	requireProfileContextEventually(t, store, "store/seed-a/team-a/from-a")
	requireNoProfileContextEventually(t, store, "store/seed-a/team-b/from-b")

	seed = testStoreContext("seed-a", kubeconfig.KubeConfig, "https://seed.example.com", "token", false)
	seed.KubeContext.Namespace = "team-b"
	require.NoError(t, store.AddContext(seed))

	reconcileAndWaitForRoot(t, ctx, runner, "store/seed-a")

	requireNoProfileContextEventually(t, store, "store/seed-a/team-a/from-a")
	requireProfileContextEventually(t, store, "store/seed-a/team-b/from-b")
}

func TestRootFingerprintIncludesExecConfig(t *testing.T) {
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

	fingerprint := func(config *rest.Config) string {
		return rootFingerprint(rootConfig{restConfig: config})
	}

	assert.Equal(t, fingerprint(configA), fingerprint(configAAgain))
	assert.NotEqual(t, fingerprint(configA), fingerprint(configB))
}

func TestRootFingerprintIncludesNamespaces(t *testing.T) {
	config := &rest.Config{Host: "https://seed.example.com"}

	assert.NotEqual(t,
		rootFingerprint(rootConfig{restConfig: config, namespaces: []string{"team-a"}}),
		rootFingerprint(rootConfig{restConfig: config, namespaces: []string{"team-b"}}))
}

func TestSelfReferencingProfileDoesNotTriggerChildWatcher(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	clientRequests := 0
	runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
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
	runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
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
	}, clusterInventoryTestEventuallyTimeout, clusterInventoryTestEventuallyTick)

	require.NoError(t, client.ApisV1alpha1().ClusterProfiles("default").Delete(
		ctx,
		"spoke-a",
		metav1.DeleteOptions{},
	))

	requireNoProfileContextEventually(t, store, "in-cluster/default/spoke-a")
}

func TestWatchUpdateSyncsClusterInventoryConditions(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:     store,
		HubConfig: &rest.Config{Host: "https://hub.example.com"},
	})

	client := ciafake.NewSimpleClientset()
	runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
		return client, nil
	}

	ctx := testRunnerContext(t, runner)
	reconcileAndWaitForRoot(t, ctx, runner, inClusterRootID)

	createdProfile := clusterProfileWithControlPlaneCondition(
		metav1.ConditionFalse,
		"HealthCheckFailed",
		"control plane endpoint is not ready",
	)
	created, err := client.ApisV1alpha1().ClusterProfiles("default").Create(
		ctx,
		createdProfile,
		metav1.CreateOptions{},
	)
	require.NoError(t, err)

	headlampContext := requireProfileContextEventually(t, store, "in-cluster/default/spoke-a")
	require.NotNil(t, inventoryMetadata(headlampContext))
	require.Len(t, inventoryMetadata(headlampContext).Conditions, 1)
	require.Equal(t, metav1.ConditionFalse, inventoryMetadata(headlampContext).Conditions[0].Status)

	updatedProfile := clusterProfileWithControlPlaneCondition(
		metav1.ConditionTrue,
		"HealthCheckSucceeded",
		"control plane endpoint is ready",
	)
	updatedProfile.ObjectMeta = created.ObjectMeta
	_, err = client.ApisV1alpha1().ClusterProfiles("default").Update(ctx, updatedProfile, metav1.UpdateOptions{})
	require.NoError(t, err)

	require.Eventually(t, func() bool {
		headlampContext, err := getProfileContext(store, "in-cluster/default/spoke-a")
		if err != nil || inventoryMetadata(headlampContext) == nil {
			return false
		}

		conditions := inventoryMetadata(headlampContext).Conditions

		return len(conditions) == 1 &&
			conditions[0].Type == apisv1alpha1.ClusterConditionControlPlaneHealthy &&
			conditions[0].Status == metav1.ConditionTrue &&
			conditions[0].Reason == "HealthCheckSucceeded"
	}, clusterInventoryTestEventuallyTimeout, clusterInventoryTestEventuallyTick)
}

func TestClusterProfileUpdateToIgnoredLabelPrunesContext(t *testing.T) {
	store := kubeconfig.NewContextStore()
	runner := newTestRunner(t, Options{
		Store:         store,
		HubConfig:     &rest.Config{Host: "https://hub.example.com"},
		LabelSelector: "!headlamp.dev/ignore",
	})

	client := ciafake.NewSimpleClientset()
	runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
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
	runner.source.(*clusterProfileSource).clientForConfig = func(config *rest.Config) (ciaclient.Interface, error) {
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

	runner.source.(*clusterProfileSource).clientForConfig = func(*rest.Config) (ciaclient.Interface, error) {
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
			assert.Equal(t, tt.want, isNoCRDError(tt.err, clusterProfileResource))
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
