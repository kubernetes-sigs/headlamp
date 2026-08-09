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

package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestNewOIDCTokenRefreshMiddleware(t *testing.T) {
	kubeConfigStore := kubeconfig.NewContextStore()
	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:  kubeConfigStore,
		Cache:            cache.New[interface{}](),
		TelemetryHandler: &telemetry.RequestHandler{},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)

	// Test case: non-cluster request is skipped
	req := httptest.NewRequestWithContext(context.Background(), "GET", "/non-cluster", nil)
	rec := httptest.NewRecorder()
	middleware.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	// Test case: cluster request without token is bypassed
	req = httptest.NewRequestWithContext(context.Background(), "GET", "/clusters/test-cluster", nil)
	rec = httptest.NewRecorder()
	middleware.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestNewOIDCTokenRefreshMiddleware_BaseURL(t *testing.T) {
	const cluster = "main"

	oldToken := makeTestToken(t, map[string]interface{}{"exp": float64(time.Now().Unix())})

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	kubeConfigStore := kubeconfig.NewContextStore()
	require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
		Name:     cluster,
		OidcConf: &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret", IdpIssuerURL: srv.URL},
	}))

	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:  kubeConfigStore,
		Cache:            &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "REFRESH_OLD"}},
		TelemetryHandler: &telemetry.RequestHandler{},
		BaseURL:          "/dev/internal/headlamp",
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
		"/dev/internal/headlamp/clusters/"+cluster+"/apis/metrics.k8s.io/v1beta1/pods", nil)
	req.Header.Set("Authorization", "Bearer "+oldToken)
	addBrowserToken(req, cluster, oldToken)

	middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)
	invalidRequest := req.Clone(req.Context())
	invalidRequest.Header.Set("Authorization", "")

	invalidResponse := httptest.NewRecorder()
	middleware.ServeHTTP(invalidResponse, invalidRequest)
	require.Equal(t, http.StatusUnauthorized, invalidResponse.Code)

	rec := httptest.NewRecorder()
	middleware.ServeHTTP(rec, req)

	resp := rec.Result()

	defer func() { _ = resp.Body.Close() }()

	cookieVal, ok := findAuthCookie(resp, cluster)
	require.True(t, ok, "expected the refreshed token cookie to be set")
	assert.Equal(t, "NEW", cookieVal)
}

func TestOIDCTokenRefreshMiddlewareContextAndInClusterBranches(t *testing.T) {
	kubeConfigStore := kubeconfig.NewContextStore()
	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:  kubeConfigStore,
		Cache:            cache.New[interface{}](),
		TelemetryHandler: &telemetry.RequestHandler{},
	}
	nextCalled := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		nextCalled++

		w.Header().Set("X-Next-Called", "true")
		w.WriteHeader(http.StatusOK)
	})
	serveAndAssert := func(mw http.Handler, path string, wantCalls int) {
		t.Helper()

		req := httptest.NewRequestWithContext(context.Background(), "GET", path, nil)
		req.Header.Set("Authorization", "Bearer tok")

		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "true", rec.Header().Get("X-Next-Called"))
		assert.Equal(t, wantCalls, nextCalled)
	}

	middleware := auth.NewOIDCTokenRefreshMiddleware(config)(handler)
	// Missing context in store triggers handleGetContextError and passes through.
	serveAndAssert(middleware, "/clusters/missing-cluster/pods", 1)

	// Context without OIDC config triggers handleOIDCAuthConfigError and passes through.
	require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
		Name:        "no-oidc",
		Cluster:     &api.Cluster{Server: "https://127.0.0.1:6443"},
		AuthInfo:    &api.AuthInfo{Token: "static"},
		KubeContext: &api.Context{Cluster: "no-oidc", AuthInfo: "no-oidc"},
	}))
	serveAndAssert(middleware, "/clusters/no-oidc/pods", 2)

	// In-cluster unsafe service account token skips OIDC refresh.
	require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
		Name:        "incluster",
		Source:      kubeconfig.InCluster,
		Cluster:     &api.Cluster{Server: "https://127.0.0.1:6443"},
		AuthInfo:    &api.AuthInfo{TokenFile: "sa-token-file"},
		KubeContext: &api.Context{Cluster: "incluster", AuthInfo: "incluster"},
	}))

	inClusterCfg := config
	inClusterCfg.UseInCluster = true
	inClusterCfg.UnsafeUseServiceAccountToken = true
	inClusterMW := auth.NewOIDCTokenRefreshMiddleware(inClusterCfg)(handler)
	serveAndAssert(inClusterMW, "/clusters/incluster/pods", 3)
}

