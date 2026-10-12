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

package pluginmanager_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/pluginmanager"
)

func makeSecret(name, password string) *corev1.Secret {
	return &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: testNamespace},
		Data:       map[string][]byte{"password": []byte(password)},
	}
}

// requireBasicAuth wraps a handler, answering 401 unless the request carries
// the expected credentials.
func requireBasicAuth(user, pass string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		gotUser, gotPass, ok := r.BasicAuth()
		if !ok || gotUser != user || gotPass != pass {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		next(w, r)
	}
}

func probePost(t *testing.T, router *mux.Router, body string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequestWithContext(
		context.Background(), http.MethodPost, "/clusters/hosting/plugin-manager/probe-index", bytes.NewReader([]byte(body)))
	request.Header.Set("Authorization", "Bearer manager-token")
	router.ServeHTTP(recorder, request)

	return recorder
}

func TestBasicAuthCatalogBrowse(t *testing.T) {
	index := `{"plugins": [{"name": "p", "version": "1.0.0",
		"archiveUrl": "https://example.com/p.tar.gz", "checksum": "` + validChecksum + `"}]}`
	server := httptest.NewServer(requireBasicAuth("nexus", "s3cret",
		func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(index)) }))

	defer server.Close()

	catalog := `{"id": "nexus", "name": "N", "type": "index", "url": "` + server.URL + `/index.json",
		"username": "nexus", "passwordSecret": "nexus-creds"}`
	state := `{"catalogs": [` + catalog + `]}`

	clientset := newFakeClientset(t, makeConfigMap(state), makeSecret("nexus-creds", "s3cret"))
	manager := pluginmanager.NewForTest(clientset, testNamespace, testConfigMap, t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	manager.Run(ctx)
	waitFor(t, "state loaded", func() bool {
		loaded, _ := manager.CurrentState()

		return len(loaded.Catalogs) == 1
	})

	router := routerFor(t, manager)
	assert.Equal(t, http.StatusOK, doGet(t, router, "/plugin-manager/catalogs/nexus/search").Code)
}

func TestBasicAuthFailsWithWrongPassword(t *testing.T) {
	server := httptest.NewServer(requireBasicAuth("nexus", "s3cret",
		func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"plugins": []}`)) }))

	defer server.Close()

	catalog := `{"id": "nexus", "name": "N", "type": "index", "url": "` + server.URL + `/index.json",
		"username": "nexus", "passwordSecret": "nexus-creds"}`
	state := `{"catalogs": [` + catalog + `]}`

	clientset := newFakeClientset(t, makeConfigMap(state), makeSecret("nexus-creds", "wrong"))
	manager := pluginmanager.NewForTest(clientset, testNamespace, testConfigMap, t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	manager.Run(ctx)
	waitFor(t, "state loaded", func() bool {
		loaded, _ := manager.CurrentState()

		return len(loaded.Catalogs) == 1
	})

	router := routerFor(t, manager)
	assert.Equal(t, http.StatusBadGateway, doGet(t, router, "/plugin-manager/catalogs/nexus/search").Code)
}

func TestProbeIndexFindsIndexBelowBaseURL(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/repo/index.json", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"plugins": []}`))
	})
	server := httptest.NewServer(mux)

	defer server.Close()

	router := startCatalogRouter(t, `{"id": "c", "name": "C", "type": "index", "url": "https://x.example"}`)

	recorder := probePost(t, router,
		`{"url": "`+server.URL+`/repo"}`)
	require.Equal(t, http.StatusOK, recorder.Code)

	var result struct {
		IndexURL string `json:"indexUrl"`
	}

	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &result))
	assert.Equal(t, server.URL+"/repo/index.json", result.IndexURL)
}

func TestProbeIndexAcceptsDirectJSONURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"plugins": []}`))
	}))

	defer server.Close()

	router := startCatalogRouter(t, `{"id": "c", "name": "C", "type": "index", "url": "https://x.example"}`)

	recorder := probePost(t, router,
		`{"url": "`+server.URL+`/custom.json"}`)
	require.Equal(t, http.StatusOK, recorder.Code)

	var result struct {
		IndexURL string `json:"indexUrl"`
	}

	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &result))
	assert.Equal(t, server.URL+"/custom.json", result.IndexURL)
}

func TestProbeIndexReportsNothingFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))

	defer server.Close()

	router := startCatalogRouter(t, `{"id": "c", "name": "C", "type": "index", "url": "https://x.example"}`)

	recorder := probePost(t, router, `{"url": "`+server.URL+`/repo"}`)
	assert.Equal(t, http.StatusBadGateway, recorder.Code)
}

func TestProbeIndexWithBasicAuth(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/repo/index.json", requireBasicAuth("u", "p",
		func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{"plugins": []}`)) }))
	server := httptest.NewServer(mux)

	defer server.Close()

	router := startCatalogRouter(t, `{"id": "c", "name": "C", "type": "index", "url": "https://x.example"}`)

	// Without credentials the probe fails.
	assert.Equal(t, http.StatusBadGateway,
		probePost(t, router, `{"url": "`+server.URL+`/repo"}`).Code)

	// With credentials it succeeds.
	recorder := probePost(t, router,
		`{"url": "`+server.URL+`/repo", "username": "u", "password": "p"}`)
	assert.Equal(t, http.StatusOK, recorder.Code)
}

