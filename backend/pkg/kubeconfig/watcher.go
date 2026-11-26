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
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
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

	// The reload can reference credential files that are not watched yet.
	reAddMissingFiles(watched, kubeConfigStore, paths, source, ignoreFunc)

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

// maxWatchReloads bounds the reloads of one reAddMissingFiles call.
const maxWatchReloads = 3

// reAddMissingFiles watches the kubeconfig and credential files that were
// missing or that a symlink now resolves to, and reloads the kubeconfig when
// it starts watching one or a watched one is gone. No event fires when a
// symlink is retargeted or deleted while its target stays, so this reload also
// removes the contexts that are gone.
//
// A reload can reference credential files that are not watched yet, such as
// those of a context it added or changed. One of them could change before it
// is watched, so watch them and reload again. Watched paths only change when
// files do, so this ends; the bound keeps a file system that keeps changing
// from holding it up.
func reAddMissingFiles(
	watcher *fileWatcher,
	kubeConfigStore ContextStore,
	paths string,
	source int,
	ignoreFunc shouldBeSkippedFunc,
) {
	for range maxWatchReloads {
		if !updateWatcherPaths(watcher, watchedPaths(kubeConfigStore, paths)) {
			return
		}

		logger.Log(logger.LevelInfo, nil, nil, "watcher: re-added missing files")

		err := syncContexts(kubeConfigStore, paths, source, ignoreFunc)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "watcher: error synchronizing contexts")
		}
	}
}

// isEventTrigger returns true if the fsnotify operation is one of the triggers we care about.
func isEventTrigger(op fsnotify.Op) bool {
	// Chmod, as restoring a credential file's read permission fires nothing else.
	triggers := []fsnotify.Op{fsnotify.Create, fsnotify.Write, fsnotify.Remove, fsnotify.Rename, fsnotify.Chmod}
	for _, trigger := range triggers {
		if op.Has(trigger) {
			return true
		}
	}

	return false
}

// syncContexts synchronizes the contexts in the store with the ones in the kubeconfig files.
//
// Of the contexts defined under a name, the last one is stored, as when the
// files are first loaded. Which one that is comes from the definitions, not
// from the contexts that load: one whose proxy can't be set up yet, as one with
// an API proxy while its token file is missing, does not hand its name to an
// earlier definition.
//
// The store is changed with ReplaceContext, against the contexts read from it
// before, so that a context stored meanwhile, such as a dynamic cluster, is not
// replaced or removed.
func syncContexts(kubeConfigStore ContextStore, paths string, source int, ignoreFunc shouldBeSkippedFunc) error {
	return withKubeConfigLocks(paths, func() error {
		return syncContextsLocked(kubeConfigStore, paths, source, ignoreFunc)
	})
}

func syncContextsLocked(kubeConfigStore ContextStore, paths string, source int, ignoreFunc shouldBeSkippedFunc) error {
	existingPaths := ExistingKubeConfigPaths(paths)

	loaded, definitions, contextErrors, err := loadKubeConfigs(existingPaths, source)
	if err != nil {
		return fmt.Errorf("error reading kubeconfig files: %w", err)
	}

	stored, err := kubeConfigStore.GetContexts()
	if err != nil {
		return fmt.Errorf("error getting existing contexts: %w", err)
	}

	storedByName := make(map[string]*Context, len(stored))
	for _, c := range stored {
		storedByName[c.Name] = c
	}

	defined := lastDefinitions(definitions, ignoreFunc)
	reloaded := lastLoaded(loaded, defined)

	removeUnloadedContexts(kubeConfigStore, stored, defined, reloaded)

	var errs []error

	for i := range loaded {
		name, err := storeName(&loaded[i])
		if err != nil || reloaded[name] != &loaded[i] {
			continue
		}

		s := storedByName[name]
		if s != nil && (s.Source == DynamicCluster || keepStoredContext(s, defined[name])) {
			continue
		}

		if _, err := kubeConfigStore.ReplaceContext(name, s, &loaded[i]); err != nil {
			errs = append(errs, err)
		}
	}

	for _, contextError := range contextErrors {
		errs = append(errs, fmt.Errorf("error in context %s: %w", contextError.ContextName, contextError.Error))
	}

	if len(errs) > 0 {
		return fmt.Errorf("error loading kubeconfig files: %w", errors.Join(errs...))
	}

	return nil
}

// removeUnloadedContexts removes the stored kubeconfig contexts that are no
// longer defined, or whose definition no longer loads, unless that is only
// because a credential file it needs can't be used yet; see keepStoredContext.
func removeUnloadedContexts(kubeConfigStore ContextStore, stored []*Context, defined, reloaded map[string]*Context) {
	for _, s := range stored {
		if s.Source != KubeConfig || reloaded[s.Name] != nil {
			continue
		}

		if d, ok := defined[s.Name]; ok && keepStoredContext(s, d) {
			continue
		}

		if _, err := kubeConfigStore.ReplaceContext(s.Name, s, nil); err != nil {
			logger.Log(logger.LevelError, nil, err, "error removing context")
		}
	}
}

