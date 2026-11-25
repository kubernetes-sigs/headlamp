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
	"debug/buildinfo"
	"debug/dwarf"
	"debug/elf"
	"debug/macho"
	"debug/pe"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

func checkBinary(filename string) error {
	info, err := buildinfo.ReadFile(filename)
	if err != nil {
		return err
	}
	recordedLinkerFlag := false
	for _, setting := range info.Settings {
		if setting.Key == "-trimpath" && setting.Value == "true" {
			return errors.New("caller -trimpath=false was overridden")
		}
		if setting.Key == "-ldflags" && strings.Contains(setting.Value, "-compressdwarf=false") {
			recordedLinkerFlag = true
		}
	}
	if !recordedLinkerFlag {
		return errors.New("caller -compressdwarf=false is absent from Go build settings")
	}

	var data *dwarf.Data
	switch image, openErr := elf.Open(filename); {
	case openErr == nil:
		defer image.Close()
		section := image.Section(".debug_info")
		if section == nil || section.Flags&elf.SHF_COMPRESSED != 0 {
			return errors.New("ELF debug information is missing or compressed")
		}
		data, err = image.DWARF()
	default:
		if image, openErr := macho.Open(filename); openErr == nil {
			defer image.Close()
			if image.Section("__debug_info") == nil {
				return errors.New("Mach-O debug information is missing or compressed")
			}
			data, err = image.DWARF()
		} else if image, openErr := pe.Open(filename); openErr == nil {
			defer image.Close()
			if image.Section(".debug_info") == nil {
				return errors.New("PE debug information is missing or compressed")
			}
			data, err = image.DWARF()
		} else {
			return errors.New("unsupported executable format")
		}
	}
	if err != nil {
		return err
	}
	entry, err := data.Reader().Next()
	if err != nil {
		return err
	}
	if entry == nil {
		return errors.New("no DWARF entries")
	}
	return nil
}

func checkPath(name string) error {
	info, err := os.Stat(name)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return checkBinary(name)
	}
	found := 0
	err = filepath.WalkDir(name, func(filename string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || (entry.Name() != "headlamp-server" && entry.Name() != "headlamp-server.exe") {
			return nil
		}
		if err := checkBinary(filename); err != nil {
			return fmt.Errorf("%s: %w", filename, err)
		}
		fmt.Println("Verified packaged backend:", filename)
		found++
		return nil
	})
	if err != nil {
		return err
	}
	if found == 0 {
		return fmt.Errorf("no packaged backends found under %s", name)
	}
	return nil
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: check-backend-debug <binary-or-package-directory> [...]")
		os.Exit(1)
	}
	for _, name := range os.Args[1:] {
		if err := checkPath(name); err != nil {
			fmt.Fprintln(os.Stderr, "Backend build verification failed:", err)
			os.Exit(1)
		}
		fmt.Println("Verified requested compiler/linker flags and DWARF:", name)
	}
}
