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

package helm_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/helm"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/repo"
)

const (
	testUsername = "testuser"
	testPassword = "testpass"
)

func newHelmHandler(t *testing.T) *helm.Handler {
	t.Helper()

	cache := cache.New[interface{}]()
	require.NotNil(t, cache)

	helmHandler, err := helm.NewHandlerWithSettings(cache, settings)
	require.NoError(t, err)

	return helmHandler
}

// newIsolatedHelmHandler creates a Handler with its own temporary repository config,
// isolated from the shared test state used by newHelmHandler.
func newIsolatedHelmHandler(t *testing.T) *helm.Handler {
	t.Helper()

	customSettings := cli.New()
	customSettings.RepositoryConfig = filepath.Join(t.TempDir(), "repositories.yaml")

	c := cache.New[interface{}]()
	require.NotNil(t, c)

	helmHandler, err := helm.NewHandlerWithSettings(c, customSettings)
	require.NoError(t, err)

	return helmHandler
}

// mustJSONBody marshals v to JSON and returns a buffer. Safe to use with test credentials.
func mustJSONBody(t *testing.T, v any) *bytes.Buffer {
	t.Helper()

	b, err := json.Marshal(v)
	require.NoError(t, err)

	return bytes.NewBuffer(b)
}

// newAuthRepoIndexServer starts a test HTTP server that requires basic auth.
func newAuthRepoIndexServer(t *testing.T) *httptest.Server {
	t.Helper()

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if !ok || user != testUsername || pass != testPassword {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"apiVersion":"v1","entries":{},"generated":"2025-01-01T00:00:00Z"}`))
	}))
}

func checkRepoExists(t *testing.T, helmHandler *helm.Handler, repoName string) bool {
	t.Helper()

	listRepoReq, err := http.NewRequestWithContext(context.Background(),
		"GET", "/clusters/minikube/helm/repositories", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()

	helmHandler.ListRepo(rr, listRepoReq)
	require.Equal(t, http.StatusOK, rr.Code)

	var listRepoResponse helm.ListRepoResponse

	err = json.Unmarshal(rr.Body.Bytes(), &listRepoResponse)
	require.NoError(t, err)

	for _, repo := range listRepoResponse.Repositories {
		if repo.Name == repoName {
			return true
		}
	}

	return false
}

//nolint:unparam
func testAddRepo(t *testing.T, helmHandler *helm.Handler, repoName, repoURL string) {
	t.Helper()

	addRepo := helm.AddUpdateRepoRequest{
		Name: "headlamp_test_repo",
		URL:  "https://kubernetes-sigs.github.io/headlamp/",
	}

	addRepoRequest, err := http.NewRequestWithContext(context.Background(), "POST",
		"/clusters/minikube/helm/repositories/charts", mustJSONBody(t, addRepo))
	require.NoError(t, err)

	rr := httptest.NewRecorder()

	helmHandler.AddRepo(rr, addRepoRequest)
	assert.Equal(t, http.StatusOK, rr.Code)

	assert.True(t, checkRepoExists(t, helmHandler, "headlamp_test_repo"))
}

// TestAddRepositoryToHelm.
func TestAddRepository(t *testing.T) {
	helmHandler := newHelmHandler(t)

	t.Run("add_repo_success", func(t *testing.T) {
		testAddRepo(t, helmHandler, "headlamp_test_repo", "https://kubernetes-sigs.github.io/headlamp/")
	})

	t.Run("invalid_add_repo_request", func(t *testing.T) {
		addRepoRequest, err := http.NewRequestWithContext(context.Background(),
			"POST", "/clusters/minikube/helm/repositories/charts",
			bytes.NewBufferString("some invalid request string"))
		require.NoError(t, err)

		rr := httptest.NewRecorder()

		helmHandler.AddRepo(rr, addRepoRequest)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("missing_name", func(t *testing.T) {
		req, err := http.NewRequestWithContext(context.Background(), "POST",
			"/clusters/minikube/helm/repositories/charts",
			bytes.NewBufferString(`{"url":"https://kubernetes-sigs.github.io/headlamp/"}`))
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		helmHandler.AddRepo(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
		assert.Contains(t, rr.Body.String(), "name is required")
	})

	t.Run("missing_url", func(t *testing.T) {
		req, err := http.NewRequestWithContext(context.Background(), "POST",
			"/clusters/minikube/helm/repositories/charts",
			bytes.NewBufferString(`{"name":"headlamp_test_repo"}`))
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		helmHandler.AddRepo(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
		assert.Contains(t, rr.Body.String(), "url is required")
	})
}

// TestRemoveRepository.
func TestRemoveRepository(t *testing.T) {
	helmHandler := newHelmHandler(t)

	t.Run("remove_repo_success", func(t *testing.T) {
		testAddRepo(t, helmHandler, "headlamp_test_repo", "https://kubernetes-sigs.github.io/headlamp/")

		removeRepoRequest, err := http.NewRequestWithContext(context.Background(), "DELETE",
			"/clusters/minikube/helm/repositories/?name=headlamp_test_repo", nil)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		helmHandler.RemoveRepo(rr, removeRepoRequest)

		assert.False(t, checkRepoExists(t, helmHandler, "headlamp_test_repo"))
	})

	t.Run("remove_repo_not_found", func(t *testing.T) {
		removeRepoRequest, err := http.NewRequestWithContext(context.Background(), "DELETE",
			"/clusters/minikube/helm/repositories/?name=repo-that-does-not-exist", nil)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		helmHandler.RemoveRepo(rr, removeRepoRequest)

		assert.Equal(t, http.StatusNotFound, rr.Code)
	})
}

// TestUpdateRepo.
func TestUpdateRepo(t *testing.T) {
	helmHandler := newHelmHandler(t)

	t.Run("update_repo_success", func(t *testing.T) {
		testUpdateRepo(t, helmHandler)
	})

	t.Run("invalid_update_repo_request", func(t *testing.T) {
		updateRepoRequest, err := http.NewRequestWithContext(context.Background(), "PUT",
			"/clusters/minikube/helm/repositories", bytes.NewBufferString("some invalid request string"))
		require.NoError(t, err)

		rr := httptest.NewRecorder()

		helmHandler.UpdateRepository(rr, updateRepoRequest)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("missing_name", func(t *testing.T) {
		req, err := http.NewRequestWithContext(context.Background(), "PUT",
			"/clusters/minikube/helm/repositories",
			bytes.NewBufferString(`{"url":"https://kubernetes-sigs-update-url.github.io/headlamp/"}`))
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		helmHandler.UpdateRepository(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
		assert.Contains(t, rr.Body.String(), "name is required")
	})

	t.Run("missing_url", func(t *testing.T) {
		req, err := http.NewRequestWithContext(context.Background(), "PUT",
			"/clusters/minikube/helm/repositories",
			bytes.NewBufferString(`{"name":"headlamp_test_repo"}`))
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		helmHandler.UpdateRepository(rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
		assert.Contains(t, rr.Body.String(), "url is required")
	})
}

// TestListRepositories.
func TestListRepositories(t *testing.T) {
	helmHandler := newHelmHandler(t)

	testAddRepo(t, helmHandler, "headlamp_test_repo", "https://kubernetes-sigs.github.io/headlamp/")

	listRepoReq, err := http.NewRequestWithContext(context.Background(),
		"GET", "/clusters/minikube/helm/repositories", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()

	helmHandler.ListRepo(rr, listRepoReq)
	require.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Header().Get("Content-Type"), "application/json")

	var listRepoResponse helm.ListRepoResponse

	err = json.Unmarshal(rr.Body.Bytes(), &listRepoResponse)
	assert.NoError(t, err)
}

func TestRemoveRepositoryMissingNameReturnsBadRequest(t *testing.T) {
	helmHandler := newHelmHandler(t)

	removeRepoRequest, err := http.NewRequestWithContext(context.Background(), "DELETE",
		"/clusters/minikube/helm/repositories/", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	helmHandler.RemoveRepo(rr, removeRepoRequest)

	require.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "name query parameter is required")
}

func TestListRepoSetsJSONContentType(t *testing.T) {
	customSettings := cli.New()
	customSettings.RepositoryConfig = filepath.Join(t.TempDir(), "repositories.yaml")

	repoFile := repo.NewFile()
	repoFile.Update(&repo.Entry{
		Name: "sample",
		URL:  "https://example.test/charts",
	})
	require.NoError(t, repoFile.WriteFile(customSettings.RepositoryConfig, 0o644))

	cache := cache.New[interface{}]()
	require.NotNil(t, cache)

	helmHandler, err := helm.NewHandlerWithSettings(cache, customSettings)
	require.NoError(t, err)

	listRepoReq, err := http.NewRequestWithContext(context.Background(),
		"GET", "/clusters/minikube/helm/repositories", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	helmHandler.ListRepo(rr, listRepoReq)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Header().Get("Content-Type"), "application/json")
}

func TestAddRepositoryWithAuth(t *testing.T) {
	helmHandler := newIsolatedHelmHandler(t)

	ts := newAuthRepoIndexServer(t)
	defer ts.Close()

	username := testUsername
	password := testPassword

	addRepo := helm.AddUpdateRepoRequest{
		Name:     "auth_test_repo",
		URL:      ts.URL,
		Username: &username,
		Password: &password,
	}

	req, err := http.NewRequestWithContext(context.Background(), "POST",
		"/clusters/minikube/helm/repositories/charts", mustJSONBody(t, addRepo))
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	helmHandler.AddRepo(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)

	repoFile, err := repo.LoadFile(helmHandler.RepositoryConfig)
	require.NoError(t, err)

	addedEntry := repoFile.Get("auth_test_repo")
	require.NotNil(t, addedEntry)
	assert.Equal(t, testUsername, addedEntry.Username)
	assert.Equal(t, testPassword, addedEntry.Password)
}

func testUpdateRepo(t *testing.T, helmHandler *helm.Handler) {
	t.Helper()

	testAddRepo(t, helmHandler, "headlamp_test_repo", "https://kubernetes-sigs.github.io/headlamp/")

	updateRepo := helm.AddUpdateRepoRequest{
		Name: "headlamp_test_repo",
		URL:  "https://kubernetes-sigs-update-url.github.io/headlamp/",
	}

	updateRepoRequest, err := http.NewRequestWithContext(context.Background(),
		"PUT", "/clusters/minikube/helm/repositories",
		mustJSONBody(t, updateRepo))
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	helmHandler.UpdateRepository(rr, updateRepoRequest)
	assert.Equal(t, http.StatusOK, rr.Code)

	listRepoReq, err := http.NewRequestWithContext(context.Background(),
		"GET", "/clusters/minikube/helm/repositories", nil)
	require.NoError(t, err)

	rr = httptest.NewRecorder()
	helmHandler.ListRepo(rr, listRepoReq)

	var listRepoResponse helm.ListRepoResponse

	err = json.Unmarshal(rr.Body.Bytes(), &listRepoResponse)
	assert.NoError(t, err)

	for _, repo := range listRepoResponse.Repositories {
		if repo.Name == "headlamp_test_repo" {
			assert.Equal(t, "https://kubernetes-sigs-update-url.github.io/headlamp/", repo.URL)
		}
	}
}

func TestUpdateRepositoryPreservesAuth(t *testing.T) {
	helmHandler := newIsolatedHelmHandler(t)

	ts := newAuthRepoIndexServer(t)
	defer ts.Close()

	username := testUsername
	password := testPassword

	addRepo := helm.AddUpdateRepoRequest{
		Name:     "auth_update_repo",
		URL:      ts.URL,
		Username: &username,
		Password: &password,
	}

	req, err := http.NewRequestWithContext(context.Background(), "POST",
		"/clusters/minikube/helm/repositories/charts", mustJSONBody(t, addRepo))
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	helmHandler.AddRepo(rr, req)
	require.Equal(t, http.StatusOK, rr.Code)

	updateRepo := helm.AddUpdateRepoRequest{
		Name: "auth_update_repo",
		URL:  ts.URL,
	}

	updateReq, err := http.NewRequestWithContext(context.Background(), "PUT",
		"/clusters/minikube/helm/repositories", mustJSONBody(t, updateRepo))
	require.NoError(t, err)

	rr = httptest.NewRecorder()
	helmHandler.UpdateRepository(rr, updateReq)
	assert.Equal(t, http.StatusOK, rr.Code)

	repoFile, err := repo.LoadFile(helmHandler.RepositoryConfig)
	require.NoError(t, err)

	updatedEntry := repoFile.Get("auth_update_repo")
	require.NotNil(t, updatedEntry)

	assert.Equal(t, testUsername, updatedEntry.Username)
	assert.Equal(t, testPassword, updatedEntry.Password)
}

func TestCreateFileIfNotThere(t *testing.T) {
	t.Run("creates_missing_file_and_directories", func(t *testing.T) {
		dir := t.TempDir()

		customSettings := cli.New()
		customSettings.RepositoryConfig = filepath.Join(dir, "nonexistent", "subdir", "repositories.yaml")

		ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"apiVersion":"v1","entries":{},"generated":"2025-01-01T00:00:00Z"}`))
		}))
		defer ts.Close()

		c := cache.New[interface{}]()
		helmHandler, err := helm.NewHandlerWithSettings(c, customSettings)
		require.NoError(t, err)

		addRepo := helm.AddUpdateRepoRequest{
			Name: "file_create_test_repo",
			URL:  ts.URL,
		}

		req, err := http.NewRequestWithContext(context.Background(), "POST",
			"/clusters/minikube/helm/repositories/charts", mustJSONBody(t, addRepo))
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		helmHandler.AddRepo(rr, req)
		assert.Equal(t, http.StatusOK, rr.Code)

		_, statErr := os.Stat(customSettings.RepositoryConfig)
		assert.NoError(t, statErr, "repository config file should have been created by createFileIfNotThere")
	})
}
