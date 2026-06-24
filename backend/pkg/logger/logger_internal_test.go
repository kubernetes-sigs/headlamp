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
	"bytes"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/require"
)

var logErrorTypeCases = []struct {
	name    string
	err     interface{}
	wantErr func(t *testing.T, raw map[string]interface{})
}{
	{
		name: "error type",
		err:  fmt.Errorf("test error"),
		wantErr: func(t *testing.T, raw map[string]interface{}) {
			require.Equal(t, "test error", raw["error"])
		},
	},
	{
		name: "error slice",
		err:  []error{fmt.Errorf("error1"), fmt.Errorf("error2")},
		wantErr: func(t *testing.T, raw map[string]interface{}) {
			require.Equal(t, []interface{}{"error1", "error2"}, raw["error"])
		},
	},
	{
		name: "int error code",
		err:  500,
		wantErr: func(t *testing.T, raw map[string]interface{}) {
			require.Equal(t, float64(500), raw["error"])
		},
	},
	{
		name: "string error",
		err:  "error message",
		wantErr: func(t *testing.T, raw map[string]interface{}) {
			require.Equal(t, "error message", raw["error"])
		},
	},
	{
		name: "interface error",
		err:  struct{ Msg string }{Msg: "custom"},
		wantErr: func(t *testing.T, raw map[string]interface{}) {
			require.Equal(t, map[string]interface{}{"Msg": "custom"}, raw["error"])
		},
	},
}

func TestLogErrorTypes(t *testing.T) {
	var buf bytes.Buffer

	origBaseLogger := SetBaseLoggerForTest(zerolog.New(&buf))

	t.Cleanup(func() { SetBaseLoggerForTest(origBaseLogger) })

	for _, tt := range logErrorTypeCases {
		t.Run(tt.name, func(t *testing.T) {
			buf.Reset()

			log(LevelError, nil, tt.err, "test")

			var raw map[string]interface{}
			require.NoError(t, json.Unmarshal(buf.Bytes(), &raw))
			require.Equal(t, "error", raw["level"])
			require.Equal(t, "test", raw["message"])
			tt.wantErr(t, raw)
		})
	}
}
