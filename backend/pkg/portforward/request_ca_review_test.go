//nolint:testpackage // Exercises the authenticated handler with real rotating TLS authorities.
package portforward

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	authenticationv1 "k8s.io/api/authentication/v1"
	"k8s.io/client-go/tools/clientcmd/api"
)

func portForwardTestAuthority(t *testing.T) (tls.Certificate, []byte) {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)

	certificate := &x509.Certificate{
		SerialNumber: big.NewInt(1), DNSNames: []string{"ca-review.example"},
		IPAddresses: []net.IP{net.ParseIP("127.0.0.1")},
		NotBefore:   time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour),
		IsCA: true, BasicConstraintsValid: true,
		KeyUsage:    x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, certificate, certificate, key.Public(), key)
	require.NoError(t, err)

	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key},
		pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
}

//nolint:funlen // Verifies same-endpoint CA rotation, every session operation, and original-trust restoration.
func TestPortForwardCAReplacementPinsAuthority(t *testing.T) {
	first, firstCA := portForwardTestAuthority(t)
	second, secondCA := portForwardTestAuthority(t)

	var certificate atomic.Pointer[tls.Certificate]
	certificate.Store(&first)

	var calls atomic.Int32

	upstream := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, err := w.Write([]byte(`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
			`"status":{"userInfo":{"username":"alice","uid":"alice-id"}}}`))
		require.NoError(t, err)
	}))
	upstream.TLS = &tls.Config{
		MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{first},
		GetCertificate: func(*tls.ClientHelloInfo) (*tls.Certificate, error) { return certificate.Load(), nil },
	}
	upstream.StartTLS()
	t.Cleanup(upstream.Close)

	caFile := filepath.Join(t.TempDir(), "ca.pem")
	require.NoError(t, os.WriteFile(caFile, firstCA, 0o600))

	store := kubeconfig.NewContextStore()
	kContext := &kubeconfig.Context{
		Name: "shared", Source: kubeconfig.KubeConfig,
		Cluster: &api.Cluster{
			Server: upstream.URL, TLSServerName: "ca-review.example", CertificateAuthority: caFile,
		},
		KubeContext: &api.Context{Cluster: "shared", AuthInfo: "shared"}, AuthInfo: &api.AuthInfo{},
	}
	require.NoError(t, store.AddContext(kContext))
	pinned := kContext.Cluster.DeepCopy()
	pinned.CertificateAuthorityData = firstCA
	pinned.CertificateAuthority = ""
	key := portForwardOwnerKey("shared", pinned, authenticationv1.UserInfo{Username: "alice", UID: "alice-id"})
	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })

	closed := make(chan struct{})
	portforwardstore(sessions, portForward{
		ID: "victim", Cluster: "shared", cacheKey: key, Pod: "private-pod", Status: RUNNING, closeChan: closed,
	})

	router := mux.NewRouter()
	router.PathPrefix("/clusters/{clusterName}/portforward").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		RequestHandler(store, sessions, false, false, "shared", w, r)
	})
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)

	status, body := portForwardTestRequest(t, server.URL, http.MethodGet,
		"/clusters/shared/portforward/list", "alice", "")
	require.Equal(t, http.StatusOK, status)
	require.Contains(t, body, "private-pod")
	require.Empty(t, kContext.Cluster.CertificateAuthorityData, "the stored context must not be mutated")

	require.NoError(t, os.WriteFile(caFile, secondCA, 0o600))
	certificate.Store(&second)
	upstream.CloseClientConnections()

	before := calls.Load()
	status, body = portForwardTestRequest(t, server.URL, http.MethodGet,
		"/clusters/shared/portforward/list", "forged", "")
	require.Equal(t, http.StatusOK, status, "the replacement authority is trusted by the new CA")
	require.JSONEq(t, "[]", body)
	require.Greater(t, calls.Load(), before, "isolation must not depend on rejecting the replacement TLS handshake")

	for _, test := range []struct{ method, path, body string }{
		{http.MethodGet, "/clusters/shared/portforward?id=victim", ""},
		{http.MethodDelete, "/clusters/shared/portforward", `{"id":"victim","stopOrDelete":true}`},
		{http.MethodDelete, "/clusters/shared/portforward", `{"id":"victim","stopOrDelete":false}`},
	} {
		status, _ = portForwardTestRequest(t, server.URL, test.method, test.path, "forged", test.body)
		require.Equal(t, http.StatusNotFound, status)
	}

	select {
	case <-closed:
		t.Fatal("replacement CA authority stopped the original session")
	default:
	}

	require.NoError(t, os.WriteFile(caFile, firstCA, 0o600))
	certificate.Store(&first)
	upstream.CloseClientConnections()

	status, body = portForwardTestRequest(t, server.URL, http.MethodGet,
		"/clusters/shared/portforward/list", "alice-refreshed", "")
	require.Equal(t, http.StatusOK, status)
	require.Contains(t, body, "private-pod")
}

func TestPortForwardCreationPinsCABytes(t *testing.T) {
	first, firstCA := portForwardTestAuthority(t)
	_, secondCA := portForwardTestAuthority(t)
	caFile := filepath.Join(t.TempDir(), "ca.pem")
	require.NoError(t, os.WriteFile(caFile, firstCA, 0o600))

	var permissionCalls atomic.Int32

	upstream := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.URL.Path == "/apis/authentication.k8s.io/v1/selfsubjectreviews" {
			require.NoError(t, os.WriteFile(caFile, secondCA, 0o600))

			_, err := w.Write([]byte(`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
				`"status":{"userInfo":{"username":"alice","uid":"alice-id"}}}`))
			require.NoError(t, err)

			return
		}

		permissionCalls.Add(1)

		_, err := w.Write([]byte(`{"apiVersion":"authorization.k8s.io/v1","kind":"SelfSubjectAccessReview",` +
			`"status":{"allowed":false,"reason":"creation reached the original authority"}}`))
		require.NoError(t, err)
	}))
	upstream.TLS = &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{first}}
	upstream.StartTLS()
	t.Cleanup(upstream.Close)

	store := kubeconfig.NewContextStore()
	kContext := &kubeconfig.Context{
		Name: "shared", Source: kubeconfig.KubeConfig,
		Cluster: &api.Cluster{
			Server: upstream.URL, TLSServerName: "ca-review.example", CertificateAuthority: caFile,
		},
		KubeContext: &api.Context{Cluster: "shared", AuthInfo: "shared"}, AuthInfo: &api.AuthInfo{},
	}
	require.NoError(t, store.AddContext(kContext))

	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })
	request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/portforward",
		strings.NewReader(`{"id":"new","pod":"p","namespace":"default","port":"8080","targetPort":"80"}`))
	request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
	request.Header.Set("Authorization", "Bearer alice")

	response := httptest.NewRecorder()
	RequestHandler(store, sessions, false, false, "shared", response, request)
	require.Equal(t, http.StatusInternalServerError, response.Code)
	require.Contains(t, response.Body.String(), "creation reached the original authority")
	require.EqualValues(t, 1, permissionCalls.Load())
	require.Empty(t, kContext.Cluster.CertificateAuthorityData)
}

