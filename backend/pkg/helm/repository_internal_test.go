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
	"context"
	"errors"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/repo"
)

func TestRemoveRepositoryReturnsNotFoundError(t *testing.T) {
	settings := cli.New()
	settings.RepositoryConfig = filepath.Join(t.TempDir(), "repositories.yaml")

	repoFile := repo.NewFile()
	repoFile.Update(&repo.Entry{
		Name: "existing",
		URL:  "https://example.test/charts",
	})
	require.NoError(t, repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode))

	err := RemoveRepository("missing", settings)
	require.Error(t, err)
	assert.True(t, errors.Is(err, errRepositoryNotFound))
}

func TestEnsureRepositoryFileLocked(t *testing.T) {
	t.Run("locked", func(t *testing.T) {
		assert.NoError(t, ensureRepositoryFileLocked(true, nil))
	})

	t.Run("lock_error", func(t *testing.T) {
		lockErr := fs.ErrPermission

		err := ensureRepositoryFileLocked(false, lockErr)

		require.Error(t, err)
		assert.True(t, errors.Is(err, lockErr))
	})

	t.Run("not_locked_without_error", func(t *testing.T) {
		err := ensureRepositoryFileLocked(false, nil)

		require.Error(t, err)
		assert.True(t, errors.Is(err, errRepositoryLockNotAcquired))
	})
}

func newIsolatedEnvSettings(t *testing.T) *cli.EnvSettings {
	t.Helper()

	dir := t.TempDir()
	t.Setenv("HELM_CACHE_HOME", filepath.Join(dir, "cache"))

	settings := cli.New()
	settings.RepositoryConfig = filepath.Join(dir, "repositories.yaml")
	settings.RepositoryCache = filepath.Join(dir, "cache")

	return settings
}

func TestLockRepositoryFile_NoExtension(t *testing.T) {
	settings := newIsolatedEnvSettings(t)
	repoPath := filepath.Join(t.TempDir(), "repositories")
	settings.RepositoryConfig = repoPath

	locked, fileLock, err := lockRepositoryFile(context.Background(), settings.RepositoryConfig)
	require.NoError(t, err)
	assert.True(t, locked)
	require.NoError(t, fileLock.Unlock())
	assert.FileExists(t, repoPath+".lock")
}

func TestApplyRequestFields_OptionalBooleans(t *testing.T) {
	entry := &repo.Entry{
		Name:                  "test",
		InsecureSkipTLSverify: false,
		PassCredentialsAll:    false,
	}

	skipTLS := true
	passCreds := true

	applyRequestFields(entry, AddUpdateRepoRequest{
		InsecureSkipTLSverify: &skipTLS,
		PassCredentialsAll:    &passCreds,
	})

	assert.True(t, entry.InsecureSkipTLSverify)
	assert.True(t, entry.PassCredentialsAll)
}

func TestCreateFileIfNotThere_ParentIsFile(t *testing.T) {
	parentFile := filepath.Join(t.TempDir(), "not-a-dir")
	require.NoError(t, os.WriteFile(parentFile, []byte("x"), 0o600))

	err := createFileIfNotThere(filepath.Join(parentFile, "repositories.yaml"))
	require.Error(t, err)
}

