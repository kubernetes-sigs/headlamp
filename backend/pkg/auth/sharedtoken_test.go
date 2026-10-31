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

package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	sharedTestCluster = "linked-cluster"
	sharedTestOther   = "other-cluster"
)

// sharedTestKey is the shared cookie key used by the tests in this file.
var sharedTestKey = auth.SharedTokenKey(testIssuerA, testClientFoo)

// sharedCookieName uses a "~" separator: SanitizeClusterName strips it, so no
// cluster name can produce a cookie in the shared namespace.
func sharedCookieName(key string, index int) string {
	return "headlamp-auth~shared-" + key + "." + strconv.Itoa(index)
}

func ownCookieName(cluster string) string {
	return "headlamp-auth-" + auth.SanitizeClusterName(cluster) + ".0"
}

func outCookieName() string {
	return "headlamp-auth-" + auth.SanitizeClusterName(sharedTestCluster) + ".out"
}

func newDynamicOIDCContext(name, issuer, clientID string) *kubeconfig.Context {
	kCtx := newOIDCContext(name, issuer, clientID)
	kCtx.Source = kubeconfig.DynamicCluster

	return kCtx
}

// sharedTestStore holds the kubeconfig contexts the resolver tests run against:
// two operator-configured clusters on IdP A, one on IdP B, a static-token
// cluster and client-controlled (dynamic, internal) contexts on IdP A.
func sharedTestStore(t *testing.T) kubeconfig.ContextStore {
	t.Helper()

	store := kubeconfig.NewContextStore()
	for _, kCtx := range []*kubeconfig.Context{
		newOIDCContext(sharedTestCluster, testIssuerA, testClientFoo),
		newOIDCContext(sharedTestOther, testIssuerA, testClientFoo),
		newOIDCContext("idp-b", testIssuerB, testClientFoo),
		newNonOIDCContext("static"),
		newDynamicOIDCContext("evil-dynamic", testIssuerA, testClientFoo),
		newInternalOIDCContext("evil-internal", testIssuerA, testClientFoo),
		newOIDCContextWithUnreadableCA("unreadable-ca"),
	} {
		require.NoError(t, store.AddContext(kCtx))
	}

	return store
}

// storeResolver resolves keys the way the middleware does, from the loaded
// context of the requested cluster.
func storeResolver(store kubeconfig.ContextStore) auth.SharedTokenKeyResolver {
	return func(cluster string) (string, bool) {
		kCtx, err := store.GetContext(cluster)
		if err != nil {
			return "", false
		}

		issuer, clientID, ok := auth.SharedTokenIdentity(kCtx)
		if !ok {
			return "", false
		}

		return auth.SharedTokenKey(issuer, clientID), true
	}
}

// sharedTestToken is opaque on purpose: the shared token is never inspected
// (access tokens may not be JWTs); the API server verifies it.
const sharedTestToken = "opaque-shared-token" //nolint:gosec // test fixture, not a credential

func sharedTestResolver(t *testing.T) auth.SharedTokenKeyResolver {
	t.Helper()

	return storeResolver(sharedTestStore(t))
}

// readShared is ReadClusterToken without the key, for tests that only care
// about the token a cluster ends up with.
func readShared(t *testing.T, r *http.Request, cluster string, resolve auth.SharedTokenKeyResolver) string {
	t.Helper()

	token, _, err := auth.ReadClusterToken(r, cluster, resolve)
	require.NoError(t, err)

	return token
}

func clusterRequest(cluster string) *http.Request {
	return httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/"+cluster+"/api", nil)
}

func findResponseCookie(t *testing.T, w *httptest.ResponseRecorder, name string) *http.Cookie {
	t.Helper()

	resp := w.Result()
	defer func() { _ = resp.Body.Close() }()

	for _, ck := range resp.Cookies() {
		if ck.Name == name {
			return ck
		}
	}

	return nil
}

