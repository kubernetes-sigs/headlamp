//go:build !windows

package main

import (
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveFavicon_FIFODoesNotBlock(t *testing.T) {
	// Opening a FIFO with no writer blocks, so it must be rejected before open.
	path := filepath.Join(t.TempDir(), "favicon.png")
	require.NoError(t, syscall.Mkfifo(path, 0o600))

	done := make(chan bool, 1)

	go func() {
		_, _, ok := resolveFavicon(faviconTestConfig(path, ""))
		done <- ok
	}()

	select {
	case ok := <-done:
		assert.False(t, ok)
	case <-time.After(5 * time.Second):
		t.Fatal("resolveFavicon blocked on a FIFO")
	}
}
