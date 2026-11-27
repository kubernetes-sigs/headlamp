//go:build !windows

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

package terminal

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
)

// LocalPTYConfig configures a local PTY shell session.
type LocalPTYConfig struct {
	KubeConfigYAML []byte
	ContextName    string
	Shell          string
	IdleTimeout    time.Duration
	MaxDuration    time.Duration
}

type localPTYSession struct {
	ptmx        *os.File
	cmd         *exec.Cmd
	tempDir     string
	done        chan struct{}
	closeOnce   sync.Once
	idleResetCh chan struct{}
}

var allowedEnvKeys = []string{"PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR"}

func buildSanitizedEnv(kubeconfigPath, contextName string) []string {
	env := make([]string, 0, len(allowedEnvKeys)+3)

	for _, k := range allowedEnvKeys {
		if v, ok := os.LookupEnv(k); ok && v != "" {
			env = append(env, k+"="+v)
		}
	}

	env = append(env, "TERM=xterm-256color")

	if kubeconfigPath != "" {
		env = append(env, "KUBECONFIG="+kubeconfigPath)
	}

	if contextName != "" {
		env = append(env, "KUBECTL_CONTEXT="+contextName)
	}

	return env
}

func resolveShell(requested string) string {
	allowedNames := map[string]bool{
		"sh":   true,
		"bash": true,
		"zsh":  true,
		"fish": true,
	}

	candidates := []string{requested, os.Getenv("SHELL"), "/bin/zsh", "/bin/bash", "/bin/sh"}
	for _, c := range candidates {
		if c == "" || !filepath.IsAbs(c) || !allowedNames[filepath.Base(c)] {
			continue
		}

		cleaned := filepath.Clean(c)
		if info, err := os.Stat(cleaned); err == nil && !info.IsDir() {
			return cleaned
		}
	}

	return "/bin/sh"
}

// NewLocalPTYSession spawns a shell in a new PTY process group with an allow-listed
// environment, isolated temporary kubeconfig, idle timeout, and max duration.
func NewLocalPTYSession(cfg LocalPTYConfig) (Session, error) {
	idleTimeout := cfg.IdleTimeout
	if idleTimeout <= 0 {
		idleTimeout = DefaultIdleTimeout
	}

	maxDuration := cfg.MaxDuration
	if maxDuration <= 0 {
		maxDuration = DefaultMaxDuration
	}

	tempDir, err := os.MkdirTemp("", "headlamp-terminal-*")
	if err != nil {
		return nil, err
	}

	kubeconfigPath := ""
	if len(cfg.KubeConfigYAML) > 0 {
		kubeconfigPath = filepath.Join(tempDir, "kubeconfig")
		if err := os.WriteFile(kubeconfigPath, cfg.KubeConfigYAML, 0o600); err != nil {
			_ = os.RemoveAll(tempDir)
			return nil, err
		}
	}

	shellPath := resolveShell(cfg.Shell)
	cmd := exec.CommandContext(context.Background(), shellPath) //nolint:gosec // Shell path is resolved from allowlist.
	cmd.Env = buildSanitizedEnv(kubeconfigPath, cfg.ContextName)

	if home, err := os.UserHomeDir(); err == nil && home != "" {
		cmd.Dir = home
	}

	ptmx, err := pty.Start(cmd)
	if err != nil {
		_ = os.RemoveAll(tempDir)
		return nil, err
	}

	s := &localPTYSession{
		ptmx:        ptmx,
		cmd:         cmd,
		tempDir:     tempDir,
		done:        make(chan struct{}),
		idleResetCh: make(chan struct{}, 1),
	}

	go s.watchLifecycle(idleTimeout, maxDuration)

	return s, nil
}

func (s *localPTYSession) watchLifecycle(idleTimeout, maxDuration time.Duration) {
	waitCh := make(chan error, 1)
	go func() {
		waitCh <- s.cmd.Wait()
	}()

	idleTimer := time.NewTimer(idleTimeout)
	defer idleTimer.Stop()

	maxTimer := time.NewTimer(maxDuration)
	defer maxTimer.Stop()

	for {
		select {
		case <-waitCh:
			_ = s.Close()
			return
		case <-s.idleResetCh:
			if !idleTimer.Stop() {
				select {
				case <-idleTimer.C:
				default:
				}
			}

			idleTimer.Reset(idleTimeout)
		case <-idleTimer.C:
			_ = s.Close()
			return
		case <-maxTimer.C:
			_ = s.Close()
			return
		case <-s.done:
			return
		}
	}
}

func (s *localPTYSession) touchActivity() {
	select {
	case s.idleResetCh <- struct{}{}:
	default:
	}
}

func (s *localPTYSession) Read(p []byte) (int, error) {
	n, err := s.ptmx.Read(p)
	if n > 0 {
		s.touchActivity()
	}

	return n, err
}

func (s *localPTYSession) Write(p []byte) (int, error) {
	s.touchActivity()
	return s.ptmx.Write(p)
}

func (s *localPTYSession) Resize(cols, rows uint16) error {
	if cols == 0 || rows == 0 {
		return errors.New("invalid terminal dimensions")
	}

	return pty.Setsize(s.ptmx, &pty.Winsize{
		Cols: cols,
		Rows: rows,
	})
}

func (s *localPTYSession) Done() <-chan struct{} {
	return s.done
}

func (s *localPTYSession) Close() error {
	var closeErr error

	s.closeOnce.Do(func() {
		close(s.done)

		if s.cmd != nil && s.cmd.Process != nil {
			// Kill the entire process group created by pty.Start (Setsid: true).
			_ = syscall.Kill(-s.cmd.Process.Pid, syscall.SIGKILL)
			_ = s.cmd.Process.Kill()
		}

		if s.ptmx != nil {
			closeErr = s.ptmx.Close()
		}

		if s.tempDir != "" {
			_ = os.RemoveAll(s.tempDir)
		}
	})

	return closeErr
}
