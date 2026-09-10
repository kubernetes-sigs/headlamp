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

// Package testutil holds small test-only helpers shared across the backend's
// package boundaries (internal/ so it's never importable outside this module).
package testutil

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

// MakeUnsignedJWT builds a JWT-shaped (but unsigned) token for tests that only need
// to exercise claim decoding, not signature verification. Production code never
// re-verifies a token's signature after the initial OIDC login/callback validated
// it, so an unsigned fixture is sufficient wherever a test only needs realistic
// claims to decode.
func MakeUnsignedJWT(t *testing.T, claims map[string]interface{}) string {
	t.Helper()

	header := map[string]string{"alg": "none", "typ": "JWT"}

	headerJSON, err := json.Marshal(header)
	require.NoError(t, err)

	claimsJSON, err := json.Marshal(claims)
	require.NoError(t, err)

	return fmt.Sprintf("%s.%s.signature",
		base64.RawURLEncoding.EncodeToString(headerJSON),
		base64.RawURLEncoding.EncodeToString(claimsJSON),
	)
}
