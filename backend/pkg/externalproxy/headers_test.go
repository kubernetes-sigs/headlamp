/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package externalproxy_test

import (
	"net/http"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/externalproxy"
	"github.com/stretchr/testify/assert"
)

func TestShouldFilterRequestHeader(t *testing.T) {
	t.Parallel()

	filtered := []string{
		"Authorization",
		"Cookie",
		"Proxy-Authorization",
		"X-Headlamp-Backend-Token",
		"X-HEADLAMP_BACKEND-TOKEN",
		"proxy-to",
		"Forward-to",
		"Connection",
		"Upgrade",
		"Accept-Encoding",
	}

	for _, header := range filtered {
		assert.Truef(t, externalproxy.ShouldFilterRequestHeader(header), "expected %s to be filtered", header)
	}

	assert.False(t, externalproxy.ShouldFilterRequestHeader("X-Custom-Preserve"))
}

func TestCopyFilteredHeaders(t *testing.T) {
	t.Parallel()

	src := http.Header{}
	src.Set("proxy-to", "https://example.com")
	src.Set("Authorization", "Bearer secret")
	src.Set("Cookie", "a=b")
	src.Set("X-Headlamp-Custom", "secret")
	src.Set("X-HEADLAMP_BACKEND-TOKEN", "secret")
	src.Set("Connection", "Upgrade, X-Connection-Only")
	src.Set("Upgrade", "websocket")
	src.Set("X-Connection-Only", "drop-me")
	src.Set("X-Custom-Preserve", "keep")

	dst := http.Header{}
	externalproxy.CopyFilteredHeaders(dst, src)

	assert.Equal(t, "keep", dst.Get("X-Custom-Preserve"))
	assert.Empty(t, dst.Get("Authorization"))
	assert.Empty(t, dst.Get("Cookie"))
	assert.Empty(t, dst.Get("proxy-to"))
	assert.Empty(t, dst.Get("X-Headlamp-Custom"))
	assert.Empty(t, dst.Get("X-HEADLAMP_BACKEND-TOKEN"))
	assert.Empty(t, dst.Get("Upgrade"))
	assert.Empty(t, dst.Get("X-Connection-Only"))
}
