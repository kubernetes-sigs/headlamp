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

package k8cache

import (
	"context"
	"sync"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
)

// metricsRef holds an optional reference to the telemetry Metrics instance.
// It is set once at startup via SetMetrics and read concurrently from request
// handlers, so access is guarded by metricsOnce / sync.Once semantics.
//
//nolint:gochecknoglobals // injected once at startup; read-only after init
var (
	metricsRef  *telemetry.Metrics
	metricsOnce sync.Once
)

// SetMetrics injects the telemetry Metrics instance into the k8cache package.
// It must be called once during server startup, before any requests are served.
// Subsequent calls are silently ignored.
func SetMetrics(m *telemetry.Metrics) {
	metricsOnce.Do(func() {
		metricsRef = m
	})
}

// recordCacheHit increments the cache hit counter. It is a no-op when
// telemetry is disabled (metricsRef is nil).
func recordCacheHit(ctx context.Context) {
	if metricsRef != nil && metricsRef.CacheHitCount != nil {
		metricsRef.CacheHitCount.Add(ctx, 1)
	}
}

// recordCacheMiss increments the cache miss counter. It is a no-op when
// telemetry is disabled (metricsRef is nil).
func recordCacheMiss(ctx context.Context) {
	if metricsRef != nil && metricsRef.CacheMissCount != nil {
		metricsRef.CacheMissCount.Add(ctx, 1)
	}
}

// recordSSARDuration records the duration of a SelfSubjectAccessReview API
// call. It is a no-op when telemetry is disabled (metricsRef is nil).
func recordSSARDuration(ctx context.Context, d time.Duration) {
	if metricsRef != nil && metricsRef.SSARDuration != nil {
		metricsRef.SSARDuration.Record(ctx, d.Seconds())
	}
}
