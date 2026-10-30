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
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	testIssuerA        = "https://idp-a.example.com"
	testIssuerB        = "https://idp-b.example.com"
	testClientFoo      = "client-foo"
	testClientBar      = "client-bar"
	testBroadcastToken = "test-token"
)

// broadcastCookieInfo is the reassembled auth cookie for one cluster: the full
// token value (all chunks concatenated in order) and the cookie Path.
type broadcastCookieInfo struct {
	value string
	path  string
}

// broadcastCookies resolves the cookies set on w the way a later request sees
// them: every non-clearing cookie is attached to a request and, for each
// context in store whose logout marker was cleared by the broadcast (its
// participation mark), the token GetTokenFromCookie returns for it through
// the store-backed resolver, with the path of that marker clear. This lets
// tests assert that the broadcast made the exact source token readable by the
// target cluster — not merely that some cookie was set for it.
func broadcastCookies(
	t *testing.T, w *httptest.ResponseRecorder, store kubeconfig.ContextStore,
) map[string]broadcastCookieInfo {
	t.Helper()

	resp := w.Result()
	defer func() { _ = resp.Body.Close() }()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/", nil)
	cleared := make(map[string]string) // sanitized cluster -> path of its marker clear

	for _, ck := range resp.Cookies() {
		if ck.Value != "" && ck.MaxAge > 0 {
			addRequestCookie(req, ck.Name, ck.Value)
			continue
		}

		if strings.HasPrefix(ck.Name, "headlamp-auth-") && strings.HasSuffix(ck.Name, ".out") {
			cleared[strings.TrimSuffix(strings.TrimPrefix(ck.Name, "headlamp-auth-"), ".out")] = ck.Path
		}
	}

	resolve := storeResolver(store)
	out := make(map[string]broadcastCookieInfo)

	kContexts, err := store.GetContexts()
	require.NoError(t, err)

	for _, kCtx := range kContexts {
		name := auth.SanitizeClusterName(kCtx.Name)

		path, ok := cleared[name]
		if !ok {
			continue
		}

		token, _, err := auth.ReadClusterToken(req, kCtx.Name, resolve)
		require.NoError(t, err)

		if token != "" {
			out[name] = broadcastCookieInfo{value: token, path: path}
		}
	}

	return out
}

// broadcastClusters returns just the cluster names present in got, for readable
// assertion-failure messages.
func broadcastClusters(got map[string]broadcastCookieInfo) []string {
	names := make([]string, 0, len(got))
	for name := range got {
		names = append(names, name)
	}

	return names
}

func newOIDCContext(name, issuer, clientID string) *kubeconfig.Context {
	return &kubeconfig.Context{
		Name:     name,
		AuthInfo: &api.AuthInfo{},
		OidcConf: &kubeconfig.OidcConfig{
			IdpIssuerURL: issuer,
			ClientID:     clientID,
		},
	}
}

func newNonOIDCContext(name string) *kubeconfig.Context {
	return &kubeconfig.Context{
		Name:     name,
		AuthInfo: &api.AuthInfo{Token: "static-sa-token"},
	}
}

// newGCPAuthProviderContext returns a context that uses a non-OIDC
// auth-provider (here: "gcp"). kubeconfig.Context.AuthType() coarsely returns
// "oidc" for any AuthProvider, so the broadcast loop must filter on
// AuthProvider.Name to avoid mistakenly treating these as OIDC targets.
func newGCPAuthProviderContext(name string) *kubeconfig.Context {
	return &kubeconfig.Context{
		Name: name,
		AuthInfo: &api.AuthInfo{
			AuthProvider: &api.AuthProviderConfig{
				Name:   "gcp",
				Config: map[string]string{"access-token": "gcp-access-token"},
			},
		},
	}
}

