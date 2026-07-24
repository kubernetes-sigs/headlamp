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

package pluginmanager

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// markerFile marks a plugin directory as managed by the plugin manager.
// Directories without it are never touched during reconciliation.
const markerFile = ".plugin-manager.json"

const (
	maxArchiveSize    = 256 << 20
	maxExtractedSize  = 512 << 20
	maxArchiveEntries = 10000
	downloadTimeout   = 5 * time.Minute
	dirPerm           = 0o755
	filePerm          = 0o644
)

// Marker is the content of the marker file of an installed plugin.
type Marker struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Checksum    string `json:"checksum"`
	ArchiveURL  string `json:"archiveUrl"`
	Source      string `json:"source,omitempty"`
	InstalledAt string `json:"installedAt"`
}

// readMarker returns the marker of a managed plugin directory, or nil.
func readMarker(pluginPath string) *Marker {
	content, err := os.ReadFile(filepath.Clean(filepath.Join(pluginPath, markerFile)))
	if err != nil {
		return nil
	}

	marker := &Marker{}
	if err := json.Unmarshal(content, marker); err != nil {
		return nil
	}

	return marker
}

func writeMarker(pluginPath string, plugin DesiredPlugin) error {
	marker := Marker{
		Name:        plugin.Name,
		Version:     plugin.Version,
		Checksum:    plugin.Checksum,
		ArchiveURL:  plugin.ArchiveURL,
		Source:      plugin.Source,
		InstalledAt: time.Now().UTC().Format(time.RFC3339),
	}

	content, err := json.Marshal(marker)
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(pluginPath, markerFile), content, filePerm)
}

// listManaged returns the markers of all managed plugins in dir, keyed by
// directory name.
func listManaged(dir string) (map[string]*Marker, error) {
	managed := map[string]*Marker{}

	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return managed, nil
		}

		return nil, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		if marker := readMarker(filepath.Join(dir, entry.Name())); marker != nil {
			managed[entry.Name()] = marker
		}
	}

	return managed, nil
}

// install downloads, verifies and extracts a plugin archive, then atomically
// moves it into place under dir/plugin.Name. The client carries the catalog's
// TLS settings so downloads from a self-signed Nexus succeed.
func install(ctx context.Context, client *http.Client, dir string, plugin DesiredPlugin) error {
	if err := os.MkdirAll(dir, dirPerm); err != nil {
		return err
	}

	archive, err := download(ctx, client, plugin)
	if err != nil {
		return err
	}

	defer func() { _ = os.Remove(archive) }()

	staging, err := os.MkdirTemp(dir, ".staging-"+plugin.Name+"-")
	if err != nil {
		return err
	}

	defer func() { _ = os.RemoveAll(staging) }()

	if err := extractArchive(archive, staging); err != nil {
		return err
	}

	root, err := pluginRoot(staging)
	if err != nil {
		return err
	}

	if err := writeMarker(root, plugin); err != nil {
		return err
	}

	// Only replace directories the manager owns; anything without a marker
	// was installed by other means and must never be deleted.
	target := filepath.Join(dir, plugin.Name)
	if _, err := os.Stat(target); err == nil && readMarker(target) == nil {
		return fmt.Errorf("refusing to replace unmanaged plugin directory %q", plugin.Name)
	}

	if err := os.RemoveAll(target); err != nil {
		return err
	}

	return os.Rename(root, target)
}

