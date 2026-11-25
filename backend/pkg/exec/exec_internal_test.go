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

package exec

import (
	"context"
	"crypto/tls"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
	"k8s.io/client-go/transport"
	"k8s.io/client-go/util/connrotation"
)

func TestUpdateTransportConfigEdgeCases(t *testing.T) {
	a := &Authenticator{
		connTracker: connrotation.NewConnectionTracker(),
		dial:        &transport.DialHolder{},
	}

	t.Run("skips when token auth is already configured", func(t *testing.T) {
		cfg := &transport.Config{BearerToken: "tok"}
		require.NoError(t, a.UpdateTransportConfig(cfg))
		assert.Nil(t, cfg.WrapTransport)
	})

	t.Run("errors when GetCertHolder is already set", func(t *testing.T) {
		cfg := &transport.Config{
			TLS: transport.TLSConfig{
				GetCertHolder: &transport.GetCertHolder{
					GetCert: func() (*tls.Certificate, error) { return nil, nil },
				},
			},
		}
		err := a.UpdateTransportConfig(cfg)
		require.ErrorContains(t, err, "already set")
	})

	t.Run("errors when DialHolder has nil Dial", func(t *testing.T) {
		cfg := &transport.Config{DialHolder: &transport.DialHolder{}}
		err := a.UpdateTransportConfig(cfg)
		require.ErrorContains(t, err, "Dial function is nil")
	})

	t.Run("wraps custom DialHolder", func(t *testing.T) {
		cfg := &transport.Config{
			DialHolder: &transport.DialHolder{
				Dial: func(ctx context.Context, network, addr string) (net.Conn, error) {
					return nil, nil
				},
			},
		}
		require.NoError(t, a.UpdateTransportConfig(cfg))
		assert.NotNil(t, cfg.DialHolder)
	})
}

func TestRoundTripPreservesExistingAuthorization(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer preset", r.Header.Get("Authorization"))
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	rt := &roundTripper{
		a:    &Authenticator{},
		base: http.DefaultTransport,
	}

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, srv.URL, nil)
	req.Header.Set("Authorization", "Bearer preset")

	resp, err := rt.RoundTrip(req)
	require.NoError(t, err)
	assert.NoError(t, resp.Body.Close())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, http.DefaultTransport, rt.WrappedRoundTripper())
}

func TestGetAuthenticatorAndSysProcAttr(t *testing.T) {
	_ = GetSysProcAttr()

	_, err := GetAuthenticator(&api.ExecConfig{APIVersion: "invalid"}, nil)
	require.Error(t, err)

	auth, err := GetAuthenticator(&api.ExecConfig{
		APIVersion: "client.authentication.k8s.io/v1beta1",
		Command:    "echo",
	}, nil)
	require.NoError(t, err)
	assert.NotNil(t, auth)
}