func TestSharedTokenKeyIsStableAndCookieSafe(t *testing.T) {
	key := auth.SharedTokenKey(testIssuerA, testClientFoo)

	assert.Equal(t, key, auth.SharedTokenKey(testIssuerA, testClientFoo))
	assert.NotEqual(t, key, auth.SharedTokenKey(testIssuerA, testClientBar))
	assert.NotEqual(t, key, auth.SharedTokenKey(testIssuerB, testClientFoo))
	assert.Regexp(t, `^[a-f0-9]{16}$`, key)
}

func TestSharedTokenIdentityOverStore(t *testing.T) {
	resolve := sharedTestResolver(t)

	tests := []struct {
		cluster string
		wantKey string
		wantOK  bool
	}{
		{sharedTestCluster, sharedTestKey, true},
		{sharedTestOther, sharedTestKey, true},
		{"idp-b", auth.SharedTokenKey(testIssuerB, testClientFoo), true},
		{"static", "", false},
		{"evil-dynamic", "", false},  // client-controlled: never trusts a shared token
		{"evil-internal", "", false}, // per-user stateless context: never trusts a shared token
		// Eligibility is identity only; the CA file matters for login and refresh,
		// not for reading the shared token.
		{"unreadable-ca", sharedTestKey, true},
		{"missing", "", false},
	}

	for _, tc := range tests {
		t.Run(tc.cluster, func(t *testing.T) {
			key, ok := resolve(tc.cluster)
			assert.Equal(t, tc.wantOK, ok)
			assert.Equal(t, tc.wantKey, key)
		})
	}
}

func TestSharedCookieNamespaceCannotCollideWithClusterName(t *testing.T) {
	// A cluster literally named "shared-<key>" must keep its own cookies.
	cluster := "shared-" + sharedTestKey

	assert.NotContains(t, auth.SanitizeClusterName("a~shared-b"), "~",
		"SanitizeClusterName must strip the shared namespace separator")

	req := clusterRequest(cluster)
	req.Header.Set("Cookie", ownCookieName(cluster)+"=own-token; "+sharedCookieName(sharedTestKey, 0)+"=shared-token")

	token, err := auth.GetTokenFromCookie(req, cluster)
	require.NoError(t, err)
	assert.Equal(t, "own-token", token)

	auth.StripSharedTokenCookies(req)
	assert.Equal(t, ownCookieName(cluster)+"=own-token", req.Header.Get("Cookie"))
}

func TestGetTokenFromCookieFallsBackToSharedToken(t *testing.T) {
	req := clusterRequest(sharedTestCluster)
	addRequestCookie(req, sharedCookieName(sharedTestKey, 0), "part-one-")
	addRequestCookie(req, sharedCookieName(sharedTestKey, 1), "part-two")

	token, key, err := auth.ReadClusterToken(req, sharedTestCluster, sharedTestResolver(t))
	require.NoError(t, err)
	assert.Equal(t, "part-one-part-two", token)
	assert.Equal(t, sharedTestKey, key, "the caller learns the token came from the shared cookie")
}

func TestGetTokenFromCookieOwnCookieWinsOverSharedToken(t *testing.T) {
	req := clusterRequest(sharedTestCluster)
	addRequestCookie(req, ownCookieName(sharedTestCluster), "own-token")
	addRequestCookie(req, sharedCookieName(sharedTestKey, 0), sharedTestToken)

	token, key, err := auth.ReadClusterToken(req, sharedTestCluster, sharedTestResolver(t))
	require.NoError(t, err)
	assert.Equal(t, "own-token", token)
	assert.Empty(t, key, "an own token is not reported as shared")
}

func TestGetTokenFromCookieReadsOwnCookieOnly(t *testing.T) {
	req := clusterRequest(sharedTestCluster)
	addRequestCookie(req, sharedCookieName(sharedTestKey, 0), sharedTestToken)

	token, err := auth.GetTokenFromCookie(req, sharedTestCluster)
	require.NoError(t, err)
	assert.Empty(t, token, "handlers never resolve shared tokens; the middleware does")

	token, _, err = auth.ReadClusterToken(req, sharedTestCluster, nil)
	require.NoError(t, err)
	assert.Empty(t, token)
}

