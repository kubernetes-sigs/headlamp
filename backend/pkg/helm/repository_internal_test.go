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
	"io/fs"
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

func TestCreateFileIfNotThere(t *testing.T) {
	tempDir := t.TempDir()
	fileName := filepath.Join(tempDir, "new-repo", "config.yaml")

	// 1. Should create missing directory and file
	err := createFileIfNotThere(fileName)
	require.NoError(t, err)

	info, err := os.Stat(fileName)
	require.NoError(t, err)
	assert.False(t, info.IsDir())

	// 2. We should be able to remove it (verifies no leaked descriptor locking the file, esp on Windows)
	err = os.Remove(fileName)
	require.NoError(t, err)

	// 3. Pre-create file and verify createFileIfNotThere doesn't truncate/fail
	err = os.WriteFile(fileName, []byte("data"), 0644)
	require.NoError(t, err)

	err = createFileIfNotThere(fileName)
	require.NoError(t, err)

	content, err := os.ReadFile(fileName)
	require.NoError(t, err)
	assert.Equal(t, "data", string(content))
}
