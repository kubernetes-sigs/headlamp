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

package kubeconfig //nolint:testpackage // tests inspect the unexported proxy transport.

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

// minimal valid self-signed CA certificate so transport creation succeeds.
const testCACert = `-----BEGIN CERTIFICATE-----
MIIC/jCCAeagAwIBAgIBADANBgkqhkiG9w0BAQsFADAVMRMwEQYDVQQDEwprdWJl
cm5ldGVzMB4XDTIyMDgyNjExMDQ1M1oXDTMyMDgyMzExMDQ1M1owFTETMBEGA1UE
AxMKa3ViZXJuZXRlczCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANy7
/dDC1WL7MsRXevgkTAy3pVG1UKkUPywxq/DLpOvdsBihB6hVcumcYQ93aLKlDsIs
GD4ABdPS8pAO38LotAYeCx20p1OzoKaS/VJzfRJAeTI+BcwsF8vSUWaM+yfxI0OR
gjQ49TtyJiaDrKksnwxGv4+E7iaaeEO0nySMDrzN7TobEroZNlts6GL7kiL0tLnY
J+6smHyaHhzY8ZGBY0WVQzs4CE2rtCY9y5x7awmICQa6jpWTUPk3jkDLqOwlD2Fc
psdyr8kVwQHSQEgFH6c80vzw7/QIECtdX6VQFq5o639iosxPquJWvm0ecvLyt/5p
q5vi731Y8DoEC21mKcsCAwEAAaNZMFcwDgYDVR0PAQH/BAQDAgKkMA8GA1UdEwEB
/wQFMAMBAf8wHQYDVR0OBBYEFI4QdSaRDUhv/0Z94g5yFiUuiLdpMBUGA1UdEQQO
MAyCCmt1YmVybmV0ZXMwDQYJKoZIhvcNAQELBQADggEBACzVYJAS45PPNHURh2JY
JX1rraLtcSo5n4mCW/hxNXtzB2R3ZHOSHg6avGrMxV8fZBvkAtBEiF33boE8sg5a
8aXtEN4yo9YCaYsfW+kM6VCEGmUgynmwiyma0sInTJVuGvUl5nqXcPrIuoNMUkML
t++rLBoCpclk7OUI04uvojzqshlCBb1DR9tpOK4++4PgOj+z9vt7x4w8LbXoBkoz
38BrTJ2CsjmM1KfjeyiwgGVacxOXItcmzk74iC6tJ7jVmLVcZpG9dIopY9Y0ZND4
d3f9f8gBZBsip4kx12aq2Ryw1X4eNhV6unNh+GTsa6QCJRtfOE+T867vdyOn6Lol
ad8=
-----END CERTIFICATE-----
`

func TestSetupProxyTransport(t *testing.T) { //nolint:funlen // test scaffolding.
	t.Run("oidc auth provider gets a transport with TLS settings", func(t *testing.T) {
		caFile := filepath.Join(t.TempDir(), "ca.crt")
		require.NoError(t, os.WriteFile(caFile, []byte(testCACert), 0o600))

		ctx := &Context{
			Name: "oidc-context",
			KubeContext: &api.Context{
				Cluster:  "oidc-cluster",
				AuthInfo: "oidc-user",
			},
			Cluster: &api.Cluster{
				Server:               "https://127.0.0.1:6443",
				CertificateAuthority: caFile,
			},
			AuthInfo: &api.AuthInfo{
				AuthProvider: &api.AuthProviderConfig{
					Name: "oidc",
					Config: map[string]string{
						"client-id":      "test-client",
						"idp-issuer-url": "https://idp.example.com",
					},
				},
			},
		}

		err := ctx.SetupProxy()
		require.NoError(t, err)
		require.NotNil(t, ctx.proxy)

		// Previously the "oidc" auth provider made transport creation fail
		// ("no Auth Provider found for name \"oidc\"") and the proxy silently
		// fell back to the default transport without the cluster CA.
		assert.NotNil(t, ctx.proxy.Transport,
			"proxy should get a transport with the kubeconfig's TLS settings")
	})

	t.Run("valid config gets a transport", func(t *testing.T) {
		caFile := filepath.Join(t.TempDir(), "ca.crt")
		require.NoError(t, os.WriteFile(caFile, []byte(testCACert), 0o600))

		ctx := &Context{
			Name: "plain-context",
			KubeContext: &api.Context{
				Cluster:  "plain-cluster",
				AuthInfo: "plain-user",
			},
			Cluster: &api.Cluster{
				Server:               "https://127.0.0.1:6443",
				CertificateAuthority: caFile,
			},
			AuthInfo: &api.AuthInfo{
				Token: "test-token",
			},
		}

		err := ctx.SetupProxy()
		require.NoError(t, err)
		require.NotNil(t, ctx.proxy)
		assert.NotNil(t, ctx.proxy.Transport)
	})

	// RESTConfig() error branch: cert files referenced by the kubeconfig don't
	// exist, so RESTConfig() fails before a transport is ever built.
	t.Run("RESTConfig failure still sets up a proxy with default transport", func(t *testing.T) {
		ctx := &Context{
			Name: "broken-restconfig-context",
			KubeContext: &api.Context{
				Cluster:  "broken-cluster",
				AuthInfo: "broken-user",
			},
			Cluster: &api.Cluster{
				Server:               "https://127.0.0.1:6443",
				CertificateAuthority: "/nonexistent/ca.crt",
			},
			AuthInfo: &api.AuthInfo{
				ClientCertificate: "/nonexistent/client.crt",
				ClientKey:         "/nonexistent/client.key",
			},
		}

		// The error is logged (no longer silent) but the proxy still comes up
		// with the default transport so existing setups keep working.
		err := ctx.SetupProxy()
		require.NoError(t, err)
		require.NotNil(t, ctx.proxy)
		assert.Nil(t, ctx.proxy.Transport)
	})

	// makeTransportFor() error branch: RESTConfig() succeeds (the CA data is
	// stored as-is) but building the transport fails because the CA data isn't
	// valid PEM.
	t.Run("transport creation failure still sets up a proxy with default transport", func(t *testing.T) {
		ctx := &Context{
			Name: "broken-transport-context",
			KubeContext: &api.Context{
				Cluster:  "broken-cluster",
				AuthInfo: "broken-user",
			},
			Cluster: &api.Cluster{
				Server:                   "https://127.0.0.1:6443",
				CertificateAuthorityData: []byte("not-valid-pem-data"),
			},
			AuthInfo: &api.AuthInfo{
				Token: "test-token",
			},
		}

		err := ctx.SetupProxy()
		require.NoError(t, err)
		require.NotNil(t, ctx.proxy)
		assert.Nil(t, ctx.proxy.Transport)
	})
}
