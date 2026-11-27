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

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func newMockSelfSubjectReviewServer(t *testing.T, tokenToUser map[string]string) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/apis/authentication.k8s.io/v1/selfsubjectreviews" || r.Method != http.MethodPost {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		authHeader := r.Header.Get("Authorization")

		user, ok := tokenToUser[authHeader]
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"kind":"Status","apiVersion":"v1","status":"Failure","code":401}`))

			return
		}

		w.Header().Set("Content-Type", "application/json")

		resp := map[string]interface{}{
			"kind":       "SelfSubjectReview",
			"apiVersion": "authentication.k8s.io/v1",
			"status": map[string]interface{}{
				"userInfo": map[string]interface{}{
					"username": user,
				},
			},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	t.Cleanup(srv.Close)

	return srv
}

func newMockChartRepoServer(t *testing.T) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/x-yaml")
		_, _ = w.Write([]byte("apiVersion: v1\nentries:\n  poison:\n    - name: poison\n      version: 1.0.0\n"))
	}))
	t.Cleanup(srv.Close)

	return srv
}

func newInClusterHelmTestHandler(t *testing.T, k8sURL string) http.Handler {
	t.Helper()

	tokenFile := writeTestTokenFile(t)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:        "main",
		KubeContext: &api.Context{Cluster: "main", AuthInfo: "main"},
		Cluster:     &api.Cluster{Server: k8sURL},
		AuthInfo:    &api.AuthInfo{TokenFile: tokenFile},
		Source:      kubeconfig.InCluster,
	}))

	hc := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: store,
				UseInCluster:    true,
				EnableHelm:      true,
			},
			Cache: cache.New[interface{}](),
		},
	}

	return newRemainingTestHandler(t, hc)
}

func TestHelmRepositoryRoutesRejectUnauthenticated(t *testing.T) {
	k8sSrv := newMockSelfSubjectReviewServer(t, map[string]string{
		"Bearer anon-token": "system:anonymous",
	})
	chartRepoSrv := newMockChartRepoServer(t)
	h := newInClusterHelmTestHandler(t, k8sSrv.URL)

	t.Run("unknown clusterName returns 404 even with Authorization header", func(t *testing.T) {
		req := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPost,
			"/clusters/anything/helm/repositories",
			bytes.NewBufferString(`{"name":"bitnami","url":"`+chartRepoSrv.URL+`"}`),
		)
		req.Header.Set("Authorization", "x")

		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("non-Bearer Authorization header is rejected with 401", func(t *testing.T) {
		for _, tc := range []struct {
			method string
			path   string
			body   string
		}{
			{http.MethodGet, "/clusters/main/helm/repositories", ""},
			{http.MethodPost, "/clusters/main/helm/repositories", `{"name":"bitnami","url":"` + chartRepoSrv.URL + `"}`},
			{http.MethodPut, "/clusters/main/helm/repositories/update", `{"name":"bitnami","url":"` + chartRepoSrv.URL + `"}`},
			{http.MethodDelete, "/clusters/main/helm/repositories/remove?name=bitnami", ""},
			{http.MethodGet, "/clusters/main/helm/charts", ""},
		} {
			req := httptest.NewRequestWithContext(context.Background(), tc.method, tc.path, bytes.NewBufferString(tc.body))
			req.Header.Set("Authorization", "x")

			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			assert.Equal(t, http.StatusUnauthorized, rec.Code, "%s %s", tc.method, tc.path)
		}
	})

	t.Run("forged Bearer token and anonymous user are rejected with 401", func(t *testing.T) {
		for _, token := range []string{"forged-token", "anon-token"} {
			req := httptest.NewRequestWithContext(
				context.Background(),
				http.MethodPost,
				"/clusters/main/helm/repositories",
				bytes.NewBufferString(`{"name":"bitnami","url":"`+chartRepoSrv.URL+`"}`),
			)
			req.Header.Set("Authorization", "Bearer "+token)

			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			assert.Equal(t, http.StatusUnauthorized, rec.Code, "token %s", token)
		}
	})
}

func doHelmAuthReq(
	t *testing.T,
	h http.Handler,
	method, path, token, body string,
) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequestWithContext(context.Background(), method, path, bytes.NewBufferString(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	return rec
}

func TestHelmRepositoryRoutesIsolateUsers(t *testing.T) {
	k8sSrv := newMockSelfSubjectReviewServer(t, map[string]string{
		"Bearer alice-valid-token": "alice",
		"Bearer bob-valid-token":   "bob",
	})
	chartRepoSrv := newMockChartRepoServer(t)
	h := newInClusterHelmTestHandler(t, k8sSrv.URL)

	addRec := doHelmAuthReq(t, h, http.MethodPost, "/clusters/main/helm/repositories",
		"alice-valid-token", `{"name":"bitnami-test","url":"`+chartRepoSrv.URL+`"}`)
	require.Equal(t, http.StatusOK, addRec.Code)

	t.Cleanup(func() {
		doHelmAuthReq(t, h, http.MethodDelete, "/clusters/main/helm/repositories/remove?name=bitnami-test",
			"alice-valid-token", "")
	})

	aliceListRec := doHelmAuthReq(t, h, http.MethodGet, "/clusters/main/helm/repositories", "alice-valid-token", "")
	require.Equal(t, http.StatusOK, aliceListRec.Code)
	assert.Contains(t, aliceListRec.Body.String(), `"bitnami-test"`)

	bobListRec := doHelmAuthReq(t, h, http.MethodGet, "/clusters/main/helm/repositories", "bob-valid-token", "")
	require.Equal(t, http.StatusOK, bobListRec.Code)
	assert.NotContains(t, bobListRec.Body.String(), `"bitnami-test"`)

	installBody := `{"name":"rel","namespace":"default","chart":"bitnami-test/poison",` +
		`"version":"1.0.0","description":"test"}`
	bobInstallRec := doHelmAuthReq(t, h, http.MethodPost, "/clusters/main/helm/release/install",
		"bob-valid-token", installBody)
	assert.Equal(t, http.StatusBadRequest, bobInstallRec.Code)
	assert.Contains(t, bobInstallRec.Body.String(), "not registered")
}

func TestHelmRepositoryRoutesOIDCDesktopValidation(t *testing.T) {
	k8sSrv := newMockSelfSubjectReviewServer(t, map[string]string{
		"Bearer alice-valid-token": "alice",
	})
	chartRepoSrv := newMockChartRepoServer(t)

	oidcStore := kubeconfig.NewContextStore()
	require.NoError(t, oidcStore.AddContext(&kubeconfig.Context{
		Name:        "oidc-cluster",
		KubeContext: &api.Context{Cluster: "oidc-cluster", AuthInfo: "oidc"},
		Cluster:     &api.Cluster{Server: k8sSrv.URL},
		AuthInfo:    &api.AuthInfo{},
		OidcConf:    &kubeconfig.OidcConfig{ClientID: "cid"},
	}))

	oidcHC := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: oidcStore,
				UseInCluster:    false,
				EnableHelm:      true,
			},
			Cache: cache.New[interface{}](),
		},
	}

	oidcHandler := newRemainingTestHandler(t, oidcHC)

	badReq := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		"/clusters/oidc-cluster/helm/repositories",
		bytes.NewBufferString(`{"name":"bitnami","url":"`+chartRepoSrv.URL+`"}`),
	)
	badReq.Header.Set("Authorization", "Bearer forged-token")

	badRec := httptest.NewRecorder()
	oidcHandler.ServeHTTP(badRec, badReq)
	assert.Equal(t, http.StatusUnauthorized, badRec.Code)

	okReq := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodGet,
		"/clusters/oidc-cluster/helm/repositories",
		nil,
	)
	okReq.Header.Set("Authorization", "Bearer alice-valid-token")

	okRec := httptest.NewRecorder()
	oidcHandler.ServeHTTP(okRec, okReq)
	assert.Equal(t, http.StatusOK, okRec.Code)
}
