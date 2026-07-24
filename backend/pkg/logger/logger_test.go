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
	"bytes"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
	"github.com/stretchr/testify/require"
)

var capturedLogs []string

// MockLog is a mock logging function for testing.
func MockLog(level uint, str map[string]string, err interface{}, msg string) {
	logMessage := fmt.Sprintf(`{"level":%d, "message":"%s"}`, level, msg)
	capturedLogs = append(capturedLogs, logMessage)
}

func TestLog(t *testing.T) {
	// Note: no t.Parallel() here (or in any test in this package): the tests
	// mutate process-wide state (logger.SetLogFunc, zerolog.SetGlobalLevel,
	// zlog.Logger and capturedLogs), so they must run serially.

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
		require.NoError(t, os.Unsetenv("HEADLAMP_CONFIG_LOG_LEVEL"))
		logger.Init(os.Getenv("HEADLAMP_CONFIG_LOG_LEVEL"))

		if zerolog.GlobalLevel() != zerolog.InfoLevel {
			t.Fatalf("expected info when env missing")
		}
	})
}

// captureLog redirects the global zerolog logger into a buffer, calls
// logger.Log with the default (real) log function, and returns the output.
func captureLog(t *testing.T, level uint, str map[string]string, err interface{}, msg string) string {
	t.Helper()

	origLevel := zerolog.GlobalLevel()

	zerolog.SetGlobalLevel(zerolog.TraceLevel)

	origLogger := zlog.Logger

	t.Cleanup(func() {
		zlog.Logger = origLogger

		zerolog.SetGlobalLevel(origLevel)
	})

	var buf bytes.Buffer

	zlog.Logger = zerolog.New(&buf)

	logger.Log(level, str, err, msg)

	return buf.String()
}

// Exercises the real log function: levels, string fields, source/line and
// every error type branch ([]error, int, string, error, interface{}).
//
//nolint:funlen // table-driven test, splitting hurts readability
func TestDefaultLogFunc(t *testing.T) {
	origLogFunc := logger.SetLogFunc(nil)
	t.Cleanup(func() { logger.SetLogFunc(origLogFunc) })

	tests := []struct {
		name     string
		level    uint
		str      map[string]string
		err      interface{}
		msg      string
		expected []string
	}{
		{
			name:     "info with fields and no error",
			level:    logger.LevelInfo,
			str:      map[string]string{"key": "value"},
			msg:      "info msg",
			expected: []string{`"level":"info"`, `"key":"value"`, `"source":`, `"line":`, `"message":"info msg"`},
		},
		{
			name:     "warn level",
			level:    logger.LevelWarn,
			msg:      "warn msg",
			expected: []string{`"level":"warn"`, `"message":"warn msg"`},
		},
		{
			name:     "unknown level defaults to info",
			level:    42,
			msg:      "default msg",
			expected: []string{`"level":"info"`, `"message":"default msg"`},
		},
		{
			name:     "error interface",
			level:    logger.LevelError,
			err:      errors.New("boom"),
			msg:      "error msg",
			expected: []string{`"level":"error"`, `"error":"boom"`, `"message":"error msg"`},
		},
		{
			name:     "error slice",
			level:    logger.LevelError,
			err:      []error{errors.New("first"), errors.New("second")},
			msg:      "multi error",
			expected: []string{`"error":["first","second"]`, `"message":"multi error"`},
		},
		{
			name:     "int error code",
			level:    logger.LevelError,
			err:      404,
			msg:      "int error",
			expected: []string{`"error":404`, `"message":"int error"`},
		},
		{
			name:     "string error",
			level:    logger.LevelError,
			err:      "string failure",
			msg:      "string error",
			expected: []string{`"error":"string failure"`, `"message":"string error"`},
		},
		{
			name:     "generic interface error",
			level:    logger.LevelError,
			err:      struct{ Code int }{Code: 7},
			msg:      "generic error",
			expected: []string{`"error":{"Code":7}`, `"message":"generic error"`},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			out := captureLog(t, tt.level, tt.str, tt.err, tt.msg)

			for _, want := range tt.expected {
				if !strings.Contains(out, want) {
					t.Errorf("expected output to contain %s, got: %s", want, out)
				}
			}
		})
	}
}

// SetLogFunc(nil) restores the default log function.
func TestSetLogFuncNilRestoresDefault(t *testing.T) {
	orig := logger.SetLogFunc(MockLog)

	t.Cleanup(func() {
		logger.SetLogFunc(orig)
	})

	returned := logger.SetLogFunc(nil)
	if returned == nil {
		t.Fatal("expected previous log function to be returned")
	}

	// The default function is active again: output goes to zerolog, not MockLog.
	capturedLogs = nil
	out := captureLog(t, logger.LevelInfo, nil, nil, "after reset")

	if len(capturedLogs) != 0 {
		t.Errorf("mock should not capture after reset, got: %v", capturedLogs)
	}

	if !strings.Contains(out, `"message":"after reset"`) {
		t.Errorf("expected default log output, got: %s", out)
	}
}
