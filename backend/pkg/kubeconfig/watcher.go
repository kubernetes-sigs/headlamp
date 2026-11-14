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

// fileWatcher is an fsnotify watcher that remembers the file each watched path
// resolved to when it was added. A watch follows symlinks to the target file,
// so a symlink retargeted to another file needs a new watch.
type fileWatcher struct {
	*fsnotify.Watcher
	files map[string]os.FileInfo
}

func newFileWatcher(watcher *fsnotify.Watcher) *fileWatcher {
	return &fileWatcher{Watcher: watcher, files: make(map[string]os.FileInfo)}
}

// unwatch stops watching path. A path that shares another path's watch, as
// described in watches, is not in the watch list, so a removal error is
// expected and ignored.
func (w *fileWatcher) unwatch(path string) {
	_ = w.Remove(path)
	delete(w.files, path)
}

// watches reports whether a watch is registered on the file info describes.
// On Linux, paths that resolve to the same file share one watch, which
// fsnotify lists only under the path added first.
func (w *fileWatcher) watches(info os.FileInfo) bool {
	for _, path := range w.WatchList() {
		if watched, ok := w.files[path]; ok && os.SameFile(watched, info) {
			return true
		}
	}

	return false
}

// LoadAndWatchFiles watches kubeconfig files (and any referenced credential files) and reloads contexts on changes.
// It registers the watches and reloads the contexts before returning, so that
// contexts stored after it returns, such as dynamic clusters, still replace
// kubeconfig contexts of the same name. It then watches the files in the
// background until the provided context is cancelled.
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

	// create watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating watcher")

		return
	}

	watched := newFileWatcher(watcher)

	updateWatcherPaths(watched, watchedPaths(kubeConfigStore, paths))

	// Reload once the files are watched, in case one changed or was deleted
	// after the contexts were loaded but before its watch was registered.
	if err := syncContexts(kubeConfigStore, paths, source, ignoreFunc); err != nil {
		logger.Log(logger.LevelError, nil, err, "watcher: error synchronizing contexts")
	}

	go watchFiles(ctx, watched, kubeConfigStore, paths, source, ignoreFunc)
}

// watchFiles reloads the contexts when a watched file changes, until ctx is
// cancelled.
func watchFiles(
	ctx context.Context,
	watched *fileWatcher,
	kubeConfigStore ContextStore,
	paths string,
	source int,
	ignoreFunc shouldBeSkippedFunc,
) {
	defer func() { _ = watched.Close() }()

	ticker := time.NewTicker(watchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Log(logger.LevelInfo, nil, nil, "watcher: shutting down kubeconfig watcher")

			return
		case <-ticker.C:
			reAddMissingFiles(watched, kubeConfigStore, paths, source, ignoreFunc)

		case event := <-watched.Events:
			if isEventTrigger(event.Op) {
				logger.Log(logger.LevelInfo, map[string]string{"event": event.Name},
					nil, "watcher: file changed, reloading contexts")

				// A removed or renamed file's watch is stale; drop it so the
				// replacement file is watched once it exists.
				if event.Op.Has(fsnotify.Remove) || event.Op.Has(fsnotify.Rename) {
					watched.unwatch(event.Name)
				}

				err := syncContexts(kubeConfigStore, paths, source, ignoreFunc)
				if err != nil {
					logger.Log(logger.LevelError, nil, err, "watcher: error synchronizing contexts")
				}

				// In a remove-and-recreate rotation the new file can appear
				// before this point, so reload again if it was re-added.
				reAddMissingFiles(watched, kubeConfigStore, paths, source, ignoreFunc)
			}

		case err := <-watched.Errors:
			logger.Log(logger.LevelError, nil, err, "watcher: error watching kubeconfig files")
		}
	}
}

