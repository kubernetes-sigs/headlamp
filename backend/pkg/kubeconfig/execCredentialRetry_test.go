package kubeconfig_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

type closeTrackingBody struct {
	io.Reader
	closed bool
}

func (b *closeTrackingBody) Close() error {
	b.closed = true

	return nil
}

type refreshingExecRoundTripper struct {
	calls                int
	authorizationHeaders []string
	unauthorizedBody     *closeTrackingBody
}

func (rt *refreshingExecRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	rt.calls++
	rt.authorizationHeaders = append(rt.authorizationHeaders, req.Header.Get("Authorization"))

	if rt.calls == 1 {
		// Match client-go's exec transport: it injects the cached credential into
		// the request, then refreshes its cache after the API returns 401.
		req.Header.Set("Authorization", "Bearer stale-token")

		rt.unauthorizedBody = &closeTrackingBody{Reader: strings.NewReader("unauthorized")}

		return &http.Response{
			StatusCode: http.StatusUnauthorized,
			Header:     make(http.Header),
			Body:       rt.unauthorizedBody,
			Request:    req,
		}, nil
	}

	req.Header.Set("Authorization", "Bearer refreshed-token")

	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       http.NoBody,
		Request:    req,
	}, nil
}

func TestExecCredentialRetryRoundTripperRetriesSafeRequestAfterUnauthorized(t *testing.T) {
	base := &refreshingExecRoundTripper{}
	rt := &kubeconfig.ExecCredentialRetryRoundTripper{Base: base}
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "https://cluster.example/version", nil)

	resp, err := rt.RoundTrip(req)
	require.NoError(t, err)
	require.NotNil(t, resp)

	defer func() { _ = resp.Body.Close() }()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, 2, base.calls)
	assert.Equal(t, []string{"", ""}, base.authorizationHeaders)
	assert.True(t, base.unauthorizedBody.closed)
	assert.Empty(t, req.Header.Get("Authorization"))
}

func TestExecCredentialRetryRoundTripperDoesNotRetryUnsafeRequests(t *testing.T) {
	tests := []struct {
		name      string
		method    string
		body      io.Reader
		authorize bool
	}{
		{name: "post", method: http.MethodPost},
		{name: "get with body", method: http.MethodGet, body: strings.NewReader("body")},
		{name: "caller authorization", method: http.MethodGet, authorize: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			base := &refreshingExecRoundTripper{}
			rt := &kubeconfig.ExecCredentialRetryRoundTripper{Base: base}

			req := httptest.NewRequestWithContext(context.Background(), tt.method, "https://cluster.example/api", tt.body)
			if tt.authorize {
				req.Header.Set("Authorization", "Bearer caller-token")
			}

			resp, err := rt.RoundTrip(req)
			require.NoError(t, err)
			require.NotNil(t, resp)

			defer func() { _ = resp.Body.Close() }()

			assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
			assert.Equal(t, 1, base.calls)
		})
	}
}

func TestExecCredentialPluginProcess(t *testing.T) {
	if os.Getenv("HEADLAMP_EXEC_CREDENTIAL_HELPER") != "true" {
		return
	}

	tokenFile := os.Getenv("HEADLAMP_EXEC_CREDENTIAL_TOKEN_FILE")

	token, err := os.ReadFile(tokenFile) //nolint:gosec // Test controls the temporary credential path.
	if err != nil {
		os.Exit(1)
	}

	err = json.NewEncoder(os.Stdout).Encode(map[string]interface{}{
		"apiVersion": "client.authentication.k8s.io/v1",
		"kind":       "ExecCredential",
		"status":     map[string]string{"token": strings.TrimSpace(string(token))},
	})
	if err != nil {
		os.Exit(1)
	}

	os.Exit(0)
}

func TestSetupProxyRetriesAfterExecCredentialRefresh(t *testing.T) {
	tokenFile := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("token-one"), 0o600))

	requests := 0

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		requests++

		if req.Header.Get("Authorization") == "Bearer token-one" {
			require.NoError(t, os.WriteFile(tokenFile, []byte("token-two"), 0o600))
			w.WriteHeader(http.StatusUnauthorized)

			return
		}

		assert.Equal(t, "Bearer token-two", req.Header.Get("Authorization"))
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ctx := &kubeconfig.Context{
		Name:        "exec-context",
		KubeContext: &api.Context{Cluster: "cluster", AuthInfo: "user"},
		Cluster:     &api.Cluster{Server: server.URL, InsecureSkipTLSVerify: true},
		AuthInfo: &api.AuthInfo{Exec: &api.ExecConfig{
			APIVersion:      "client.authentication.k8s.io/v1",
			Command:         os.Args[0],
			Args:            []string{"-test.run=TestExecCredentialPluginProcess"},
			InteractiveMode: api.NeverExecInteractiveMode,
			Env: []api.ExecEnvVar{
				{Name: "HEADLAMP_EXEC_CREDENTIAL_HELPER", Value: "true"},
				{Name: "HEADLAMP_EXEC_CREDENTIAL_TOKEN_FILE", Value: tokenFile},
			},
		}},
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/version", nil)
	require.NoError(t, ctx.ProxyRequest(recorder, request))

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, 2, requests)
}

func TestSetupProxyDoesNotRetryNonExecUnauthorized(t *testing.T) {
	requests := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests++

		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	ctx := &kubeconfig.Context{
		Name:        "token-context",
		KubeContext: &api.Context{Cluster: "cluster", AuthInfo: "user"},
		Cluster:     &api.Cluster{Server: server.URL},
		AuthInfo:    &api.AuthInfo{Token: "static-token"},
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/version", nil)
	require.NoError(t, ctx.ProxyRequest(recorder, request))

	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
	assert.Equal(t, 1, requests)
}
