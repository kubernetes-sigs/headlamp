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
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd/api"
)

var generatedTestCA = sync.OnceValue(func() []byte {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		panic(err)
	}

	template := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "discovery-test-ca"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign,
	}

	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		panic(err)
	}

	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
})

// testCAPEM returns a self-signed CA certificate that passes TLS validation.
func testCAPEM() []byte { return bytes.Clone(generatedTestCA()) }

// The common loader rejects invalid TLS settings for every source.
func TestConnectionClusterRequiresUsableTLSSettings(t *testing.T) {
	validCA := testCAPEM()

	for _, tc := range []struct {
		name    string
		cluster api.Cluster
		wantErr string
	}{
		{name: "no CA uses the system roots", cluster: api.Cluster{}},
		{name: "valid CA", cluster: api.Cluster{CertificateAuthorityData: validCA}},
		{name: "valid CA with a TLS server name", cluster: api.Cluster{
			CertificateAuthorityData: validCA, TLSServerName: "api.internal",
		}},
		{name: "insecure without a CA", cluster: api.Cluster{InsecureSkipTLSVerify: true}},
		{
			name:    "CA data that is not PEM",
			cluster: api.Cluster{CertificateAuthorityData: []byte("not a certificate")},
			wantErr: "build proxy transport",
		},
		{
			name:    "CA together with the insecure flag",
			cluster: api.Cluster{CertificateAuthorityData: validCA, InsecureSkipTLSVerify: true},
			wantErr: "build proxy transport",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tc.cluster.Server = "https://spoke.example.com"

			got, err := ConnectionCluster(&tc.cluster)
			require.NoError(t, err)

			_, errs := kubeconfig.LoadContextsFromAPIConfig(ConfigForCluster("connection", got, ""), false)
			if tc.wantErr != "" {
				require.NotEmpty(t, errs)
				require.ErrorContains(t, errs[0], tc.wantErr)

				return
			}

			require.Empty(t, errs)
			require.Equal(t, tc.cluster.CertificateAuthorityData, got.CertificateAuthorityData)
			require.Equal(t, tc.cluster.InsecureSkipTLSVerify, got.InsecureSkipTLSVerify)
			require.Equal(t, tc.cluster.TLSServerName, got.TLSServerName)
		})
	}
}

// describedSource is the sample source under a descriptor chosen by the test.
type describedSource struct {
	*sampleFleetSource
	descriptor Descriptor
}

// Descriptor returns the descriptor of the test instead of that of the sample source.
func (s describedSource) Descriptor() Descriptor { return s.descriptor }

// A registry only accepts sources that can be identified and watched.
func TestRegistryRejectsUnusableSources(t *testing.T) {
	registry := &Registry{}

	require.ErrorContains(t, registry.Register(nil), "discovery source is required")

	for _, tc := range []struct {
		name       string
		descriptor Descriptor
	}{
		{name: "no ID", descriptor: Descriptor{DisplayName: "Fleet", Resource: sampleFleetResource}},
		{name: "no display name", descriptor: Descriptor{ID: "fleet", Resource: sampleFleetResource}},
		{name: "no owner resource", descriptor: Descriptor{ID: "fleet", DisplayName: "Fleet"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := registry.Register(describedSource{descriptor: tc.descriptor})
			require.ErrorContains(t, err, "descriptor is incomplete")
		})
	}

	require.Empty(t, registry.Sources())
}

// Callers cannot change what is registered through the sources they are given.
func TestRegistrySourcesReturnsACopy(t *testing.T) {
	registry := &Registry{}
	require.NoError(t, registry.Register(&sampleFleetSource{}))

	sources := registry.Sources()
	sources[0] = nil

	require.NotNil(t, registry.Sources()[0])
}

// Informers report a deletion they missed as a tombstone, which still names the owner.
func TestObjectOwnerUnwrapsDeletionTombstones(t *testing.T) {
	member := sampleFleetMember("member-a", "https://a.example.com", "eu")
	want := []types.NamespacedName{{Namespace: "default", Name: "member-a"}}

	require.Equal(t, want, objectOwner(member))
	require.Equal(t, want, objectOwner(cache.DeletedFinalStateUnknown{Key: "default/member-a", Obj: member}))
	require.Equal(t, want, objectOwner(&cache.DeletedFinalStateUnknown{Key: "default/member-a", Obj: member}))
	require.Nil(t, objectOwner("not a Kubernetes object"))
}

