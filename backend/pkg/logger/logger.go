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

package logger

import (
	"runtime"

	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
)

const (
	// LevelInfo is the info level.
	LevelInfo = iota
	// LevelWarn is the warn level.
	LevelWarn
	// LevelError is the error level.
	LevelError
)

// callerDepth is the depth of the caller in the stack.
const callerDepth = 2

// LogFunc is a function signature for logging.
type LogFunc func(level uint, str map[string]string, err interface{}, msg string)

// logFunc holds the actual logging function.
var logFunc LogFunc = log

// Log logs the message, source file, and line number at the specified level.
func Log(level uint, str map[string]string, err interface{}, msg string) {
	logFunc(level, str, err, msg)
}

// Log is a wrapper function for logging. It uses zlog package and logs to stdout.
// It logs the message, source file and line number.
// It logs the message at the level specified.
func log(level uint, str map[string]string, err interface{}, msg string) {
	var event *zerolog.Event

	switch level {
	case LevelInfo:
		event = zlog.Info()
	case LevelWarn:
		event = zlog.Warn()
	case LevelError:
		event = zlog.Error()
	default:
		event = zlog.Info()
	}

	for k, v := range str {
		event.Str(k, v)
	}

	_, file, line, ok := runtime.Caller(callerDepth)
	if ok {
		event.Str("source", file)
		event.Int("line", line)
	}

	// Handle errors
	if err != nil {
		switch e := err.(type) {
		case error:
			event.Err(e).Msg(msg)
		case []error:
			event.Errs("error", e).Msg(msg)
		case int:
			event.Int("error", e).Msg(msg)
		case string:
			event.Str("error", e).Msg(msg)
		default:
			event.Interface("error", e).Msg(msg)
		}
	} else {
		event.Msg(msg)
	}
}

// SetLogFunc sets the logging function.
func SetLogFunc(lf LogFunc) LogFunc {
	logFunc = lf

	return logFunc
}