// reAddMissingFiles watches the kubeconfig and credential files that were
// missing or that a symlink now resolves to, and reloads the kubeconfig when
// it starts watching one or a watched one is gone. No event fires when a
// symlink is retargeted or deleted while its target stays, so this reload also
// removes the contexts that are gone.
func reAddMissingFiles(
	watcher *fileWatcher,
	kubeConfigStore ContextStore,
	paths string,
	source int,
	ignoreFunc shouldBeSkippedFunc,
) {
	if !updateWatcherPaths(watcher, watchedPaths(kubeConfigStore, paths)) {
		return
	}

	logger.Log(logger.LevelInfo, nil, nil, "watcher: re-added missing files")

	err := syncContexts(kubeConfigStore, paths, source, ignoreFunc)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "watcher: error synchronizing contexts")
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

		for i := range newContexts {
			// A context renamed in Headlamp is stored under its custom name.
			if name, err := storeName(&newContexts[i]); err == nil && existingCtx.Name == name {
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
	err = LoadAndStoreKubeConfigs(kubeConfigStore, existingPaths, source,
		keepContextsMissingCredentials(existingContexts, newContexts, ignoreFunc))
	if err != nil {
		return fmt.Errorf("error loading kubeconfig files: %w", err)
	}

	return nil
}

// keepContextsMissingCredentials returns ignoreFunc extended to also skip
// reloaded contexts that replace a stored kubeconfig context while a
// credential file they reference is missing, as in a remove-and-recreate
// rotation. The proxy of the replacement could not set up a transport, so
// this keeps the stored context with its working proxy. The reload when the
// file is watched again replaces it.
//
// Only the stored context's files are watched, so it is only kept when the
// reloaded context that would replace it, the last one stored under its
// name, comes from the same kubeconfig and references the same files. A
// context changed to use a file that does not exist yet is replaced, so its
// new file gets watched.
func keepContextsMissingCredentials(
	stored []*Context,
	reloaded []Context,
	ignoreFunc shouldBeSkippedFunc,
) shouldBeSkippedFunc {
	skipped := func(c Context) bool {
		return ignoreFunc != nil && ignoreFunc(c)
	}

	storedKubeConfig := make(map[string]*Context, len(stored))

	for _, c := range stored {
		if c.Source == KubeConfig {
			storedKubeConfig[c.Name] = c
		}
	}

	replacing := make(map[string]*Context, len(reloaded))

	for i := range reloaded {
		if name, err := storeName(&reloaded[i]); err == nil && !skipped(reloaded[i]) {
			replacing[name] = &reloaded[i]
		}
	}

	keep := make(map[string]bool, len(replacing))

	for name, c := range replacing {
		s, ok := storedKubeConfig[name]
		keep[name] = ok && s.KubeConfigPath == c.KubeConfigPath &&
			slices.Equal(credentialPaths(s), credentialPaths(c)) && missingCredentialFile(c)
	}

	return func(c Context) bool {
		if skipped(c) {
			return true
		}

		name, err := storeName(&c)

		return err == nil && keep[name]
	}
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

// credentialPaths returns the absolute paths of the credential/certificate
// files the context references.
func credentialPaths(ctx *Context) []string {
	if ctx.AuthInfo == nil {
		return nil
	}

	var paths []string

	for _, relPath := range []string{ctx.AuthInfo.ClientCertificate, ctx.AuthInfo.ClientKey, ctx.AuthInfo.TokenFile} {
		if relPath == "" {
			continue
		}

		absPath := relPath
		if !filepath.IsAbs(relPath) && ctx.KubeConfigPath != "" {
			absPath = filepath.Join(filepath.Dir(ctx.KubeConfigPath), relPath)
		}

		absPath, err := filepath.Abs(absPath)
		if err != nil {
			continue
		}

		paths = append(paths, absPath)
	}

	return paths
}

// missingCredentialFile reports whether a credential file the context
// references does not exist.
func missingCredentialFile(ctx *Context) bool {
	for _, path := range credentialPaths(ctx) {
		if _, err := os.Stat(path); errors.Is(err, fs.ErrNotExist) {
			return true
		}
	}

	return false
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
		if ctx.Source != KubeConfig {
			continue
		}

		for _, absPath := range credentialPaths(ctx) {
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

		absPath := filepath.Clean(p)
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
// It reports whether any path was newly added, re-added because it now
// resolves to a different file, or dropped because it is gone. A missing file
// is skipped and is added once it exists.
func updateWatcherPaths(watcher *fileWatcher, desiredPaths []string) bool {
	desiredPaths = normalizePaths(desiredPaths)

	// Remove any path that is no longer desired
	for path := range watcher.files {
		if !slices.Contains(desiredPaths, path) {
			watcher.unwatch(path)
		}
	}

	changed := false

	for _, absPath := range desiredPaths {
		info, err := os.Stat(absPath)
		if err != nil {
			// Don't keep a stale watch on a file that is gone or unreadable.
			if _, ok := watcher.files[absPath]; ok {
				watcher.unwatch(absPath)

				changed = true
			}

			if !errors.Is(err, fs.ErrNotExist) {
				logger.Log(logger.LevelError, map[string]string{logFieldPath: absPath}, err, "stat path")
			}

			continue
		}

		// A retargeted symlink still stats fine, but its watch is on the old
		// file, which no longer gets the events for this path. Compare by file
		// rather than by the watch list, which leaves out paths that share
		// another path's watch.
		if watched, ok := watcher.files[absPath]; ok && os.SameFile(watched, info) && watcher.watches(info) {
			continue
		}

		_ = watcher.Remove(absPath)

		if err := watcher.Add(absPath); err != nil {
			logger.Log(logger.LevelError, map[string]string{logFieldPath: absPath}, err, "adding path to watcher")
			continue
		}

		watcher.files[absPath] = info
		changed = true
	}

	return changed
}
