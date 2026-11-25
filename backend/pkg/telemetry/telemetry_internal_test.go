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

package telemetry

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
)

func preserveOtelGlobals(t *testing.T) {
	t.Helper()

	origTP := otel.GetTracerProvider()
	origMP := otel.GetMeterProvider()
	origProp := otel.GetTextMapPropagator()

	t.Cleanup(func() {
		otel.SetTracerProvider(origTP)
		otel.SetMeterProvider(origMP)
		otel.SetTextMapPropagator(origProp)
	})
}

func TestNewTelemetryWithTracingAndMetrics(t *testing.T) {
	t.Run("enabled tracing stdout and metrics", func(t *testing.T) {
		preserveOtelGlobals(t)

		tr := true
		ver := "1.0.0"
		rate := 0.5
		useStdout := true

		tel, err := NewTelemetry(cfg.Config{
			ServiceName:        "headlamp-test",
			ServiceVersion:     &ver,
			TracingEnabled:     &tr,
			MetricsEnabled:     &tr,
			SamplingRate:       &rate,
			StdoutTraceEnabled: &useStdout,
		})
		require.NoError(t, err)
		require.NotNil(t, tel)
		require.NotNil(t, tel.tracerProvider)
		require.NotNil(t, tel.meterProvider)
		require.NoError(t, tel.Shutdown(context.Background()))
	})

	t.Run("createSampler edge rates", func(t *testing.T) {
		assert.NotNil(t, createSampler(1.0))
		assert.NotNil(t, createSampler(0.0))
		assert.NotNil(t, createSampler(0.25))
	})

	t.Run("NewTelemetry rejects empty service name and handles OTLP/Jaeger", func(t *testing.T) {
		preserveOtelGlobals(t)

		_, err := NewTelemetry(cfg.Config{})
		require.Error(t, err)

		tr := true
		fa := false
		ver := "1.0.0"
		rate := 1.0
		otlp := "http://127.0.0.1:4318"
		jaeger := "http://127.0.0.1:14268/api/traces"

		tel, err := NewTelemetry(cfg.Config{
			ServiceName:    "headlamp-otlp",
			ServiceVersion: &ver,
			TracingEnabled: &tr,
			MetricsEnabled: &fa,
			SamplingRate:   &rate,
			OTLPEndpoint:   &otlp,
			JaegerEndpoint: &jaeger,
			UseOTLPHTTP:    &tr,
		})
		require.NoError(t, err)
		require.NoError(t, tel.Shutdown(context.Background()))

		exp, errNoExp := createTracingExporter(cfg.Config{})
		require.NoError(t, errNoExp)
		assert.NotNil(t, exp)
	})
}

func TestRequestHandlerRecordingMethods(t *testing.T) {
	preserveOtelGlobals(t)

	tr := true
	ver := "1.0.0"
	rate := 1.0
	useStdout := true

	tel, err := NewTelemetry(cfg.Config{
		ServiceName:        "headlamp-rh",
		ServiceVersion:     &ver,
		TracingEnabled:     &tr,
		MetricsEnabled:     &tr,
		SamplingRate:       &rate,
		StdoutTraceEnabled: &useStdout,
	})
	require.NoError(t, err)

	defer func() { _ = tel.Shutdown(context.Background()) }()

	metrics, err := NewMetrics()
	require.NoError(t, err)

	rh := NewRequestHandler(tel, metrics)
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/pods", nil)

	ctx, span := CreateSpan(context.Background(), req, "test-tracer", "op")
	defer span.End()

	rh.RecordEvent(span, "ev-no-attrs")
	rh.RecordEvent(span, "ev-with-attrs", attribute.String("k", "v"))
	rh.RecordError(span, errors.New("boom"), "err-msg")
	rh.RecordDuration(ctx, time.Now().Add(-time.Millisecond), attribute.String("status", "ok"))
	rh.RecordErrorCount(ctx, attribute.String("err", "test"))
	rh.RecordClusterProxyRequestsCount(ctx, attribute.String("cluster", "c1"))
	rh.RecordRequestCount(ctx, req, attribute.String("route", "pods"))

	var nilRH *RequestHandler
	nilRH.RecordEvent(span, "noop")
	nilRH.RecordError(span, errors.New("noop"), "noop")
	nilRH.RecordDuration(ctx, time.Now())
	nilRH.RecordErrorCount(ctx)
	nilRH.RecordClusterProxyRequestsCount(ctx)
	nilRH.RecordRequestCount(ctx, req)
}