func TestSetTokenFromCookie(t *testing.T) {
	clusterName := "test-cluster-oidc"
	testToken := "fake-token-for-testing"
	cookieName := "headlamp-auth-" + auth.SanitizeClusterName(clusterName) + ".0"

	req, err := http.NewRequestWithContext(context.Background(), "GET", "/api/v1/clusters/"+clusterName, nil)
	assert.NoError(t, err)

	req.AddCookie(&http.Cookie{
		Name:     cookieName,
		Value:    testToken,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	auth.SetTokenFromCookie(req, clusterName)

	got := req.Header.Get("Authorization")
	want := "Bearer " + testToken
	assert.Equal(t, want, got)
}

func addBrowserToken(req *http.Request, cluster, token string) {
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-auth-" + auth.SanitizeClusterName(cluster) + ".0",
		Value:    token,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
}

func setupConcurrentRefreshMiddleware(t *testing.T, cluster, token string) (http.Handler, func() int) {
	t.Helper()

	var (
		mu    sync.Mutex
		calls int
	)

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		calls++
		mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	fc := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, fc.Close()) })
	require.NoError(t, fc.Set(context.Background(), "oidc-token-"+token, "REFRESH_OLD"))

	kubeConfigStore := kubeconfig.NewContextStore()
	require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
		Name:     cluster,
		OidcConf: &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"},
	}))

	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:  kubeConfigStore,
		Cache:            fc,
		TelemetryHandler: &telemetry.RequestHandler{},
		OidcIdpIssuerURL: srv.URL,
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	callCount := func() int {
		mu.Lock()
		defer mu.Unlock()

		return calls
	}

	return auth.NewOIDCTokenRefreshMiddleware(config)(handler), callCount
}

func setupRefreshMiddleware(
	t *testing.T,
	clusters []string,
	token, providerURL string,
) http.Handler {
	t.Helper()

	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	return setupRefreshMiddlewareWithHandler(t, clusters, token, providerURL, next)
}

func setupRefreshMiddlewareWithHandler(
	t *testing.T,
	clusters []string,
	token, providerURL string,
	next http.Handler,
) http.Handler {
	t.Helper()

	fc := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, fc.Close()) })
	require.NoError(t, fc.Set(context.Background(), "oidc-token-"+token, "REFRESH_OLD"))

	kubeConfigStore := kubeconfig.NewContextStore()

	for _, cluster := range clusters {
		require.NoError(t, kubeConfigStore.AddContext(&kubeconfig.Context{
			Name:     cluster,
			OidcConf: &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"},
		}))
	}

	config := auth.OIDCTokenRefreshConfig{
		KubeConfigStore:  kubeConfigStore,
		Cache:            fc,
		TelemetryHandler: &telemetry.RequestHandler{},
		OidcIdpIssuerURL: providerURL,
	}

	return auth.NewOIDCTokenRefreshMiddleware(config)(next)
}

