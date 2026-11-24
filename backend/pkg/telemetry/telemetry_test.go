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

package telemetry_test

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	tel "github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

func TestNewTelemetry(t *testing.T) { //nolint:funlen // multiple test cases function
	testVersion := "1.0.0"
	sampleRate := 1.0
	emptyStr := ""
	trueVal := true
	falseVal := false

	tests := []struct {
		name          string
		config        cfg.Config
		expectError   bool
		errorContains string
	}{
		{
			name: "valid config",
			config: cfg.Config{
				ServiceName:        "test-service",
				ServiceVersion:     &testVersion,
				TracingEnabled:     &trueVal,
				StdoutTraceEnabled: &trueVal,
				SamplingRate:       &sampleRate,
				MetricsEnabled:     &falseVal,
				JaegerEndpoint:     &emptyStr,
				OTLPEndpoint:       &emptyStr,
				UseOTLPHTTP:        &falseVal,
			},
			expectError: false,
		},
		{
			name: "valid config with metrics",
			config: cfg.Config{
				ServiceName:        "test-service",
				ServiceVersion:     &testVersion,
				TracingEnabled:     &trueVal,
				MetricsEnabled:     &trueVal,
				StdoutTraceEnabled: &trueVal,
				SamplingRate:       &sampleRate,
				JaegerEndpoint:     &emptyStr,
				OTLPEndpoint:       &emptyStr,
				UseOTLPHTTP:        &falseVal,
			},
			expectError: false,
		},
		{
			name: "missing service name",
			config: cfg.Config{
				TracingEnabled:     &trueVal,
				ServiceVersion:     &testVersion,
				SamplingRate:       &sampleRate,
				MetricsEnabled:     &falseVal,
				JaegerEndpoint:     &emptyStr,
				OTLPEndpoint:       &emptyStr,
				UseOTLPHTTP:        &falseVal,
				StdoutTraceEnabled: &falseVal,
			},
			expectError:   true,
			errorContains: "service name cannot be empty",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			telemetry, err := tel.NewTelemetry(tc.config)

			if tc.expectError {
				assert.Error(t, err)

				if tc.errorContains != "" {
					assert.Contains(t, err.Error(), tc.errorContains)
				}

				assert.Nil(t, telemetry)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, telemetry)

				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()

				err = telemetry.Shutdown(ctx)
				assert.NoError(t, err)
			}
		})
	}
}

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()

	origStdout := os.Stdout
	r, w, err := os.Pipe()
	require.NoError(t, err)

	os.Stdout = w

	var buf bytes.Buffer

	done := make(chan error, 1)

	go func() {
		_, copyErr := io.Copy(&buf, r)
		done <- copyErr
	}()

	defer func() {
		os.Stdout = origStdout
		_ = w.Close()
		_ = r.Close()
	}()

	fn()

	os.Stdout = origStdout

	require.NoError(t, w.Close())
	require.NoError(t, <-done)

	return buf.String()
}

func contextWithTraceID(traceID trace.TraceID) context.Context {
	sc := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID: traceID,
		SpanID:  trace.SpanID{1, 0, 0, 0, 0, 0, 0, 1},
		Remote:  true,
	})

	return trace.ContextWithRemoteSpanContext(context.Background(), sc)
}

func TestTelemetrySamplingRates(t *testing.T) {
	testVersion := "1.0.0"
	traceIDLow := trace.TraceID{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1}
	traceIDHigh := trace.TraceID{0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff}

	tests := []struct {
		name         string
		samplingRate float64
		expectLow    bool
		expectHigh   bool
	}{
		{
			name:         "rate 0 never samples",
			samplingRate: 0.0,
			expectLow:    false,
			expectHigh:   false,
		},
		{
			name:         "rate 0.5 samples deterministically by trace ID",
			samplingRate: 0.5,
			expectLow:    true,
			expectHigh:   false,
		},
		{
			name:         "rate 1 always samples",
			samplingRate: 1.0,
			expectLow:    true,
			expectHigh:   true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_ = captureStdout(t, func() {
				tInst, err := tel.NewTelemetry(cfg.Config{
					ServiceName:        "test-service",
					ServiceVersion:     &testVersion,
					TracingEnabled:     new(true),
					StdoutTraceEnabled: new(true),
					SamplingRate:       &tc.samplingRate,
					MetricsEnabled:     new(false),
				})
				require.NoError(t, err)
				require.NotNil(t, tInst)

				tracer := otel.Tracer("sampling-test")

				_, lowSpan := tracer.Start(contextWithTraceID(traceIDLow), "low-trace")
				assert.Equal(t, tc.expectLow, lowSpan.SpanContext().IsSampled())
				lowSpan.End()

				_, highSpan := tracer.Start(contextWithTraceID(traceIDHigh), "high-trace")
				assert.Equal(t, tc.expectHigh, highSpan.SpanContext().IsSampled())
				highSpan.End()

				assert.NoError(t, tInst.Shutdown(context.Background()))
			})
		})
	}
}

