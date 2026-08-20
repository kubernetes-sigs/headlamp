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
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

// newBlockingOIDCServer builds a minimal OIDC discovery + token server.
// The token handler calls onEnter() when it is first invoked, then blocks on
// gate before writing its response. This lets tests synchronise concurrent
// callers to maximise contention through the singleflight group.
func newBlockingOIDCServer(
	t *testing.T,
	idToken string,
	onEnter func(),
	gate <-chan struct{},
) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		cfg := map[string]any{
			"issuer":         srv.URL,
			"token_endpoint": srv.URL + "/token",
			"jwks_uri":       srv.URL + "/jwks",
		}
		if err := json.NewEncoder(w).Encode(cfg); err != nil {
			t.Errorf("encode discovery: %v", err)
		}
	})

	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if _, err := w.Write([]byte(`{"keys":[]}`)); err != nil {
			t.Errorf("write jwks: %v", err)
		}
	})

	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		if onEnter != nil {
			onEnter()
		}

		<-gate // block until test releases the gate

		body := map[string]any{
			"access_token":  "AT",
			"token_type":    "Bearer",
			"expires_in":    3600,
			"refresh_token": "REFRESH_NEW",
			"id_token":      idToken,
		}
		w.Header().Set("Content-Type", "application/json")

		if err := json.NewEncoder(w).Encode(body); err != nil {
			t.Errorf("encode token response: %v", err)
		}
	})

	return srv
}

// seedCache stores oldToken -> refreshToken in a real, goroutine-safe cache
// and returns it. The real cache is used instead of fakeCache because
// fakeCache's slice appends are not goroutine-safe.
func seedCache(t *testing.T, oldToken, refreshToken string) cache.Cache[interface{}] {
	t.Helper()

	c := cache.New[interface{}]()
	t.Cleanup(func() { _ = c.Close() })

	require.NoError(t, c.Set(context.Background(), "oidc-token-"+oldToken, refreshToken))

	return c
}

// TestRefreshAndCacheNewToken_SingleflightDeduplication verifies that N
// concurrent callers sharing the same token key trigger exactly one outbound
// token-endpoint request, and that every non-cancelled caller receives the
// same refreshed token.
//
// Safe to run under `go test -race`.
func TestRefreshAndCacheNewToken_SingleflightDeduplication(t *testing.T) {
	t.Parallel()

	const (
		numCallers   = 8
		oldToken     = "SF_DEDUP_OLD" // unique key – avoids singleflight collision
		refreshToken = "SF_DEDUP_REFRESH"
		newIDToken   = "SF_DEDUP_NEW_ID"
	)

	var requestCount atomic.Int64

	// allCallersDone is decremented each time a caller has called
	// RefreshAndCacheNewToken (whether waiting or running); once all are in,
	// the gate is opened.
	gate := make(chan struct{})

	srv := newBlockingOIDCServer(t, newIDToken,
		func() {
			requestCount.Add(1)
		},
		gate,
	)

	c := seedCache(t, oldToken, refreshToken)

	oidcCfg := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}

	type callResult struct {
		tok *oauth2.Token
		err error
	}

	results := make([]callResult, numCallers)

	var resultsMu sync.Mutex
	var launchWg sync.WaitGroup

	launchWg.Add(numCallers)

	for i := range numCallers {
		go func() {

			defer launchWg.Done()

			tok, err := auth.RefreshAndCacheNewToken(
				context.Background(),
				oidcCfg,
				c,
				"id_token",
				oldToken,
				srv.URL,
				"",
			)

			resultsMu.Lock()
			results[i] = callResult{tok: tok, err: err}
			resultsMu.Unlock()
		}()
	}

	time.Sleep(100 * time.Millisecond)
	close(gate)

	// Wait for all goroutines to finish, with a generous timeout.
	done := make(chan struct{})
	go func() {
		launchWg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(15 * time.Second):
		t.Fatal("timed out waiting for concurrent callers to complete")
	}

	// 1. Exactly one outbound token-endpoint hit.
	assert.Equal(t, int64(1), requestCount.Load(),
		"expected exactly 1 token-endpoint request across %d concurrent callers", numCallers)

	// 2. Every caller got the refreshed id_token without error.
	resultsMu.Lock()
	defer resultsMu.Unlock()

	for i, r := range results {
		require.NoError(t, r.err, "caller %d got unexpected error", i)
		require.NotNil(t, r.tok, "caller %d got nil token", i)

		idTok, _ := r.tok.Extra("id_token").(string)
		assert.Equal(t, newIDToken, idTok, "caller %d got wrong id_token", i)
	}
}

