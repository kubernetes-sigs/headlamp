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

package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	testIssuerA   = "https://idp-a.example.com"
	testIssuerB   = "https://idp-b.example.com"
	testClientFoo = "client-foo"
	testClientBar = "client-bar"
	testToken     = "test-token"
)

// broadcastCookieInfo is the reassembled auth cookie for one cluster: the full
// token value (all chunks concatenated in order) and the cookie Path.
type broadcastCookieInfo struct {
	value string
	path  string
}

// broadcastCookies reassembles the chunked headlamp-auth-<cluster>.<i> cookies
// set on w into a per-cluster {value, path}. Clearing cookies (empty value,
// non-positive MaxAge emitted by SetTokenCookie's ClearTokenCookie pre-step) are
// ignored. Reassembling the value and path lets tests assert that the broadcast
// carried the exact source token, scoped to the target cluster — not merely that
// some cookie was set for the cluster.
func broadcastCookies(t *testing.T, w *httptest.ResponseRecorder) map[string]broadcastCookieInfo {
	t.Helper()

	resp := w.Result()
	defer func() { _ = resp.Body.Close() }()

	type chunk struct {
		idx int
		val string
	}

	chunks := make(map[string][]chunk)
	paths := make(map[string]string)

	for _, ck := range resp.Cookies() {
		if !strings.HasPrefix(ck.Name, "headlamp-auth-") || ck.Value == "" || ck.MaxAge <= 0 {
			continue
		}

		// Split "headlamp-auth-<cluster>.<chunkIndex>" into cluster name + index.
		name := strings.TrimPrefix(ck.Name, "headlamp-auth-")
		idx := 0

		if dot := strings.LastIndex(name, "."); dot >= 0 {
			if n, err := strconv.Atoi(name[dot+1:]); err == nil {
				idx = n
				name = name[:dot]
			}
		}

		chunks[name] = append(chunks[name], chunk{idx: idx, val: ck.Value})
		paths[name] = ck.Path
	}

	out := make(map[string]broadcastCookieInfo, len(chunks))

	for name, cs := range chunks {
		sort.Slice(cs, func(i, j int) bool { return cs[i].idx < cs[j].idx })

		var b strings.Builder
		for _, c := range cs {
			b.WriteString(c.val)
		}

		out[name] = broadcastCookieInfo{value: b.String(), path: paths[name]}
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

// newOIDCContextWithUnreadableCA returns a context that advertises OIDC
// (AuthType()=="oidc") but whose OidcConfig() will return an error because
// idp-certificate-authority points at a nonexistent file. Used to verify that
// one misconfigured target does not prevent broadcasting to other matching
// targets.
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
	wantBroadcast []string // clusters expected to receive a cookie
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
			name: "target with unreadable OIDC CA is skipped but others still broadcast",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", testIssuerA, testClientFoo),
				newOIDCContext("dst-good", testIssuerA, testClientFoo),
				newOIDCContextWithUnreadableCA("dst-bad-ca"),
			},
			source:        "src",
			wantBroadcast: []string{"dst-good"},
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

	c := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: store,
				SessionTTL:      3600,
			},
		},
	}

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)

	c.broadcastOIDCToken(w, r, tc.source, testToken)

	got := broadcastCookies(t, w)
	assertBroadcastResult(t, tc, got)
}

func assertBroadcastResult(t *testing.T, tc broadcastTestCase, got map[string]broadcastCookieInfo) {
	t.Helper()

	_, gotSource := got[tc.source]
	assert.Falsef(t, gotSource,
		"source cluster %s must not receive a broadcast cookie", tc.source)

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
		assert.Equalf(t, testToken, info.value,
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
	c := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: store,
				SessionTTL:      3600,
			},
		},
	}

	w := httptest.NewRecorder()
	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)

	// Should not panic even when the source cluster doesn't exist.
	c.broadcastOIDCToken(w, r, "missing", testToken)

	assert.Empty(t, broadcastCookies(t, w))
}
