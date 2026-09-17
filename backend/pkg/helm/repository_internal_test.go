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

func TestLockRepositoryFileForReadWaitsOnWriteLock(t *testing.T) {
	repoConfig := filepath.Join(t.TempDir(), "repositories.yaml")

	writeCtx, writeCancel := context.WithTimeout(context.Background(), time.Second)
	defer writeCancel()

	writeLocked, writeFileLock, err := lockRepositoryFile(writeCtx, repoConfig)
	require.NoError(t, err)
	require.True(t, writeLocked)

	defer func() { assert.NoError(t, writeFileLock.Unlock()) }()

	readCtx, readCancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer readCancel()

	readLocked, _, err := lockRepositoryFileForRead(readCtx, repoConfig)
	assert.False(t, readLocked)
	assert.Error(t, err)
}

func TestLockRepositoryFileForReadAllowsConcurrentReaders(t *testing.T) {
	repoConfig := filepath.Join(t.TempDir(), "repositories.yaml")

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	firstLocked, firstFileLock, err := lockRepositoryFileForRead(ctx, repoConfig)
	require.NoError(t, err)
	require.True(t, firstLocked)

	defer func() { assert.NoError(t, firstFileLock.Unlock()) }()

	secondLocked, secondFileLock, err := lockRepositoryFileForRead(ctx, repoConfig)
	require.NoError(t, err)
	assert.True(t, secondLocked)
	assert.NoError(t, secondFileLock.Unlock())
}
