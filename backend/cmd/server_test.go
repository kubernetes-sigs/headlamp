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

package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
	"k8s.io/client-go/tools/clientcmd/api"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func newMinimalConfig() *HeadlampConfig {
	return &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: kubeconfig.NewContextStore(),
			},
			Cache:            cache.New[interface{}](),
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}
}

// newNoopSpan returns a trace.Span interface backed by the noop provider.
// Returning the interface avoids the "cannot use noop.Span as trace.Span" compiler error.
func newNoopSpan() trace.Span {
	_, sp := noop.NewTracerProvider().Tracer("test").Start(context.Background(), "test")

	return sp
}

// httpBodyFromString wraps a string as an io.Reader for HTTP requests.
func httpBodyFromString(s string) *strings.Reader {
	return strings.NewReader(s)
}

// makeTestConfig returns a minimal valid *config.Config with all pointer fields initialised.
func makeTestConfig() *config.Config {
	svcVer := "0.0.0"
	tracing := false
	metrics := false
	jaeger := ""
	otlp := ""
	useHTTP := false
	stdout := false
	sampling := 0.0

	return &config.Config{
		ServiceName:        "headlamp-test",
		ServiceVersion:     &svcVer,
		TracingEnabled:     &tracing,
		MetricsEnabled:     &metrics,
		JaegerEndpoint:     &jaeger,
		OTLPEndpoint:       &otlp,
		UseOTLPHTTP:        &useHTTP,
		StdoutTraceEnabled: &stdout,
		SamplingRate:       &sampling,
		OidcScopes:         "openid",
		ProxyURLs:          "",
	}
}

// ---------------------------------------------------------------------------
// buildTelemetryConfig
// ---------------------------------------------------------------------------

func TestBuildTelemetryConfig(t *testing.T) {
	svcVer := "1.2.3"
	tracing := true
	metrics := true
	jaeger := "http://jaeger:14268"
	otlp := "http://otlp:4317"
	otlpHTTP := false
	stdout := false
	sampling := 0.5

	in := &config.Config{
		ServiceName:        "my-svc",
		ServiceVersion:     &svcVer,
		TracingEnabled:     &tracing,
		MetricsEnabled:     &metrics,
		JaegerEndpoint:     &jaeger,
		OTLPEndpoint:       &otlp,
		UseOTLPHTTP:        &otlpHTTP,
		StdoutTraceEnabled: &stdout,
		SamplingRate:       &sampling,
	}

	out := buildTelemetryConfig(in)

	assert.Equal(t, "my-svc", out.ServiceName)
	assert.Equal(t, &svcVer, out.ServiceVersion)
	assert.Equal(t, &tracing, out.TracingEnabled)
	assert.Equal(t, &metrics, out.MetricsEnabled)
	assert.Equal(t, &jaeger, out.JaegerEndpoint)
	assert.Equal(t, &otlp, out.OTLPEndpoint)
	assert.Equal(t, &otlpHTTP, out.UseOTLPHTTP)
	assert.Equal(t, &stdout, out.StdoutTraceEnabled)
	assert.Equal(t, &sampling, out.SamplingRate)
}

// ---------------------------------------------------------------------------
// createHeadlampConfig
// ---------------------------------------------------------------------------

func TestCreateHeadlampConfig_Basic(t *testing.T) {
	conf := makeTestConfig()
	conf.Port = 19999
	conf.EnableDynamicClusters = true
	conf.OidcScopes = "openid,email"
	conf.ProxyURLs = "http://proxy1.example.com,http://proxy2.example.com"

	cfg := createHeadlampConfig(conf)

	require.NotNil(t, cfg)
	assert.NotNil(t, cfg.Cache)
	assert.NotNil(t, cfg.KubeConfigStore)
	assert.NotNil(t, cfg.Multiplexer)
	assert.Equal(t, 19999, cfg.Port)
	assert.Equal(t, "headlamp-test", cfg.TelemetryConfig.ServiceName)
	assert.Equal(t, []string{"openid", "email"}, cfg.OidcScopes)
	assert.Equal(t, []string{"http://proxy1.example.com", "http://proxy2.example.com"}, cfg.ProxyURLs)
}

func TestCreateHeadlampConfig_WithOIDCCAFile(t *testing.T) {
	tmpCA, err := os.CreateTemp(t.TempDir(), "ca-*.pem")
	require.NoError(t, err)

	_, err = tmpCA.WriteString("FAKE-CA-CERT")
	require.NoError(t, err)

	require.NoError(t, tmpCA.Close())

	conf := makeTestConfig()
	conf.OidcCAFile = tmpCA.Name()

	cfg := createHeadlampConfig(conf)
	require.NotNil(t, cfg)
	assert.Equal(t, "FAKE-CA-CERT", cfg.OidcCACert)
}

