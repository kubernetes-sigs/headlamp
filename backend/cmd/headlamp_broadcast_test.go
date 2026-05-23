/*
Copyright 2026 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
*/

package main

import (
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

// broadcastCookieClusters returns the set of clusters for which a non-empty
// headlamp-auth-* cookie was set on w. Clearing cookies (empty value, negative
// MaxAge emitted by SetTokenCookie's ClearTokenCookie pre-step) are ignored.
func broadcastCookieClusters(t *testing.T, w *httptest.ResponseRecorder) map[string]bool {
	t.Helper()

	resp := w.Result()
	defer resp.Body.Close()

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

func TestBroadcastOIDCToken(t *testing.T) {
	const (
		issuerA   = "https://idp-a.example.com"
		issuerB   = "https://idp-b.example.com"
		clientFoo = "client-foo"
		clientBar = "client-bar"
	)

	cases := []struct {
		name          string
		contexts      []*kubeconfig.Context
		source        string
		wantBroadcast []string // clusters expected to receive a cookie
	}{
		{
			name: "matching issuer and client_id broadcasts",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", issuerA, clientFoo),
				newOIDCContext("dst-match", issuerA, clientFoo),
			},
			source:        "src",
			wantBroadcast: []string{"dst-match"},
		},
		{
			name: "different issuer does not broadcast",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", issuerA, clientFoo),
				newOIDCContext("dst-other-idp", issuerB, clientFoo),
			},
			source:        "src",
			wantBroadcast: nil,
		},
		{
			name: "different client_id does not broadcast",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", issuerA, clientFoo),
				newOIDCContext("dst-other-client", issuerA, clientBar),
			},
			source:        "src",
			wantBroadcast: nil,
		},
		{
			name: "non-oidc target is skipped",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", issuerA, clientFoo),
				newNonOIDCContext("dst-sa"),
			},
			source:        "src",
			wantBroadcast: nil,
		},
		{
			name: "source without oidc config is a no-op",
			contexts: []*kubeconfig.Context{
				newNonOIDCContext("src"),
				newOIDCContext("dst", issuerA, clientFoo),
			},
			source:        "src",
			wantBroadcast: nil,
		},
		{
			name: "source cluster is never broadcast to itself",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", issuerA, clientFoo),
				newOIDCContext("dst-1", issuerA, clientFoo),
				newOIDCContext("dst-2", issuerA, clientFoo),
			},
			source:        "src",
			wantBroadcast: []string{"dst-1", "dst-2"},
		},
		{
			name: "mixed contexts: only matching ones receive cookie",
			contexts: []*kubeconfig.Context{
				newOIDCContext("src", issuerA, clientFoo),
				newOIDCContext("match-1", issuerA, clientFoo),
				newOIDCContext("mismatch-issuer", issuerB, clientFoo),
				newOIDCContext("mismatch-client", issuerA, clientBar),
				newNonOIDCContext("static"),
				newOIDCContext("match-2", issuerA, clientFoo),
			},
			source:        "src",
			wantBroadcast: []string{"match-1", "match-2"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
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
			r := httptest.NewRequest(http.MethodGet, "/", nil)

			c.broadcastOIDCToken(w, r, tc.source, "test-token")

			got := broadcastCookieClusters(t, w)

			assert.False(t, got[tc.source], "source cluster %s must not receive a broadcast cookie", tc.source)

			for _, expected := range tc.wantBroadcast {
				assert.Truef(t, got[expected], "expected broadcast cookie for %q, got cookies for: %v", expected, got)
			}

			// Any context not in wantBroadcast (and not the source) must not receive a cookie.
			for _, ctx := range tc.contexts {
				if ctx.Name == tc.source {
					continue
				}

				expected := false

				for _, e := range tc.wantBroadcast {
					if e == ctx.Name {
						expected = true
						break
					}
				}

				if !expected {
					assert.Falsef(t, got[ctx.Name],
						"did not expect broadcast cookie for %q, got cookies for: %v", ctx.Name, got)
				}
			}
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
	r := httptest.NewRequest(http.MethodGet, "/", nil)

	// Should not panic even when the source cluster doesn't exist.
	c.broadcastOIDCToken(w, r, "missing", "test-token")

	assert.Empty(t, broadcastCookieClusters(t, w))
}
