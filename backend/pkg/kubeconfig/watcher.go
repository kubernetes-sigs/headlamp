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

// LoadAndWatchFiles watches kubeconfig files (and any referenced credential files) and reloads contexts on changes.
// It runs until the provided context is cancelled.
//
//nolint:funlen
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

	getDesiredPaths := func() []string {
		desired := append([]string{}, kubeConfigPaths...)
		credPaths := getReferencedCredentialPaths(kubeConfigStore)
		desired = append(desired, credPaths...)

		return desired
	}

	// add files to watcher
	updateWatcherPaths(watcher, getDesiredPaths())

	for {
		select {
		case <-ctx.Done():
			logger.Log(logger.LevelInfo, nil, nil, "watcher: shutting down kubeconfig watcher")

			return
		case <-ticker.C:
			desired := getDesiredPaths()
			beforeWatchList := watcher.WatchList()
			updateWatcherPaths(watcher, desired)
			afterWatchList := watcher.WatchList()

			if hasWatchListChanged(beforeWatchList, afterWatchList) {
				logger.Log(logger.LevelInfo, nil, nil, "watcher: watchlist updated, reloading contexts")

				err := LoadAndStoreKubeConfigs(kubeConfigStore, paths, source, ignoreFunc)
				if err != nil {
					logger.Log(logger.LevelError, nil, err, "watcher: error loading kubeconfig files")
				}
			}

		case event := <-watcher.Events:
			if isEventTrigger(event.Op) {
				logger.Log(logger.LevelInfo, map[string]string{"event": event.Name},
					nil, "watcher: file changed, reloading contexts")

				err := syncContexts(kubeConfigStore, paths, source, ignoreFunc)
				if err != nil {
					logger.Log(logger.LevelError, nil, err, "watcher: error synchronizing contexts")
				}

				updateWatcherPaths(watcher, getDesiredPaths())
			}

		case err := <-watcher.Errors:
			logger.Log(logger.LevelError, nil, err, "watcher: error watching kubeconfig files")
		}
	}
}

// hasWatchListChanged checks if the watch list of paths has changed between before and after states.
func hasWatchListChanged(before, after []string) bool {
	if len(before) != len(after) {
		return true
	}

	for _, path := range before {
		if !slices.Contains(after, path) {
			return true
		}
	}

	return false
}

// isEventTrigger returns true if the fsnotify operation is one of the triggers we care about.
func isEventTrigger(op fsnotify.Op) bool {
	triggers := []fsnotify.Op{fsnotify.Create, fsnotify.Write, fsnotify.Remove, fsnotify.Rename}
	for _, trigger := range triggers {
		if op.Has(trigger) {
			return true
		}
	}

	return false
}

// syncContexts synchronizes the contexts in the store with the ones in the kubeconfig files.
func syncContexts(kubeConfigStore ContextStore, paths string, source int, ignoreFunc shouldBeSkippedFunc) error {
	// First read all kubeconfig files to get new contexts
	newContexts, _, err := LoadContextsFromMultipleFiles(paths, source)
	if err != nil {
		return fmt.Errorf("error reading kubeconfig files: %w", err)
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
			isMatch := false
			if existingCtx.ClusterID != "" && newCtx.ClusterID != "" {
				isMatch = existingCtx.ClusterID == newCtx.ClusterID
			} else {
				isMatch = existingCtx.Name == newCtx.Name
			}

			if isMatch {
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
	err = LoadAndStoreKubeConfigs(kubeConfigStore, paths, source, ignoreFunc)
	if err != nil {
		return fmt.Errorf("error loading kubeconfig files: %w", err)
	}

	return nil
}

// getReferencedCredentialPaths retrieves absolute paths of all external credential/certificate files
// referenced in KubeConfig type contexts in the store.
func getReferencedCredentialPaths(kubeConfigStore ContextStore) []string {
	contexts, err := kubeConfigStore.GetContexts()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "watcher: error getting contexts to extract credential paths")
		return nil
	}

	var paths []string

	for _, ctx := range contexts {
		if ctx.Source != KubeConfig || ctx.AuthInfo == nil {
			continue
		}

		for _, relPath := range []string{ctx.AuthInfo.ClientCertificate, ctx.AuthInfo.ClientKey, ctx.AuthInfo.TokenFile} {
			if relPath == "" {
				continue
			}

			absPath := relPath
			if !filepath.IsAbs(relPath) && ctx.KubeConfigPath != "" {
				absPath = filepath.Join(filepath.Dir(ctx.KubeConfigPath), relPath)
			}

			absPath, err = filepath.Abs(absPath)
			if err != nil {
				continue
			}

			if !slices.Contains(paths, absPath) {
				paths = append(paths, absPath)
			}
		}
	}

	return paths
}

// normalizePaths converts relative paths to absolute and de-duplicates them.
func normalizePaths(desiredPaths []string) []string {
	normalizedDesired := make([]string, 0, len(desiredPaths))

	seen := make(map[string]struct{}, len(desiredPaths))
	for _, p := range desiredPaths {
		if p == "" {
			continue
		}

		absPath := p
		if !filepath.IsAbs(p) {
			var err error

			absPath, err = filepath.Abs(p)
			if err != nil {
				logger.Log(logger.LevelError, map[string]string{logFieldPath: p}, err, "getting absolute path")
				continue
			}
		}

		if _, ok := seen[absPath]; ok {
			continue
		}

		seen[absPath] = struct{}{}
		normalizedDesired = append(normalizedDesired, absPath)
	}

	return normalizedDesired
}

// updateWatcherPaths registers desired paths to be watched and deregisters stale ones.
func updateWatcherPaths(watcher *fsnotify.Watcher, desiredPaths []string) {
	desiredPaths = normalizePaths(desiredPaths)

	// Remove any path that is no longer desired (diff against actual watcher state)
	for _, path := range watcher.WatchList() {
		if !slices.Contains(desiredPaths, path) {
			if err := watcher.Remove(path); err != nil {
				logger.Log(logger.LevelError, map[string]string{logFieldPath: path}, err, "removing path from watcher")
			}
		}
	}

	for _, absPath := range desiredPaths {
		if _, err := os.Stat(absPath); err != nil {
			// If the file no longer exists (or is otherwise unreadable), ensure we don't keep a stale watch.
			if slices.Contains(watcher.WatchList(), absPath) {
				_ = watcher.Remove(absPath)
			}

			if os.IsNotExist(err) {
				logger.Log(logger.LevelError, map[string]string{logFieldPath: absPath}, err, "Path does not exist")
			} else {
				logger.Log(logger.LevelError, map[string]string{logFieldPath: absPath}, err, "stat path")
			}

			continue
		}

		filesBeingWatched := watcher.WatchList()
		if !slices.Contains(filesBeingWatched, absPath) {
			err := watcher.Add(absPath)
			if err != nil {
				logger.Log(logger.LevelError, map[string]string{logFieldPath: absPath}, err, "adding path to watcher")
				continue
			}
		}
	}
}
