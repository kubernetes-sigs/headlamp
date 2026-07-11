package kubeconfig

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/gofrs/flock"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

const timeoutForLock = 30 * time.Second

// lockKubeConfigFile acquires an exclusive file lock on configPath + ".lock",
// blocking up to the deadline in ctx. It returns whether the lock was acquired,
// the flock handle (so the caller can unlock), and any error.
func lockKubeConfigFile(ctx context.Context, configPath string) (bool, *flock.Flock, error) {
	if configPath == "" {
		return false, nil, fmt.Errorf("kubeconfig path is empty")
	}

	lockPath := configPath + ".lock"
	fileLock := flock.New(lockPath)
	locked, err := fileLock.TryLockContext(ctx, time.Second)

	return locked, fileLock, err
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

	load := clientcmd.ClientConfigLoadingRules{
		Precedence: []string{configFile, tmpPath},
	}

	merged, err := load.Load()
	if err != nil {
		return nil, fmt.Errorf("failed to load merged kubeconfig: %w", err)
	}

	return merged, nil
}

// RemoveContextFromFile removes the given context and its related
// cluster and user from the kubeconfig file.
func RemoveContextFromFile(contextName string, path string) error {
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

	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("kubeconfig file %q does not exist: %w", path, err)
		}

		return fmt.Errorf("stat kubeconfig file %q: %w", path, err)
	}

	config, err := clientcmd.LoadFromFile(path)
	if err != nil {
		return fmt.Errorf("failed to load kubeconfig file: %w", err)
	}

	// remove the context from the config
	contextConfig, ok := config.Contexts[contextName]
	if !ok {
		return errors.New("context not found in kubeconfig")
	}

	clusterToRemove := contextConfig.Cluster
	userToRemove := contextConfig.AuthInfo

	delete(config.Contexts, contextName)

	removeOrphanedClusterAndUser(config, clusterToRemove, userToRemove)

	return clientcmd.WriteToFile(*config, path)
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