// newInternalOIDCContext returns a per-user stateless (Internal=true) context
// with a matching OIDC config. The store keys such contexts as
// "<cluster>\x00<userID>" and sets Name to that key, mirroring
// AddContextWithKeyAndTTL. Broadcast must skip these: they are private to one
// user, and their sanitized cookie name can collide with a real cluster's.
func newInternalOIDCContext(name, issuer, clientID string) *kubeconfig.Context {
	ctx := newOIDCContext(name, issuer, clientID)
	ctx.Internal = true

	return ctx
}

// newOIDCContextWithUnreadableCA returns a context that advertises OIDC
// (AuthType()=="oidc") but whose OidcConfig() will return an error because
// idp-certificate-authority points at a nonexistent file. Used to verify that
// the shared token eligibility is identity only and never reads the CA file.
func newOIDCContextWithUnreadableCA(name string) *kubeconfig.Context {
	return &kubeconfig.Context{
		Name: name,
		AuthInfo: &api.AuthInfo{
			AuthProvider: &api.AuthProviderConfig{
				Name: "oidc",
				Config: map[string]string{
					"idp-issuer-url":            testIssuerA,
					"client-id":                 testClientFoo,
					"idp-certificate-authority": "/nonexistent/path/ca.crt",
				},
			},
		},
	}
}

type broadcastTestCase struct {
	name          string
	contexts      []*kubeconfig.Context
	source        string
	wantBroadcast []string // clusters expected to be linked to the shared token
}

func matchingTargetCases() []broadcastTestCase {
	return []broadcastTestCase{
		{
			name: "matching issuer and client_id broadcasts",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", testIssuerA, testClientFoo),
				newOIDCContext("dst-match", testIssuerA, testClientFoo),
			},
			source:        "src",
			wantBroadcast: []string{"dst-match"},
		},
		{
			name: "source cluster is never broadcast to itself",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", testIssuerA, testClientFoo),
				newOIDCContext("dst-1", testIssuerA, testClientFoo),
				newOIDCContext("dst-2", testIssuerA, testClientFoo),
			},
			source:        "src",
			wantBroadcast: []string{"dst-1", "dst-2"},
		},
	}
}

func mismatchedTargetCases() []broadcastTestCase {
	return []broadcastTestCase{
		{
			name: "different issuer does not broadcast",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", testIssuerA, testClientFoo),
				newOIDCContext("dst-other-idp", testIssuerB, testClientFoo),
			},
			source:        "src",
			wantBroadcast: nil,
		},
		{
			name: "different client_id does not broadcast",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", testIssuerA, testClientFoo),
				newOIDCContext("dst-other-client", testIssuerA, testClientBar),
			},
			source:        "src",
			wantBroadcast: nil,
		},
		{
			name: "static-token target is skipped",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", testIssuerA, testClientFoo),
				newNonOIDCContext("dst-sa"),
			},
			source:        "src",
			wantBroadcast: nil,
		},
		{
			name: "non-oidc auth-provider (gcp) target is skipped",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", testIssuerA, testClientFoo),
				newGCPAuthProviderContext("dst-gcp"),
			},
			source:        "src",
			wantBroadcast: nil,
		},
		{
			name: "source without oidc config is a no-op",
			contexts: []*kubeconfig.Context{
				newNonOIDCContext("src"),
				newOIDCContext("dst", testIssuerA, testClientFoo),
			},
			source:        "src",
			wantBroadcast: nil,
		},
		{
			name: "source with non-oidc auth-provider (gcp) is a no-op",
			contexts: []*kubeconfig.Context{
				newGCPAuthProviderContext("src"),
				newOIDCContext("dst", testIssuerA, testClientFoo),
			},
			source:        "src",
			wantBroadcast: nil,
		},
	}
}

