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
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/repo"
)

func newChartRefHandler(t *testing.T, repoNames ...string) *Handler {
	t.Helper()

	settings := cli.New()
	settings.RepositoryConfig = filepath.Join(t.TempDir(), "repositories.yaml")

	file := repo.NewFile()
	for _, name := range repoNames {
		file.Update(&repo.Entry{Name: name, URL: "https://example.com/" + name})
	}

	require.NoError(t, file.WriteFile(settings.RepositoryConfig, 0o600))

	return &Handler{EnvSettings: settings}
}

var chartRefCases = []struct {
	name    string
	chart   string
	wantErr string
}{
	{"chart from a registered repository", "bitnami/nginx", ""},
	{"repository name with dashes", "my-repo/some-chart", ""},
	{"https URL", "https://example.com/chart-1.0.0.tgz", "must be in the form"},
	{"http URL to internal address", "http://169.254.169.254/latest/meta-data", "must be in the form"},
	{"oci URL", "oci://registry.example.com/charts/nginx", "must be in the form"},
	{"URL after a repository name", "bitnami/http://169.254.169.254", "must be in the form"},
	{"absolute path", "/etc/chart", "must be in the form"},
	{"relative path", "./chart", "not a URL or a path"},
	{"drive letter", "bitnami/c:chart", "not a URL or a path"},
	{"parent path", "bitnami/../secret", "must be in the form"},
	{"parent path as the chart", "bitnami/..", "not a URL or a path"},
	{"Windows path", `bitnami\\nginx`, "must be in the form"},
	{"Windows drive path", `C:\charts\nginx`, "must be in the form"},
	{"only a chart name", "nginx", "must be in the form"},
	{"empty repository", "/nginx", "must be in the form"},
	{"empty chart", "bitnami/", "must be in the form"},
	{"extra path segment", "bitnami/nginx/extra", "must be in the form"},
	{"leading whitespace", " bitnami/nginx", "whitespace"},
	{"trailing whitespace", "bitnami/nginx ", "whitespace"},
	{"repository that is not registered", "other/nginx", `repository "other" is not registered`},
}

func TestValidateChartRef(t *testing.T) {
	h := newChartRefHandler(t, "bitnami", "my-repo")

	for _, tc := range chartRefCases {
		t.Run(tc.name, func(t *testing.T) {
			err := h.validateChartRef(tc.chart)

			if tc.wantErr == "" {
				require.NoError(t, err)
				return
			}

			require.ErrorIs(t, err, errInvalidChartRef)
			assert.ErrorContains(t, err, tc.wantErr)

			status, statusErr := h.checkChartRef(tc.chart)
			assert.Equal(t, http.StatusBadRequest, status)
			assert.Error(t, statusErr)
		})
	}
}

func TestValidateChartRefRepositoryFile(t *testing.T) {
	h := newChartRefHandler(t, "bitnami", "my-repo")

	t.Run("no repository file registers nothing", func(t *testing.T) {
		empty := &Handler{EnvSettings: cli.New()}
		empty.RepositoryConfig = filepath.Join(t.TempDir(), "missing.yaml")

		err := empty.validateChartRef("bitnami/nginx")
		require.ErrorIs(t, err, errInvalidChartRef)
		assert.ErrorContains(t, err, "not registered")
	})

	t.Run("an unreadable repository file is a server error", func(t *testing.T) {
		broken := newChartRefHandler(t)
		require.NoError(t, os.WriteFile(broken.RepositoryConfig, []byte("not: [valid"), 0o600))

		status, err := broken.checkChartRef("bitnami/nginx")
		require.Error(t, err)
		assert.NotErrorIs(t, err, errInvalidChartRef)
		assert.Equal(t, http.StatusInternalServerError, status)
	})

	t.Run("a reference that exists on disk is read from there by Helm, so it is rejected", func(t *testing.T) {
		dir := t.TempDir()
		require.NoError(t, os.MkdirAll(filepath.Join(dir, "bitnami", "nginx"), 0o700))
		t.Chdir(dir)

		err := h.validateChartRef("bitnami/nginx")
		require.ErrorIs(t, err, errInvalidChartRef)
		assert.ErrorContains(t, err, "local path")
	})
}
