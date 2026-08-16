// Copyright 2025 The Kubernetes Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package transfer_test

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/transfer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDownloadFromPodErrors(t *testing.T) {
	mockCtx := &kubeconfig.Context{
		Name: "test-cluster",
	}

	t.Run("empty file path should still attempt exec and fail at REST config", func(t *testing.T) {
		store := &MockContextStore{MockContext: mockCtx}

		err := transfer.DownloadFromPod(
			context.Background(), store,
			"cluster", "ns", "pod", "container", "", "token", io.Discard,
		)
		assert.Error(t, err, "Expected error for empty file path, got nil")
	})

	t.Run("missing cluster context should return error", func(t *testing.T) {
		store := &MockContextStore{
			MockContext: mockCtx,
			ShouldError: true,
			ErrorMsg:    errClusterNotFound,
		}

		err := transfer.DownloadFromPod(
			context.Background(), store,
			"non-existent", "ns", "pod", "container", "/path", "token", io.Discard,
		)
		require.Error(t, err)
		assert.Equal(t, errClusterNotFound, err.Error())
	})
}

func TestUploadToPodErrors(t *testing.T) {
	mockCtx := &kubeconfig.Context{
		Name: "test-cluster",
	}

	t.Run("missing cluster context should return error", func(t *testing.T) {
		store := &MockContextStore{
			MockContext: mockCtx,
			ShouldError: true,
			ErrorMsg:    errClusterNotFound,
		}

		err := transfer.UploadToPod(
			context.Background(), store,
			"non-existent", "ns", "pod", "container", "/tmp/file.txt", "token", nil,
		)
		require.Error(t, err)
		assert.Equal(t, errClusterNotFound, err.Error())
	})

	t.Run("successful store lookup but invalid REST config should return error", func(t *testing.T) {
		store := &MockContextStore{MockContext: mockCtx}

		err := transfer.UploadToPod(
			context.Background(), store,
			"cluster", "ns", "pod", "container", "/tmp/file.txt", "token", nil,
		)
		assert.Error(t, err, "Expected error for invalid REST config, got nil")
	})
}

func TestVerifyDownloadTargetErrors(t *testing.T) {
	mockCtx := &kubeconfig.Context{
		Name: "test-cluster",
	}

	t.Run("missing cluster context should return error", func(t *testing.T) {
		store := &MockContextStore{
			MockContext: mockCtx,
			ShouldError: true,
			ErrorMsg:    errClusterNotFound,
		}

		err := transfer.VerifyDownloadTarget(
			context.Background(), store,
			"non-existent", "ns", "pod", "container", "/tmp/file", "token",
		)
		require.Error(t, err)
		assert.Equal(t, errClusterNotFound, err.Error())
	})

	t.Run("invalid REST config should return error", func(t *testing.T) {
		store := &MockContextStore{MockContext: mockCtx}

		err := transfer.VerifyDownloadTarget(
			context.Background(), store,
			"cluster", "ns", "pod", "container", "/tmp/file", "token",
		)
		assert.Error(t, err, "Expected error for invalid REST config, got nil")
	})
}

func TestVerifyUploadTargetErrors(t *testing.T) {
	mockCtx := &kubeconfig.Context{
		Name: "test-cluster",
	}

	t.Run("missing cluster context should return error", func(t *testing.T) {
		store := &MockContextStore{
			MockContext: mockCtx,
			ShouldError: true,
			ErrorMsg:    errClusterNotFound,
		}

		err := transfer.VerifyUploadTarget(
			context.Background(), store,
			"non-existent", "ns", "pod", "container", "/tmp/file.txt", "token",
		)
		require.Error(t, err)
		assert.Equal(t, errClusterNotFound, err.Error())
	})

	t.Run("invalid REST config should return error", func(t *testing.T) {
		store := &MockContextStore{MockContext: mockCtx}

		err := transfer.VerifyUploadTarget(
			context.Background(), store,
			"cluster", "ns", "pod", "container", "/tmp/file.txt", "token",
		)
		assert.Error(t, err, "Expected error for invalid REST config, got nil")
	})
}

//nolint:funlen
func TestFileTransferScenariosWithMockServer(t *testing.T) {
	// Setup a mock HTTP server to simulate Kubernetes pod exec endpoints
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Contains(t, r.URL.Path, "/exec")
		assert.Equal(t, "test-container", r.URL.Query().Get("container"))

		// Return 400 Bad Request if SPDY handshake fails, confirming exec endpoint was invoked
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("mock exec response"))
	}))
	defer server.Close()

	mockCtx := createMockContextWithServer(server.URL)
	store := &MockContextStore{MockContext: mockCtx}

	t.Run("DownloadFromPod invokes exec endpoint for file path with special characters", func(t *testing.T) {
		var out bytes.Buffer

		specialPath := "/tmp/dir with spaces & (1)/my file #1.txt"

		err := transfer.DownloadFromPod(
			context.Background(), store,
			"test-cluster", "default", "test-pod", "test-container",
			specialPath, "token", &out,
		)

		// Under mock HTTP server (non-SPDY upgrade), remotecommand returns error after contacting server
		assert.Error(t, err)
	})

	t.Run("UploadToPod handles empty file upload", func(t *testing.T) {
		emptyReader := strings.NewReader("")

		err := transfer.UploadToPod(
			context.Background(), store,
			"test-cluster", "default", "test-pod", "test-container",
			"/tmp/empty.txt", "token", emptyReader,
		)

		assert.Error(t, err)
	})

	t.Run("UploadToPod handles large file streaming", func(t *testing.T) {
		largeData := bytes.Repeat([]byte("A"), 64*1024)
		largeReader := bytes.NewReader(largeData)

		err := transfer.UploadToPod(
			context.Background(), store,
			"test-cluster", "default", "test-pod", "test-container",
			"/tmp/large-file.bin", "token", largeReader,
		)

		assert.Error(t, err)
	})

	t.Run("UploadToPod handles special characters and subdirectories in target path", func(t *testing.T) {
		body := strings.NewReader("sample text content")

		err := transfer.UploadToPod(
			context.Background(), store,
			"test-cluster", "default", "test-pod", "test-container",
			"/tmp/sub dir/my file (copy) $1.txt", "token", body,
		)

		assert.Error(t, err)
	})

	t.Run("VerifyDownloadTarget executes check command against mock server", func(t *testing.T) {
		err := transfer.VerifyDownloadTarget(
			context.Background(), store,
			"test-cluster", "default", "test-pod", "test-container",
			"/tmp/check-file.txt", "token",
		)

		assert.Error(t, err)
	})

	t.Run("VerifyUploadTarget executes check command against mock server", func(t *testing.T) {
		err := transfer.VerifyUploadTarget(
			context.Background(), store,
			"test-cluster", "default", "test-pod", "test-container",
			"/tmp/sub dir/target.txt", "token",
		)

		assert.Error(t, err)
	})
}