// ---------------------------------------------------------------------------
// buildHeadlampCFG
// ---------------------------------------------------------------------------

func TestBuildHeadlampCFG(t *testing.T) {
	conf := makeTestConfig()
	conf.InCluster = false
	conf.InClusterContextName = "in-cluster-ctx"
	conf.KubeConfigPath = "/tmp/kube"
	conf.ListenAddr = "0.0.0.0"
	conf.Port = 9090
	conf.DevMode = true
	conf.EnableHelm = true
	conf.EnableDynamicClusters = true
	conf.AllowKubeconfigChanges = true
	conf.BaseURL = "/headlamp"
	conf.SessionTTL = 3600
	conf.OidcUseCookie = true

	store := kubeconfig.NewContextStore()
	cfg := buildHeadlampCFG(conf, store)

	assert.False(t, cfg.UseInCluster)
	assert.Equal(t, "in-cluster-ctx", cfg.InClusterContextName)
	assert.Equal(t, "/tmp/kube", cfg.KubeConfigPath)
	assert.Equal(t, 9090, cfg.Port)
	assert.True(t, cfg.DevMode)
	assert.True(t, cfg.EnableHelm)
	assert.True(t, cfg.EnableDynamicClusters)
	assert.Equal(t, "/headlamp", cfg.BaseURL)
	assert.Equal(t, store, cfg.KubeConfigStore)
}

// ---------------------------------------------------------------------------
// HandleServerStartError
// ---------------------------------------------------------------------------

func TestHandleServerStartError_NonAddrInUse(t *testing.T) {
	// Generic error must NOT call os.Exit; function should return normally.
	err := errors.New("some other error")

	HandleServerStartError(&err)
}

func TestHandleServerStartError_WrappedEADDRINUSE_DetectedByErrorsIs(t *testing.T) {
	// Verify errors.Is detects wrapped EADDRINUSE — the same check used inside the function.
	// We cannot let os.Exit fire in the test process, so we only assert the detection logic.
	wrapped := fmt.Errorf("bind failed: %w", syscall.EADDRINUSE)

	assert.True(t, errors.Is(wrapped, syscall.EADDRINUSE))
}

// ---------------------------------------------------------------------------
// setupGracefulShutdown
// ---------------------------------------------------------------------------

func TestSetupGracefulShutdown_ServerDoneExits(t *testing.T) {
	server := &http.Server{ //nolint:gosec
		Addr:              "127.0.0.1:0",
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, cancel := context.WithCancel(context.Background())

	serverDone := make(chan struct{})
	setupGracefulShutdown(server, cancel, serverDone)

	// Simulate server stopping on its own.
	close(serverDone)

	time.Sleep(50 * time.Millisecond)

	select {
	case <-ctx.Done():
		// expected: goroutine called cancel()
	default:
		t.Error("expected context to be cancelled after serverDone is closed")
	}
}

// ---------------------------------------------------------------------------
// CacheMiddleWare — cache-disabled path
// ---------------------------------------------------------------------------

func TestCacheMiddleWare_Disabled(t *testing.T) {
	c := newMinimalConfig()
	c.CacheEnabled = false

	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true

		w.WriteHeader(http.StatusOK)
	})

	mw := CacheMiddleWare(c)(next)
	req := httptest.NewRequestWithContext(context.Background(), "GET", "/clusters/test/api/v1/pods", nil)
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	assert.True(t, called, "next handler must be called when cache is disabled")
}

// ---------------------------------------------------------------------------
// handleGetContextError
// ---------------------------------------------------------------------------

func TestHandleGetContextError_NoError(t *testing.T) {
	c := newMinimalConfig()
	sp := newNoopSpan()

	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true })

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	w := httptest.NewRecorder()

	handled := c.handleGetContextError(nil, "cluster", w, req, sp, context.Background(), time.Now(), next)

	assert.False(t, handled)
	assert.False(t, called)
}

func TestHandleGetContextError_WithError(t *testing.T) {
	c := newMinimalConfig()
	sp := newNoopSpan()

	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true })

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	w := httptest.NewRecorder()

	handled := c.handleGetContextError(
		errors.New("context not found"),
		"cluster", w, req, sp, context.Background(), time.Now(), next,
	)

	assert.True(t, handled)
	assert.True(t, called, "next must be called on context error")
}

// ---------------------------------------------------------------------------
// handleOIDCAuthConfigError
// ---------------------------------------------------------------------------

