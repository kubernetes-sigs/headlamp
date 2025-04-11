package helm

import (
	"context"
	"encoding/json"
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

// add repository.
type AddUpdateRepoRequest struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	// TODO: Figure out how to support auth
	// like username, password, certfile etc
	// https://github.com/helm/helm/blob/39ca699ca790e02ba36753dec6ba4177cc68d417/cmd/helm/repo_add.go#L169
}

// Creates a filename if it's not there, including any missing directories.
func createFileIfNotThere(fileName string) error {
	_, err := os.Stat(fileName)
	if os.IsNotExist(err) {
		// create changes
		_, err = createFullPath(fileName)
		return err
	}

	return nil
}

// Uses a file lock like the helm tool.
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

const timeoutForLock = 30 * time.Second

// Adds a repository with name, url to the helm config. Returns error if there is one.
func addRepository(name string, url string, settings *cli.EnvSettings) error {
	err := createFileIfNotThere(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating empty RepositoryConfig file")
		return err
	}

	lockCtx, cancel := context.WithTimeout(context.Background(), timeoutForLock)
	defer cancel()

	locked, fileLock, err := lockRepositoryFile(lockCtx, settings.RepositoryConfig)
	if err == nil && locked {
		defer func() {
			err := fileLock.Unlock()
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "unlocking repository config file")
			}
		}()
	}

	if err != nil {
		logger.Log(logger.LevelError, nil, err, "locking repository config file")
		return err
	}

	// read repo file
	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return err
	}

	// add repo
	newRepo := &repo.Entry{
		Name: name,
		URL:  url,
	}

	repo, err := repo.NewChartRepository(newRepo, getter.All(settings))
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating chart repository")
		return err
	}

	// download chart repo index
	_, err = repo.DownloadIndexFile()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "downloading index file")
		return err
	}

	// write repo file
	repoFile.Update(newRepo)

	err = repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing repo file")
		return err
	}

	return nil
}

func (h *Handler) AddRepo(w http.ResponseWriter, r *http.Request) {
	// parse request
	var request AddUpdateRepoRequest

	err := json.NewDecoder(r.Body).Decode(&request)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "parsing request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	err = addRepository(request.Name, request.URL, h.EnvSettings)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// respond
	response := map[string]string{
		"message": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	err = json.NewEncoder(w).Encode(response)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}
}

// List repository.
type repositoryInfo struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}
type ListRepoResponse struct {
	Repositories []repositoryInfo `json:"repositories"`
}

// Create a full path, including directories if it does not exist.
func createFullPath(p string) (*os.File, error) {
	if err := os.MkdirAll(filepath.Dir(p), defaultNewConfigFolderMode); err != nil {
		return nil, err
	}

	return os.Create(p)
}

func listRepositories(settings *cli.EnvSettings) ([]repositoryInfo, error) {
	err := createFileIfNotThere(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating empty RepositoryConfig file")
		return nil, err
	}

	// read repo file
	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return nil, err
	}

	// response
	repositories := make([]repositoryInfo, 0, len(repoFile.Repositories))

	for _, repo := range repoFile.Repositories {
		repo := repo

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

	w.WriteHeader(http.StatusOK)
	w.Header().Set("Content-Type", "application/json")

	err = json.NewEncoder(w).Encode(response)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
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
	if err == nil && locked {
		defer func() {
			err := fileLock.Unlock()
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "unlocking repository config file")
			}
		}()
	}

	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return err
	}

	isRemoved := repoFile.Remove(name)
	if !isRemoved {
		logger.Log(logger.LevelError, nil, err, "repository not found")
		return err
	}

	// write repo file
	err = repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing repo file")
		return err
	}

	return nil
}

// Remove repository name.
func (h *Handler) RemoveRepo(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")

	err := RemoveRepository(name, h.EnvSettings)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func UpdateRepository(name, url string, settings *cli.EnvSettings) error {
	err := createFileIfNotThere(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating empty RepositoryConfig file")
		return err
	}

	lockCtx, cancel := context.WithTimeout(context.Background(), timeoutForLock)
	defer cancel()

	locked, fileLock, err := lockRepositoryFile(lockCtx, settings.RepositoryConfig)
	if err == nil && locked {
		defer func() {
			err := fileLock.Unlock()
			if err != nil {
				logger.Log(logger.LevelError, nil, err, "unlocking repository config file")
			}
		}()
	}

	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading repo file")
		return err
	}

	// update repo
	repoFile.Update(&repo.Entry{
		Name: name,
		URL:  url,
	})

	err = repoFile.WriteFile(settings.RepositoryConfig, defaultNewConfigFileMode)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing repo file")
		return err
	}

	return nil
}

// Update repository name.
func (h *Handler) UpdateRepository(w http.ResponseWriter, r *http.Request) {
	// parse request
	var request AddUpdateRepoRequest

	err := json.NewDecoder(r.Body).Decode(&request)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "parsing request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	err = UpdateRepository(request.Name, request.URL, h.EnvSettings)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