// TestGetTokenFromCookieNeverServesSharedTokenToOtherClusters is the isolation
// guarantee: the shared token is used only for operator-configured clusters
// whose kubeconfig points at the issuer + client-id the key was derived from.
// A client-added (dynamic) or per-user context never gets it, even when its
// kubeconfig claims the same issuer, because that claim is client-controlled.
func TestGetTokenFromCookieNeverServesSharedTokenToOtherClusters(t *testing.T) {
	resolve := sharedTestResolver(t)

	tests := []struct {
		cluster string
		want    string
	}{
		{sharedTestCluster, sharedTestToken},
		{sharedTestOther, sharedTestToken},
		{"idp-b", ""},
		{"static", ""},
		{"evil-dynamic", ""},
		{"evil-internal", ""},
		{"unreadable-ca", sharedTestToken},
		{"unknown", ""},
	}

	for _, tc := range tests {
		t.Run(tc.cluster, func(t *testing.T) {
			req := clusterRequest(tc.cluster)
			addRequestCookie(req, sharedCookieName(sharedTestKey, 0), sharedTestToken)

			assert.Equal(t, tc.want, readShared(t, req, tc.cluster, resolve))
		})
	}
}

func TestGetTokenFromCookieHonoursLogoutMarker(t *testing.T) {
	req := clusterRequest(sharedTestCluster)
	addRequestCookie(req, outCookieName(), "1")
	addRequestCookie(req, sharedCookieName(sharedTestKey, 0), sharedTestToken)

	resolve := sharedTestResolver(t)
	assert.Empty(t, readShared(t, req, sharedTestCluster, resolve), "a logged-out cluster must not read the shared token")

	// The marker only applies to the marked cluster.
	other := clusterRequest(sharedTestOther)
	addRequestCookie(other, outCookieName(), "1")
	addRequestCookie(other, sharedCookieName(sharedTestKey, 0), sharedTestToken)
	assert.Equal(t, sharedTestToken, readShared(t, other, sharedTestOther, resolve))

	// A private token (manual set-token) wins over the marker.
	addRequestCookie(req, ownCookieName(sharedTestCluster), "own-token")
	assert.Equal(t, "own-token", readShared(t, req, sharedTestCluster, resolve))
}

func TestSetSharedTokenCookieChunksUnderSharedPath(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/oidc-callback", nil)
	w := httptest.NewRecorder()
	token := strings.Repeat("a", 3800) + strings.Repeat("b", 1200) // two chunks, opaque

	require.NoError(t, auth.SetSharedTokenCookie(w, req, sharedTestKey, token, "/headlamp", 3600))

	first := findResponseCookie(t, w, sharedCookieName(sharedTestKey, 0))
	require.NotNil(t, first)
	assert.Equal(t, token[:3800], first.Value)
	assert.Equal(t, "/headlamp/clusters/", first.Path)
	assert.Equal(t, 3600, first.MaxAge)
	assert.True(t, first.HttpOnly)
	assert.Equal(t, http.SameSiteStrictMode, first.SameSite)

	second := findResponseCookie(t, w, sharedCookieName(sharedTestKey, 1))
	require.NotNil(t, second)
	assert.Equal(t, token[3800:], second.Value)

	// The chunk after the last one is cleared, as SetTokenCookie does.
	terminal := findResponseCookie(t, w, sharedCookieName(sharedTestKey, 2))
	require.NotNil(t, terminal)
	assert.Equal(t, -1, terminal.MaxAge)

	// Round trip: a cluster on that IdP reads the token back from the shared cookie.
	next := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/headlamp/clusters/x", nil)
	addRequestCookie(next, first.Name, first.Value)
	addRequestCookie(next, second.Name, second.Value)

	assert.Equal(t, token, readShared(t, next, sharedTestCluster, sharedTestResolver(t)),
		"an opaque shared token is promoted as is")
}

