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
	"context"
	"fmt"
	"io"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/transfer"
)

const errClusterNotFound = "cluster not found"

// MockContextStore is a configurable mock of kubeconfig.ContextStore for testing.
type MockContextStore struct {
	kubeconfig.ContextStore
	MockContext *kubeconfig.Context
	ShouldError bool
	ErrorMsg    string
}

func (m *MockContextStore) GetContext(name string) (*kubeconfig.Context, error) {
	if m.ShouldError {
		msg := errClusterNotFound
		if m.ErrorMsg != "" {
			msg = m.ErrorMsg
		}

		return nil, fmt.Errorf("%s", msg)
	}

	return m.MockContext, nil
}

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
		if err == nil {
			t.Error("Expected error for empty file path, got nil")
		}
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
		if err == nil {
			t.Errorf("Expected error, got nil")
		}

		if err.Error() != errClusterNotFound {
			t.Errorf("Expected error '%s', got '%v'", errClusterNotFound, err)
		}
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
		if err == nil {
			t.Errorf("Expected error, got nil")
		}

		if err.Error() != errClusterNotFound {
			t.Errorf("Expected error '%s', got '%v'", errClusterNotFound, err)
		}
	})

	t.Run("successful store lookup but invalid REST config should return error", func(t *testing.T) {
		store := &MockContextStore{MockContext: mockCtx}

		err := transfer.UploadToPod(
			context.Background(), store,
			"cluster", "ns", "pod", "container", "/tmp/file.txt", "token", nil,
		)
		if err == nil {
			t.Error("Expected error for invalid REST config, got nil")
		}
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
		if err == nil {
			t.Errorf("Expected error, got nil")
		}

		if err.Error() != errClusterNotFound {
			t.Errorf("Expected error '%s', got '%v'", errClusterNotFound, err)
		}
	})

	t.Run("invalid REST config should return error", func(t *testing.T) {
		store := &MockContextStore{MockContext: mockCtx}

		err := transfer.VerifyDownloadTarget(
			context.Background(), store,
			"cluster", "ns", "pod", "container", "/tmp/file", "token",
		)
		if err == nil {
			t.Error("Expected error for invalid REST config, got nil")
		}
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
		if err == nil {
			t.Errorf("Expected error, got nil")
		}

		if err.Error() != errClusterNotFound {
			t.Errorf("Expected error '%s', got '%v'", errClusterNotFound, err)
		}
	})

	t.Run("invalid REST config should return error", func(t *testing.T) {
		store := &MockContextStore{MockContext: mockCtx}

		err := transfer.VerifyUploadTarget(
			context.Background(), store,
			"cluster", "ns", "pod", "container", "/tmp/file.txt", "token",
		)
		if err == nil {
			t.Error("Expected error for invalid REST config, got nil")
		}
	})
}