func TestNewOIDCTokenRefreshMiddleware_RefreshesEachCookieDestination(t *testing.T) {
	token := makeJWTWithPayload(t, map[string]interface{}{
		"exp": float64(time.Now().Add(auth.JWTExpirationTTL / 2).Unix()),
	})

	var calls int

	var mu sync.Mutex

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		calls++
		mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})
	clusters := []string{"first", "second"}
	middleware := setupRefreshMiddleware(t, clusters, token, srv.URL)

	for _, cluster := range clusters {
		req := httptest.NewRequestWithContext(
			context.Background(), http.MethodGet, "/clusters/"+cluster+"/api", nil,
		)
		req.Header.Set("Authorization", "Bearer "+token)
		addBrowserToken(req, cluster, token)

		rec := httptest.NewRecorder()

		middleware.ServeHTTP(rec, req)

		resp := rec.Result()
		cookie, ok := findAuthCookie(resp, cluster)
		_ = resp.Body.Close()

		require.True(t, ok, "each cluster destination needs its own cookie write")
		assert.Equal(t, "NEW", cookie)
	}

	mu.Lock()
	assert.Equal(t, 1, calls, "both cookie destinations must share the token refresh")
	mu.Unlock()
}

func TestNewOIDCTokenRefreshMiddleware_HeaderOnlyRequestDoesNotConsumeBrowserCookie(t *testing.T) {
	const cluster = "header-only"

	token := makeJWTWithPayload(t, map[string]interface{}{
		"exp": float64(time.Now().Add(auth.JWTExpirationTTL / 2).Unix()),
	})
	middleware, callCount := setupConcurrentRefreshMiddleware(t, cluster, token)

	headerReq := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/clusters/"+cluster+"/api", nil,
	)
	headerReq.Header.Set("Authorization", "Bearer "+token)

	headerRec := httptest.NewRecorder()

	middleware.ServeHTTP(headerRec, headerReq)

	headerResp := headerRec.Result()
	_, wroteCookie := findAuthCookie(headerResp, cluster)
	_ = headerResp.Body.Close()

	assert.False(t, wroteCookie)
	assert.Equal(t, "Bearer NEW", headerReq.Header.Get("Authorization"))

	browserReq := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/clusters/"+cluster+"/api", nil,
	)
	browserReq.Header.Set("Authorization", "Bearer "+token)
	addBrowserToken(browserReq, cluster, token)

	browserRec := httptest.NewRecorder()

	middleware.ServeHTTP(browserRec, browserReq)

	browserResp := browserRec.Result()
	cookie, wroteCookie := findAuthCookie(browserResp, cluster)
	_ = browserResp.Body.Close()

	require.True(t, wroteCookie)
	assert.Equal(t, "NEW", cookie)
	assert.Equal(t, 1, callCount())
}

//nolint:funlen // Coordinates an early response with a concurrent final response.
func TestNewOIDCTokenRefreshMiddleware_RestagesCookiesAfterInformationalResponse(t *testing.T) {
	token := makeJWTWithPayload(t, map[string]interface{}{
		"exp": float64(time.Now().Add(auth.JWTExpirationTTL / 2).Unix()),
	})
	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	const cluster = "informational-response"

	firstInformational := make(chan struct{})
	releaseFirst := make(chan struct{})

	var nextMu sync.Mutex

	nextCalls := 0
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		nextMu.Lock()
		nextCalls++
		call := nextCalls
		nextMu.Unlock()

		if call == 1 {
			assert.Empty(t, w.Header().Values("Set-Cookie"), "cookies must be staged only after a final claim")
			w.WriteHeader(http.StatusEarlyHints)
			close(firstInformational)
			<-releaseFirst
		}

		w.WriteHeader(http.StatusOK)
	})
	middleware := setupRefreshMiddlewareWithHandler(
		t,
		[]string{cluster},
		token,
		srv.URL,
		next,
	)
	req := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodGet,
		"/clusters/"+cluster+"/api",
		nil,
	)
	req.Header.Set("Authorization", "Bearer "+token)
	addBrowserToken(req, cluster, token)

	firstRec := &informationalResponseWriter{ResponseRecorder: httptest.NewRecorder()}
	firstDone := make(chan struct{})

	go func() {
		middleware.ServeHTTP(firstRec, req)
		close(firstDone)
	}()

	<-firstInformational

	secondReq := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodGet,
		"/clusters/"+cluster+"/api",
		nil,
	)
	secondReq.Header.Set("Authorization", "Bearer "+token)
	addBrowserToken(secondReq, cluster, token)

	secondRec := &informationalResponseWriter{ResponseRecorder: httptest.NewRecorder()}

	middleware.ServeHTTP(secondRec, secondReq)
	close(releaseFirst)
	<-firstDone

	secondResp := secondRec.Result()
	cookie, ok := findAuthCookie(secondResp, cluster)
	_ = secondResp.Body.Close()

	require.True(t, ok)
	assert.Equal(t, "NEW", cookie)

	firstResp := firstRec.Result()
	_, firstWroteCookie := findAuthCookie(firstResp, cluster)
	_ = firstResp.Body.Close()

	assert.False(t, firstWroteCookie)
}