func mixedAndMisconfiguredCases() []broadcastTestCase {
	return []broadcastTestCase{
		{
			name: "mixed contexts: only matching ones receive cookie",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", testIssuerA, testClientFoo),
				newOIDCContext("match-1", testIssuerA, testClientFoo),
				newOIDCContext("mismatch-issuer", testIssuerB, testClientFoo),
				newOIDCContext("mismatch-client", testIssuerA, testClientBar),
				newNonOIDCContext("static"),
				newOIDCContext("match-2", testIssuerA, testClientFoo),
			},
			source:        "src",
			wantBroadcast: []string{"match-1", "match-2"},
		},
		{
			// Eligibility is identity only: the CA file matters for that cluster's
			// own login and refresh, not for reading the shared token.
			name: "target with unreadable OIDC CA still takes part",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", testIssuerA, testClientFoo),
				newOIDCContext("dst-good", testIssuerA, testClientFoo),
				newOIDCContextWithUnreadableCA("dst-bad-ca"),
			},
			source:        "src",
			wantBroadcast: []string{"dst-good", "dst-bad-ca"},
		},
		{
			name: "source with empty issuer or client-id is a no-op",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", "", ""),
				newOIDCContext("dst", testIssuerA, testClientFoo),
			},
			source:        "src",
			wantBroadcast: nil,
		},
		{
			name: "target with empty issuer or client-id is skipped (would otherwise match empty source incorrectly)",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", testIssuerA, testClientFoo),
				newOIDCContext("dst-empty", "", ""),
				newOIDCContext("dst-good", testIssuerA, testClientFoo),
			},
			source:        "src",
			wantBroadcast: []string{"dst-good"},
		},
		{
			name: "internal (per-user stateless) target is skipped even when issuer and client-id match",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", testIssuerA, testClientFoo),
				newInternalOIDCContext("dst-private", testIssuerA, testClientFoo),
				newOIDCContext("dst-good", testIssuerA, testClientFoo),
			},
			source:        "src",
			wantBroadcast: []string{"dst-good"},
		},
	}
}

func broadcastTestCases() []broadcastTestCase {
	cases := matchingTargetCases()
	cases = append(cases, mismatchedTargetCases()...)
	cases = append(cases, mixedAndMisconfiguredCases()...)

	return cases
}

func runBroadcastCase(t *testing.T, tc broadcastTestCase) {
	t.Helper()

	store := kubeconfig.NewContextStore()
	for _, ctx := range tc.contexts {
		require.NoError(t, store.AddContext(ctx))
	}

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)

	shared, err := auth.BroadcastOIDCToken(auth.BroadcastOIDCTokenParams{
		Writer:          w,
		Request:         r,
		KubeConfigStore: store,
		SourceCluster:   tc.source,
		Token:           testBroadcastToken,
		SessionTTL:      3600,
	})
	require.NoError(t, err)

	assert.Equal(t, len(tc.wantBroadcast) > 0, shared,
		"BroadcastOIDCToken must report whether the token was stored in the shared cookie")

	got := broadcastCookies(t, w, store)
	assertBroadcastResult(t, tc, got)
}

func assertBroadcastResult(t *testing.T, tc broadcastTestCase, got map[string]broadcastCookieInfo) {
	t.Helper()

	// With at least one target, the source reads the shared token too so that
	// one cookie carries one refresh lineage. Without targets the source keeps
	// its own cookie, set by the login handler, and broadcast sets nothing.
	sourceInfo, gotSource := got[tc.source]
	if len(tc.wantBroadcast) > 0 {
		if assert.Truef(t, gotSource, "source cluster %s must be linked to the shared token", tc.source) {
			assert.Equal(t, testBroadcastToken, sourceInfo.value)
			assert.Equal(t, "/clusters/"+tc.source, sourceInfo.path)
		}
	} else {
		assert.Falsef(t, gotSource, "source cluster %s must not take part in a broadcast without targets", tc.source)
	}

	wantSet := make(map[string]bool, len(tc.wantBroadcast))

	for _, e := range tc.wantBroadcast {
		wantSet[e] = true

		info, ok := got[e]
		if !assert.Truef(t, ok, "expected broadcast cookie for %q, got cookies for: %v",
			e, broadcastClusters(got)) {
			continue
		}

		// The broadcast must carry the exact source token (not empty, truncated,
		// or some other value) and be scoped to the target cluster's cookie path.
		assert.Equalf(t, testBroadcastToken, info.value,
			"broadcast cookie for %q must carry the source token", e)
		assert.Equalf(t, "/clusters/"+e, info.path,
			"broadcast cookie for %q must be scoped to /clusters/%s", e, e)
	}

	for _, ctx := range tc.contexts {
		if ctx.Name == tc.source || wantSet[ctx.Name] {
			continue
		}

		_, unexpected := got[ctx.Name]
		assert.Falsef(t, unexpected,
			"did not expect broadcast cookie for %q, got cookies for: %v",
			ctx.Name, broadcastClusters(got))
	}
}

