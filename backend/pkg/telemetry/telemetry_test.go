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
	"context"
	"testing"
	"time"

	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	tel "github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
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
