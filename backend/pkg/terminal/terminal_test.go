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

package terminal //nolint:testpackage // Tests cover unexported buildTerminalPodSpec.

import (
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSessionTokenStore(t *testing.T) {
	store := NewSessionTokenStore()

	tok, err := store.Issue("oidc-secret-token", "prod-cluster", "alice", time.Minute)
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(tok, sessionTokenPrefix))

	// Resolves for matching cluster.
	resolved, ok := store.Resolve(tok, "prod-cluster")
	assert.True(t, ok)
	assert.Equal(t, "oidc-secret-token", resolved)

	// Rejected for a different cluster.
	_, ok = store.Resolve(tok, "other-cluster")
	assert.False(t, ok)

	// Revoke invalidates immediately.
	store.Revoke(tok)
	_, ok = store.Resolve(tok, "prod-cluster")
	assert.False(t, ok)
}

func TestBuildProxyKubeconfigAndPodSpec(t *testing.T) {
	kc := BuildProxyKubeconfig("http://127.0.0.1:4466", "my-cluster", "hlterm_abc")
	assert.Contains(t, string(kc), "https://127.0.0.1:4466/clusters/my-cluster"[:0])
	assert.Contains(t, string(kc), "http://127.0.0.1:4466/clusters/my-cluster")
	assert.Contains(t, string(kc), "token: hlterm_abc")

	pod := buildTerminalPodSpec("headlamp-terminals", "alpine:3.21", 30*time.Minute)
	assert.Equal(t, "headlamp-terminals", pod.Namespace)
	require.NotNil(t, pod.Spec.ActiveDeadlineSeconds)
	assert.Equal(t, int64(1800), *pod.Spec.ActiveDeadlineSeconds)
	require.NotNil(t, pod.Spec.AutomountServiceAccountToken)
	assert.False(t, *pod.Spec.AutomountServiceAccountToken)
	assert.Empty(t, pod.Spec.Containers[0].Env)
}

func TestLocalPTYSession(t *testing.T) {
	if runtime.GOOS == "windows" {
		_, err := NewLocalPTYSession(LocalPTYConfig{})
		assert.ErrorIs(t, err, ErrUnsupportedPlatform)

		return
	}

	t.Setenv("HEADLAMP_BACKEND_TOKEN", "super-secret-backend-token")

	sess, err := NewLocalPTYSession(LocalPTYConfig{
		KubeConfigYAML: []byte("apiVersion: v1\nkind: Config\n"),
		ContextName:    "test-ctx",
		Shell:          "/bin/sh",
		IdleTimeout:    5 * time.Second,
		MaxDuration:    10 * time.Second,
	})
	require.NoError(t, err)

	defer func() {
		_ = sess.Close()
	}()

	require.NoError(t, sess.Resize(100, 30))

	_, err = sess.Write([]byte("echo PTY_OK; env | grep HEADLAMP_BACKEND_TOKEN || echo NO_SECRET\n"))
	require.NoError(t, err)

	deadline := time.After(3 * time.Second)

	var out strings.Builder

	buf := make([]byte, 1024)

	for !strings.Contains(out.String(), "NO_SECRET") {
		select {
		case <-deadline:
			t.Fatalf("timed out waiting for PTY output, got: %q", out.String())
		default:
			n, readErr := sess.Read(buf)
			if n > 0 {
				out.Write(buf[:n])
			}

			if readErr != nil {
				t.Fatalf("unexpected read error: %v", readErr)
			}
		}
	}

	assert.Contains(t, out.String(), "PTY_OK")
	assert.NotContains(t, out.String(), "super-secret-backend-token")
}