// loadKubeConfigs loads the contexts of the kubeconfig files, and returns them
// with the contexts the files define, from parseKubeConfig. Both come from one
// read of each file, so a file rewritten in between can't define other
// contexts than were loaded. It fails if a file can't be read or parsed, as
// while it is being rewritten, so a reload then leaves the store unchanged,
// rather than removing the file's contexts, until the next one.
func loadKubeConfigs(
	paths string, source int,
) (loaded, defined []Context, contextErrors []ContextLoadError, err error) {
	if paths == "" {
		return nil, nil, nil, nil
	}

	for _, path := range splitKubeConfigPath(paths) {
		data, err := os.ReadFile(filepath.Clean(path))
		if err != nil {
			return nil, nil, nil, fmt.Errorf("error reading kubeconfig file: %w", err)
		}

		contexts, errs, err := loadContextsFromFileData(data, path, source)
		if err != nil {
			return nil, nil, nil, err
		}

		parsed, err := parseKubeConfig(data, path, source)
		if err != nil {
			return nil, nil, nil, err
		}

		loaded = append(loaded, contexts...)
		defined = append(defined, parsed...)
		contextErrors = append(contextErrors, errs...)
	}

	return loaded, defined, contextErrors, nil
}

// parseKubeConfig returns the contexts the kubeconfig file at path, with the
// contents data, defines, without setting up their proxies, so those whose
// proxy setup fails are included. A context that can't be processed, such as
// one with an invalid api-proxy URL, is included with just its name, so an
// earlier kubeconfig's context of that name doesn't take its place.
func parseKubeConfig(data []byte, path string, source int) ([]Context, error) {
	contexts, contextErrors, err := loadContextsFromData(data, source, true, path)
	if err != nil {
		return nil, err
	}

	for _, contextError := range contextErrors {
		failed := Context{
			Name:                  MakeDNSFriendly(contextError.ContextName),
			KubeConfigContextName: contextError.ContextName,
			Error:                 contextError.Error.Error(),
		}
		if contextError.Context != nil {
			failed = *contextError.Context.Copy()
			failed.Error = contextError.Error.Error()
		}

		contexts = append(contexts, failed)
	}

	for i := range contexts {
		contexts[i].KubeConfigPath = path
	}

	return contexts, nil
}

// parseKubeConfigs returns the contexts defined in the kubeconfig files, as
// parseKubeConfig does, leaving out the files that can't be read or parsed.
func parseKubeConfigs(paths string, source int) []Context {
	var contexts []Context

	for _, path := range splitKubeConfigPath(paths) {
		data, err := os.ReadFile(filepath.Clean(path))
		if err != nil {
			continue
		}

		if parsed, err := parseKubeConfig(data, path, source); err == nil {
			contexts = append(contexts, parsed...)
		}
	}

	return contexts
}

// lastDefinitions returns the last context defined under each store name,
// leaving out the ones ignoreFunc skips.
func lastDefinitions(contexts []Context, ignoreFunc shouldBeSkippedFunc) map[string]*Context {
	defined := make(map[string]*Context, len(contexts))

	for i := range contexts {
		if ignoreFunc != nil && ignoreFunc(contexts[i]) {
			continue
		}

		if name, err := storeName(&contexts[i]); err == nil {
			defined[name] = &contexts[i]
		}
	}

	return defined
}

// lastLoaded returns, for each store name, the loaded context of its last
// definition, if that loaded.
func lastLoaded(loaded []Context, defined map[string]*Context) map[string]*Context {
	reloaded := make(map[string]*Context, len(defined))

	for i := range loaded {
		name, err := storeName(&loaded[i])
		if err != nil {
			continue
		}

		if d, ok := defined[name]; ok && d.KubeConfigPath == loaded[i].KubeConfigPath &&
			d.KubeConfigContextName == loaded[i].KubeConfigContextName {
			reloaded[name] = &loaded[i]
		}
	}

	return reloaded
}

// keepStoredContext reports whether the stored kubeconfig context should be
// kept rather than replaced by, or removed for, its definition, while a
// credential file it needs can't be used yet, as in a remove-and-recreate
// rotation or while the file is rewritten. Its proxy could not set up a
// transport, so this keeps the stored context with its working proxy, and the
// reload when the file changes again replaces it. Only the stored context's
// files are watched, so this needs the definition to be configured the same,
// in the same kubeconfig: then only the files' contents differ. A context with
// any other change, such as a new server or credential file, is replaced, or
// removed if it can't load, so the change applies and its files get watched.
func keepStoredContext(stored, definition *Context) bool {
	return stored.Source == KubeConfig && definition != nil &&
		sameConfig(stored, definition) && credentialFileUnavailable(definition)
}