func TestNewTelemetryOTLPHTTPExporter(t *testing.T) {
	testVersion := "1.0.0"

	var (
		requestCount atomic.Int32
		lastPath     atomic.Value
		lastBodyLen  atomic.Int32
	)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err == nil {
			lastBodyLen.Store(int32(len(body))) //nolint:gosec // test payload is small
		}

		lastPath.Store(r.URL.Path)
		requestCount.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	otlpEndpoint := strings.TrimPrefix(srv.URL, "http://")

	stdout := captureStdout(t, func() {
		tInst, err := tel.NewTelemetry(cfg.Config{
			ServiceName:        "test-service",
			ServiceVersion:     &testVersion,
			TracingEnabled:     new(true),
			StdoutTraceEnabled: new(false),
			UseOTLPHTTP:        new(true),
			OTLPEndpoint:       &otlpEndpoint,
			SamplingRate:       new(1.0),
			MetricsEnabled:     new(false),
		})
		require.NoError(t, err)

		_, span := otel.Tracer("otlp-http-test").Start(context.Background(), "otlp-http-span")
		assert.True(t, span.SpanContext().IsSampled())
		span.End()

		assert.NoError(t, tInst.Shutdown(context.Background()))
	})

	assert.Empty(t, stdout)
	assert.GreaterOrEqual(t, requestCount.Load(), int32(1))
	assert.Equal(t, "/v1/traces", lastPath.Load())
	assert.Greater(t, lastBodyLen.Load(), int32(0))
}

func TestNewTelemetryJaegerFallbackToOTLPGRPC(t *testing.T) {
	testVersion := "1.0.0"
	jaegerEndpoint := "127.0.0.1:4317"

	stdout := captureStdout(t, func() {
		tInst, err := tel.NewTelemetry(cfg.Config{
			ServiceName:        "test-service",
			ServiceVersion:     &testVersion,
			TracingEnabled:     new(true),
			StdoutTraceEnabled: new(false),
			UseOTLPHTTP:        new(false),
			JaegerEndpoint:     &jaegerEndpoint,
			SamplingRate:       new(0.0),
			MetricsEnabled:     new(false),
		})
		require.NoError(t, err)

		_, span := otel.Tracer("jaeger-test").Start(context.Background(), "never-sampled-span")
		assert.False(t, span.SpanContext().IsSampled())
		span.End()

		assert.NoError(t, tInst.Shutdown(context.Background()))
	})

	assert.Empty(t, stdout)
}

func TestNewTelemetryMultipleExportersSelectsStdout(t *testing.T) {
	testVersion := "1.0.0"

	var otlpRequests atomic.Int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		otlpRequests.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	otlpEndpoint := strings.TrimPrefix(srv.URL, "http://")
	jaegerEndpoint := "127.0.0.1:4317"

	stdout := captureStdout(t, func() {
		tInst, err := tel.NewTelemetry(cfg.Config{
			ServiceName:        "test-service",
			ServiceVersion:     &testVersion,
			TracingEnabled:     new(true),
			StdoutTraceEnabled: new(true),
			UseOTLPHTTP:        new(true),
			OTLPEndpoint:       &otlpEndpoint,
			JaegerEndpoint:     &jaegerEndpoint,
			SamplingRate:       new(1.0),
			MetricsEnabled:     new(false),
		})
		require.NoError(t, err)

		_, span := otel.Tracer("stdout-priority-test").Start(context.Background(), "stdout-selected-span")
		assert.True(t, span.SpanContext().IsSampled())
		span.End()

		assert.NoError(t, tInst.Shutdown(context.Background()))
	})

	assert.Contains(t, stdout, "stdout-selected-span")
	assert.Contains(t, stdout, "test-service")
	assert.Equal(t, int32(0), otlpRequests.Load())
}

func TestTelemetryDisabledAndZeroValueShutdown(t *testing.T) {
	testVersion := "1.0.0"

	tInst, err := tel.NewTelemetry(cfg.Config{
		ServiceName:    "test-service",
		ServiceVersion: &testVersion,
		TracingEnabled: new(false),
		MetricsEnabled: new(false),
	})
	assert.NoError(t, err)
	assert.NoError(t, tInst.Shutdown(context.Background()))

	var empty tel.Telemetry
	assert.NoError(t, empty.Shutdown(context.Background()))
}