type informationalResponseWriter struct {
	*httptest.ResponseRecorder
	informational []int
}

func (w *informationalResponseWriter) WriteHeader(statusCode int) {
	if statusCode >= 100 && statusCode < 200 {
		w.informational = append(w.informational, statusCode)
		w.Header().Del("Set-Cookie")

		return
	}

	w.ResponseRecorder.WriteHeader(statusCode)
}

//nolint:funlen // Coordinates cancellation during refresh with a live follower.
func TestNewOIDCTokenRefreshMiddleware_CanceledWinnerReleasesCookieClaim(t *testing.T) {
	token := makeJWTWithPayload(t, map[string]interface{}{
		"exp": float64(time.Now().Add(auth.JWTExpirationTTL / 2).Unix()),
	})

	ctx, cancel := context.WithCancel(context.Background())

	var calls int

	var mu sync.Mutex

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		mu.Lock()
		calls++
		mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	const cluster = "canceled-winner"

	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		cancel()
		w.WriteHeader(http.StatusOK)
	})
	middleware := setupRefreshMiddlewareWithHandler(
		t,
		[]string{cluster},
		token,
		srv.URL,
		next,
	)
	canceledReq := httptest.NewRequestWithContext(ctx, http.MethodGet, "/clusters/"+cluster+"/api", nil)
	canceledReq.Header.Set("Authorization", "Bearer "+token)
	addBrowserToken(canceledReq, cluster, token)

	canceledRec := httptest.NewRecorder()

	middleware.ServeHTTP(canceledRec, canceledReq)

	canceledResp := canceledRec.Result()
	_ = canceledResp.Body.Close()

	liveReq := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/clusters/"+cluster+"/api", nil,
	)
	liveReq.Header.Set("Authorization", "Bearer "+token)
	addBrowserToken(liveReq, cluster, token)

	liveRec := httptest.NewRecorder()

	middleware.ServeHTTP(liveRec, liveReq)

	liveResp := liveRec.Result()
	cookie, liveWroteCookie := findAuthCookie(liveResp, cluster)
	_ = liveResp.Body.Close()

	require.True(t, liveWroteCookie)
	assert.Equal(t, "NEW", cookie)
	assert.Equal(t, "Bearer NEW", liveReq.Header.Get("Authorization"))

	mu.Lock()
	assert.Equal(t, 1, calls, "the live follower should reuse the canceled refresh result")
	mu.Unlock()
}

