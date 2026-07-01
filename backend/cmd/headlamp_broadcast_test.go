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
)

// broadcastCookieClusters returns the set of clusters for which a non-empty
// headlamp-auth-* cookie was set on w. Clearing cookies (empty value, negative
// MaxAge emitted by SetTokenCookie's ClearTokenCookie pre-step) are ignored.
func broadcastCookieClusters(t *testing.T, w *httptest.ResponseRecorder) map[string]bool {
	t.Helper()

	resp := w.Result()
	defer func() { _ = resp.Body.Close() }()

	set := make(map[string]bool)

	for _, ck := range resp.Cookies() {
		if !strings.HasPrefix(ck.Name, "headlamp-auth-") || ck.Value == "" || ck.MaxAge <= 0 {
			continue
		}
		// Strip "headlamp-auth-" prefix and ".<chunkIndex>" suffix.
		name := strings.TrimPrefix(ck.Name, "headlamp-auth-")
		if dot := strings.LastIndex(name, "."); dot >= 0 {
			name = name[:dot]
		}

		set[name] = true
	}

	return set
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

	c.broadcastOIDCToken(w, r, tc.source, "test-token")

	got := broadcastCookieClusters(t, w)
	assertBroadcastResult(t, tc, got)
}

func assertBroadcastResult(t *testing.T, tc broadcastTestCase, got map[string]bool) {
	t.Helper()

	assert.Falsef(t, got[tc.source],
		"source cluster %s must not receive a broadcast cookie", tc.source)

	wantSet := make(map[string]bool, len(tc.wantBroadcast))
	for _, e := range tc.wantBroadcast {
		wantSet[e] = true
		assert.Truef(t, got[e], "expected broadcast cookie for %q, got cookies for: %v", e, got)
	}

	for _, ctx := range tc.contexts {
		if ctx.Name == tc.source || wantSet[ctx.Name] {
			continue
		}

		assert.Falsef(t, got[ctx.Name],
			"did not expect broadcast cookie for %q, got cookies for: %v", ctx.Name, got)
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
	c.broadcastOIDCToken(w, r, "missing", "test-token")

	assert.Empty(t, broadcastCookieClusters(t, w))
}
