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

package helm

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"helm.sh/helm/v3/pkg/repo"
)

// errInvalidChartRef is returned for a chart reference that is not allowed. Handlers
// answer it with 400, as opposed to the failures reading the repository file.
var errInvalidChartRef = errors.New("invalid chart reference")

// checkChartRef validates chartRef and returns the HTTP status to answer with when it fails.
func (h *Handler) checkChartRef(chartRef string) (int, error) {
	err := h.validateChartRef(chartRef)

	switch {
	case err == nil:
		return http.StatusOK, nil
	case errors.Is(err, errInvalidChartRef):
		return http.StatusBadRequest, err
	default:
		return http.StatusInternalServerError, err
	}
}

// validateChartRef accepts only "<repository>/<chart>", where <repository> is a Helm
// repository registered with this backend.
//
// Helm's LocateChart also accepts http(s) and oci:// URLs and paths on the local
// filesystem, and would fetch or read them for the caller. Install and upgrade requests
// are made by API clients, so only charts from repositories that were added (and
// validated) through the repository routes are allowed.
func (h *Handler) validateChartRef(chartRef string) error {
	// LocateChart trims the name before using it, so a reference that needs trimming
	// is not the one checked here.
	if chartRef != strings.TrimSpace(chartRef) {
		return fmt.Errorf("%w: must not start or end with whitespace", errInvalidChartRef)
	}

	repoName, chartName, ok := strings.Cut(chartRef, "/")
	if !ok || repoName == "" || chartName == "" || strings.Contains(chartName, "/") {
		return fmt.Errorf("%w: %q must be in the form <repository>/<chart>", errInvalidChartRef, chartRef)
	}

	// ':' covers URLs and Windows drive letters, a backslash Windows paths, and a leading
	// '.' or ".." relative and parent paths.
	if strings.ContainsAny(chartRef, `:\`) || strings.HasPrefix(chartRef, ".") || strings.Contains(chartRef, "..") {
		return fmt.Errorf("%w: %q must be a chart from a registered repository, not a URL or a path",
			errInvalidChartRef, chartRef)
	}

	repoFile, err := repo.LoadFile(h.RepositoryConfig)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("reading the repository file: %w", err)
	}

	if err != nil || !repoFile.Has(repoName) {
		return fmt.Errorf("%w: repository %q is not registered", errInvalidChartRef, repoName)
	}

	// LocateChart prefers an existing local path over a repository, so a chart reference
	// that happens to exist on disk would be read from there.
	if _, err := os.Stat(chartRef); err == nil {
		return fmt.Errorf("%w: %q matches a local path", errInvalidChartRef, chartRef)
	}

	return nil
}
