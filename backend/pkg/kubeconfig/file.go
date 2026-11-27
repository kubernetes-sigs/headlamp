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

package kubeconfig

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"

	"github.com/gofrs/flock"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

const timeoutForLock = 30 * time.Second

var kubeConfigOperationLocks sync.Map

// withKubeConfigLocks orders in-process reload publication with writes without
// requiring read-only kubeconfig directories to support a writable lock file.
func withKubeConfigLocks(paths string, action func() error) error {
	configPaths := splitKubeConfigPath(paths)
	for index, path := range configPaths {
		absolute, err := filepath.Abs(path)
		if err != nil {
			return err
		}

		configPaths[index] = absolute
	}

	slices.Sort(configPaths)
	configPaths = slices.Compact(configPaths)

	for _, path := range configPaths {
		value, _ := kubeConfigOperationLocks.LoadOrStore(path, &sync.Mutex{})
		lock := value.(*sync.Mutex)
		lock.Lock()
		defer lock.Unlock()
	}

	return action()
}

// lockKubeConfigFile acquires an exclusive file lock on configPath + ".lock",
// blocking up to the deadline in ctx. It returns whether the lock was acquired,
// the flock handle (so the caller can unlock), and any error.
func lockKubeConfigFile(ctx context.Context, configPath string) (bool, *flock.Flock, error) {
	lockPath := configPath + ".lock"
	fileLock := flock.New(lockPath)
	locked, err := fileLock.TryLockContext(ctx, time.Second)

	return locked, fileLock, err
}

// ModifyConfigFile holds the shared file lock across loading, modifying, writing
// and publishing the committed kubeconfig to optional callbacks.
func ModifyConfigFile(
	path string, modify func(*clientcmdapi.Config) error, committed ...func(*clientcmdapi.Config) error,
) error {
	return withKubeConfigLocks(path, func() error {
		return modifyConfigFile(path, modify, committed...)
	})
}

func modifyConfigFile(
	path string, modify func(*clientcmdapi.Config) error, committed ...func(*clientcmdapi.Config) error,
) error {
	lockCtx, cancel := context.WithTimeout(context.Background(), timeoutForLock)
	defer cancel()

	locked, fileLock, err := lockKubeConfigFile(lockCtx, path)
	if err == nil && locked {
		defer func() {
			if unlockErr := fileLock.Unlock(); unlockErr != nil {
				logger.Log(logger.LevelError, nil, unlockErr, "unlocking kubeconfig file")
			}
		}()
	}

	if err != nil || !locked {
		if err == nil {
			err = fmt.Errorf("failed to acquire file lock for %q within %s", path, timeoutForLock)
		}

		return fmt.Errorf("locking kubeconfig file %q: %w", path, err)
	}

	config, err := clientcmd.LoadFromFile(path)
	if err != nil {
		return err
	}

	if err := modify(config); err != nil {
		return err
	}

	if err := clientcmd.WriteToFile(*config, path); err != nil {
		return err
	}

	for _, publish := range committed {
		if err := publish(config); err != nil {
			return err
		}
	}

	return nil
}

// WriteToFile writes the given config to the kubeconfig file.
// If the config file already exists, the new config is merged into it.
func WriteToFile(config clientcmdapi.Config, path string) error {
	configFile := filepath.Join(path, "config")

	lockCtx, cancel := context.WithTimeout(context.Background(), timeoutForLock)
	defer cancel()

	locked, fileLock, err := lockKubeConfigFile(lockCtx, configFile)
	if err == nil && locked {
		defer func() {
			if unlockErr := fileLock.Unlock(); unlockErr != nil {
				logger.Log(logger.LevelError, nil, unlockErr, "unlocking kubeconfig file")
			}
		}()
	}

	if err != nil || !locked {
		if err == nil {
			err = fmt.Errorf("failed to acquire file lock for %q within %s", configFile, timeoutForLock)
		}

		return fmt.Errorf("locking kubeconfig file %q: %w", configFile, err)
	}

	// If a config file already exists, merge the new config into it.
	if _, err := os.Stat(configFile); err == nil {
		merged, mergeErr := mergeWithExisting(config, path, configFile)
		if mergeErr != nil {
			return mergeErr
		}

		config = *merged
	}

	return clientcmd.WriteToFile(config, configFile)
}

