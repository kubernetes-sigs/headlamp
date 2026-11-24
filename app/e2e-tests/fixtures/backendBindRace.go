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

// backendBindRace is a cross-platform test fixture for Electron's backend retry path.
package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

const addressInUseExitCode = 98

// requiredEnvironment returns a fixture setting or exits when it is absent.
func requiredEnvironment(name string) string {
	value := os.Getenv(name)
	if value == "" {
		fmt.Fprintf(os.Stderr, "missing required environment variable %s\n", name)
		os.Exit(1)
	}

	return value
}

// selectedPort extracts Electron's selected backend port from its command arguments.
func selectedPort(arguments []string) (string, error) {
	for _, argument := range arguments {
		if port, found := strings.CutPrefix(argument, "--port="); found && port != "" {
			return port, nil
		}
	}

	return "", errors.New("missing --port argument")
}

// runRaceServer starts an unrelated listener on the selected port, then exits with
// the stable status that asks Electron to retry the backend on another port.
func runRaceServer(arguments []string) {
	port, err := selectedPort(arguments)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	readyPath := requiredEnvironment("HEADLAMP_E2E_RACE_SERVER_READY")
	command := exec.Command(
		requiredEnvironment("HEADLAMP_E2E_NODE"),
		requiredEnvironment("HEADLAMP_E2E_RACE_SERVER"),
		port,
		readyPath,
		requiredEnvironment("HEADLAMP_E2E_RECEIVED_TOKEN"),
	)
	if err := command.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "starting race server: %v\n", err)
		os.Exit(1)
	}

	pidPath := requiredEnvironment("HEADLAMP_E2E_RACE_SERVER_PID")
	if err := os.WriteFile(pidPath, []byte(fmt.Sprint(command.Process.Pid)), 0o600); err != nil {
		fmt.Fprintf(os.Stderr, "writing race server PID: %v\n", err)
		os.Exit(1)
	}

	serverExit := make(chan error, 1)
	go func() {
		serverExit <- command.Wait()
	}()

	deadline := time.NewTimer(10 * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case err := <-serverExit:
			fmt.Fprintf(os.Stderr, "race server exited before readiness: %v\n", err)
			os.Exit(1)
		case <-deadline.C:
			_ = command.Process.Kill()
			fmt.Fprintln(os.Stderr, "timed out waiting for race server readiness")
			os.Exit(1)
		case <-ticker.C:
			if _, err := os.Stat(readyPath); err == nil {
				if err := os.WriteFile(
					requiredEnvironment("HEADLAMP_E2E_FIRST_ATTEMPT"),
					[]byte("complete"),
					0o600,
				); err != nil {
					fmt.Fprintf(os.Stderr, "writing first-attempt marker: %v\n", err)
					os.Exit(1)
				}
				os.Exit(addressInUseExitCode)
			}
		}
	}
}

// main races the first bind attempt; Electron launches the real backend for its retry.
func main() {
	runRaceServer(os.Args[1:])
}
