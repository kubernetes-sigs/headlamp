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

package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildTelemetryConfig(t *testing.T) {
	conf := &config.Config{
		ServiceName:        "headlamp",
		ServiceVersion:     &[]string{"1.2.3"}[0],
		TracingEnabled:     &[]bool{true}[0],
		MetricsEnabled:     &[]bool{false}[0],
		JaegerEndpoint:     &[]string{"http://localhost:14268"}[0],
		OTLPEndpoint:       &[]string{"localhost:4317"}[0],
		UseOTLPHTTP:        &[]bool{true}[0],
		StdoutTraceEnabled: &[]bool{false}[0],
		SamplingRate:       &[]float64{0.5}[0],
	}

	got := buildTelemetryConfig(conf)

	assert.Equal(t, conf.ServiceName, got.ServiceName)
	assert.Equal(t, conf.ServiceVersion, got.ServiceVersion)
	assert.Equal(t, conf.TracingEnabled, got.TracingEnabled)
	assert.Equal(t, conf.MetricsEnabled, got.MetricsEnabled)
	assert.Equal(t, conf.JaegerEndpoint, got.JaegerEndpoint)
	assert.Equal(t, conf.OTLPEndpoint, got.OTLPEndpoint)
	assert.Equal(t, conf.UseOTLPHTTP, got.UseOTLPHTTP)
	assert.Equal(t, conf.StdoutTraceEnabled, got.StdoutTraceEnabled)
	assert.Equal(t, conf.SamplingRate, got.SamplingRate)
}

func TestLoadOidcCACert(t *testing.T) {
	assert.Equal(t, "", loadOidcCACert(""), "empty path should return empty string")

	caFile := filepath.Join(t.TempDir(), "ca.crt")
	require.NoError(t, os.WriteFile(caFile, []byte("test-ca-cert"), 0o600))

	assert.Equal(t, "test-ca-cert", loadOidcCACert(caFile))
}
