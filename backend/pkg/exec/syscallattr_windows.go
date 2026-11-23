//go:build windows

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

package exec

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"syscall"
	"time"
)

func GetSysProcAttr() *syscall.SysProcAttr {
	// This prevents the console window from appearing when running the command,
	// since we do not want it flashing when the exec plugin is running.
	return &syscall.SysProcAttr{
		HideWindow: true,
	}
}

// killProcessTreeOnCancel makes a timeout also stop the processes the plugin
// started, like the real binary behind a .cmd wrapper.
func killProcessTreeOnCancel(cmd *exec.Cmd) {
	cmd.Cancel = func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		taskkill := filepath.Join(os.Getenv("SystemRoot"), "System32", "taskkill.exe")
		kill := exec.CommandContext(ctx, taskkill, //nolint:gosec // Fixed system binary and our own child's pid.
			"/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid))
		kill.SysProcAttr = GetSysProcAttr()

		if err := kill.Run(); err != nil {
			return cmd.Process.Kill()
		}

		return nil
	}
}
