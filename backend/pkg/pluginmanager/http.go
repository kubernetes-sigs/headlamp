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

package pluginmanager

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	authorizationv1 "k8s.io/api/authorization/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	authorizationclient "k8s.io/client-go/kubernetes/typed/authorization/v1"
	"k8s.io/client-go/rest"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

type InfoResponse struct {
	ClusterName     string `json:"clusterName"`
	ResourceVersion string `json:"resourceVersion"`
	Enabled         bool   `json:"enabled"`
	Namespace       string `json:"namespace"`
	ConfigMapName   string `json:"configMapName"`
	State           State  `json:"state"`
	Status          Status `json:"status"`
}

// RegisterRoutes adds the plugin manager endpoints to the router. Persisted
// changes still happen through the Kubernetes API with the user's own
// credentials; the probe endpoint is a stateless helper that does not mutate.
func (m *Manager) RegisterRoutes(router *mux.Router, store kubeconfig.ContextStore) {
	r := router.PathPrefix("/clusters/{clusterName}").Subrouter()
	r.Use(m.authorize(store))
	r.HandleFunc("/plugin-manager", m.handleInfo).Methods(http.MethodGet)
	r.HandleFunc("/plugin-manager/catalogs/{id}/search", m.handleSearch).Methods(http.MethodGet)
	r.HandleFunc("/plugin-manager/catalogs/{id}/resolve", m.handleResolve).Methods(http.MethodGet)
	r.HandleFunc("/plugin-manager/probe-index", m.handleProbeIndex).Methods(http.MethodPost)
}

func (m *Manager) handleInfo(w http.ResponseWriter, r *http.Request) {
	state, status, resourceVersion := m.currentState()

	writeJSON(w, InfoResponse{
		Enabled:         true,
		ClusterName:     mux.Vars(r)["clusterName"],
		ResourceVersion: resourceVersion,
		Namespace:       m.Namespace,
		ConfigMapName:   m.ConfigMapName,
		State:           state,
		Status:          status,
	})
}

func (m *Manager) handleSearch(w http.ResponseWriter, r *http.Request) {
	client, ok := m.catalogClientForRequest(w, r)
	if !ok {
		return
	}

	limit := intQueryParam(r, "limit", defaultSearchLimit, maxSearchLimit)
	offset := intQueryParam(r, "offset", 0, 1<<30)

	entries, err := client.search(r.Context(), r.URL.Query().Get("q"), limit, offset)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)

		return
	}

	writeJSON(w, map[string]interface{}{
		"entries": entries,
		"hasMore": len(entries) == limit,
	})
}

func (m *Manager) handleResolve(w http.ResponseWriter, r *http.Request) {
	client, ok := m.catalogClientForRequest(w, r)
	if !ok {
		return
	}

	entry := CatalogEntry{
		Name:     r.URL.Query().Get("name"),
		RepoName: r.URL.Query().Get("repoName"),
		Version:  r.URL.Query().Get("version"),
		Source:   r.URL.Query().Get("source"),
	}

	if !nameRe.MatchString(entry.Name) {
		writeError(w, http.StatusBadRequest, errInvalidName)

		return
	}

	resolved, err := client.resolve(r.Context(), entry)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)

		return
	}

	writeJSON(w, resolved)
}

// ProbeIndexRequest is the body of POST /plugin-manager/probe-index. The
// credentials are used transiently to probe and are not persisted here.
type ProbeIndexRequest struct {
	URL                   string `json:"url"`
	InsecureSkipTLSVerify bool   `json:"insecureSkipTlsVerify"`
	CACert                string `json:"caCert"`
	Username              string `json:"username"`
	Password              string `json:"password"`
}

// handleProbeIndex tries to locate a plugin index below a base URL, so the UI
// can offer a "search for index" action when the user only entered a repo URL.
func (m *Manager) handleProbeIndex(w http.ResponseWriter, r *http.Request) {
	var body ProbeIndexRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)

		return
	}

	if err := validateHTTPURL(body.URL); err != nil {
		writeError(w, http.StatusBadRequest, err)

		return
	}

	catalog := Catalog{
		ID:                    "probe",
		URL:                   body.URL,
		InsecureSkipTLSVerify: body.InsecureSkipTLSVerify,
		CACert:                body.CACert,
	}

	client, err := httpClientFor(catalog, body.Username, body.Password, catalogHTTPTimeout)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)

		return
	}

	indexURL, err := probeIndex(r.Context(), client, body.URL)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)

		return
	}

	writeJSON(w, map[string]string{"indexUrl": indexURL})
}

