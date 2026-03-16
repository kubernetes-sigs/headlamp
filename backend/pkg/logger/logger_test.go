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

package logger_test

import (
	"fmt"
	"os"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/rs/zerolog"
)

var capturedLogs []string

// MockLog is a mock logging function for testing.
func MockLog(level uint, str map[string]string, err interface{}, msg string) {
	logMessage := fmt.Sprintf(`{"level":%d, "message":"%s"}`, level, msg)
	capturedLogs = append(capturedLogs, logMessage)
}

func TestLog(t *testing.T) {
	t.Parallel()

	// Replace the actual logging function with the mock one
	originalLogFunc := logger.SetLogFunc(MockLog)
	defer logger.SetLogFunc(originalLogFunc)

	tests := []struct {
		name  string
		level uint
		str   map[string]string
		err   interface{}
		msg   string
	}{
		{
			name:  "TestInfoLog",
			level: logger.LevelInfo,
			str:   map[string]string{"key": "value"},
			err:   nil,
			msg:   "Test Info Log",
		},
		{
			name:  "TestWarnLog",
			level: logger.LevelWarn,
			str:   map[string]string{"key": "value"},
			err:   nil,
			msg:   "Test Warn Log",
		},
		{
			name:  "TestErrorLog",
			level: logger.LevelError,
			str:   map[string]string{"key": "value"},
			err:   nil,
			msg:   "Test Error Log",
		},
	}

	// Call the Log function
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			logger.Log(test.level, test.str, test.err, test.msg)

			expectedLog := fmt.Sprintf(`{"level":%d, "message":"%s"}`, test.level, test.msg)
			if len(capturedLogs) != 1 || capturedLogs[0] != expectedLog {
				t.Errorf("unexpected log output:\n\texpected: %s\n\tgot: %s", expectedLog, capturedLogs)
			}
		})

		// Reset capturedLogs for the next test case
		capturedLogs = nil
	}
}

// Sets global log level from HEADLAMP_CONFIG_LOG_LEVEL.
func TestLogLevelsFromEnv(t *testing.T) {
	orig := zerolog.GlobalLevel()

	t.Cleanup(func() {
		zerolog.SetGlobalLevel(orig)
	})

	tests := []struct {
		name     string
		envValue string
		expected zerolog.Level
	}{
		{"debug lowercase", "debug", zerolog.DebugLevel},
		{"info lowercase", "info", zerolog.InfoLevel},
		{"warn lowercase", "warn", zerolog.WarnLevel},
		{"error lowercase", "error", zerolog.ErrorLevel},

		{"uppercase INFO", "INFO", zerolog.InfoLevel},
		{"mixed case Info", "Info", zerolog.InfoLevel},

		{"leading whitespace", "   warn", zerolog.WarnLevel},
		{"trailing whitespace", "error   ", zerolog.ErrorLevel},
		{"both sides whitespace", "  debug  ", zerolog.DebugLevel},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("HEADLAMP_CONFIG_LOG_LEVEL", tt.envValue)

			logger.Init(os.Getenv("HEADLAMP_CONFIG_LOG_LEVEL"))

			if got := zerolog.GlobalLevel(); got != tt.expected {
				t.Fatalf("expected %v, got %v", tt.expected, got)
			}
		})
	}
}

// Falls back to info on invalid log level.
func TestInvalidLevelDefaultsToInfo(t *testing.T) {
	orig := zerolog.GlobalLevel()

	t.Cleanup(func() {
		zerolog.SetGlobalLevel(orig)
	})

	t.Setenv("HEADLAMP_CONFIG_LOG_LEVEL", "not-a-level")

	logger.Init(os.Getenv("HEADLAMP_CONFIG_LOG_LEVEL"))

	if got := zerolog.GlobalLevel(); got != zerolog.InfoLevel {
		t.Fatalf("expected fallback to info, got %v", got)
	}
}

// Defaults to info when env is empty or missing.
func TestEmptyOrMissingEnvDefaultsToInfo(t *testing.T) {
	orig := zerolog.GlobalLevel()

	t.Cleanup(func() {
		zerolog.SetGlobalLevel(orig)
	})

	t.Run("empty", func(t *testing.T) {
		t.Setenv("HEADLAMP_CONFIG_LOG_LEVEL", "")
		logger.Init(os.Getenv("HEADLAMP_CONFIG_LOG_LEVEL"))

		if zerolog.GlobalLevel() != zerolog.InfoLevel {
			t.Fatalf("expected info for empty env")
		}
	})

	t.Run("missing", func(t *testing.T) {
		os.Unsetenv("HEADLAMP_CONFIG_LOG_LEVEL")
		logger.Init(os.Getenv("HEADLAMP_CONFIG_LOG_LEVEL"))

		if zerolog.GlobalLevel() != zerolog.InfoLevel {
			t.Fatalf("expected info when env missing")
		}
	})
}