// Adapters read what a watched resource has cached, and nothing else.
func TestRootWatchGetReadsWatchedResources(t *testing.T) {
	watch := sampleRootWatch(t, sampleFleetWith(sampleFleetMember("member-a", "https://a.example.com", "eu")))
	owner := types.NamespacedName{Namespace: "default", Name: "member-a"}

	obj, exists := watch.Get(sampleFleetResource, owner)
	require.True(t, exists)
	require.Equal(t, []types.NamespacedName{owner}, objectOwner(obj))

	_, exists = watch.Get(sampleFleetResource, types.NamespacedName{Namespace: "default", Name: "missing"})
	require.False(t, exists)

	_, exists = watch.Get(secretResource, owner)
	require.False(t, exists)
}

// Whatever a source leaves in its kubeconfig, users sign in with the global OIDC settings.
func TestGeneratedOIDCConfigUsesGlobalOIDCSettings(t *testing.T) {
	ca := "issuer CA"
	fromSource := ConfigForCluster("from-source", &api.Cluster{Server: "https://member.example.com"}, "team")
	fromSource.Contexts["from-source"].AuthInfo = "from-source"
	fromSource.AuthInfos = map[string]*api.AuthInfo{"from-source": {Token: "must-not-be-forwarded"}}

	config, err := generatedOIDCConfig(
		GeneratedKubeconfig{Key: "default", Name: "member", ClusterID: "fleet/member", Config: fromSource},
		&kubeconfig.OidcConfig{
			ClientID: "headlamp", IdpIssuerURL: "https://idp.example.com", Scopes: []string{"openid", "email"}, CACert: &ca,
		},
	)
	require.NoError(t, err)
	require.Equal(t, "team", config.Contexts["member"].Namespace)
	require.Equal(t, map[string]*api.AuthInfo{"member": {AuthProvider: &api.AuthProviderConfig{
		Name: "oidc",
		Config: map[string]string{
			"client-id":                      "headlamp",
			"idp-issuer-url":                 "https://idp.example.com",
			"scope":                          "openid,email",
			"idp-certificate-authority-data": base64.StdEncoding.EncodeToString([]byte(ca)),
		},
	}}}, config.AuthInfos)
}

// A source that does not describe exactly one usable connection produces none.
func TestGeneratedOIDCConfigRejectsIncompleteConnections(t *testing.T) {
	for _, tc := range []struct {
		name    string
		mutate  func(g *GeneratedKubeconfig)
		wantErr string
	}{
		{name: "no key", mutate: func(g *GeneratedKubeconfig) { g.Key = "" }, wantErr: "exactly one context"},
		{name: "no name", mutate: func(g *GeneratedKubeconfig) { g.Name = "" }, wantErr: "exactly one context"},
		{name: "no cluster ID", mutate: func(g *GeneratedKubeconfig) { g.ClusterID = "" }, wantErr: "exactly one context"},
		{name: "no kubeconfig", mutate: func(g *GeneratedKubeconfig) { g.Config = nil }, wantErr: "exactly one context"},
		{
			name:    "two contexts",
			mutate:  func(g *GeneratedKubeconfig) { g.Config.Contexts["other"] = &api.Context{Cluster: "member"} },
			wantErr: "exactly one context",
		},
		{
			name:    "a nil context",
			mutate:  func(g *GeneratedKubeconfig) { g.Config.Contexts["member"] = nil },
			wantErr: "context is nil",
		},
		{
			name:    "a context without its cluster",
			mutate:  func(g *GeneratedKubeconfig) { g.Config.Clusters = nil },
			wantErr: "no server URL",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			generated := GeneratedKubeconfig{
				Key: "default", Name: "member", ClusterID: "fleet/member",
				Config: ConfigForCluster("member", &api.Cluster{Server: "https://member.example.com"}, ""),
			}
			tc.mutate(&generated)

			_, err := generatedOIDCConfig(generated, testOIDCOptions())
			require.ErrorContains(t, err, tc.wantErr)
		})
	}
}

// A connection whose Cluster Inventory metadata clients could not read is not published.
func TestLoadGeneratedRejectsInvalidInventoryMetadata(t *testing.T) {
	runner, _ := sampleFleetRunner(t, nil, &sampleFleetSource{})

	_, err := runner.loadGenerated(
		"root",
		types.NamespacedName{Namespace: "default", Name: "member-a"},
		GeneratedKubeconfig{
			Key: "default", Name: "member", ClusterID: "fleet/member",
			Config:   ConfigForCluster("member", &api.Cluster{Server: "https://member.example.com"}, ""),
			Metadata: map[string]json.RawMessage{"clusterInventory": json.RawMessage(`"not an object"`)},
		},
	)
	require.ErrorContains(t, err, "invalid Inventory metadata")
}