// mergeWithExisting writes config to a temp file, then loads and merges
// it with the existing configFile. The temp file is always cleaned up.
func mergeWithExisting(config clientcmdapi.Config, dir, configFile string) (*clientcmdapi.Config, error) {
	tmpFile, err := os.CreateTemp(dir, "config_*.yaml")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp kubeconfig file: %w", err)
	}

	tmpPath := tmpFile.Name()

	defer func() { _ = os.Remove(tmpPath) }()

	// Write directly to the open file descriptor to avoid a TOCTOU
	// window that would exist if we closed and re-opened by path.
	data, err := clientcmd.Write(config)
	if err != nil {
		_ = tmpFile.Close()

		return nil, fmt.Errorf("failed to serialize kubeconfig: %w", err)
	}

	n, err := tmpFile.Write(data)
	if err != nil {
		_ = tmpFile.Close()

		return nil, fmt.Errorf("failed to write temp kubeconfig file: %w", err)
	}

	if n != len(data) {
		_ = tmpFile.Close()

		return nil, fmt.Errorf("short write to temp kubeconfig file: wrote %d of %d bytes", n, len(data))
	}

	if err = tmpFile.Close(); err != nil {
		return nil, fmt.Errorf("failed to close temp kubeconfig file: %w", err)
	}

	// The incoming config comes first so that it wins over the existing file:
	// clientcmd resolves conflicts in favour of the first entry. Entries that
	// only exist in the file on disk are still preserved by the merge.
	load := clientcmd.ClientConfigLoadingRules{
		Precedence: []string{tmpPath, configFile},
	}

	merged, err := load.Load()
	if err != nil {
		return nil, fmt.Errorf("failed to load merged kubeconfig: %w", err)
	}

	return merged, nil
}

// RemoveContextFromFile removes the given context and its related
// cluster and user from the kubeconfig file.
func RemoveContextFromFile(contextName string, path string) (err error) {
	if path == "" {
		return errors.New("kubeconfig path is empty")
	}

	// Pin the kubeconfig before waiting for the lock. Keep using the original
	// path for the lock so imports and deletions share it for configured symlinks.
	//nolint:gosec // The server supplies the kubeconfig origin.
	file, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return fmt.Errorf("opening kubeconfig file: %w", err)
	}

	lockCtx, cancel := context.WithTimeout(context.Background(), timeoutForLock)
	defer cancel()

	locked, fileLock, err := lockKubeConfigFile(lockCtx, path)

	defer func() {
		err = errors.Join(err, file.Close())

		if locked {
			if unlockErr := fileLock.Unlock(); unlockErr != nil {
				logger.Log(logger.LevelError, nil, unlockErr, "unlocking kubeconfig file")
			}
		}
	}()

	if err != nil || !locked {
		if err == nil {
			err = fmt.Errorf("failed to acquire file lock for %q within %s", path, timeoutForLock)
		}

		return fmt.Errorf("locking kubeconfig file %q: %w", path, err)
	}

	return removeContextFromLockedFile(contextName, file)
}

func removeContextFromLockedFile(contextName string, file *os.File) error {
	info, err := file.Stat()
	if err != nil {
		return fmt.Errorf("stat open kubeconfig file: %w", err)
	}

	if !info.Mode().IsRegular() {
		return errors.New("kubeconfig is not a regular file")
	}

	// A lock wait can outlast a file replacement or a symlink change. Abort if
	// the origin moved and use the open file for all reads and writes.
	current, err := os.Stat(file.Name())
	if err != nil {
		return fmt.Errorf("stat kubeconfig origin: %w", err)
	}

	if !os.SameFile(info, current) {
		return errors.New("kubeconfig changed while waiting for its file lock")
	}

	data, err := io.ReadAll(file)
	if err != nil {
		return fmt.Errorf("failed to read kubeconfig file: %w", err)
	}

	config, err := clientcmd.Load(data)
	if err != nil {
		return fmt.Errorf("failed to load kubeconfig file: %w", err)
	}

	contextConfig, ok := config.Contexts[contextName]
	if !ok {
		return errors.New("context not found in kubeconfig")
	}

	delete(config.Contexts, contextName)
	removeOrphanedClusterAndUser(config, contextConfig.Cluster, contextConfig.AuthInfo)

	updated, err := clientcmd.Write(*config)
	if err != nil {
		return fmt.Errorf("failed to serialize kubeconfig file: %w", err)
	}

	if _, err := file.WriteAt(updated, 0); err != nil {
		return fmt.Errorf("failed to write kubeconfig file: %w", err)
	}

	return file.Truncate(int64(len(updated)))
}

// removeOrphanedClusterAndUser deletes the named cluster and user entries
// from config if no remaining context references them.
func removeOrphanedClusterAndUser(config *clientcmdapi.Config, clusterToRemove, userToRemove string) {
	// check if cluster is used in other contexts
	clusterUsed := false

	for _, ctxCfg := range config.Contexts {
		if ctxCfg.Cluster == clusterToRemove {
			clusterUsed = true
			break
		}
	}

	// remove the cluster from the config
	if !clusterUsed {
		delete(config.Clusters, clusterToRemove)
	}

	// check if user is used in other contexts
	userUsed := false

	for _, ctxCfg := range config.Contexts {
		if ctxCfg.AuthInfo == userToRemove {
			userUsed = true
			break
		}
	}

	// remove the user from the config
	if !userUsed {
		delete(config.AuthInfos, userToRemove)
	}
}
