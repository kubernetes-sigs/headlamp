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

package externalproxy

import (
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRedactURLForLogClearsUserinfo(t *testing.T) {
	t.Parallel()

	parsed, err := url.Parse("https://secret-token@evil.example.com/path?token=abc")
	require.NoError(t, err)

	redacted := redactURLForLog(parsed)
	assert.NotContains(t, redacted, "secret-token")
	assert.NotContains(t, redacted, "token=abc")
	assert.Contains(t, redacted, "evil.example.com")
}
