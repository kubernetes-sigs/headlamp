package kubeconfig

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"k8s.io/utils/strings/slices"
)

const watchInterval = 10 * time.Second

// LoadAndWatchFiles loads kubeconfig files and watches them for changes.
func LoadAndWatchFiles(kubeConfigStore ContextStore, paths string, source int) {
	// create ticker
	ticker := time.NewTicker(watchInterval)

	// create watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating watcher")

		return
	}

	defer watcher.Close()

	kubeConfigPaths := splitKubeConfigPath(paths)

	// add files to watcher
	addFilesToWatcher(watcher, kubeConfigPaths)

	for {
		select {
		case <-ticker.C:
			if len(watcher.WatchList()) != len(kubeConfigPaths) {
				logger.Log(logger.LevelInfo, nil, nil, "watcher: re-adding missing files")
				addFilesToWatcher(watcher, kubeConfigPaths)

				err := LoadAndStoreKubeConfigs(kubeConfigStore, paths, source)
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

					err := syncContexts(kubeConfigStore, paths, source)
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
		path := path

		// if path is relative, make it absolute
		if !filepath.IsAbs(path) {
			absPath, err := filepath.Abs(path)
			if err != nil {
				logger.Log(logger.LevelError, map[string]string{"path": path},
					err, "getting absolute path")

				continue
			}

			path = absPath
		}

		// check if path exists
		if _, err := os.Stat(path); os.IsNotExist(err) {
			logger.Log(logger.LevelError, map[string]string{"path": path},
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
			logger.Log(logger.LevelError, map[string]string{"path": path},
				err, "adding path to watcher")
		}
	}
}

// syncContexts synchronizes the contexts in the store with the ones in the kubeconfig files.
func syncContexts(kubeConfigStore ContextStore, paths string, source int) error {
	// First read all kubeconfig files to get new contexts
	newContexts, _, err := LoadContextsFromMultipleFiles(paths, source)
	if err != nil {
		return fmt.Errorf("error reading kubeconfig files: %v", err)
	}

	// Get existing contexts from store
	existingContexts, err := kubeConfigStore.GetContexts()
	if err != nil {
		return fmt.Errorf("error getting existing contexts: %v", err)
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

	// Now load and store the new configurations
	err = LoadAndStoreKubeConfigs(kubeConfigStore, paths, source)
	if err != nil {
		return fmt.Errorf("error loading kubeconfig files: %v", err)
	}

	return nil
}
