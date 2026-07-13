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
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofrs/flock"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"

	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/getter"
	"helm.sh/helm/v3/pkg/repo"
)

const (
	defaultNewConfigFileMode   os.FileMode = os.FileMode(0o644)
	defaultNewConfigFolderMode os.FileMode = os.FileMode(0o770)
)

var (
	errRepositoryNotFound        = errors.New("repository not found")
	errRepositoryLockNotAcquired = errors.New("repository lock not acquired")
)

// CertFile, KeyFile, and CAFile are intentionally omitted from this struct.
// Accepting filesystem paths from HTTP clients would allow arbitrary local
// file reads on the server. These values are preserved from the existing
// repo entry only (server-side state).
type AddUpdateRepoRequest struct {
	Name                  string  `json:"name"`
	URL                   string  `json:"url"`
	Username              *string `json:"username"`
	Password              *string `json:"password"`
	InsecureSkipTLSverify *bool   `json:"insecureSkipTLSverify"`
	PassCredentialsAll    *bool   `json:"passCredentialsAll"`
}

func (r AddUpdateRepoRequest) Validate() error {
	if strings.TrimSpace(r.Name) == "" {
		return errors.New("name is required")
	}

	if strings.TrimSpace(r.URL) == "" {
		return errors.New("url is required")
	}

	return nil
}

func createFileIfNotThere(fileName string) error {
	_, err := os.Stat(fileName)
	if os.IsNotExist(err) {
		file, err := createFullPath(fileName)
		if err != nil {
			return err
		}

		return file.Close()
	}

	return err
}

func lockRepositoryFile(lockCtx context.Context, repositoryConfig string) (bool, *flock.Flock, error) {
	var lockPath string

	repoFileExt := filepath.Ext(repositoryConfig)

	if len(repoFileExt) > 0 && len(repoFileExt) < len(repositoryConfig) {
		lockPath = strings.Replace(repositoryConfig, repoFileExt, ".lock", 1)
	} else {
		lockPath = repositoryConfig + ".lock"
	}

	fileLock := flock.New(lockPath)

	locked, err := fileLock.TryLockContext(lockCtx, time.Second)

	return locked, fileLock, err
}

func ensureRepositoryFileLocked(locked bool, err error) error {
	if err != nil {
		return err
	}

	if !locked {
		return errRepositoryLockNotAcquired
	}

	return nil
}

const timeoutForLock = 30 * time.Second

// applyRequestFields applies non-nil fields from request onto entry,
// leaving existing entry values unchanged for any field not set in the request.
func applyRequestFields(entry *repo.Entry, request AddUpdateRepoRequest) {
	if request.Username != nil {
		entry.Username = *request.Username
	}

	if request.Password != nil {
		entry.Password = *request.Password
	}

	if request.InsecureSkipTLSverify != nil {
		entry.InsecureSkipTLSverify = *request.InsecureSkipTLSverify
	}

	if request.PassCredentialsAll != nil {
		entry.PassCredentialsAll = *request.PassCredentialsAll
	}
}

// addRepository adds a repository with the given request fields to the helm config.
// Returns an error if the repository cannot be created or its index downloaded.
func addRepository(request AddUpdateRepoRequest, settings *cli.EnvSettings) error {
	err := createFileIfNotThere(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating empty RepositoryConfig file")
		return err
	}

	lockCtx, cancel := context.WithTimeout(context.Background(), timeoutForLock)
	defer cancel()

	locked, fileLock, err := lockRepositoryFile(lockCtx, settings.RepositoryConfig)
	if err = ensureRepositoryFileLocked(locked, err); err != nil {
		logger.Log(logger.LevelError, nil, err, "locking repository config file")
		return err
	}

	defer func() {
		if err := fileLock.Unlock(); err != nil {
			logger.Log(logger.LevelError, nil, err, "unlocking repository config file")
		}
	}()

	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return err
	}

	newRepo := &repo.Entry{
		Name: request.Name,
		URL:  request.URL,
	}

	applyRequestFields(newRepo, request)

	r, err := repo.NewChartRepository(newRepo, getter.All(settings))
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating chart repository")
		return err
	}

	_, err = r.DownloadIndexFile()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "downloading index file")
		return err
	}

	repoFile.Update(newRepo)

	err = repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing repo file")
		return err
	}

	return nil
}

func (h *Handler) AddRepo(w http.ResponseWriter, r *http.Request) {
	var request AddUpdateRepoRequest

	err := json.NewDecoder(r.Body).Decode(&request)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "parsing request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	if err = request.Validate(); err != nil {
		logger.Log(logger.LevelError, nil, err, "validating request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	err = addRepository(request, h.EnvSettings)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := map[string]string{
		"message": "success",
	}

	var buf bytes.Buffer

	if err = json.NewEncoder(&buf).Encode(response); err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if _, err = w.Write(buf.Bytes()); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing response")
	}
}

type repositoryInfo struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type ListRepoResponse struct {
	Repositories []repositoryInfo `json:"repositories"`
}