func download(ctx context.Context, client *http.Client, plugin DesiredPlugin) (string, error) {
	wantSum, err := normalizeChecksum(plugin.Checksum)
	if err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(ctx, downloadTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, plugin.ArchiveURL, nil)
	if err != nil {
		return "", err
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("downloading %s: unexpected status %d", plugin.ArchiveURL, resp.StatusCode)
	}

	tmp, err := os.CreateTemp("", "headlamp-plugin-*.tar.gz")
	if err != nil {
		return "", err
	}

	defer func() { _ = tmp.Close() }()

	hasher := sha256.New()

	if _, err := io.Copy(io.MultiWriter(tmp, hasher), io.LimitReader(resp.Body, maxArchiveSize)); err != nil {
		_ = os.Remove(tmp.Name())

		return "", err
	}

	gotSum := hex.EncodeToString(hasher.Sum(nil))
	if gotSum != wantSum {
		_ = os.Remove(tmp.Name())

		return "", fmt.Errorf("checksum mismatch for %q: expected %s, got %s", plugin.Name, wantSum, gotSum)
	}

	return tmp.Name(), nil
}

// extractArchive unpacks a .tar.gz file into dest, rejecting entries that
// would escape dest as well as oversized archives.
func extractArchive(archivePath, dest string) error {
	file, err := os.Open(filepath.Clean(archivePath))
	if err != nil {
		return err
	}

	defer func() { _ = file.Close() }()

	gzReader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}

	defer func() { _ = gzReader.Close() }()

	tarReader := tar.NewReader(gzReader)

	var totalSize int64

	for entries := 0; ; entries++ {
		header, err := tarReader.Next()
		if err == io.EOF {
			return nil
		}

		if err != nil {
			return err
		}

		if entries >= maxArchiveEntries {
			return fmt.Errorf("archive has too many entries")
		}

		if header.Size < 0 {
			return fmt.Errorf("archive entry %q has an invalid size", header.Name)
		}

		totalSize += header.Size
		if totalSize > maxExtractedSize {
			return fmt.Errorf("archive contents exceed size limit")
		}

		if err := extractEntry(tarReader, header, dest); err != nil {
			return err
		}
	}
}

func extractEntry(tarReader *tar.Reader, header *tar.Header, dest string) error {
	target, err := safeJoin(dest, header.Name)
	if err != nil {
		return err
	}

	switch header.Typeflag {
	case tar.TypeDir:
		return os.MkdirAll(target, dirPerm)
	case tar.TypeReg:
		if err := os.MkdirAll(filepath.Dir(target), dirPerm); err != nil {
			return err
		}

		out, err := os.OpenFile(filepath.Clean(target), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, filePerm)
		if err != nil {
			return err
		}

		defer func() { _ = out.Close() }()

		if _, err := io.Copy(out, io.LimitReader(tarReader, maxExtractedSize)); err != nil {
			return err
		}

		return nil
	default:
		// Symlinks and special files are skipped on purpose.
		return nil
	}
}

func safeJoin(dest, name string) (string, error) {
	if filepath.IsAbs(name) {
		return "", fmt.Errorf("archive entry %q has absolute path", name)
	}

	target := filepath.Join(dest, filepath.Clean(name))
	if !strings.HasPrefix(target, filepath.Clean(dest)+string(os.PathSeparator)) {
		return "", fmt.Errorf("archive entry %q escapes destination", name)
	}

	return target, nil
}

// pluginRoot locates the directory holding main.js within the extracted
// archive: either the archive root or a single top-level directory.
func pluginRoot(staging string) (string, error) {
	if _, err := os.Stat(filepath.Join(staging, "main.js")); err == nil {
		return staging, nil
	}

	entries, err := os.ReadDir(staging)
	if err != nil {
		return "", err
	}

	if len(entries) == 1 && entries[0].IsDir() {
		root := filepath.Join(staging, entries[0].Name())
		if _, err := os.Stat(filepath.Join(root, "main.js")); err == nil {
			return root, nil
		}
	}

	return "", fmt.Errorf("archive does not contain a plugin (missing main.js)")
}

// remove deletes a managed plugin directory. Unmanaged directories are left
// alone and reported as an error.
func remove(dir, name string) error {
	pluginPath := filepath.Join(dir, name)
	if readMarker(pluginPath) == nil {
		return fmt.Errorf("plugin %q is not managed by the plugin manager", name)
	}

	return os.RemoveAll(pluginPath)
}
