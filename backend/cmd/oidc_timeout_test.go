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
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// handlerDeadline is how long the tests wait for a handler that should give up much sooner.
const handlerDeadline = 5 * time.Second

// shortenOIDCRequestTimeout makes the identity provider timeout short for the test.
func shortenOIDCRequestTimeout(t *testing.T) {
	t.Helper()

	previous := oidcRequestTimeout
	oidcRequestTimeout = 200 * time.Millisecond

	t.Cleanup(func() { oidcRequestTimeout = previous })
}

// serveInBackground runs the request so a handler that never returns cannot hang the test.
func serveInBackground(handler http.Handler, target string) <-chan *httptest.ResponseRecorder {
	done := make(chan *httptest.ResponseRecorder, 1)

	go func() {
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, httptest.NewRequestWithContext(context.Background(), http.MethodGet, target, nil))

		done <- rr
	}()

	return done
}

// TestOIDCStart_TimesOutWhenIdPNeverResponds covers an identity provider that accepts the
// connection for discovery but never answers.
func TestOIDCStart_TimesOutWhenIdPNeverResponds(t *testing.T) {
	shortenOIDCRequestTimeout(t)

	release := make(chan struct{})

	stalledIdP := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		<-release
	}))
	t.Cleanup(stalledIdP.Close)
	// Registered last, so it runs first and lets the blocked handlers return before Close.
	t.Cleanup(func() { close(release) })

	handler, cluster := newOIDCTestHandler(t, &oidcTestServer{server: stalledIdP})

	select {
	case rr := <-serveInBackground(handler, "/oidc?cluster="+cluster):
		assert.GreaterOrEqual(t, rr.Code, http.StatusInternalServerError,
			"an unresponsive identity provider should give an error status")
	case <-time.After(handlerDeadline):
		t.Fatal("GET /oidc did not return although the identity provider never answered discovery")
	}
}

// TestOIDCCallback_TimesOutWhenTokenEndpointNeverResponds covers an identity provider whose
// discovery works but whose token endpoint never answers.
func TestOIDCCallback_TimesOutWhenTokenEndpointNeverResponds(t *testing.T) {
	shortenOIDCRequestTimeout(t)

	release := make(chan struct{})

	oidcSrv := newOIDCTestServer(t, func(_ http.ResponseWriter, _ *http.Request) { <-release })
	// Registered after the server's own cleanup, so it runs first and unblocks /token.
	t.Cleanup(func() { close(release) })

	handler, cluster := newOIDCTestHandler(t, oidcSrv)
	state := extractState(t, driveOIDCStart(t, handler, cluster))

	select {
	case rr := <-serveInBackground(handler, fmt.Sprintf("/oidc-callback?state=%s&code=%s", state, testAuthCode)):
		assert.Equal(t, http.StatusInternalServerError, rr.Code,
			"an unresponsive token endpoint should give an error status")
	case <-time.After(handlerDeadline):
		t.Fatal("GET /oidc-callback did not return although the token endpoint never answered")
	}
}
