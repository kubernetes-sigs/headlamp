package helm_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/helm"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newHelmHandler(t *testing.T) *helm.Handler {
	t.Helper()

	k8sclient := GetClient(t, "minikube")

	cache := cache.New[interface{}]()
	require.NotNil(t, cache)

	helmHandler, err := helm.NewHandlerWithSettings(k8sclient, cache, "default", settings)
	require.NoError(t, err)

	return helmHandler
}

func checkRepoExists(t *testing.T, helmHandler *helm.Handler, repoName string) bool {
	t.Helper()

	// list repositories
	listRepoReq, err := http.NewRequestWithContext(context.Background(),
		"GET", "/clusters/minikube/helm/repositories", nil)
	require.NoError(t, err)

	// response recorder
	rr := httptest.NewRecorder()

	helmHandler.ListRepo(rr, listRepoReq)
	require.Equal(t, http.StatusOK, rr.Code)

	var listRepoResponse helm.ListRepoResponse

	err = json.Unmarshal(rr.Body.Bytes(), &listRepoResponse)
	require.NoError(t, err)

	for _, repo := range listRepoResponse.Repositories {
		repo := repo
		if repo.Name == repoName {
			return true
		}
	}

	return false
}

//nolint:unparam
func testAddRepo(t *testing.T, helmHandler *helm.Handler, repoName, repoURL string) {
	t.Helper()

	// add headlmap repo
	addRepo := helm.AddUpdateRepoRequest{
		Name: "headlamp_test_repo",
		URL:  "https://kubernetes-sigs.github.io/headlamp/",
	}

	addRepoRequestJSON, err := json.Marshal(addRepo)
	require.NoError(t, err)

	addRepoRequest, err := http.NewRequestWithContext(context.Background(), "POST",
		"/clusters/minikube/helm/repositories/charts", bytes.NewBuffer(addRepoRequestJSON))
	require.NoError(t, err)

	// response recorder
	rr := httptest.NewRecorder()

	helmHandler.AddRepo(rr, addRepoRequest)
	assert.Equal(t, http.StatusOK, rr.Code)

	// check if repository exists in list
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

		// response recorder
		rr := httptest.NewRecorder()

		helmHandler.AddRepo(rr, addRepoRequest)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

// TestRemoveRepository.
func TestRemoveRepository(t *testing.T) {
	helmHandler := newHelmHandler(t)

	t.Run("remove_repo_success", func(t *testing.T) {
		testAddRepo(t, helmHandler, "headlamp_test_repo", "https://kubernetes-sigs.github.io/headlamp/")

		// remove repository
		removeRepoRequest, err := http.NewRequestWithContext(context.Background(), "DELETE",
			"/clusters/minikube/helm/repositories/?name=headlamp_test_repo", nil)
		require.NoError(t, err)

		// response recorder
		rr := httptest.NewRecorder()
		helmHandler.RemoveRepo(rr, removeRepoRequest)

		assert.False(t, checkRepoExists(t, helmHandler, "headlamp_test_repo"))
	})
}

// TestUpdateRepo.
func TestUpdateRepo(t *testing.T) {
	helmHandler := newHelmHandler(t)

	t.Run("update_repo_success", func(t *testing.T) {
		testAddRepo(t, helmHandler, "headlamp_test_repo", "https://kubernetes-sigs.github.io/headlamp/")

		// update repository request
		updateRepo := helm.AddUpdateRepoRequest{
			Name: "headlamp_test_repo",
			URL:  "https://kubernetes-sigs-update-url.github.io/headlamp/",
		}

		updateRepoRequestJSON, err := json.Marshal(updateRepo)
		require.NoError(t, err)

		updateRepoRequest, err := http.NewRequestWithContext(context.Background(),
			"PUT", "/clusters/minikube/helm/repositories",
			bytes.NewBuffer(updateRepoRequestJSON))
		require.NoError(t, err)

		// response recorder
		rr := httptest.NewRecorder()

		helmHandler.UpdateRepository(rr, updateRepoRequest)
		assert.Equal(t, http.StatusOK, rr.Code)

		// check if repository exists in list
		// list repositories
		listRepoReq, err := http.NewRequestWithContext(context.Background(),
			"GET", "/clusters/minikube/helm/repositories", nil)
		require.NoError(t, err)

		// response recorder
		rr = httptest.NewRecorder()

		helmHandler.ListRepo(rr, listRepoReq)

		var listRepoResponse helm.ListRepoResponse

		err = json.Unmarshal(rr.Body.Bytes(), &listRepoResponse)
		assert.NoError(t, err)

		for _, repo := range listRepoResponse.Repositories {
			repo := repo
			if repo.Name == "headlamp_test_repo" {
				assert.Equal(t, "https://kubernetes-sigs-update-url.github.io/headlamp/", repo.URL)
			}
		}
	})

	t.Run("invalid_update_repo_request", func(t *testing.T) {
		updateRepoRequest, err := http.NewRequestWithContext(context.Background(), "PUT",
			"/clusters/minikube/helm/repositories", bytes.NewBufferString("some invalid request string"))
		require.NoError(t, err)

		// response recorder
		rr := httptest.NewRecorder()

		helmHandler.UpdateRepository(rr, updateRepoRequest)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})
}

// TestListRepositories.
func TestListRepositories(t *testing.T) {
	helmHandler := newHelmHandler(t)

	testAddRepo(t, helmHandler, "headlamp_test_repo", "https://kubernetes-sigs.github.io/headlamp/")

	// list repositories
	listRepoReq, err := http.NewRequestWithContext(context.Background(),
		"GET", "/clusters/minikube/helm/repositories", nil)
	require.NoError(t, err)

	// response recorder
	rr := httptest.NewRecorder()

	helmHandler.ListRepo(rr, listRepoReq)

	var listRepoResponse helm.ListRepoResponse

	err = json.Unmarshal(rr.Body.Bytes(), &listRepoResponse)
	assert.NoError(t, err)
}