//nolint:funlen // Table covers replacement and deletion cookie precedence.
func TestNewOIDCTokenRefreshMiddleware_PreservesDownstreamTokenCookies(t *testing.T) {
	for _, test := range []struct {
		name   string
		value  string
		maxAge int
	}{
		{name: "replacement", value: "replacement"},
		{name: "deletion", maxAge: -1},
	} {
		t.Run(test.name, func(t *testing.T) {
			const cluster = "token-management"

			token := makeJWTWithPayload(t, map[string]interface{}{
				"exp": float64(time.Now().Add(auth.JWTExpirationTTL / 2).Unix()),
				"jti": test.name,
			})
			srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				assert.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
			})
			next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				http.SetCookie(w, &http.Cookie{
					Name:     "headlamp-auth-" + auth.SanitizeClusterName(cluster) + ".0",
					Value:    test.value,
					MaxAge:   test.maxAge,
					HttpOnly: true,
					Secure:   true,
					SameSite: http.SameSiteStrictMode,
				})
				w.WriteHeader(http.StatusOK)
			})
			middleware := setupRefreshMiddlewareWithHandler(
				t,
				[]string{cluster},
				token,
				srv.URL,
				next,
			)
			req := httptest.NewRequestWithContext(
				context.Background(),
				http.MethodGet,
				"/clusters/"+cluster+"/api",
				nil,
			)
			req.Header.Set("Authorization", "Bearer "+token)
			addBrowserToken(req, cluster, token)

			rec := httptest.NewRecorder()

			middleware.ServeHTTP(rec, req)

			resp := rec.Result()
			defer func() { _ = resp.Body.Close() }()

			var matches []*http.Cookie

			for _, cookie := range resp.Cookies() {
				if cookie.Name == "headlamp-auth-"+auth.SanitizeClusterName(cluster)+".0" {
					matches = append(matches, cookie)
				}
			}

			require.Len(t, matches, 1)
			assert.Equal(t, test.value, matches[0].Value)
			assert.Equal(t, test.maxAge, matches[0].MaxAge)
		})
	}
}

//nolint:funlen // Regression test coordinates delayed cookie delivery across two refresh generations.
func TestNewOIDCTokenRefreshMiddleware_DelayedResponseDoesNotOverwriteNewerCookie(t *testing.T) {
	token := makeJWTWithPayload(t, map[string]interface{}{
		"exp": float64(time.Now().Add(auth.JWTExpirationTTL / 2).Unix()),
	})

	var (
		callMu sync.Mutex
		calls  int
	)

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		callMu.Lock()
		calls++
		call := calls
		callMu.Unlock()

		idToken := "TOKEN_B"
		expiresIn := -1

		if call > 1 {
			idToken = "TOKEN_C"
			expiresIn = 3600
		}

		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(map[string]any{
			"access_token":  "ACCESS_" + idToken,
			"token_type":    "Bearer",
			"expires_in":    expiresIn,
			"refresh_token": "REFRESH_" + idToken,
			"id_token":      idToken,
		}))
	})

	const cluster = "delayed-refresh"

	firstDownstream := make(chan struct{})
	releaseFirst := make(chan struct{})

	var downstreamMu sync.Mutex

	downstreamCalls := 0
	secondCtx, cancelSecond := context.WithCancel(context.Background())
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		downstreamMu.Lock()
		downstreamCalls++
		call := downstreamCalls
		downstreamMu.Unlock()

		if call == 1 {
			close(firstDownstream)
			<-releaseFirst
		} else {
			cancelSecond()
		}

		w.WriteHeader(http.StatusOK)
	})
	middleware := setupRefreshMiddlewareWithHandler(
		t,
		[]string{cluster},
		token,
		srv.URL,
		next,
	)

	firstReq := httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/clusters/"+cluster+"/api", nil,
	)
	firstReq.Header.Set("Authorization", "Bearer "+token)
	addBrowserToken(firstReq, cluster, token)

	firstRec := httptest.NewRecorder()

	firstDone := make(chan struct{})

	go func() {
		middleware.ServeHTTP(firstRec, firstReq)
		close(firstDone)
	}()

	<-firstDownstream

	secondReq := httptest.NewRequestWithContext(
		secondCtx, http.MethodGet, "/clusters/"+cluster+"/api", nil,
	)
	secondReq.Header.Set("Authorization", "Bearer "+token)
	addBrowserToken(secondReq, cluster, token)

	secondRec := httptest.NewRecorder()

	middleware.ServeHTTP(secondRec, secondReq)
	close(releaseFirst)
	<-firstDone

	firstResp := firstRec.Result()
	firstCookie, firstWroteCookie := findAuthCookie(firstResp, cluster)
	_ = firstResp.Body.Close()

	require.True(t, firstWroteCookie, "the live older response should receive the latest refresh")
	assert.Equal(t, "TOKEN_C", firstCookie)

	secondResp := secondRec.Result()
	_, secondWroteCookie := findAuthCookie(secondResp, cluster)
	_ = secondResp.Body.Close()

	assert.False(t, secondWroteCookie)

	callMu.Lock()
	assert.Equal(t, 2, calls)
	callMu.Unlock()
}