// sameConfig reports whether the kubeconfig contexts stored and reloaded are
// configured the same, from the same kubeconfig, so that only the contents of
// the files they reference can differ.
func sameConfig(stored, reloaded *Context) bool {
	return stored.KubeConfigPath == reloaded.KubeConfigPath &&
		reflect.DeepEqual(stored.Cluster, reloaded.Cluster) &&
		reflect.DeepEqual(stored.AuthInfo, reloaded.AuthInfo) &&
		reflect.DeepEqual(stored.KubeContext, reloaded.KubeContext)
}

// ExistingKubeConfigPaths drops the watched paths that do not exist on disk.
// A watched kubeconfig file can be deleted or not created yet, and the watcher
// treats that as a file with no contexts rather than as a load error.
func ExistingKubeConfigPaths(paths string) string {
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
		if absPath, ok := credentialPath(ctx, relPath); ok {
			paths = append(paths, absPath)
		}
	}

	return paths
}

// credentialPath returns the absolute path of a credential file the context
// references, resolved against the directory of its kubeconfig.
func credentialPath(ctx *Context, relPath string) (string, bool) {
	if relPath == "" {
		return "", false
	}

	absPath := relPath
	if !filepath.IsAbs(relPath) && ctx.KubeConfigPath != "" {
		absPath = filepath.Join(filepath.Dir(ctx.KubeConfigPath), relPath)
	}

	absPath, err := filepath.Abs(absPath)

	return absPath, err == nil
}

// credentialFileUnavailable reports whether a credential file the context
// needs can't be used: it is missing, can't be read, or is empty, as while it
// is being rewritten, or it holds a client certificate or key that doesn't
// match the other, as between writing one and the other in a rotation. A token
// file is not needed when the context also has an inline token, which
// client-go uses when the file can't be read. Client certificate and key files
// that are empty or don't match are fine for a context with an API proxy,
// which doesn't use them.
func credentialFileUnavailable(ctx *Context) bool {
	needed := ctx
	apiProxy, apiProxyErr := ctx.APIProxy()

	if ctx.AuthInfo != nil && ctx.AuthInfo.Token != "" && ctx.AuthInfo.TokenFile != "" {
		authInfo := *ctx.AuthInfo
		authInfo.TokenFile = ""
		needed = &Context{AuthInfo: &authInfo, KubeConfigPath: ctx.KubeConfigPath}
	}

	for _, path := range credentialPaths(needed) {
		data, err := os.ReadFile(filepath.Clean(path))
		if err != nil {
			return true
		}

		unusedTLSFile := false

		if apiProxyErr == nil && apiProxy != nil && needed.AuthInfo != nil {
			if relCertPath, certOK := credentialPath(needed, needed.AuthInfo.ClientCertificate); certOK &&
				relCertPath == path {
				unusedTLSFile = true
			}

			if relKeyPath, keyOK := credentialPath(needed, needed.AuthInfo.ClientKey); keyOK &&
				relKeyPath == path {
				unusedTLSFile = true
			}
		}

		if len(bytes.TrimSpace(data)) == 0 && !unusedTLSFile {
			return true
		}
	}

	if apiProxyErr == nil && apiProxy != nil {
		return false
	}

	return clientKeyPairMismatched(ctx)
}

// clientKeyPairMismatched reports whether the context's client certificate and
// key, at least one of them read from a file, don't form a key pair. Like
// client-go, it takes inline data over a file.
func clientKeyPairMismatched(ctx *Context) bool {
	if ctx.AuthInfo == nil || (ctx.AuthInfo.ClientCertificate == "" && ctx.AuthInfo.ClientKey == "") {
		return false
	}

	read := func(data []byte, relPath string) []byte {
		if len(data) > 0 {
			return data
		}

		path, ok := credentialPath(ctx, relPath)
		if !ok {
			return nil
		}

		data, _ = os.ReadFile(filepath.Clean(path))

		return data
	}

	certPEM := read(ctx.AuthInfo.ClientCertificateData, ctx.AuthInfo.ClientCertificate)
	keyPEM := read(ctx.AuthInfo.ClientKeyData, ctx.AuthInfo.ClientKey)

	if len(certPEM) == 0 || len(keyPEM) == 0 {
		return false
	}

	_, err := tls.X509KeyPair(certPEM, keyPEM)

	return err != nil
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
// contexts reference. Those of the contexts defined in the files are included,
// as a context whose proxy can't be set up, as one with an API proxy while its
// token file is missing, is not stored, but loads once the file exists.
func watchedPaths(kubeConfigStore ContextStore, paths string) []string {
	watched := append(splitKubeConfigPath(paths), getReferencedCredentialPaths(kubeConfigStore)...)

	defined := parseKubeConfigs(ExistingKubeConfigPaths(paths), KubeConfig)
	for i := range defined {
		watched = append(watched, credentialPaths(&defined[i])...)
	}

	return watched
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
