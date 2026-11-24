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
	"os"
	"syscall"
)

// serverAddressInUseExitCode is the stable process status Electron uses to retry on another port.
const serverAddressInUseExitCode = 98

// windowsAddressInUseErrno is WSAEADDRINUSE, which is not syscall.EADDRINUSE on Windows.
const windowsAddressInUseErrno syscall.Errno = 10048

// isAddressInUseError reports whether err means another process won the socket bind race.
// Unix exposes this as EADDRINUSE. Windows uses WSAEADDRINUSE (10048), which Go does not
// normalize to syscall.EADDRINUSE when cross-compiled, so both values must be checked.
func isAddressInUseError(err error) bool {
	return errors.Is(err, syscall.EADDRINUSE) || errors.Is(err, windowsAddressInUseErrno)
}

// serverStartExitCode maps a server startup error to a stable application exit code.
func serverStartExitCode(err error) (int, bool) {
	if isAddressInUseError(err) {
		return serverAddressInUseExitCode, true
	}

	return 0, false
}

// HandleServerStartError exits with a stable status for recoverable server startup errors.
func HandleServerStartError(err *error) {
	if exitCode, shouldExit := serverStartExitCode(*err); shouldExit {
		os.Exit(exitCode)
	}
}
