package logger_test

import (
	"fmt"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
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
		test := test // Assign test to a local variable
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