// probeIndex requests candidate index locations below rawURL and returns the
// first that serves a valid plugin index.
func probeIndex(ctx context.Context, client *http.Client, rawURL string) (string, error) {
	for _, candidate := range indexCandidates(rawURL) {
		var doc struct {
			Plugins []json.RawMessage `json:"plugins"`
		}

		if err := fetchJSON(ctx, client, candidate, &doc); err == nil && doc.Plugins != nil {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("no plugin index found at or below %s", rawURL)
}

// indexCandidates lists the URLs to try for a given base URL: the URL itself
// when it already points at a .json file, otherwise <base>/index.json.
func indexCandidates(rawURL string) []string {
	trimmed := strings.TrimRight(rawURL, "/")

	if strings.HasSuffix(strings.ToLower(trimmed), ".json") {
		return []string{trimmed}
	}

	return []string{trimmed + "/index.json"}
}

func (m *Manager) catalogClientForRequest(w http.ResponseWriter, r *http.Request) (catalogClient, bool) {
	catalog, err := m.FindCatalog(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusNotFound, err)

		return nil, false
	}

	httpClient, err := m.clientForCatalog(r.Context(), *catalog, catalogHTTPTimeout)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)

		return nil, false
	}

	client, err := newCatalogClient(*catalog, httpClient)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)

		return nil, false
	}

	return client, true
}

type errString string

func (e errString) Error() string { return string(e) }

const errInvalidName = errString("invalid plugin name")

func intQueryParam(r *http.Request, name string, fallback, maxValue int) int {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return fallback
	}

	value, err := strconv.Atoi(raw)
	if err != nil || value < 0 {
		return fallback
	}

	if value > maxValue {
		return maxValue
	}

	return value
}

func writeJSON(w http.ResponseWriter, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		logger.Log(logger.LevelError, nil, err, "plugin manager: writing response")
	}
}

func writeError(w http.ResponseWriter, code int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)

	if err := json.NewEncoder(w).Encode(map[string]string{"error": err.Error()}); err != nil {
		logger.Log(logger.LevelError, nil, err, "plugin manager: writing error response")
	}
}

func (m *Manager) authorize(store kubeconfig.ContextStore) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cluster, err := store.GetContext(mux.Vars(r)["clusterName"])
			if err != nil || cluster.Source != kubeconfig.InCluster {
				writeError(w, http.StatusNotFound, fmt.Errorf("plugin manager is only available in its hosting cluster"))
				return
			}

			auth.SetTokenFromCookie(r, cluster.Name)

			token := auth.BearerTokenValue(r.Header.Get("Authorization"))
			if token == "" {
				writeError(w, http.StatusUnauthorized, fmt.Errorf("authentication required"))
				return
			}

			config, err := cluster.RESTConfig()
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}

			config = rest.AnonymousClientConfig(config)
			config.BearerToken = token

			verb := "update"
			if r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/plugin-manager") {
				verb = "get"
			}

			if err := m.checkAccess(r.Context(), config, verb); err != nil {
				code := http.StatusForbidden
				if apierrors.IsUnauthorized(err) {
					code = http.StatusUnauthorized
				}

				writeError(w, code, err)

				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func (m *Manager) checkAccess(ctx context.Context, config *rest.Config, verb string) error {
	client, err := authorizationclient.NewForConfig(config)
	if err != nil {
		return err
	}

	review, err := client.SelfSubjectAccessReviews().Create(ctx, &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Namespace: m.Namespace, Verb: verb, Resource: "configmaps", Name: m.ConfigMapName,
			},
		},
	}, metav1.CreateOptions{})
	if err != nil {
		return err
	}

	if !review.Status.Allowed {
		return fmt.Errorf("%s access to plugin manager ConfigMap required", verb)
	}

	return nil
}
