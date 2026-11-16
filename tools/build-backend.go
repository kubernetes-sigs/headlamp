/*
Copyright 2026 The Kubernetes Authors

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
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
)

func splitGoWords(value string) ([]string, error) {
	var words []string
	for {
		value = strings.TrimLeft(value, " \t\r\n")
		if value == "" {
			return words, nil
		}
		if quote := value[0]; quote == '\'' || quote == '"' {
			end := strings.IndexByte(value[1:], quote)
			if end < 0 {
				return nil, fmt.Errorf("Unterminated %c in Go build flags", quote)
			}
			words = append(words, value[1:end+1])
			value = value[end+2:]
		} else if end := strings.IndexAny(value, " \t\r\n"); end >= 0 {
			words = append(words, value[:end])
			value = value[end:]
		} else {
			return append(words, value), nil
		}
	}
}

func joinGoWords(words []string) (string, error) {
	result := make([]string, 0, len(words))
	for _, word := range words {
		// Go quoted fields preserve backslashes and do not use shell escaping.
		switch {
		case word != "" && !strings.ContainsAny(word, " \t\r\n") && word[0] != '\'' && word[0] != '"':
			result = append(result, word)
		case !strings.ContainsRune(word, '\''):
			result = append(result, "'"+word+"'")
		case !strings.ContainsRune(word, '"'):
			result = append(result, `"`+word+`"`)
		default:
			return "", fmt.Errorf("cannot quote Go linker argument: %s", word)
		}
	}
	return strings.Join(result, " "), nil
}

func flagValue(arg, name string) (string, bool) {
	for _, prefix := range []string{"-" + name + "=", "--" + name + "="} {
		if strings.HasPrefix(arg, prefix) {
			return strings.TrimPrefix(arg, prefix), true
		}
	}
	return "", false
}

func hasFlag(args []string, name string) bool {
	for _, arg := range args {
		if _, ok := flagValue(arg, name); ok || arg == "-"+name || arg == "--"+name {
			return true
		}
	}
	return false
}

func mergeLinkerFlags(value string, base []string) (string, error) {
	flags := strings.TrimSpace(value)
	pattern := ""
	if flags != "" && flags[0] != '-' {
		separator := strings.IndexByte(flags, '=')
		if separator <= 0 || flags[0] == '\'' || flags[0] == '"' {
			return "", fmt.Errorf("invalid Go linker package pattern: %s", value)
		}
		pattern = strings.TrimSpace(flags[:separator]) + "="
		flags = flags[separator+1:]
	}
	caller, err := splitGoWords(flags)
	if err != nil {
		return "", err
	}
	combined, err := joinGoWords(append(append([]string{}, base...), caller...))
	return pattern + combined, err
}

func withEmbedTag(value string) string {
	if value == "" {
		return "embed"
	}
	delimiter := ","
	// Match Go's legacy space-separated tag mode, including quoted single tags.
	if strings.ContainsAny(value, " '") {
		delimiter = " "
	}
	return value + delimiter + "embed"
}

func buildArguments(args []string, lookup func(string) (string, bool), goFlags string) ([]string, error) {
	metadata := len(args) > 0 && args[0] == "--version-metadata"
	if metadata {
		args = args[1:]
	}
	embedded := len(args) > 0 && args[0] == "--embed"
	if embedded {
		args = args[1:]
	}
	environment, err := splitGoWords(goFlags)
	if err != nil {
		return nil, err
	}
	var environmentLinkers []string
	environmentTags := ""
	for _, arg := range environment {
		if value, ok := flagValue(arg, "ldflags"); ok {
			environmentLinkers = append(environmentLinkers, value)
		} else if arg == "-ldflags" || arg == "--ldflags" {
			return nil, errors.New("GOFLAGS -ldflags requires an =value")
		}
		if value, ok := flagValue(arg, "tags"); ok {
			environmentTags = value
		}
	}

	var base []string
	if metadata {
		version, versionSet := lookup("APP_VERSION")
		name, nameSet := lookup("APP_NAME")
		if !versionSet || !nameSet {
			return nil, errors.New("--version-metadata requires APP_VERSION and APP_NAME")
		}
		const pkg = "github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
		base = append(base, "-X", pkg+".Version="+version, "-X", pkg+".AppName="+name)
	}
	defaults := append(append([]string{}, base...), "-s", "-w")
	defaultText, err := joinGoWords(defaults)
	if err != nil {
		return nil, err
	}
	result := []string{"build"}
	if !hasFlag(environment, "trimpath") && !hasFlag(args, "trimpath") {
		result = append(result, "-trimpath")
	}
	result = append(result, "-ldflags", defaultText)
	for _, value := range environmentLinkers {
		combined, err := mergeLinkerFlags(value, base)
		if err != nil {
			return nil, err
		}
		result = append(result, "-ldflags", combined)
	}
	if embedded {
		result = append(result, "-tags", withEmbedTag(environmentTags))
	}
	for index := 0; index < len(args); index++ {
		arg := args[index]
		name := ""
		value, inline := flagValue(arg, "ldflags")
		if inline || arg == "-ldflags" || arg == "--ldflags" {
			name = "ldflags"
		} else if embedded {
			value, inline = flagValue(arg, "tags")
			if inline || arg == "-tags" || arg == "--tags" {
				name = "tags"
			}
		}
		if name == "" {
			result = append(result, arg)
			continue
		}
		if !inline {
			index++
			if index == len(args) {
				return nil, fmt.Errorf("-%s requires a value", name)
			}
			value = args[index]
		}
		if name == "ldflags" {
			value, err = mergeLinkerFlags(value, base)
			if err != nil {
				return nil, err
			}
		} else {
			value = withEmbedTag(value)
		}
		result = append(result, "-"+name, value)
	}
	return result, nil
}

func run() int {
	query := exec.Command("go", "env", "-json=false", "GOFLAGS")
	query.Stderr = os.Stderr
	goFlags, err := query.Output()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to read Go build settings:", err)
		return 1
	}
	args, err := buildArguments(os.Args[1:], os.LookupEnv, string(goFlags))
	if err != nil {
		fmt.Fprintln(os.Stderr, "Invalid backend build flags:", err)
		return 1
	}
	child := exec.Command("go", args...)
	child.Stdin, child.Stdout, child.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err := child.Start(); err != nil {
		fmt.Fprintln(os.Stderr, "Failed to start Go build:", err)
		return 1
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	defer func() {
		signal.Stop(signals)
		close(signals)
	}()
	go func() {
		for received := range signals {
			// Windows console children receive Ctrl+C directly; forwarding is unsupported.
			if runtime.GOOS == "windows" {
				continue
			}
			if err := child.Process.Signal(received); err != nil && !errors.Is(err, os.ErrProcessDone) {
				fmt.Fprintln(os.Stderr, "Failed to forward build signal:", err)
			}
		}
	}()
	if err := child.Wait(); err != nil {
		var failure *exec.ExitError
		if errors.As(err, &failure) {
			if status, ok := failure.Sys().(syscall.WaitStatus); ok && status.Signaled() {
				return 128 + int(status.Signal())
			}
			return failure.ExitCode()
		}
		fmt.Fprintln(os.Stderr, "Failed to wait for Go build:", err)
		return 1
	}
	return 0
}

func main() {
	os.Exit(run())
}
