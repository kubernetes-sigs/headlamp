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

// LoadAndWatchFiles watches kubeconfig files (and any referenced credential files) and reloads contexts on changes.
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

	updateWatcherPaths(watcher, watchedPaths(kubeConfigStore, paths))

	for {
		select {
		case <-ctx.Done():
			logger.Log(logger.LevelInfo, nil, nil, "watcher: shutting down kubeconfig watcher")

			return
		case <-ticker.C:
			reAddMissingFiles(watcher, kubeConfigStore, paths, source, ignoreFunc)

		case event := <-watcher.Events:
			if isEventTrigger(event.Op) {
				logger.Log(logger.LevelInfo, map[string]string{"event": event.Name},
					nil, "watcher: file changed, reloading contexts")

				// A removed or renamed file's watch is stale; drop it so the
				// replacement file is watched once it exists.
				if event.Op.Has(fsnotify.Remove) || event.Op.Has(fsnotify.Rename) {
					_ = watcher.Remove(event.Name)
				}

				err := syncContexts(kubeConfigStore, paths, source, ignoreFunc)
				if err != nil {
					logger.Log(logger.LevelError, nil, err, "watcher: error synchronizing contexts")
				}

				// In a remove-and-recreate rotation the new file can appear
				// before this point, so reload again if it was re-added.
				reAddMissingFiles(watcher, kubeConfigStore, paths, source, ignoreFunc)
			}

		case err := <-watcher.Errors:
			logger.Log(logger.LevelError, nil, err, "watcher: error watching kubeconfig files")
		}
	}
}

// reAddMissingFiles watches the kubeconfig and credential files that were
// missing and reloads the kubeconfig once one of them shows up again.
func reAddMissingFiles(
	watcher *fsnotify.Watcher,
	kubeConfigStore ContextStore,
	paths string,
	source int,
	ignoreFunc shouldBeSkippedFunc,
) {
	if !updateWatcherPaths(watcher, watchedPaths(kubeConfigStore, paths)) {
		return
	}

	logger.Log(logger.LevelInfo, nil, nil, "watcher: re-added missing files")

	err := LoadAndStoreKubeConfigs(kubeConfigStore, existingKubeConfigPaths(paths), source, ignoreFunc)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "watcher: error loading kubeconfig files")
	}
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

// watchedPaths returns the kubeconfig files plus the credential files their
// contexts reference.
func watchedPaths(kubeConfigStore ContextStore, paths string) []string {
	return append(splitKubeConfigPath(paths), getReferencedCredentialPaths(kubeConfigStore)...)
}

// updateWatcherPaths registers desired paths to be watched and deregisters stale ones.
// It reports whether any path was newly added. A missing file is skipped and is
// added once it exists.
func updateWatcherPaths(watcher *fsnotify.Watcher, desiredPaths []string) bool {
	desiredPaths = normalizePaths(desiredPaths)

	// Remove any path that is no longer desired (diff against actual watcher state)
	for _, path := range watcher.WatchList() {
		if !slices.Contains(desiredPaths, path) {
			if err := watcher.Remove(path); err != nil {
				logger.Log(logger.LevelError, map[string]string{logFieldPath: path}, err, "removing path from watcher")
			}
		}
	}

	added := false

	for _, absPath := range desiredPaths {
		if _, err := os.Stat(absPath); err != nil {
			// Don't keep a stale watch on a file that is gone or unreadable.
			if slices.Contains(watcher.WatchList(), absPath) {
				_ = watcher.Remove(absPath)
			}

			if !errors.Is(err, fs.ErrNotExist) {
				logger.Log(logger.LevelError, map[string]string{logFieldPath: absPath}, err, "stat path")
			}

			continue
		}

		if slices.Contains(watcher.WatchList(), absPath) {
			continue
		}

		if err := watcher.Add(absPath); err != nil {
			logger.Log(logger.LevelError, map[string]string{logFieldPath: absPath}, err, "adding path to watcher")
			continue
		}

		added = true
	}

	return added
}
