/*
Copyright 2026 The Kubernetes Authors.

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
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultLogAllLevelsAndErrorTypes(t *testing.T) {
	prev := SetLogFunc(nil)
	prevLogger := zlog.Logger
	prevLevel := zerolog.GlobalLevel()

	var buf bytes.Buffer

	zlog.Logger = zlog.Output(&buf)

	zerolog.SetGlobalLevel(zerolog.InfoLevel)

	t.Cleanup(func() {
		SetLogFunc(prev)

		zlog.Logger = prevLogger

		zerolog.SetGlobalLevel(prevLevel)
	})

	str := map[string]string{"k": "v"}

	Log(LevelInfo, str, nil, "info msg")
	Log(LevelWarn, str, errors.New("err"), "warn msg")
	Log(LevelError, str, []error{errors.New("e1"), errors.New("e2")}, "errors msg")
	Log(99, str, 42, "int err msg")
	Log(LevelInfo, str, "string err", "str err msg")
	Log(LevelInfo, str, struct{ A int }{A: 1}, "struct err msg")

	assert.NotNil(t, prev)
	assertLogEntries(t, buf.String())
}

func assertLogEntries(t *testing.T, raw string) {
	t.Helper()

	lines := strings.Split(strings.TrimSpace(raw), "\n")
	require.Len(t, lines, 6)

	expected := []struct {
		level string
		msg   string
		has   bool
		err   any
	}{
		{level: "info", msg: "info msg", has: false},
		{level: "warn", msg: "warn msg", has: true, err: "err"},
		{level: "error", msg: "errors msg", has: true, err: []any{"e1", "e2"}},
		{level: "info", msg: "int err msg", has: true, err: float64(42)},
		{level: "info", msg: "str err msg", has: true, err: "string err"},
		{level: "info", msg: "struct err msg", has: true, err: map[string]any{"A": float64(1)}},
	}

	for i, exp := range expected {
		var entry map[string]any
		require.NoError(t, json.Unmarshal([]byte(lines[i]), &entry))

		assert.Equal(t, exp.level, entry["level"])
		assert.Equal(t, exp.msg, entry["message"])
		assert.Equal(t, "v", entry["k"])
		assert.Contains(t, entry["source"], "logger_internal_test.go")

		lineNum, ok := entry["line"].(float64)
		assert.True(t, ok)
		assert.Positive(t, lineNum)

		if exp.has {
			assert.Equal(t, exp.err, entry["error"])
		} else {
			assert.NotContains(t, entry, "error")
		}
	}
}