func TestSetSharedTokenCookieRejectsOversizedAndSkipsEmptyToken(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/oidc-callback", nil)

	w := httptest.NewRecorder()
	require.Error(t, auth.SetSharedTokenCookie(w, req, sharedTestKey, strings.Repeat("a", 3800*33), "", 3600))

	// Like SetTokenCookie, no token chunk is written and chunk zero is invalidated.
	for _, ck := range w.Result().Cookies() {
		assert.Empty(t, ck.Value)
		assert.Equal(t, -1, ck.MaxAge)
	}

	// An empty token is a no-op, as in SetTokenCookie: nothing stored, no error.
	w = httptest.NewRecorder()
	require.NoError(t, auth.SetSharedTokenCookie(w, req, sharedTestKey, "", "", 3600))
	assert.Empty(t, w.Result().Cookies())
}

func TestSharedTokenIdentity(t *testing.T) {
	issuer, clientID, ok := auth.SharedTokenIdentity(newOIDCContext(sharedTestCluster, testIssuerA, testClientFoo))
	assert.True(t, ok)
	assert.Equal(t, testIssuerA, issuer)
	assert.Equal(t, testClientFoo, clientID)

	_, _, ok = auth.SharedTokenIdentity(nil)
	assert.False(t, ok)

	_, _, ok = auth.SharedTokenIdentity(newDynamicOIDCContext(sharedTestCluster, testIssuerA, testClientFoo))
	assert.False(t, ok)

	_, _, ok = auth.SharedTokenIdentity(newInternalOIDCContext(sharedTestCluster, testIssuerB, testClientBar))
	assert.False(t, ok)

	_, _, ok = auth.SharedTokenIdentity(newNonOIDCContext("static"))
	assert.False(t, ok)
}

func TestOIDCTokenRefreshMiddlewareHandsOffWithoutSharedCookies(t *testing.T) {
	for _, baseURL := range []string{"", "/headlamp"} {
		t.Run("base="+baseURL, func(t *testing.T) {
			store := &countingStore{ContextStore: sharedTestStore(t)}

			var seenAuth, seenCookie string

			handler := auth.NewOIDCTokenRefreshMiddleware(auth.OIDCTokenRefreshConfig{
				KubeConfigStore:       store,
				TelemetryHandler:      &telemetry.RequestHandler{},
				BaseURL:               baseURL,
				OidcUseTokenBroadcast: true,
			})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				seenAuth = r.Header.Get("Authorization")
				seenCookie = r.Header.Get("Cookie")
			}))

			serve := func(path, cookie string) {
				seenAuth, seenCookie = "", ""
				req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, baseURL+path, nil)
				req.Header.Set("Cookie", cookie)
				handler.ServeHTTP(httptest.NewRecorder(), req)
			}

			// No token and no shared cookie: the context is never loaded.
			serve("/clusters/unknown/api", "other=keep")
			assert.Equal(t, 0, store.calls)
			assert.Empty(t, seenAuth)
			assert.Equal(t, "other=keep", seenCookie)

			// Own cookie: a token is present, so the context is loaded once for the
			// refresh check (not again by the resolver) and the token is promoted.
			serve("/clusters/"+sharedTestCluster+"/api", ownCookieName(sharedTestCluster)+"=own")
			assert.Equal(t, 1, store.calls)
			assert.Equal(t, "Bearer own", seenAuth)

			// Shared cookie: context loaded once more, token promoted, shared cookie stripped.
			serve("/clusters/"+sharedTestCluster+"/api", "other=keep; "+sharedCookieName(sharedTestKey, 0)+"="+sharedTestToken)
			assert.Equal(t, 2, store.calls)
			assert.Equal(t, "Bearer "+sharedTestToken, seenAuth)
			assert.Equal(t, "other=keep", seenCookie)

			// Logged-out cluster: nothing promoted, shared cookie still stripped.
			serve("/clusters/"+sharedTestCluster+"/api", outCookieName()+"=1; "+sharedCookieName(sharedTestKey, 0)+"=s")
			assert.Empty(t, seenAuth)
			assert.Equal(t, outCookieName()+"=1", seenCookie)
		})
	}
}

