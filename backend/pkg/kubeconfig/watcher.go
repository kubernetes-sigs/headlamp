package kubeconfig

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const watchInterval = 10 * time.Second

// logFieldPath is the structured-log field name for filesystem paths.
const logFieldPath = "path"

// LoadAndWatchFiles loads kubeconfig files and watches them for changes.
// It runs until the provided context is cancelled.
func LoadAndWatchFiles(
	ctx context.Context,
	kubeConfigStore ContextStore,
	paths string,
	source int,
	ignoreFunc shouldBeSkippedFunc,
) {
	// Nothing to watch, for example in-cluster mode without a kubeconfig.
	if paths == "" {
		return
	}

	// create ticker
	ticker := time.NewTicker(watchInterval)
	defer ticker.Stop()

	// create watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating watcher")

		return
	}

	defer func() { _ = watcher.Close() }()

	kubeConfigPaths := splitKubeConfigPath(paths)

	// add files to watcher
	addFilesToWatcher(watcher, kubeConfigPaths)

	for {
		select {
		case <-ctx.Done():
			logger.Log(logger.LevelInfo, nil, nil, "watcher: shutting down kubeconfig watcher")

			return
		case <-ticker.C:
			reAddMissingFiles(watcher, kubeConfigStore, paths, source, ignoreFunc)

		case event := <-watcher.Events:
			triggers := []fsnotify.Op{fsnotify.Create, fsnotify.Write, fsnotify.Remove, fsnotify.Rename}
			for _, trigger := range triggers {
				if event.Op.Has(trigger) {
					logger.Log(logger.LevelInfo, map[string]string{"event": event.Name},
						nil, "watcher: kubeconfig file changed, reloading contexts")

					err := syncContexts(kubeConfigStore, paths, source, ignoreFunc)
					if err != nil {
						logger.Log(logger.LevelError, nil, err, "watcher: error synchronizing contexts")
					}
				}
			}

		case err := <-watcher.Errors:
			logger.Log(logger.LevelError, nil, err, "watcher: error watching kubeconfig files")
		}
	}
}

// reAddMissingFiles watches the files that were missing and reloads the
// kubeconfig once one of them shows up again.
func reAddMissingFiles(
	watcher *fsnotify.Watcher,
	kubeConfigStore ContextStore,
	paths string,
	source int,
	ignoreFunc shouldBeSkippedFunc,
) {
	kubeConfigPaths := splitKubeConfigPath(paths)

	watchedFiles := len(watcher.WatchList())
	if watchedFiles == len(kubeConfigPaths) {
		return
	}

	addFilesToWatcher(watcher, kubeConfigPaths)

	if len(watcher.WatchList()) == watchedFiles {
		return
	}

	logger.Log(logger.LevelInfo, nil, nil, "watcher: re-added missing files")

	err := LoadAndStoreKubeConfigs(kubeConfigStore, existingKubeConfigPaths(paths), source, ignoreFunc)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "watcher: error loading kubeconfig files")
	}
}

func addFilesToWatcher(watcher *fsnotify.Watcher, paths []string) {
	for _, path := range paths {
		// if path is relative, make it absolute
		if !filepath.IsAbs(path) {
			absPath, err := filepath.Abs(path)
			if err != nil {
				logger.Log(logger.LevelError, map[string]string{logFieldPath: path},
					err, "getting absolute path")

				continue
			}

			path = absPath
		}

		// A missing file is picked up by the ticker once it exists.
		if _, err := os.Stat(path); os.IsNotExist(err) {
			continue
		}

		// check if path is already being watched
		// if it is, continue
		filesBeingWatched := watcher.WatchList()
		if slices.Contains(filesBeingWatched, path) {
			continue
		}

		// if it isn't, add it to the watcher
		err := watcher.Add(path)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{logFieldPath: path},
				err, "adding path to watcher")
		}
	}
}

// syncContexts synchronizes the contexts in the store with the ones in the kubeconfig files.
func syncContexts(kubeConfigStore ContextStore, paths string, source int, ignoreFunc shouldBeSkippedFunc) error {
	existingPaths := existingKubeConfigPaths(paths)

	// First read all kubeconfig files to get new contexts
	var newContexts []Context

	if existingPaths != "" {
		var err error

		newContexts, _, err = LoadContextsFromMultipleFiles(existingPaths, source)
		if err != nil {
			return fmt.Errorf("error reading kubeconfig files: %w", err)
		}
	}

	// Get existing contexts from store
	existingContexts, err := kubeConfigStore.GetContexts()
	if err != nil {
		return fmt.Errorf("error getting existing contexts: %w", err)
	}

	// Find and remove contexts that no longer exist in the kubeconfig
	// but only for contexts that came from KubeConfig source
	for _, existingCtx := range existingContexts {
		// Skip contexts from other sources
		if existingCtx.Source != KubeConfig {
			continue
		}

		found := false

		for _, newCtx := range newContexts {
			if existingCtx.Name == newCtx.Name {
				found = true

				break
			}
		}

		if !found {
			err := kubeConfigStore.RemoveContext(existingCtx.Name)
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "error removing context")
			}
		}
	}

	if existingPaths == "" {
		return nil
	}

	// Now load and store the new configurations
	err = LoadAndStoreKubeConfigs(kubeConfigStore, existingPaths, source, ignoreFunc)
	if err != nil {
		return fmt.Errorf("error loading kubeconfig files: %w", err)
	}

	return nil
}

// existingKubeConfigPaths drops the watched paths that do not exist on disk.
// A watched kubeconfig file can be deleted or not created yet, and the watcher
// treats that as a file with no contexts rather than as a load error.
func existingKubeConfigPaths(paths string) string {
	var existing []string

	for _, path := range splitKubeConfigPath(paths) {
		if _, err := os.Stat(path); errors.Is(err, fs.ErrNotExist) {
			continue
		}

		existing = append(existing, path)
	}

	return strings.Join(existing, string(os.PathListSeparator))
}
