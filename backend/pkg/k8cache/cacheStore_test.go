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

package k8cache_test

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
)

// MockCache is struct which help to mock caching for testing purpose.
type MockCache struct {
	mu    sync.RWMutex
	store map[string]string
	err   error
}

// NewMockCache Helps to initialize cache struct for tests.
func NewMockCache() *MockCache {
	return &MockCache{
		store: make(map[string]string),
	}
}

// Set mocks storing of value with its corresponding key string.
func (m *MockCache) Set(ctx context.Context, key, value string) error {
	if m.err != nil {
		return m.err
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.store[key] = value

	return nil
}

// SetWithTTL Mocks storing of value with its corresponding key string with time-to-live.
func (m *MockCache) SetWithTTL(ctx context.Context, key, value string, ttl time.Duration) error {
	return m.Set(ctx, key, value)
}

// Delete Mocks deleting value with the help of key string.
func (m *MockCache) Delete(ctx context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.store, key)

	return nil
}

// Get Mocks retrieval of value with its corresponding key string.
func (m *MockCache) Get(ctx context.Context, key string) (string, error) {
	if m.err != nil {
		return "", m.err
	}

	m.mu.RLock()
	defer m.mu.RUnlock()
	val, ok := m.store[key]

	if !ok {
		return "", errors.New("not found")
	}

	return val, nil
}

// GetAll Mocks retrieving all the values inside the cache.
func (m *MockCache) GetAll(ctx context.Context, selectFunc cache.Matcher) (map[string]string, error) {
	return nil, nil
}

// UpdateTTL Mocks updating of time-to-live with the help of its corresponding key string.
func (m *MockCache) UpdateTTL(ctx context.Context, key string, ttl time.Duration) error {
	return nil
}

// TestGetResponseBody checks that the response body is correctly decoded
// based on the content encoding (e.g., gzip).
func TestGetResponseBody(t *testing.T) {
	tests := []struct {
		name            string
		bodyBytes       []byte
		contentEncoding string
		expectedBody    string
		expectError     bool
	}{
		{
			name: "valid gzip response",
			bodyBytes: func() []byte {
				var buf bytes.Buffer
				gz := gzip.NewWriter(&buf)

				_, _ = gz.Write([]byte("test-response"))
				gz.Close()
				return buf.Bytes()
			}(),
			contentEncoding: "gzip",
			expectedBody:    "test-response",
			expectError:     false,
		},
		{
			name: "empty gzip response",
			bodyBytes: func() []byte {
				var buf bytes.Buffer
				gz := gzip.NewWriter(&buf)
				gz.Close()
				return buf.Bytes()
			}(),
			contentEncoding: "gzip",
			expectedBody:    "",
			expectError:     false,
		},
		{
			name:            "invalid gzip data - should return error",
			bodyBytes:       []byte("not-gzip-data"),
			contentEncoding: "gzip",
			expectedBody:    "",
			expectError:     true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			body, err := k8cache.GetResponseBody(tc.bodyBytes, tc.contentEncoding)

			if tc.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tc.expectedBody, body)
			}
		})
	}
}

// TestGetAPIGroup tests whether the GetAPIGroup returning correct
// apiGroup and version from the URL.
func TestGetAPIGroup(t *testing.T) {
	tests := []struct {
		name             string
		urlPath          string
		expectedAPIGroup string
		expectedVersion  string
		expectedError    error
	}{
		{
			name:             "return non-empty apiGroup and version",
			urlPath:          "/clusters/kind-kind/apis/metrics.k8s.io/v1beta1/pods",
			expectedAPIGroup: "metrics.k8s.io",
			expectedVersion:  "v1beta1",
			expectedError:    nil,
		},
		{
			name:             "return empty apiGroup",
			urlPath:          "/clusters/kind-kind/api/v1/pods",
			expectedAPIGroup: "",
			expectedVersion:  "v1",
			expectedError:    nil,
		},
		{
			name:             "invalid url format",
			urlPath:          "/clusters/kind-kind",
			expectedAPIGroup: "",
			expectedVersion:  "",
			expectedError:    fmt.Errorf("invalid url format"),
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			apiGroup, version, err := k8cache.GetAPIGroup(tc.urlPath)
			assert.Equal(t, tc.expectedAPIGroup, apiGroup)
			assert.Equal(t, tc.expectedError, err)
			assert.Equal(t, tc.expectedVersion, version)
		})
	}
}
