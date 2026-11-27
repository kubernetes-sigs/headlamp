//go:build windows

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

package exec //nolint:testpackage // Uses the same package as exec_test.go.

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
)

func processRunning(pid int) bool {
	id := strconv.Itoa(pid)

	tasklist := exec.CommandContext(context.Background(), //nolint:gosec // The pid comes from the test.
		"tasklist", "/FI", "PID eq "+id, "/NH", "/FO", "CSV")

	out, err := tasklist.Output()
	if err != nil {
		return false
	}

	return strings.Contains(string(out), `"`+id+`"`)
}

func killTestProcess(pid int) {
	taskkill := exec.CommandContext(context.Background(), //nolint:gosec // The pid comes from the test.
		"taskkill", "/F", "/PID", strconv.Itoa(pid))
	_ = taskkill.Run()
}