func runConcurrentRefreshRequests(
	middleware http.Handler,
	cluster, token string,
) ([]string, []string, []bool) {
	const concurrency = 10

	var (
		wg    sync.WaitGroup
		ready sync.WaitGroup
		start = make(chan struct{})
	)

	authorization := make([]string, concurrency)
	cookies := make([]string, concurrency)
	cookiesWritten := make([]bool, concurrency)

	ready.Add(concurrency)

	for i := 0; i < concurrency; i++ {
		wg.Add(1)

		go func(i int) {
			defer wg.Done()

			req := httptest.NewRequestWithContext(
				context.Background(), http.MethodGet, "/clusters/"+cluster+"/api", nil,
			)
			req.Header.Set("Authorization", "Bearer "+token)
			addBrowserToken(req, cluster, token)

			rr := httptest.NewRecorder()

			ready.Done()
			<-start // release every goroutine at once to maximize overlap

			middleware.ServeHTTP(rr, req)

			resp := rr.Result()
			cookies[i], cookiesWritten[i] = findAuthCookie(resp, cluster)
			_ = resp.Body.Close()

			authorization[i] = req.Header.Get("Authorization")
		}(i)
	}

	ready.Wait()
	close(start)
	wg.Wait()

	return authorization, cookies, cookiesWritten
}

// TestNewOIDCTokenRefreshMiddleware_ConcurrentRequests_DedupesAndSetsCookie exercises
// the full middleware flow (expiry check, discovery, deduplicated refresh, cookie write)
// under concurrent requests for the same expiring token, covering issue #6793's
// acceptance criteria: exactly one token-endpoint call, and no stale cookie clobbering.
func TestNewOIDCTokenRefreshMiddleware_ConcurrentRequests_DedupesAndSetsCookie(t *testing.T) {
	const cluster = "test"

	token := makeJWTWithPayload(t, map[string]interface{}{
		"exp": float64(time.Now().Add(auth.JWTExpirationTTL / 2).Unix()),
	})

	middleware, callCount := setupConcurrentRefreshMiddleware(t, cluster, token)
	authorization, cookies, cookieWritten := runConcurrentRefreshRequests(middleware, cluster, token)

	assert.Equal(t, 1, callCount(), "expected exactly one token-endpoint call for concurrent middleware requests")

	cookiesWritten := 0

	for i, cookieVal := range cookies {
		if cookieWritten[i] {
			cookiesWritten++

			assert.Equal(t, "NEW", cookieVal, "goroutine %d should receive current refreshed token", i)
		}

		assert.Equal(t, "Bearer NEW", authorization[i], "goroutine %d should use the refreshed token", i)
	}

	assert.Equal(t, 1, cookiesWritten, "only the refresh winner should write an auth cookie")
	assertDelayedRefreshFollower(t, middleware, cluster, token, callCount)
}

func assertDelayedRefreshFollower(
	t *testing.T,
	middleware http.Handler,
	cluster, token string,
	callCount func() int,
) {
	t.Helper()

	delayedReq := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodGet,
		"/clusters/"+cluster+"/api",
		nil,
	)
	delayedReq.Header.Set("Authorization", "Bearer "+token)
	addBrowserToken(delayedReq, cluster, token)

	delayedRec := httptest.NewRecorder()

	middleware.ServeHTTP(delayedRec, delayedReq)

	delayedResp := delayedRec.Result()
	defer func() { _ = delayedResp.Body.Close() }()

	_, ok := findAuthCookie(delayedResp, cluster)
	assert.False(t, ok, "a cached-refresh follower should not rewrite the auth cookie")
	assert.Equal(t, "Bearer NEW", delayedReq.Header.Get("Authorization"))
	assert.Equal(t, 1, callCount(), "a delayed follower should reuse the cached refresh outcome")
}