func createFullPath(p string) (*os.File, error) {
	if err := os.MkdirAll(filepath.Dir(p), defaultNewConfigFolderMode); err != nil {
		return nil, err
	}

	return os.Create(p) //nolint:gosec
}

func listRepositories(settings *cli.EnvSettings) ([]repositoryInfo, error) {
	err := createFileIfNotThere(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating empty RepositoryConfig file")
		return nil, err
	}

	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return nil, err
	}

	repositories := make([]repositoryInfo, 0, len(repoFile.Repositories))

	for _, repo := range repoFile.Repositories {
		repositories = append(repositories, repositoryInfo{
			Name: repo.Name,
			URL:  repo.URL,
		})
	}

	return repositories, nil
}

func (h *Handler) ListRepo(w http.ResponseWriter, r *http.Request) {
	repositories, err := listRepositories(h.EnvSettings)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := ListRepoResponse{
		Repositories: repositories,
	}

	var buf bytes.Buffer

	if err = json.NewEncoder(&buf).Encode(response); err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if _, err = w.Write(buf.Bytes()); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing response")
	}
}

func RemoveRepository(name string, settings *cli.EnvSettings) error {
	err := createFileIfNotThere(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating empty RepositoryConfig file")
		return err
	}

	lockCtx, cancel := context.WithTimeout(context.Background(), timeoutForLock)
	defer cancel()

	locked, fileLock, err := lockRepositoryFile(lockCtx, settings.RepositoryConfig)
	if err = ensureRepositoryFileLocked(locked, err); err != nil {
		logger.Log(logger.LevelError, nil, err, "locking repository config file")
		return err
	}

	defer func() {
		err := fileLock.Unlock()
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "unlocking repository config file")
		}
	}()

	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return err
	}

	isRemoved := repoFile.Remove(name)
	if !isRemoved {
		logger.Log(logger.LevelError, map[string]string{"repository": name}, errRepositoryNotFound, "repository not found")
		return errRepositoryNotFound
	}

	err = repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing repo file")
		return err
	}

	return nil
}

func (h *Handler) RemoveRepo(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "name query parameter is required", http.StatusBadRequest)
		return
	}

	err := RemoveRepository(name, h.EnvSettings)
	if err != nil {
		if errors.Is(err, errRepositoryNotFound) {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.WriteHeader(http.StatusOK)
}

func copyExistingRepoFields(updated, existing *repo.Entry) {
	updated.Username = existing.Username
	updated.Password = existing.Password
	updated.CertFile = existing.CertFile
	updated.KeyFile = existing.KeyFile
	updated.CAFile = existing.CAFile
	updated.InsecureSkipTLSverify = existing.InsecureSkipTLSverify
	updated.PassCredentialsAll = existing.PassCredentialsAll
}

// UpdateRepository updates an existing repository entry.
// It returns errRepositoryNotFound if the named repository does not exist.
// Callers that need create-or-update behaviour should use AddRepo instead.
func UpdateRepository(name, url string, settings *cli.EnvSettings) error {
	return updateRepositoryWithRequest(AddUpdateRepoRequest{
		Name: name,
		URL:  url,
	}, settings)
}

func updateRepositoryWithRequest(request AddUpdateRepoRequest, settings *cli.EnvSettings) error {
	err := createFileIfNotThere(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating empty RepositoryConfig file")
		return err
	}

	lockCtx, cancel := context.WithTimeout(context.Background(), timeoutForLock)
	defer cancel()

	locked, fileLock, err := lockRepositoryFile(lockCtx, settings.RepositoryConfig)
	if err = ensureRepositoryFileLocked(locked, err); err != nil {
		logger.Log(logger.LevelError, nil, err, "locking repository config file")
		return err
	}

	defer func() {
		err := fileLock.Unlock()
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "unlocking repository config file")
		}
	}()

	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return err
	}

	updated := &repo.Entry{
		Name: request.Name,
		URL:  request.URL,
	}

	existing := repoFile.Get(request.Name)
	if existing == nil {
		logger.Log(
			logger.LevelError,
			map[string]string{"repository": request.Name},
			errRepositoryNotFound,
			"repository not found",
		)

		return errRepositoryNotFound
	}

	copyExistingRepoFields(updated, existing)

	applyRequestFields(updated, request)
	repoFile.Update(updated)

	err = repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing repo file")
		return err
	}

	return nil
}

func (h *Handler) UpdateRepository(w http.ResponseWriter, r *http.Request) {
	var request AddUpdateRepoRequest

	err := json.NewDecoder(r.Body).Decode(&request)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "parsing request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	if err = request.Validate(); err != nil {
		logger.Log(logger.LevelError, nil, err, "validating request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	err = updateRepositoryWithRequest(request, h.EnvSettings)
	if err != nil {
		if errors.Is(err, errRepositoryNotFound) {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}

		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.WriteHeader(http.StatusOK)
}
