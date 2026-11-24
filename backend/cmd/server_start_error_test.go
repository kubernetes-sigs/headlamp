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
	"errors"
	"fmt"
	"syscall"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestServerStartExitCode(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantCode   int
		shouldExit bool
	}{
		{
			name:       "address in use uses stable application exit code",
			err:        fmt.Errorf("listen failed: %w", syscall.EADDRINUSE),
			wantCode:   serverAddressInUseExitCode,
			shouldExit: true,
		},
		{
			name:       "Windows address in use uses stable application exit code",
			err:        fmt.Errorf("listen failed: %w", windowsAddressInUseErrno),
			wantCode:   serverAddressInUseExitCode,
			shouldExit: true,
		},
		{
			name: "unrelated error does not exit",
			err:  errors.New("listen failed"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotCode, gotShouldExit := serverStartExitCode(tt.err)
			assert.Equal(t, tt.wantCode, gotCode)
			assert.Equal(t, tt.shouldExit, gotShouldExit)
		})
	}
}