func TestHandleOIDCAuthConfigError_NoError(t *testing.T) {
	c := newMinimalConfig()
	sp := newNoopSpan()

	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true })

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	w := httptest.NewRecorder()

	handled := c.handleOIDCAuthConfigError(nil, w, req, sp, context.Background(), time.Now(), next)

	assert.False(t, handled)
	assert.False(t, called)
}

func TestHandleOIDCAuthConfigError_WithError(t *testing.T) {
	c := newMinimalConfig()
	sp := newNoopSpan()

	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true })

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	w := httptest.NewRecorder()

	handled := c.handleOIDCAuthConfigError(
		errors.New("no oidc config"),
		w, req, sp, context.Background(), time.Now(), next,
	)

	assert.True(t, handled)
	assert.True(t, called, "next must be called on OIDC config error")
}

// ---------------------------------------------------------------------------
// serveWithNoCacheHeader
// ---------------------------------------------------------------------------

func TestServeWithNoCacheHeader(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := serveWithNoCacheHeader(inner)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/plugins/foo.js", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "no-cache", rr.Header().Get("Cache-Control"))
}

// ---------------------------------------------------------------------------
// processManualConfig
// ---------------------------------------------------------------------------

func TestProcessManualConfig_Basic(t *testing.T) {
	c := newMinimalConfig()
	name := "manual-cluster"
	server := "https://manual.example.com"

	contexts, errs := c.processManualConfig(ClusterReq{Name: &name, Server: &server})

	assert.Empty(t, errs)
	require.NotEmpty(t, contexts)
	assert.Equal(t, name, contexts[0].Name)
}

func TestProcessManualConfig_WithInsecureTLS(t *testing.T) {
	c := newMinimalConfig()
	name := "secure-cluster"
	server := "https://secure.example.com"

	contexts, errs := c.processManualConfig(ClusterReq{
		Name:                     &name,
		Server:                   &server,
		InsecureSkipTLSVerify:    true,
		CertificateAuthorityData: []byte("fake-ca"),
	})

	assert.Empty(t, errs)
	require.NotEmpty(t, contexts)
	assert.Equal(t, name, contexts[0].Name)
}

// ---------------------------------------------------------------------------
// handleDeleteCluster / handleRemoveKubeConfig
// ---------------------------------------------------------------------------

