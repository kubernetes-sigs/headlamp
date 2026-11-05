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
	"encoding/pem"
	"math/big"
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
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
