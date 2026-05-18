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
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"

	"helm.sh/helm/v3/cmd/helm/search"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/helmpath"
	"helm.sh/helm/v3/pkg/repo"
)

type ListAllChartsResponse struct {
	Charts []chartInfo `json:"charts"`
}

type chartInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Version     string `json:"version"`
	AppVersion  string `json:"appVersion"`
	Repository  string `json:"repository"`
}

func listCharts(filter string, settings *cli.EnvSettings) ([]chartInfo, error) {
	// read repo file
	repoFile, err := repo.LoadFile(settings.RepositoryConfig)
	if err != nil {
		return nil, err
	}

	var chartInfos []chartInfo

	for _, re := range repoFile.Repositories {
		index := search.NewIndex()

		name := re.Name
		repoIndexFile := filepath.Join(settings.RepositoryCache, helmpath.CacheIndexFile(name))

		indexFile, err := repo.LoadIndexFile(repoIndexFile)
		if err != nil {
			return nil, err
		}

		index.AddRepo(name, indexFile, true)

		for _, chart := range index.All() {
			if filter != "" {
				if strings.Contains(strings.ToLower(chart.Name), strings.ToLower(filter)) {
					chartInfos = append(chartInfos, chartInfo{
						Name:        chart.Name,
						Description: chart.Chart.Description,
						Version:     chart.Chart.Version,
						AppVersion:  chart.Chart.AppVersion,
						Repository:  name,
					})
				}
			} else {
				chartInfos = append(chartInfos, chartInfo{
					Name:        chart.Name,
					Description: chart.Chart.Description,
					Version:     chart.Chart.Version,
					AppVersion:  chart.Chart.AppVersion,
					Repository:  name,
				})
			}
		}
	}

	return chartInfos, nil
}

// ListCharts lists all charts from configured repositories.
func (h *Handler) ListCharts(w http.ResponseWriter, r *http.Request) {
	filterTerm := r.URL.Query().Get("filter")

	chartInfos, err := listCharts(filterTerm, h.EnvSettings)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "listing charts")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	response := ListAllChartsResponse{
		Charts: chartInfos,
	}

	var buf bytes.Buffer

	err = json.NewEncoder(&buf).Encode(response)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding charts response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if _, err := w.Write(buf.Bytes()); err != nil {
		logger.Log(logger.LevelError, nil, err, "writing charts response")
	}
}