func TestBroadcastOIDCToken(t *testing.T) {
	for _, tc := range broadcastTestCases() {
		t.Run(tc.name, func(t *testing.T) {
			runBroadcastCase(t, tc)
		})
	}
}

func TestBroadcastOIDCToken_NoContextsReturnsCleanly(t *testing.T) {
	store := kubeconfig.NewContextStore()

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)

	// Should not panic even when the source cluster doesn't exist.
	shared, err := auth.BroadcastOIDCToken(auth.BroadcastOIDCTokenParams{
		Writer:          w,
		Request:         r,
		KubeConfigStore: store,
		SourceCluster:   "missing",
		Token:           testBroadcastToken,
		SessionTTL:      3600,
	})
	require.NoError(t, err)
	assert.False(t, shared)
	assert.Empty(t, w.Result().Cookies())
}

// TestBroadcastOIDCToken_InternalContextCannotClobberRealClusterCookie covers
// the cookie-name collision between a per-user stateless context and a real
// configured cluster. The store names stateless contexts "<cluster>\x00<user>";
// SanitizeClusterName strips the "\x00", so "prod\x00-other" and the real
// cluster "prod-other" share the cookie name "headlamp-auth-prod-other".
//
// Here the real "prod-other" does NOT match the source's IdP and must not get a
// cookie. The internal "prod\x00-other" DOES match — if broadcast did not skip
// internal contexts it would set headlamp-auth-prod-other and silently
// overwrite the real cluster's cookie despite the issuer mismatch.
func TestBroadcastOIDCToken_InternalContextCannotClobberRealClusterCookie(t *testing.T) {
	const (
		realCluster     = "prod-other"
		internalCluster = "prod\x00-other" // sanitizes to "prod-other"
	)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(newOIDCContext("src", testIssuerA, testClientFoo)))
	require.NoError(t, store.AddContext(newOIDCContext(realCluster, testIssuerB, testClientFoo)))
	require.NoError(t, store.AddContext(newInternalOIDCContext(internalCluster, testIssuerA, testClientFoo)))

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)

	_, err := auth.BroadcastOIDCToken(auth.BroadcastOIDCTokenParams{
		Writer:          w,
		Request:         r,
		KubeConfigStore: store,
		SourceCluster:   "src",
		Token:           testBroadcastToken,
		SessionTTL:      3600,
	})
	require.NoError(t, err)

	got := broadcastCookies(t, w, store)

	// broadcastCookies keys by the sanitized cookie name, so a cookie set for
	// either "prod-other" or "prod\x00-other" would surface under "prod-other".
	_, clobbered := got[realCluster]
	assert.Falsef(t, clobbered,
		"real cluster %q must not receive a cookie: its IdP does not match and the only "+
			"matching context is an internal one that sanitizes to the same cookie name; got: %v",
		realCluster, broadcastClusters(got))
	assert.Empty(t, got, "no cluster should receive a broadcast cookie in this scenario")
}

// setCookieBytes returns the wire size of all Set-Cookie headers on w.
func setCookieBytes(t *testing.T, w *httptest.ResponseRecorder) int {
	t.Helper()

	total := 0
	for _, v := range w.Result().Header.Values("Set-Cookie") {
		total += len("Set-Cookie: ") + len(v) + len("\r\n")
	}

	return total
}

