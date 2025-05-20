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
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"

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
			chart := chart
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

// list charts.
func (h *Handler) ListCharts(w http.ResponseWriter, r *http.Request) {
	filterTerm := r.URL.Query().Get("filter")

	chartInfos, err := listCharts(filterTerm, h.EnvSettings)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

	response := ListAllChartsResponse{
		Charts: chartInfos,
	}

	w.WriteHeader(http.StatusOK)
	w.Header().Set("Content-Type", "application/json")

	err = json.NewEncoder(w).Encode(response)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}
}