func TestAddRepository_ErrorsAndExistingEntry(t *testing.T) {
	t.Run("create_file_error", func(t *testing.T) {
		parentFile := filepath.Join(t.TempDir(), "not-a-dir")
		require.NoError(t, os.WriteFile(parentFile, []byte("x"), 0o600))

		settings := newIsolatedEnvSettings(t)
		settings.RepositoryConfig = filepath.Join(parentFile, "repositories.yaml")

		err := addRepository(AddUpdateRepoRequest{Name: "r", URL: "https://example.test"}, settings)
		require.Error(t, err)
	})

	t.Run("corrupt_repo_file", func(t *testing.T) {
		settings := newIsolatedEnvSettings(t)
		require.NoError(t, os.WriteFile(settings.RepositoryConfig, []byte(":::invalid-yaml"), 0o600))

		err := addRepository(AddUpdateRepoRequest{Name: "r", URL: "https://example.test"}, settings)
		require.Error(t, err)
	})

	t.Run("download_index_error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
		}))
		defer srv.Close()

		settings := newIsolatedEnvSettings(t)
		err := addRepository(AddUpdateRepoRequest{Name: "r", URL: srv.URL}, settings)
		require.Error(t, err)
	})

	t.Run("updates_existing_entry_and_preserves_credentials", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"apiVersion":"v1","entries":{},"generated":"2025-01-01T00:00:00Z"}`))
		}))
		defer srv.Close()

		settings := newIsolatedEnvSettings(t)
		repoFile := repo.NewFile()
		repoFile.Update(&repo.Entry{
			Name:     "existing",
			URL:      "https://old.example.test",
			Username: "saved-user",
			Password: "saved-password",
		})
		require.NoError(t, repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode))

		err := addRepository(AddUpdateRepoRequest{Name: "existing", URL: srv.URL}, settings)
		require.NoError(t, err)

		updated, err := repo.LoadFile(settings.RepositoryConfig)
		require.NoError(t, err)

		entry := updated.Get("existing")
		require.NotNil(t, entry)
		assert.Equal(t, srv.URL, entry.URL)
		assert.Equal(t, "saved-user", entry.Username)
		assert.Equal(t, "saved-password", entry.Password)
	})
}

func TestListRepositories_Errors(t *testing.T) {
	t.Run("create_file_error", func(t *testing.T) {
		parentFile := filepath.Join(t.TempDir(), "not-a-dir")
		require.NoError(t, os.WriteFile(parentFile, []byte("x"), 0o600))

		settings := newIsolatedEnvSettings(t)
		settings.RepositoryConfig = filepath.Join(parentFile, "repositories.yaml")

		_, err := listRepositories(settings)
		require.Error(t, err)
	})

	t.Run("corrupt_repo_file", func(t *testing.T) {
		settings := newIsolatedEnvSettings(t)
		require.NoError(t, os.WriteFile(settings.RepositoryConfig, []byte(":::invalid-yaml"), 0o600))

		_, err := listRepositories(settings)
		require.Error(t, err)
	})
}

func TestRemoveRepository_Errors(t *testing.T) {
	t.Run("create_file_error", func(t *testing.T) {
		parentFile := filepath.Join(t.TempDir(), "not-a-dir")
		require.NoError(t, os.WriteFile(parentFile, []byte("x"), 0o600))

		settings := newIsolatedEnvSettings(t)
		settings.RepositoryConfig = filepath.Join(parentFile, "repositories.yaml")

		err := RemoveRepository("r", settings)
		require.Error(t, err)
	})

	t.Run("corrupt_repo_file", func(t *testing.T) {
		settings := newIsolatedEnvSettings(t)
		require.NoError(t, os.WriteFile(settings.RepositoryConfig, []byte(":::invalid-yaml"), 0o600))

		err := RemoveRepository("r", settings)
		require.Error(t, err)
	})

	t.Run("write_file_error", func(t *testing.T) {
		if os.Geteuid() == 0 {
			t.Skip("root ignores file mode permissions")
		}

		settings := newIsolatedEnvSettings(t)
		repoFile := repo.NewFile()
		repoFile.Update(&repo.Entry{Name: "myrepo", URL: "https://example.test"})
		require.NoError(t, repoFile.WriteFile(settings.RepositoryConfig, 0o444))

		err := RemoveRepository("myrepo", settings)
		require.Error(t, err)
	})
}

func TestUpdateRepository_DirectAndErrors(t *testing.T) {
	t.Run("direct_update_success_and_not_found", func(t *testing.T) {
		settings := newIsolatedEnvSettings(t)
		repoFile := repo.NewFile()
		repoFile.Update(&repo.Entry{Name: "myrepo", URL: "https://old.example.test"})
		require.NoError(t, repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode))

		require.NoError(t, UpdateRepository("myrepo", "https://new.example.test", settings))

		loaded, err := repo.LoadFile(settings.RepositoryConfig)
		require.NoError(t, err)
		assert.Equal(t, "https://new.example.test", loaded.Get("myrepo").URL)

		err = UpdateRepository("missing", "https://new.example.test", settings)
		require.ErrorIs(t, err, errRepositoryNotFound)
	})

	t.Run("create_file_error", func(t *testing.T) {
		parentFile := filepath.Join(t.TempDir(), "not-a-dir")
		require.NoError(t, os.WriteFile(parentFile, []byte("x"), 0o600))

		settings := newIsolatedEnvSettings(t)
		settings.RepositoryConfig = filepath.Join(parentFile, "repositories.yaml")

		err := UpdateRepository("myrepo", "https://new.example.test", settings)
		require.Error(t, err)
	})

	t.Run("corrupt_repo_file", func(t *testing.T) {
		settings := newIsolatedEnvSettings(t)
		require.NoError(t, os.WriteFile(settings.RepositoryConfig, []byte(":::invalid-yaml"), 0o600))

		err := UpdateRepository("myrepo", "https://new.example.test", settings)
		require.Error(t, err)
	})

	t.Run("write_file_error", func(t *testing.T) {
		if os.Geteuid() == 0 {
			t.Skip("root ignores file mode permissions")
		}

		settings := newIsolatedEnvSettings(t)
		repoFile := repo.NewFile()
		repoFile.Update(&repo.Entry{Name: "myrepo", URL: "https://old.example.test"})
		require.NoError(t, repoFile.WriteFile(settings.RepositoryConfig, 0o444))

		err := UpdateRepository("myrepo", "https://new.example.test", settings)
		require.Error(t, err)
	})
}
