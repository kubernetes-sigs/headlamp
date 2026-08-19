package kubeconfig

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"slices"
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
			if len(watcher.WatchList()) != len(kubeConfigPaths) {
				logger.Log(logger.LevelInfo, nil, nil, "watcher: re-adding missing files")
				addFilesToWatcher(watcher, kubeConfigPaths)

				err := LoadAndStoreKubeConfigs(kubeConfigStore, paths, source, ignoreFunc)
				if err != nil {
					logger.Log(logger.LevelError, nil, err, "watcher: error loading kubeconfig files")
				}
			}

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

		// check if path exists
		if _, err := os.Stat(path); os.IsNotExist(err) {
			logger.Log(logger.LevelError, map[string]string{logFieldPath: path},
				err, "Path does not exist")

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
	// First read all kubeconfig files to get new contexts
	newContexts, contextLoadErrors, err := LoadContextsFromMultipleFiles(paths, source)
	if err != nil {
		return fmt.Errorf("error reading kubeconfig files: %w", err)
	}

	// Get existing contexts from store
	existingContexts, err := kubeConfigStore.GetContexts()
	if err != nil {
		return fmt.Errorf("error getting existing contexts: %w", err)
	}

	removeStaleContexts(kubeConfigStore, existingContexts, newContexts, contextLoadErrors)

	// Now store the contexts read above. Reusing that read instead of loading the
	// files again keeps the removals and the additions based on the same view of
	// the kubeconfig.
	if err := storeContexts(kubeConfigStore, newContexts, contextLoadErrors, ignoreFunc); err != nil {
		return fmt.Errorf("error storing contexts: %w", err)
	}

	return nil
}

// removeStaleContexts removes the contexts that no longer exist in the kubeconfig
// files, but only the ones that came from the KubeConfig source.
//
// Contexts that failed to load are kept. Such a context is still in the kubeconfig,
// it just could not be parsed this time around: kubectl and friends rewrite
// kubeconfig files in place rather than atomically, so a reload landing mid-write
// can see a context whose cluster or user entry has not been written back yet.
// Removing it would leave it missing from the store until the next change event or
// a restart, and every request for it would fail meanwhile as if the cluster needed
// a token. Keep it and let the next reload correct it instead.
func removeStaleContexts(kubeConfigStore ContextStore, existingContexts []*Context,
	newContexts []Context, contextLoadErrors []ContextLoadError,
) {
	failedToLoad := make(map[string]bool, len(contextLoadErrors))
	for _, contextLoadError := range contextLoadErrors {
		failedToLoad[MakeDNSFriendly(contextLoadError.ContextName)] = true
	}

	for _, existingCtx := range existingContexts {
		// Skip contexts from other sources, and the ones that just failed to load.
		if existingCtx.Source != KubeConfig || failedToLoad[existingCtx.Name] {
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
}