func TestPortForwardCAFileFailureAndEmbeddedPrecedence(t *testing.T) {
	upstream := newPortForwardTestAPI(t)
	caData := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: upstream.server.Certificate().Raw})

	for _, test := range []struct {
		name     string
		embedded bool
		empty    bool
	}{
		{name: "missing-file"},
		{name: "empty-file", empty: true},
		{name: "embedded-overrides-file", embedded: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			cluster := &api.Cluster{
				Server: upstream.server.URL, CertificateAuthority: filepath.Join(t.TempDir(), "missing.pem"),
			}
			if test.empty {
				require.NoError(t, os.WriteFile(cluster.CertificateAuthority, nil, 0o600))
			}

			if test.embedded {
				cluster.CertificateAuthorityData = caData
			}

			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(&kubeconfig.Context{
				Name: "shared", Source: kubeconfig.KubeConfig, Cluster: cluster,
				KubeContext: &api.Context{Cluster: "shared", AuthInfo: "shared"},
				AuthInfo:    &api.AuthInfo{Token: "alice"},
			}))

			sessions := cache.New[interface{}]()

			t.Cleanup(func() { _ = sessions.Close() })
			request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/portforward/list", nil)
			request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
			response := httptest.NewRecorder()
			before := upstream.calls.Load()

			RequestHandler(store, sessions, false, false, "shared", response, request)

			if test.embedded {
				require.Equal(t, http.StatusOK, response.Code)
				require.Greater(t, upstream.calls.Load(), before)
			} else {
				require.Equal(t, http.StatusServiceUnavailable, response.Code)
				require.Equal(t, before, upstream.calls.Load())
			}
		})
	}
}

//nolint:funlen // Covers fresh/cached CA rejection and embedded-trust positives without file access.
func TestPortForwardRequestCAFilesRequireEmbeddedData(t *testing.T) {
	upstream := newPortForwardTestAPI(t)
	caData := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: upstream.server.Certificate().Raw})
	caFile := filepath.Join(t.TempDir(), "backend-ca.pem")
	require.NoError(t, os.WriteFile(caFile, caData, 0o600))

	for _, test := range []struct {
		name     string
		cached   bool
		token    string
		embedded bool
		status   int
	}{
		{name: "fresh-embedded-credentials", status: http.StatusBadRequest},
		{name: "fresh-request-token", token: "alice", status: http.StatusBadRequest},
		{name: "cached-request-token", cached: true, token: "alice", status: http.StatusBadRequest},
		{name: "cached-missing-token", cached: true, status: http.StatusUnauthorized},
		{name: "fresh-embedded-ca", embedded: true, status: http.StatusOK},
		{name: "cached-embedded-ca", cached: true, token: "alice", embedded: true, status: http.StatusOK},
	} {
		t.Run(test.name, func(t *testing.T) {
			cluster := &api.Cluster{Server: upstream.server.URL, CertificateAuthority: caFile}
			if test.embedded {
				cluster.CertificateAuthorityData = caData
				cluster.CertificateAuthority = filepath.Join(t.TempDir(), "unreadable-ca.pem")
			}

			kContext := &kubeconfig.Context{
				Name: "shared", Internal: test.cached, Cluster: cluster,
				KubeContext: &api.Context{Cluster: "shared", AuthInfo: "shared"}, AuthInfo: &api.AuthInfo{Token: "alice"},
			}
			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(kContext))

			sessions := cache.New[interface{}]()

			t.Cleanup(func() { _ = sessions.Close() })
			request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/portforward/list", nil)

			request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
			if test.token != "" {
				request.Header.Set("Authorization", "Bearer "+test.token)
			}

			response := httptest.NewRecorder()
			before := upstream.calls.Load()

			if test.cached {
				RequestHandler(store, sessions, false, false, "shared", response, request)
			} else {
				RequestHandlerWithContext(kContext, sessions, false, false, "shared", response, request)
			}

			require.Equal(t, test.status, response.Code)

			if test.status == http.StatusOK {
				require.Greater(t, upstream.calls.Load(), before)
				require.JSONEq(t, "[]", response.Body.String())
			} else {
				require.Equal(t, before, upstream.calls.Load())
			}
		})
	}
}
