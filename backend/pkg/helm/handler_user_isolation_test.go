/*
Copyright 2026 The Kubernetes Authors.

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

package helm //nolint:testpackage // Tests cover unexported checkChartRef and Handler.ForUser isolation.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/cli"
	authv1 "k8s.io/api/authentication/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func addRepoForHandler(t *testing.T, h *Handler, name, repoURL string) {
	t.Helper()

	body := fmt.Sprintf(`{"name":%q,"url":%q}`, name, repoURL)
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/repositories",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.AddRepo(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
}

func listReposForHandler(t *testing.T, h *Handler) ListRepoResponse {
	t.Helper()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/repositories", nil)
	rec := httptest.NewRecorder()
	h.ListRepo(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp ListRepoResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))

	return resp
}

func TestHandlerForUserIsolation(t *testing.T) {
	baseDir := t.TempDir()
	baseSettings := cli.New()
	baseSettings.RepositoryConfig = filepath.Join(baseDir, "repositories.yaml")
	baseSettings.RepositoryCache = filepath.Join(baseDir, "cache")

	baseHandler, err := NewHandlerWithSettings(newTestCache(), baseSettings)
	require.NoError(t, err)

	assert.Same(t, baseHandler, baseHandler.ForUser(""))

	alice := baseHandler.ForUser("alice")
	bob := baseHandler.ForUser("bob")

	require.NotEqual(t, baseHandler.RepositoryConfig, alice.RepositoryConfig)
	require.NotEqual(t, alice.RepositoryConfig, bob.RepositoryConfig)
	require.NotEqual(t, alice.RepositoryCache, bob.RepositoryCache)

	repoSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/x-yaml")
		_, _ = w.Write([]byte("apiVersion: v1\nentries:\n  evil-chart:\n    - name: evil-chart\n      version: 1.0.0\n"))
	}))
	t.Cleanup(repoSrv.Close)

	addRepoForHandler(t, alice, "bitnami", repoSrv.URL)

	aliceResp := listReposForHandler(t, alice)
	require.Len(t, aliceResp.Repositories, 1)
	assert.Equal(t, "bitnami", aliceResp.Repositories[0].Name)

	status, err := alice.checkChartRef("bitnami/evil-chart")
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, status)

	// Bob and the base handler must not see Alice's repository.
	assert.Empty(t, listReposForHandler(t, bob).Repositories)
	assert.Empty(t, listReposForHandler(t, baseHandler).Repositories)

	status, err = bob.checkChartRef("bitnami/evil-chart")
	require.Error(t, err)
	assert.Equal(t, http.StatusBadRequest, status)
}

func TestVerifyUserWithClient(t *testing.T) {
	t.Run("accepts authenticated user", func(t *testing.T) {
		cs := fake.NewClientset()
		cs.PrependReactor("create", "selfsubjectreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
			return true, &authv1.SelfSubjectReview{
				Status: authv1.SelfSubjectReviewStatus{
					UserInfo: authv1.UserInfo{Username: "alice"},
				},
			}, nil
		})

		user, err := VerifyUserWithClient(context.Background(), cs)
		require.NoError(t, err)
		assert.Equal(t, "alice", user)
	})

	t.Run("rejects empty username", func(t *testing.T) {
		cs := fake.NewClientset()
		cs.PrependReactor("create", "selfsubjectreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
			return true, &authv1.SelfSubjectReview{}, nil
		})

		_, err := VerifyUserWithClient(context.Background(), cs)
		require.ErrorIs(t, err, errUnauthorizedUser)
	})

	t.Run("rejects system:anonymous", func(t *testing.T) {
		cs := fake.NewClientset()
		cs.PrependReactor("create", "selfsubjectreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
			return true, &authv1.SelfSubjectReview{
				Status: authv1.SelfSubjectReviewStatus{
					UserInfo: authv1.UserInfo{Username: "system:anonymous"},
				},
			}, nil
		})

		_, err := VerifyUserWithClient(context.Background(), cs)
		require.ErrorIs(t, err, errUnauthorizedUser)
	})

	t.Run("rejects API error", func(t *testing.T) {
		cs := fake.NewClientset()
		cs.PrependReactor("create", "selfsubjectreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, errors.New("unauthorized")
		})

		_, err := VerifyUserWithClient(context.Background(), cs)
		require.Error(t, err)
	})
}