// TestOIDCTokenRefreshMiddlewareWithoutBroadcastIsUnchanged: with the flag off
// nothing new happens: no shared cookie is read, nothing is promoted, nothing is
// stripped and no cookie is set, byte for byte as before token broadcast.
func TestOIDCTokenRefreshMiddlewareWithoutBroadcastIsUnchanged(t *testing.T) {
	for _, baseURL := range []string{"", "/headlamp"} {
		t.Run("base="+baseURL, func(t *testing.T) {
			store := &countingStore{ContextStore: sharedTestStore(t)}

			var seenAuth, seenCookie string

			handler := auth.NewOIDCTokenRefreshMiddleware(auth.OIDCTokenRefreshConfig{
				KubeConfigStore:  store,
				TelemetryHandler: &telemetry.RequestHandler{},
				BaseURL:          baseURL,
			})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				seenAuth = r.Header.Get("Authorization")
				seenCookie = r.Header.Get("Cookie")
			}))

			cookie := "other=keep; " + sharedCookieName(sharedTestKey, 0) + "=" + sharedTestToken +
				"; " + outCookieName() + "=1"
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
				baseURL+"/clusters/"+sharedTestCluster+"/api", nil)
			req.Header.Set("Cookie", cookie)

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			assert.Empty(t, seenAuth, "no promotion without the flag")
			assert.Equal(t, cookie, seenCookie, "cookies forwarded untouched without the flag")
			assert.Empty(t, rr.Result().Cookies())
			assert.Equal(t, 0, store.calls, "no token means no context load, as before")
		})
	}
}

func TestRefreshAndSetToken_SharedClusterUpdatesSharedCookie(t *testing.T) {
	const oldToken = "OLD"

	fc := &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "REFRESH_OLD"}}

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		require.NoError(t, r.ParseForm())

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	req := clusterRequest(sharedTestCluster)
	addRequestCookie(req, sharedCookieName(sharedTestKey, 0), oldToken)

	rr := httptest.NewRecorder()

	auth.RefreshAndSetToken(auth.RefreshAndSetTokenParams{
		Ctx:              context.Background(),
		OIDCAuthConfig:   &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret", IdpIssuerURL: srv.URL},
		Cache:            fc,
		Token:            oldToken,
		Cluster:          sharedTestCluster,
		Writer:           rr,
		Request:          req,
		TelemetryHandler: &telemetry.RequestHandler{},
		SharedTokenKey:   sharedTestKey,
	})

	shared := findResponseCookie(t, rr, sharedCookieName(sharedTestKey, 0))
	require.NotNil(t, shared, "refresh on a shared cluster must update the shared cookie")
	assert.Equal(t, "NEW", shared.Value)
	assert.Nil(t, findResponseCookie(t, rr, ownCookieName(sharedTestCluster)))
	assert.Equal(t, "Bearer NEW", req.Header.Get("Authorization"))
}

func TestStripSharedTokenCookies(t *testing.T) {
	tests := []struct {
		name   string
		cookie string
		want   string
	}{
		{
			name: "removes shared cookies and keeps the rest",
			cookie: "headlamp-auth-main.0=own; headlamp-auth~shared-" + sharedTestKey + ".0=s0; " +
				"headlamp-auth~shared-" + sharedTestKey + ".1=s1; other=keep; headlamp-auth-main.out=1",
			want: "headlamp-auth-main.0=own; other=keep; headlamp-auth-main.out=1",
		},
		{
			name:   "drops the header when only shared cookies were sent",
			cookie: "headlamp-auth~shared-" + sharedTestKey + ".0=s0",
			want:   "",
		},
		{
			name:   "leaves the header untouched without shared cookies",
			cookie: "headlamp-auth-main.0=own;  other=keep",
			want:   "headlamp-auth-main.0=own;  other=keep",
		},
		{
			name:   "keeps quoted values and bare pairs verbatim",
			cookie: `q="b c"; bare; headlamp-auth~shared-` + sharedTestKey + `.0=s0; weird=a=b; headlamp-auth-shared-prod.0=own`,
			want:   `q="b c"; bare; weird=a=b; headlamp-auth-shared-prod.0=own`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := clusterRequest("main")
			req.Header.Set("Cookie", tc.cookie)

			auth.StripSharedTokenCookies(req)

			assert.Equal(t, tc.want, req.Header.Get("Cookie"))
		})
	}
}
