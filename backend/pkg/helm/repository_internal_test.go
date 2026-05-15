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
	"path/filepath"
	"testing"
	"time"

	"github.com/gofrs/flock"
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

func TestLockRepositoryFileRetriesBeforeContextDeadline(t *testing.T) {
	settings := cli.New()
	tempDir := t.TempDir()
	settings.RepositoryConfig = filepath.Join(tempDir, "repositories.yaml")

	lockPath := filepath.Join(tempDir, "repositories.lock")
	holder := flock.New(lockPath)

	locked, err := holder.TryLock()
	require.NoError(t, err)
	require.True(t, locked)

	t.Cleanup(func() {
		_ = holder.Unlock()
	})

	unlocked := make(chan struct{})

	go func() {
		time.Sleep(2 * lockRetryDelay)

		_ = holder.Unlock()

		close(unlocked)
	}()

	lockCtx, cancel := context.WithTimeout(context.Background(), time.Second-lockRetryDelay)
	defer cancel()

	locked, fileLock, err := lockRepositoryFile(lockCtx, settings.RepositoryConfig)
	require.NoError(t, err)
	require.True(t, locked)
	require.NotNil(t, fileLock)

	defer func() { _ = fileLock.Unlock() }()

	<-unlocked
}