// TestRefreshAndCacheNewToken_CallerCancelDoesNotAbortSharedRefresh verifies
// that cancelling one caller's context does not cancel the shared refresh
// goroutine: the refresh completes and all remaining callers still get their
// token.
//
// Safe to run under `go test -race`.
func TestRefreshAndCacheNewToken_CallerCancelDoesNotAbortSharedRefresh(t *testing.T) {
	t.Parallel()

	const (
		oldToken     = "SF_CANCEL_OLD" // unique key
		refreshToken = "SF_CANCEL_REFRESH"
		newIDToken   = "SF_CANCEL_NEW_ID"
		numCallers   = 5
	)

	var requestCount atomic.Int64

	// cancellerReady is closed when the token handler is first entered,
	// i.e. the shared refresh goroutine is in-flight and all waiters are queued.
	cancellerReady := make(chan struct{})
	var readyOnce sync.Once

	gate := make(chan struct{})

	srv := newBlockingOIDCServer(t, newIDToken,
		func() {
			requestCount.Add(1)
			readyOnce.Do(func() { close(cancellerReady) })
		},
		gate,
	)

	c := seedCache(t, oldToken, refreshToken)

	oidcCfg := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}

	cancellerCtx, cancelCaller := context.WithCancel(context.Background())

	type callResult struct {
		idToken string
		err     error
	}

	results := make([]callResult, numCallers)

	var resultsMu sync.Mutex
	var wg sync.WaitGroup

	wg.Add(numCallers)

	for i := range numCallers {
		ctx := context.Background()
		if i == 0 {
			ctx = cancellerCtx
		}

		go func(i int) {
			defer wg.Done()

			tok, err := auth.RefreshAndCacheNewToken(
				ctx,
				oidcCfg,
				c,
				"id_token",
				oldToken,
				srv.URL,
				"",
			)

			resultsMu.Lock()
			if err != nil {
				results[i].err = err
			} else if tok != nil {
				results[i].idToken, _ = tok.Extra("id_token").(string)
			}
			resultsMu.Unlock()
		}(i)
	}

	// Wait for the token handler to signal it is in-flight, then cancel caller 0.
	select {
	case <-cancellerReady:
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for token handler to be entered")
	}

	cancelCaller() // cancel caller 0's context
	close(gate)    // unblock the handler so the shared refresh completes

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for all callers to finish")
	}

	// 1. Exactly one token-endpoint hit (the shared refresh ran to completion).
	assert.Equal(t, int64(1), requestCount.Load(), "expected exactly 1 token-endpoint request")

	resultsMu.Lock()
	defer resultsMu.Unlock()

	// 2. Cancelled caller gets a context.Canceled error.
	require.Error(t, results[0].err, "cancelled caller should return an error")
	assert.ErrorIs(t, results[0].err, context.Canceled,
		"expected context.Canceled, got: %v", results[0].err)

	// 3. All other callers received the refreshed token.
	for i := 1; i < numCallers; i++ {
		require.NoError(t, results[i].err, fmt.Sprintf("caller %d should succeed", i))
		assert.Equal(t, newIDToken, results[i].idToken, fmt.Sprintf("caller %d wrong id_token", i))
	}
}
