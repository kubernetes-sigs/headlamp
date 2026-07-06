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
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

// InfoResponse is returned by GET /plugin-manager.
type InfoResponse struct {
	Enabled       bool   `json:"enabled"`
	Namespace     string `json:"namespace"`
	ConfigMapName string `json:"configMapName"`
	State         State  `json:"state"`
	Status        Status `json:"status"`
}

// RegisterRoutes adds the read-only plugin manager endpoints to the router.
// All mutations happen through the Kubernetes API with the user's own
// credentials, so no mutating endpoints exist here.
func (m *Manager) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/plugin-manager", m.handleInfo).Methods(http.MethodGet)
	r.HandleFunc("/plugin-manager/catalogs/{id}/search", m.handleSearch).Methods(http.MethodGet)
	r.HandleFunc("/plugin-manager/catalogs/{id}/resolve", m.handleResolve).Methods(http.MethodGet)
}

func (m *Manager) handleInfo(w http.ResponseWriter, _ *http.Request) {
	state, status := m.CurrentState()

	writeJSON(w, InfoResponse{
		Enabled:       true,
		Namespace:     m.Namespace,
		ConfigMapName: m.ConfigMapName,
		State:         state,
		Status:        status,
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

	writeJSON(w, map[string]interface{}{"entries": entries})
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

func (m *Manager) catalogClientForRequest(w http.ResponseWriter, r *http.Request) (catalogClient, bool) {
	catalog, err := m.FindCatalog(mux.Vars(r)["id"])
	if err != nil {
		writeError(w, http.StatusNotFound, err)

		return nil, false
	}

	client, err := newCatalogClient(*catalog)
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