func TestParseStateRejectsInvalidPasswordSecret(t *testing.T) {
	_, err := pluginmanager.ParseState(`{"catalogs": [{"id": "x", "type": "index",
		"url": "https://x.example", "passwordSecret": "../evil"}]}`)
	assert.Error(t, err)
}

func TestManagerRouteAuthorization(t *testing.T) {
	router := startCatalogRouter(t, `{"id":"c","name":"C","type":"index","url":"https://example.com/index.json"}`)

	cases := []struct {
		name, path, token string
		code              int
	}{
		{"anonymous", "/clusters/hosting/plugin-manager", "", http.StatusUnauthorized},
		{"denied", "/clusters/hosting/plugin-manager", "denied", http.StatusForbidden},
		{"reader info", "/clusters/hosting/plugin-manager", "reader-token", http.StatusOK},
		{"reader search", "/clusters/hosting/plugin-manager/catalogs/c/search", "reader-token", http.StatusForbidden},
		{"remote cluster", "/clusters/remote/plugin-manager", "manager-token", http.StatusNotFound},
		{"global route", "/plugin-manager", "manager-token", http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, tc.path, nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}

			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)
			assert.Equal(t, tc.code, recorder.Code)
		})
	}
}

func TestProbeRejectsUnauthorizedRequestsBeforeFetching(t *testing.T) {
	requests := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests++
		_, _ = w.Write([]byte(`{"plugins":[]}`))
	}))
	defer server.Close()

	router := startCatalogRouter(t, `{"id":"c","name":"C","type":"index","url":"https://example.com/index.json"}`)
	for _, token := range []string{"", "reader-token", "denied"} {
		req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/clusters/hosting/plugin-manager/probe-index",
			bytes.NewBufferString(`{"url":"`+server.URL+`"}`))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}

		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)
		assert.Contains(t, []int{http.StatusUnauthorized, http.StatusForbidden}, recorder.Code)
	}

	assert.Zero(t, requests)
}

func TestBasicAuthStaysOnCatalogOrigin(t *testing.T) {
	var received []string

	external := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = append(received, r.Header.Get("Authorization"))

		w.WriteHeader(http.StatusOK)
	}))
	defer external.Close()

	catalog := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		username, password, ok := r.BasicAuth()
		assert.True(t, ok)
		assert.Equal(t, "catalog-user", username)
		assert.Equal(t, "catalog-password", password)

		if r.URL.Path == "/redirect" {
			http.Redirect(w, r, external.URL, http.StatusFound)
			return
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer catalog.Close()

	client, err := pluginmanager.HTTPClientFor(
		pluginmanager.Catalog{URL: catalog.URL}, "catalog-user", "catalog-password", time.Second)
	require.NoError(t, err)

	for _, target := range []string{catalog.URL, external.URL, catalog.URL + "/redirect"} {
		req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, target, nil)
		require.NoError(t, err)
		req.SetBasicAuth("catalog-user", "catalog-password")
		response, err := client.Do(req)
		require.NoError(t, err)
		require.NoError(t, response.Body.Close())
		assert.Equal(t, http.StatusOK, response.StatusCode)
	}

	assert.Equal(t, []string{"", ""}, received)
}

func TestBasicAuthDoesNotFollowHTTPSDowngrade(t *testing.T) {
	external := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Empty(t, r.Header.Get("Authorization"))
		w.WriteHeader(http.StatusOK)
	}))
	defer external.Close()

	catalog := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.NotEmpty(t, r.Header.Get("Authorization"))
		http.Redirect(w, r, external.URL, http.StatusFound)
	}))
	defer catalog.Close()

	client, err := pluginmanager.HTTPClientFor(
		pluginmanager.Catalog{URL: catalog.URL, InsecureSkipTLSVerify: true}, "user", "password", time.Second)
	require.NoError(t, err)
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, catalog.URL, nil)
	require.NoError(t, err)
	response, err := client.Do(req)
	require.NoError(t, err)
	require.NoError(t, response.Body.Close())
	assert.Equal(t, http.StatusOK, response.StatusCode)
}