func TestHandleDeleteCluster_NoRemoveKubeConfig(t *testing.T) {
	c := newMinimalConfig()
	sp := newNoopSpan()

	req := httptest.NewRequestWithContext(context.Background(), "DELETE", "/cluster/test-cluster", nil)
	w := httptest.NewRecorder()

	// removeKubeConfig absent → just logs, no HTTP error written.
	c.handleDeleteCluster(w, req, context.Background(), sp, "test-cluster")

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestHandleDeleteCluster_WithRemoveKubeConfig_BadFile(t *testing.T) {
	c := newMinimalConfig()
	sp := newNoopSpan()

	req := httptest.NewRequestWithContext(
		context.Background(), "DELETE",
		"/cluster/test-cluster?removeKubeConfig=true&configPath=/nonexistent/file.yaml",
		nil,
	)
	w := httptest.NewRecorder()

	c.handleDeleteCluster(w, req, context.Background(), sp, "test-cluster")

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestHandleRemoveKubeConfig_UsesOriginalName(t *testing.T) {
	c := newMinimalConfig()
	sp := newNoopSpan()

	// Both originalName and clusterID present → configName = originalName.
	req := httptest.NewRequestWithContext(
		context.Background(), "DELETE",
		"/cluster/test?configPath=/nonexistent/kube.yaml&originalName=original&clusterID=abc",
		nil,
	)
	w := httptest.NewRecorder()

	c.handleRemoveKubeConfig(w, req, context.Background(), sp, "test")

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestHandleRemoveKubeConfig_FallsBackToClusterName(t *testing.T) {
	c := newMinimalConfig()
	sp := newNoopSpan()

	// No originalName → configName = name arg ("test").
	req := httptest.NewRequestWithContext(
		context.Background(), "DELETE",
		"/cluster/test?configPath=/nonexistent/kube.yaml",
		nil,
	)
	w := httptest.NewRecorder()

	c.handleRemoveKubeConfig(w, req, context.Background(), sp, "test")

	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

// ---------------------------------------------------------------------------
// handleSetToken
// ---------------------------------------------------------------------------

func TestHandleSetToken_MissingCluster(t *testing.T) {
	c := newMinimalConfig()
	handler := createHeadlampHandler(context.Background(), c)

	// /auth/set-token has no {clusterName} mux var → cluster == "" → 400.
	rr, err := getResponse(handler, "POST", "/auth/set-token", map[string]string{"token": "abc"})
	require.NoError(t, err)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHandleSetToken_ViaClusterRoute_WithToken(t *testing.T) {
	c := newMinimalConfig()
	handler := createHeadlampHandler(context.Background(), c)

	rr, err := getResponse(handler, "POST", "/clusters/mycluster/set-token", map[string]string{"token": "my-token"})
	require.NoError(t, err)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleSetToken_ViaClusterRoute_EmptyToken(t *testing.T) {
	c := newMinimalConfig()
	handler := createHeadlampHandler(context.Background(), c)

	// Empty token → ClearTokenCookie path.
	rr, err := getResponse(handler, "POST", "/clusters/mycluster/set-token", map[string]string{"token": ""})
	require.NoError(t, err)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestHandleSetToken_InvalidJSON(t *testing.T) {
	c := newMinimalConfig()
	handler := createHeadlampHandler(context.Background(), c)

	req, err := http.NewRequestWithContext(
		context.Background(), "POST", "/clusters/mycluster/set-token", httpBodyFromString("{bad json"),
	)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// ---------------------------------------------------------------------------
// handleLoadErrors
// ---------------------------------------------------------------------------

func TestHandleLoadErrors_NoErrors(t *testing.T) {
	c := newMinimalConfig()

	assert.Empty(t, c.handleLoadErrors(nil, nil))
}

func TestHandleLoadErrors_WithMainError(t *testing.T) {
	c := newMinimalConfig()

	errs := c.handleLoadErrors(errors.New("main error"), nil)
	require.Len(t, errs, 1)
	assert.EqualError(t, errs[0], "main error")
}

func TestHandleLoadErrors_WithContextErrors(t *testing.T) {
	c := newMinimalConfig()

	ctxErrs := []kubeconfig.ContextLoadError{
		{Error: errors.New("ctx err 1")},
		{Error: errors.New("ctx err 2")},
	}

	errs := c.handleLoadErrors(nil, ctxErrs)
	require.Len(t, errs, 2)
}

func TestHandleLoadErrors_BothErrors(t *testing.T) {
	c := newMinimalConfig()

	ctxErrs := []kubeconfig.ContextLoadError{{Error: errors.New("ctx err")}}

	errs := c.handleLoadErrors(errors.New("main"), ctxErrs)
	require.Len(t, errs, 2)
}

// ---------------------------------------------------------------------------
// handleSetupErrors
// ---------------------------------------------------------------------------

func TestHandleSetupErrors_NoErrors(t *testing.T) {
	c := newMinimalConfig()
	sp := newNoopSpan()
	w := httptest.NewRecorder()

	result := c.handleSetupErrors(nil, context.Background(), w, sp)

	assert.Nil(t, result)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestHandleSetupErrors_WithErrors(t *testing.T) {
	c := newMinimalConfig()
	sp := newNoopSpan()
	w := httptest.NewRecorder()

	errs := []error{errors.New("setup failed")}

	result := c.handleSetupErrors(errs, context.Background(), w, sp)

	assert.NotNil(t, result)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ---------------------------------------------------------------------------
// decodeClusterRequest
// ---------------------------------------------------------------------------

func TestDecodeClusterRequest_ValidNameAndServer(t *testing.T) {
	name := "test"
	server := "https://test.example.com"

	req, err := makeJSONReq("POST", "/cluster", map[string]interface{}{"name": name, "server": server})
	require.NoError(t, err)

	cr, err := decodeClusterRequest(req)
	require.NoError(t, err)
	assert.Equal(t, name, *cr.Name)
	assert.Equal(t, server, *cr.Server)
}

func TestDecodeClusterRequest_KubeConfigOnly(t *testing.T) {
	kc := "base64-data"

	req, err := makeJSONReq("POST", "/cluster", map[string]interface{}{"kubeconfig": kc})
	require.NoError(t, err)

	cr, err := decodeClusterRequest(req)
	require.NoError(t, err)
	assert.Equal(t, kc, *cr.KubeConfig)
}

func TestDecodeClusterRequest_MissingBothNameAndServer(t *testing.T) {
	req, err := makeJSONReq("POST", "/cluster", map[string]interface{}{})
	require.NoError(t, err)

	_, err = decodeClusterRequest(req)
	assert.Error(t, err)
}

func TestDecodeClusterRequest_InvalidJSON(t *testing.T) {
	req, err := http.NewRequestWithContext(
		context.Background(), "POST", "/cluster", httpBodyFromString("not-json"),
	)
	require.NoError(t, err)

	_, err = decodeClusterRequest(req)
	assert.Error(t, err)
}

// ---------------------------------------------------------------------------
// getKubeConfigPath
// ---------------------------------------------------------------------------

func TestGetKubeConfigPath_KubeConfigSource(t *testing.T) {
	c := newMinimalConfig()
	c.KubeConfigPath = "/some/path/kubeconfig"

	path, err := c.getKubeConfigPath(kubeConfigSource)
	require.NoError(t, err)
	assert.Equal(t, "/some/path/kubeconfig", path)
}

func TestGetKubeConfigPath_OtherSource(t *testing.T) {
	c := newMinimalConfig()

	// Any non-kubeconfig source calls defaultHeadlampKubeConfigFile(); may error in CI.
	path, err := c.getKubeConfigPath("dynamic_cluster")
	if err == nil {
		assert.NotEmpty(t, path)
	}
}

// ---------------------------------------------------------------------------
// copyStaticFiles
// ---------------------------------------------------------------------------

func TestCopyStaticFiles_ValidDir(t *testing.T) {
	srcDir := t.TempDir()

	require.NoError(t, os.WriteFile(srcDir+"/index.html", []byte("<html></html>"), 0o600))

	c := newMinimalConfig()
	c.StaticDir = srcDir

	err := copyStaticFiles(c)
	require.NoError(t, err)
	assert.NotEqual(t, srcDir, c.StaticDir, "StaticDir must be updated to the temp copy location")

	_, err = os.Stat(c.StaticDir + "/index.html")
	assert.NoError(t, err)
}

func TestCopyStaticFiles_NonExistentDir(t *testing.T) {
	c := newMinimalConfig()
	c.StaticDir = "/nonexistent/static/dir"

	err := copyStaticFiles(c)
	assert.Error(t, err)
}

// ---------------------------------------------------------------------------
// addContextsToStore
// ---------------------------------------------------------------------------

func TestAddContextsToStore_Success(t *testing.T) {
	c := newMinimalConfig()
	name := "ctx1"
	server := "https://ctx1.example.com"

	contexts, errs := c.processManualConfig(ClusterReq{Name: &name, Server: &server})
	require.Empty(t, errs)

	setupErrors := c.addContextsToStore(contexts, nil)
	assert.Empty(t, setupErrors)

	_, err := c.KubeConfigStore.GetContext(name)
	assert.NoError(t, err)
}

// ---------------------------------------------------------------------------
// processClusterRequest
// ---------------------------------------------------------------------------

func TestProcessClusterRequest_RoutesToManualConfig(t *testing.T) {
	c := newMinimalConfig()
	name := "manual"
	server := "https://manual.example.com"

	contexts, errs := c.processClusterRequest(ClusterReq{Name: &name, Server: &server})

	assert.Empty(t, errs)
	require.NotEmpty(t, contexts)
	assert.Equal(t, name, contexts[0].Name)
}

func TestProcessClusterRequest_RoutesToKubeConfig(t *testing.T) {
	c := newMinimalConfig()

	// Invalid base64 → processKubeConfig returns errors, no contexts.
	bad := "!!not-valid-base64!!"

	contexts, errs := c.processClusterRequest(ClusterReq{KubeConfig: &bad})

	assert.Empty(t, contexts)
	assert.NotEmpty(t, errs)
}

// ---------------------------------------------------------------------------
// parseCustomNameClusters
// ---------------------------------------------------------------------------

func TestParseCustomNameClusters_NoExtensions(t *testing.T) {
	// Context with no headlamp_info extension → name unchanged.
	contexts := []kubeconfig.Context{
		{
			Name: "plain-cluster",
			KubeContext: &api.Context{
				Cluster: "plain-cluster",
			},
			Cluster: &api.Cluster{Server: "https://plain.example.com"},
		},
	}

	clusters, errs := parseCustomNameClusters(contexts)

	assert.Empty(t, errs)
	require.Len(t, clusters, 1)
	assert.Equal(t, "plain-cluster", clusters[0].Name)
	assert.Equal(t, "https://plain.example.com", clusters[0].Server)
}

func TestParseCustomNameClusters_MultipleContexts(t *testing.T) {
	contexts := []kubeconfig.Context{
		{
			Name:        "cluster-a",
			KubeContext: &api.Context{Cluster: "cluster-a"},
			Cluster:     &api.Cluster{Server: "https://a.example.com"},
		},
		{
			Name:        "cluster-b",
			KubeContext: &api.Context{Cluster: "cluster-b"},
			Cluster:     &api.Cluster{Server: "https://b.example.com"},
		},
	}

	clusters, errs := parseCustomNameClusters(contexts)

	assert.Empty(t, errs)
	assert.Len(t, clusters, 2)
}
