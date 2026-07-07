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
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	k8cache "github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
)

// BenchmarkStoreK8sResponseInCache measures the allocation overhead of storing
// a typical Kubernetes API response in the cache. This exercises the JSON
// marshalling, Failure detection, and cache-write path.
func BenchmarkStoreK8sResponseInCache(b *testing.B) {
	mockCache := NewMockCache()
	targetURL := &url.URL{Path: "/api/v1/pods"}

	// Simulate a realistic pod list response body.
	podListBody := `{"kind":"PodList","apiVersion":"v1",` +
		`"metadata":{"resourceVersion":"54321"},"items":[` +
		`{"metadata":{"name":"nginx-1","namespace":"default"}},` +
		`{"metadata":{"name":"nginx-2","namespace":"default"}},` +
		`{"metadata":{"name":"nginx-3","namespace":"default"}}` +
		`]}`

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		b.StopTimer()

		rw := httptest.NewRecorder()
		rcw := k8cache.NewResponseCapture(rw)

		rcw.WriteHeader(http.StatusOK)
		_, _ = rcw.Write([]byte(podListBody))

		b.StartTimer()

		if err := k8cache.StoreK8sResponseInCache(
			mockCache, targetURL, rcw, "bench-key",
		); err != nil {
			b.Fatal(err)
		}
	}
}

// BenchmarkStoreK8sResponseInCache_FailureSkip measures the early-exit
// path when the response body contains a Kubernetes error status with
// "Failure". After the optimization, this path skips json.Marshal.
func BenchmarkStoreK8sResponseInCache_FailureSkip(b *testing.B) {
	mockCache := NewMockCache()
	targetURL := &url.URL{Path: "/api/v1/pods"}

	failureBody := `{"kind":"Status","apiVersion":"v1",` +
		`"status":"Failure","message":"Forbidden",` +
		`"reason":"Forbidden","code":403}`

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		b.StopTimer()

		rw := httptest.NewRecorder()
		rcw := k8cache.NewResponseCapture(rw)

		rcw.WriteHeader(http.StatusForbidden)
		_, _ = rcw.Write([]byte(failureBody))

		b.StartTimer()

		if err := k8cache.StoreK8sResponseInCache(
			mockCache, targetURL, rcw, "failure-bench-key",
		); err != nil {
			b.Fatal(err)
		}
	}
}

// benchBuildCacheKeySink prevents the compiler from optimizing
// away benchmark work.
var benchBuildCacheKeySink string

// BenchmarkGenerateKey measures the allocation overhead of generating
// cache keys from URL paths and context IDs.
func BenchmarkGenerateKey(b *testing.B) {
	targetURL := &url.URL{
		Path: "/clusters/kind-kind/apis/apps/v1/namespaces/default/deployments",
	}
	contextID := "my-production-cluster"

	b.ResetTimer()
	b.ReportAllocs()

	var err error

	for i := 0; i < b.N; i++ {
		benchBuildCacheKeySink, err = k8cache.GenerateKey(
			targetURL, contextID,
		)
		if err != nil {
			b.Fatal(err)
		}
	}
}
