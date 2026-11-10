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
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

type stubTransport struct{}

func (*stubTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("stub transport")
}

func contextClient(t *testing.T, ctx context.Context) *http.Client {
	t.Helper()

	client, ok := ctx.Value(oauth2.HTTPClient).(*http.Client)
	require.True(t, ok, "the context should carry an HTTP client")

	return client
}

func TestWithClientTimeout(t *testing.T) {
	const timeout = 3 * time.Second

	t.Run("copies the client in the context and keeps its transport", func(t *testing.T) {
		transport := &stubTransport{}
		original := &http.Client{Transport: transport}
		ctx := oidc.ClientContext(context.Background(), original)

		got := contextClient(t, auth.WithClientTimeout(ctx, timeout))

		assert.Equal(t, timeout, got.Timeout)
		assert.Same(t, transport, got.Transport)
		assert.NotSame(t, original, got)
		assert.Zero(t, original.Timeout, "the original client must not change")
		assert.Same(t, original, contextClient(t, ctx), "the original context must not change")
	})

	t.Run("keeps the transport that ConfigureTLSContext installed", func(t *testing.T) {
		skipTLSVerify := true
		ctx := auth.ConfigureTLSContext(context.Background(), &skipTLSVerify, nil)
		configured := contextClient(t, ctx)

		got := contextClient(t, auth.WithClientTimeout(ctx, timeout))

		assert.Equal(t, timeout, got.Timeout)
		assert.Same(t, configured.Transport, got.Transport)
		assert.Zero(t, configured.Timeout)
	})

	t.Run("falls back to a copy of the default client", func(t *testing.T) {
		got := contextClient(t, auth.WithClientTimeout(context.Background(), timeout))

		assert.Equal(t, timeout, got.Timeout)
		assert.NotSame(t, http.DefaultClient, got)
		assert.Zero(t, http.DefaultClient.Timeout, "the default client must not change")
	})
}