func broadcastWithTargets(t *testing.T, n int, token, baseURL string) *httptest.ResponseRecorder {
	t.Helper()

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(newOIDCContext("src", testIssuerA, testClientFoo)))

	for i := 0; i < n; i++ {
		require.NoError(t, store.AddContext(newOIDCContext("dst-"+strconv.Itoa(i), testIssuerA, testClientFoo)))
	}

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/oidc-callback", nil)

	shared, err := auth.BroadcastOIDCToken(auth.BroadcastOIDCTokenParams{
		Writer:          w,
		Request:         r,
		KubeConfigStore: store,
		SourceCluster:   "src",
		Token:           token,
		BaseURL:         baseURL,
		SessionTTL:      3600,
	})
	require.NoError(t, err)
	require.True(t, shared)

	return w
}

func TestBroadcastOIDCToken_EmptyTokenIsANoOpAndOversizedIsAnError(t *testing.T) {
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(newOIDCContext("src", testIssuerA, testClientFoo)))
	require.NoError(t, store.AddContext(newOIDCContext("dst", testIssuerA, testClientFoo)))

	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/oidc-callback", nil)

	w := httptest.NewRecorder()
	shared, err := auth.BroadcastOIDCToken(auth.BroadcastOIDCTokenParams{
		Writer: w, Request: r, KubeConfigStore: store, SourceCluster: "src", Token: "", SessionTTL: 3600,
	})
	require.NoError(t, err, "an empty token is skipped like SetTokenCookie does, not reported")
	assert.False(t, shared)
	assert.Empty(t, w.Result().Cookies())

	w = httptest.NewRecorder()
	shared, err = auth.BroadcastOIDCToken(auth.BroadcastOIDCTokenParams{
		Writer: w, Request: r, KubeConfigStore: store, SourceCluster: "src",
		Token: strings.Repeat("a", 3800*33), SessionTTL: 3600,
	})
	require.Error(t, err)
	assert.False(t, shared)
}

// TestBroadcastOIDCToken_RefusesClientControlledSource: a dynamic (client-added)
// or per-user context never resolves a shared key, so sharing its token would
// leave the just-logged-in cluster without a token. The login handler then
// falls back to the cluster's own cookie.
func TestBroadcastOIDCToken_RefusesClientControlledSource(t *testing.T) {
	for name, src := range map[string]*kubeconfig.Context{
		"dynamic":  newDynamicOIDCContext("src", testIssuerA, testClientFoo),
		"internal": newInternalOIDCContext("src", testIssuerA, testClientFoo),
	} {
		t.Run(name, func(t *testing.T) {
			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(src))
			require.NoError(t, store.AddContext(newOIDCContext("dst", testIssuerA, testClientFoo)))

			w := httptest.NewRecorder()
			r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/oidc-callback", nil)

			shared, err := auth.BroadcastOIDCToken(auth.BroadcastOIDCTokenParams{
				Writer: w, Request: r, KubeConfigStore: store, SourceCluster: "src",
				Token: testBroadcastToken, SessionTTL: 3600,
			})
			require.NoError(t, err)
			assert.False(t, shared)
			assert.Empty(t, w.Result().Cookies(), "nothing is shared from a client-controlled source")
		})
	}
}

// TestBroadcastOIDCToken_KeepsSiblingOwnCookie: only the source's chunk zero is
// cleared. A sibling with a private (set-token) or older OIDC cookie keeps
// using it — its own lineage, exactly as before this change.
func TestBroadcastOIDCToken_KeepsSiblingOwnCookie(t *testing.T) {
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(newOIDCContext("src", testIssuerA, testClientFoo)))
	require.NoError(t, store.AddContext(newOIDCContext("dst", testIssuerA, testClientFoo)))

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/oidc-callback", nil)

	shared, err := auth.BroadcastOIDCToken(auth.BroadcastOIDCTokenParams{
		Writer: w, Request: r, KubeConfigStore: store, SourceCluster: "src",
		Token: testBroadcastToken, SessionTTL: 3600,
	})
	require.NoError(t, err)
	require.True(t, shared)

	// The browser had a private token for dst before the login; replay it with
	// everything the broadcast set (clearing cookies drop the matching name).
	next := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/", nil)
	cleared := map[string]bool{}

	for _, ck := range w.Result().Cookies() {
		if ck.MaxAge > 0 {
			addRequestCookie(next, ck.Name, ck.Value)
		} else {
			cleared[ck.Name] = true
		}
	}

	assert.True(t, cleared["headlamp-auth-src.0"], "source chunk zero is cleared")
	assert.False(t, cleared["headlamp-auth-dst.0"], "sibling chunk zero must not be touched")

	if !cleared["headlamp-auth-dst.0"] {
		addRequestCookie(next, "headlamp-auth-dst.0", "private-dst-token")
	}

	resolve := storeResolver(store)
	assert.Equal(t, "private-dst-token", readShared(t, next, "dst", resolve))
	assert.Equal(t, testBroadcastToken, readShared(t, next, "src", resolve))
}

// TestBroadcastOIDCToken_HeaderSizeDoesNotScaleWithClusters guards against the
// /oidc-callback response growing as token size x number of clusters, which
// exceeds the response header limits of reverse proxies such as Envoy (60KB).
func TestBroadcastOIDCToken_HeaderSizeDoesNotScaleWithClusters(t *testing.T) {
	const clusters = 20

	token := strings.Repeat("t", 5000) // two chunks, like an Entra ID access token with groups

	w := broadcastWithTargets(t, clusters, token, "")
	size := setCookieBytes(t, w)
	t.Logf("Set-Cookie bytes for %d clusters and a %d-byte token: %d", clusters, len(token), size)

	assert.Less(t, size, 15*1024, "Set-Cookie headers must not carry one token copy per cluster")
}

func TestBroadcastOIDCToken_SharedCookieLayout(t *testing.T) {
	for _, baseURL := range []string{"", "/headlamp"} {
		t.Run("base="+baseURL, func(t *testing.T) {
			w := broadcastWithTargets(t, 3, testBroadcastToken, baseURL)
			key := auth.SharedTokenKey(testIssuerA, testClientFoo)

			resp := w.Result()
			defer func() { _ = resp.Body.Close() }()

			byName := make(map[string]*http.Cookie)
			for _, ck := range resp.Cookies() {
				byName[ck.Name] = ck
			}

			shared := byName["headlamp-auth~shared-"+key+".0"]
			require.NotNil(t, shared, "the token must be stored once in the shared cookie")
			assert.Equal(t, testBroadcastToken, shared.Value)
			assert.Equal(t, baseURL+"/clusters/", shared.Path)
			assert.Equal(t, 3600, shared.MaxAge)
			assert.True(t, shared.HttpOnly)

			// Only the source, whose login just happened, has its own chunk zero
			// cleared; siblings keep whatever private cookie they hold.
			chunkZero := byName["headlamp-auth-src.0"]
			require.NotNil(t, chunkZero, "source chunk zero must be cleared")
			assert.Empty(t, chunkZero.Value)
			assert.Equal(t, -1, chunkZero.MaxAge)
			assert.Equal(t, baseURL+"/clusters/src", chunkZero.Path)

			// No per-cluster link cookie exists: the key is resolved on the server
			// from each cluster's kubeconfig, so a client cannot point a cluster at it.
			for _, cluster := range []string{"src", "dst-0", "dst-1", "dst-2"} {
				assert.Nilf(t, byName["headlamp-auth-"+cluster+".shared"], "%s must not get a link cookie", cluster)

				if cluster != "src" {
					assert.Nilf(t, byName["headlamp-auth-"+cluster+".0"], "%s own cookie must not be touched", cluster)
				}

				marker := byName["headlamp-auth-"+cluster+".out"]
				require.NotNilf(t, marker, "%s logout marker must be lifted by a new login", cluster)
				assert.Equal(t, -1, marker.MaxAge)
				assert.Equal(t, baseURL+"/clusters/"+cluster, marker.Path)

				assert.Nilf(t, byName["headlamp-auth-"+cluster+".1"], "%s must not get token chunks", cluster)
			}
		})
	}
}
