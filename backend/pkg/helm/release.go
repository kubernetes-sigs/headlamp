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
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/gorilla/schema"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"

	"github.com/rs/zerolog"
	zlog "github.com/rs/zerolog/log"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/downloader"
	"helm.sh/helm/v3/pkg/getter"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage/driver"
	authv1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"sigs.k8s.io/yaml"
)

const (
	success    = "success"
	failed     = "failed"
	processing = "processing"
)

type ListReleaseRequest struct {
	AllNamespaces *bool   `json:"allNamespaces,omitempty"`
	Namespace     *string `json:"namespace,omitempty"`
	All           *bool   `json:"all,omitempty"`
	ByDate        *bool   `json:"byDate,omitempty"`
	Limit         *int    `json:"limit,omitempty"`
	Offset        *int    `json:"offset,omitempty"`
	Filter        *string `json:"filter,omitempty"`
	Uninstalled   *bool   `json:"uninstalled,omitempty"`
	Superseded    *bool   `json:"superseded,omitempty"`
	Uninstalling  *bool   `json:"uninstalling,omitempty"`
	Deployed      *bool   `json:"deployed,omitempty"`
	Failed        *bool   `json:"failed,omitempty"`
	Pending       *bool   `json:"pending,omitempty"`
}

type ListReleaseResponse struct {
	Releases []*release.Release `json:"releases"`
}

// Returns (releases, error) given the request and helm configuration.
func getReleases(req ListReleaseRequest, config *action.Configuration) ([]*release.Release, error) {
	// Get list client
	listClient := action.NewList(config)

	// Removing all these if assignments is not possible, so we disable gocognit linter
	if req.AllNamespaces != nil && *req.AllNamespaces {
		listClient.AllNamespaces = *req.AllNamespaces
	}

	if req.All != nil && *req.All {
		listClient.All = *req.All
	}

	if req.ByDate != nil && *req.ByDate {
		listClient.ByDate = *req.ByDate
	}

	if req.Limit != nil && *req.Limit > 0 {
		listClient.Limit = *req.Limit
	}

	if req.Offset != nil && *req.Offset > 0 {
		listClient.Offset = *req.Offset
	}

	if req.Filter != nil && *req.Filter != "" {
		listClient.Filter = *req.Filter
	}

	if req.Uninstalled != nil && *req.Uninstalled {
		listClient.Uninstalled = *req.Uninstalled
	}

	if req.Superseded != nil && *req.Superseded {
		listClient.Superseded = *req.Superseded
	}

	if req.Uninstalling != nil && *req.Uninstalling {
		listClient.Uninstalling = *req.Uninstalling
	}

	if req.Deployed != nil && *req.Deployed {
		listClient.Deployed = *req.Deployed
	}

	if req.Failed != nil && *req.Failed {
		listClient.Failed = *req.Failed
	}

	if req.Pending != nil && *req.Pending {
		listClient.Pending = *req.Pending
	}

	listClient.Short = true
	listClient.SetStateMask()

	return listClient.Run()
}

func (h *Handler) ListRelease(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// Parse request
	var req ListReleaseRequest

	decoder := schema.NewDecoder()

	err := decoder.Decode(&req, r.URL.Query())
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "list_releases"},
			err, "parsing request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	namespace := ""
	if req.Namespace != nil && *req.Namespace != "" {
		namespace = *req.Namespace
	}

	actionConfig, err := NewActionConfig(clientConfig, namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "list_releases"},
			err, "creating action config")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	releases, err := getReleases(req, actionConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "list_releases"},
			err, "fetching releases")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// Return response
	res := ListReleaseResponse{
		Releases: releases,
	}

	err = json.NewEncoder(w).Encode(res)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "list_releases"},
			err, "encoding response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/json")
}

type GetReleaseRequest struct {
	Name      string `json:"name" validate:"required"`
	Namespace string `json:"namespace" validate:"required"`
}

func (req *GetReleaseRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(req)
}

func (h *Handler) GetRelease(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// Parse request
	var req GetReleaseRequest

	decoder := schema.NewDecoder()

	err := decoder.Decode(&req, r.URL.Query())
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "get_release"},
			err, "parsing request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	err = req.Validate()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "get_release"},
			err, "validating request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	actionConfig, err := NewActionConfig(clientConfig, req.Namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "get_release"},
			err, "creating action config")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// check if release exists
	_, err = actionConfig.Releases.Deployed(req.Name)
	if err == driver.ErrReleaseNotFound {
		logger.Log(logger.LevelError, map[string]string{"releaseName": req.Name, "request": "get_release"},
			err, "release not found")
		http.Error(w, err.Error(), http.StatusNotFound)

		return
	}

	getClient := action.NewGet(actionConfig)

	result, err := getClient.Run(req.Name)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "get_release", "releaseName": req.Name},
			err, "getting release")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.WriteHeader(http.StatusOK)

	err = json.NewEncoder(w).Encode(result)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "get_release", "releaseName": req.Name},
			err, "encoding response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/json")
}

type GetReleaseHistoryRequest struct {
	Name      string `json:"name" validate:"required"`
	Namespace string `json:"namespace" validate:"required"`
}

type GetReleaseHistoryResponse struct {
	Releases []*release.Release `json:"releases"`
}

func (h *Handler) GetReleaseHistory(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// Parse request
	var req GetReleaseHistoryRequest

	decoder := schema.NewDecoder()

	err := decoder.Decode(&req, r.URL.Query())
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "get_release_history"},
			err, "decoding request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	actionConfig, err := NewActionConfig(clientConfig, req.Namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "get_release_history"},
			err, "creating action config")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// check if release exists
	_, err = actionConfig.Releases.Deployed(req.Name)
	if err == driver.ErrReleaseNotFound {
		logger.Log(logger.LevelError, map[string]string{"releaseName": req.Name, "request": "get_release_history"},
			err, "release not found")
		http.Error(w, err.Error(), http.StatusNotFound)

		return
	}

	getClient := action.NewHistory(actionConfig)

	result, err := getClient.Run(req.Name)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "get_release_history", "releaseName": req.Name},
			err, "getting release history")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	resp := GetReleaseHistoryResponse{
		Releases: result,
	}

	w.WriteHeader(http.StatusOK)

	err = json.NewEncoder(w).Encode(resp)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "get_release_history", "releaseName": req.Name},
			err, "encoding response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/json")
}

type UninstallReleaseRequest struct {
	Name      string `json:"name" validate:"required"`
	Namespace string `json:"namespace" validate:"required"`
}

func (req *UninstallReleaseRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(req)
}

func (h *Handler) UninstallRelease(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// Parse request
	var req UninstallReleaseRequest

	decoder := schema.NewDecoder()

	err := decoder.Decode(&req, r.URL.Query())
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "uninstall_release"},
			err, "decoding request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	err = req.Validate()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "uninstall_release"},
			err, "validating request")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	actionConfig, err := NewActionConfig(clientConfig, req.Namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "uninstall_release"},
			err, "creating action config")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// check if release exists
	_, err = actionConfig.Releases.Deployed(req.Name)
	if err == driver.ErrReleaseNotFound {
		logger.Log(logger.LevelError, map[string]string{"releaseName": req.Name, "request": "uninstall_release"},
			err, "release not found")
		http.Error(w, err.Error(), http.StatusNotFound)

		return
	}

	err = h.setReleaseStatus("uninstall", req.Name, processing, nil)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "uninstall_release", "releaseName": req.Name},
			err, "setting status")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	go func(h *Handler) {
		h.uninstallRelease(req, actionConfig)
	}(h)

	response := map[string]string{
		"message": "uninstall request accepted",
	}

	w.WriteHeader(http.StatusAccepted)

	err = json.NewEncoder(w).Encode(response)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "uninstall_release", "releaseName": req.Name},
			err, "encoding response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/json")
}

func (h *Handler) uninstallRelease(req UninstallReleaseRequest, actionConfig *action.Configuration) {
	// Get uninstall client
	uninstallClient := action.NewUninstall(actionConfig)

	status := success

	_, err := uninstallClient.Run(req.Name)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"releaseName": req.Name, "namespace": req.Namespace},
			err, "uninstalling release")

		status = failed
	}

	h.setReleaseStatusSilent("uninstall", req.Name, status, err)
}

type RollbackReleaseRequest struct {
	Name      string `json:"name" validate:"required"`
	Namespace string `json:"namespace" validate:"required"`
	Revision  int    `json:"revision" validate:"required"`
}

func (req *RollbackReleaseRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(req)
}

func (h *Handler) RollbackRelease(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// Parse request and validate
	var req RollbackReleaseRequest

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "parsing request for rollback")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	err = req.Validate()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "validating request for rollback")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	actionConfig, err := NewActionConfig(clientConfig, req.Namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "rollback_release"},
			err, "creating action config")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// check if release exists
	_, err = actionConfig.Releases.Deployed(req.Name)
	if err == driver.ErrReleaseNotFound {
		logger.Log(logger.LevelError, map[string]string{"releaseName": req.Name},
			err, "release not found")
		http.Error(w, err.Error(), http.StatusNotFound)

		return
	}

	err = h.setReleaseStatus("rollback", req.Name, processing, nil)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "setting status")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	go func(h *Handler) {
		h.rollbackRelease(req, actionConfig)
	}(h)

	response := map[string]string{
		"message": "rollback request accepted",
	}

	w.WriteHeader(http.StatusAccepted)

	err = json.NewEncoder(w).Encode(response)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/json")
}

func (h *Handler) rollbackRelease(req RollbackReleaseRequest, actionConfig *action.Configuration) {
	rollbackClient := action.NewRollback(actionConfig)
	rollbackClient.Version = req.Revision

	status := success

	err := rollbackClient.Run(req.Name)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"releaseName": req.Name},
			err, "rolling back release")

		status = failed
	}

	h.setReleaseStatusSilent("rollback", req.Name, status, err)
}

type CommonInstallUpdateRequest struct {
	Name        string `json:"name" validate:"required"`
	Namespace   string `json:"namespace" validate:"required"`
	Description string `json:"description" validate:"required"`
	Values      string `json:"values"`
	Chart       string `json:"chart" validate:"required"`
	Version     string `json:"version" validate:"required"`
}

type InstallRequest struct {
	CommonInstallUpdateRequest
	CreateNamespace  bool `json:"createNamespace"`
	DependencyUpdate bool `json:"dependencyUpdate"`
}

func (req *InstallRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(req)
}

func handleError(w http.ResponseWriter, releaseName string, err error, message string, status int) {
	logger.Log(logger.LevelError, map[string]string{"releaseName": releaseName}, err, message)
	http.Error(w, err.Error(), status)
}

func (h *Handler) returnResponse(w http.ResponseWriter, reqName string, statusCode int, message string) {
	response := map[string]string{
		"message": message,
	}

	w.WriteHeader(statusCode)

	err := json.NewEncoder(w).Encode(response)
	if err != nil {
		handleError(w, reqName, err, "encoding response", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
}

func (h *Handler) InstallRelease(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// parse request
	var req InstallRequest

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "parsing request for install")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	err = req.Validate()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "validating request for install")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	actionConfig, err := NewActionConfig(clientConfig, req.Namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "install_release"},
			err, "creating action config")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	err = h.setReleaseStatus("install", req.Name, processing, nil)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "setting status")
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}

	go func(h *Handler) {
		h.installRelease(req, actionConfig)
	}(h)

	h.returnResponse(w, req.Name, http.StatusAccepted, "install request accepted")
}

// Returns the chart, and err, and if dependencyUpdate is true then we also update the chart dependencies.
func (h *Handler) getChart(
	actionName string,
	reqChart string,
	reqName string,
	chartPathOptions action.ChartPathOptions,
	dependencyUpdate bool,
	settings *cli.EnvSettings,
) (*chart.Chart, error) {
	// locate chart
	chartPath, err := chartPathOptions.LocateChart(reqChart, settings)
	if err != nil {
		h.logActionState(zlog.Error(), err, actionName, reqChart, reqName, failed, "locating chart")
		return nil, err
	}

	// load chart
	chart, err := loader.Load(chartPath)
	if err != nil {
		h.logActionState(zlog.Error(), err, actionName, reqChart, reqName, failed, "loading chart")
		return nil, err
	}

	// chart is installable only if it is of type application or empty
	if chart.Metadata.Type != "" && chart.Metadata.Type != "application" {
		h.logActionState(zlog.Error(), err, actionName, reqChart, reqName, failed, "chart is not installable")
		return nil, err
	}

	// Update chart dependencies
	if chart.Metadata.Dependencies != nil && dependencyUpdate {
		err = action.CheckDependencies(chart, chart.Metadata.Dependencies)
		if err != nil {
			manager := &downloader.Manager{
				ChartPath:        chartPath,
				Keyring:          chartPathOptions.Keyring,
				SkipUpdate:       false,
				Getters:          getter.All(settings),
				RepositoryConfig: settings.RepositoryConfig,
				RepositoryCache:  settings.RepositoryCache,
			}

			err = manager.Update()
			if err != nil {
				h.logActionState(zlog.Error(), err, actionName, reqChart, reqName, failed, "updating dependencies")
				return nil, err
			}
		}
	}

	return chart, nil
}

// Verify the user has minimal privileges by performing a whoami check.
// This prevents spurious downloads by ensuring basic authentication before proceeding.
func VerifyUser(actionConfig *action.Configuration, req InstallRequest) bool {
	restConfig, err := actionConfig.RESTClientGetter.ToRESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name}, err, "getting chart")
		return false
	}

	cs, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name}, err, "getting chart")
		return false
	}

	review, err := cs.AuthenticationV1().SelfSubjectReviews().Create(context.Background(),
		&authv1.SelfSubjectReview{}, metav1.CreateOptions{})
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name}, err, "getting chart")
		return false
	}

	if user := review.Status.UserInfo.Username; user == "" || user == "system:anonymous" {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name},
			errors.New("insufficient privileges"), "getting chart: user is not authorized to perform this operation")
		return false
	}

	return true
}

func (h *Handler) installRelease(req InstallRequest, actionConfig *action.Configuration) {
	installClient := action.NewInstall(actionConfig)
	installClient.ReleaseName = req.Name
	installClient.Namespace = req.Namespace
	installClient.Description = req.Description
	installClient.CreateNamespace = req.CreateNamespace
	installClient.ChartPathOptions.Version = req.Version

	if !VerifyUser(actionConfig, req) {
		return
	}

	chart, err := h.getChart("install", req.Chart, req.Name,
		installClient.ChartPathOptions, req.DependencyUpdate, h.EnvSettings)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name},
			err, "getting chart")

		return
	}

	decodedBytes, err := base64.StdEncoding.DecodeString(req.Values)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name},
			err, "decoding values")
		h.setReleaseStatusSilent("install", req.Name, failed, err)

		return
	}

	values := make(map[string]interface{})
	if err = yaml.Unmarshal(decodedBytes, &values); err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name},
			err, "unmarshalling values")
		h.setReleaseStatusSilent("install", req.Name, failed, err)

		return
	}

	if _, err = installClient.Run(chart, values); err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name},
			err, "installing chart")
		h.setReleaseStatusSilent("install", req.Name, failed, err)

		return
	}

	h.setReleaseStatusSilent("install", req.Name, success, nil)
}

type UpgradeReleaseRequest struct {
	CommonInstallUpdateRequest
	Install *bool `json:"install"`
}

func (req *UpgradeReleaseRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(req)
}

func (h *Handler) UpgradeRelease(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// Parse request and validate
	var req UpgradeReleaseRequest

	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		handleError(w, req.Name, err, "parsing request for upgrade release", http.StatusBadRequest)
		return
	}

	err = req.Validate()
	if err != nil {
		handleError(w, req.Name, err, "validating request for upgrade release", http.StatusBadRequest)
		return
	}

	actionConfig, err := NewActionConfig(clientConfig, req.Namespace)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"request": "upgrade_release"},
			err, "creating action config")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// check if release exists
	_, err = actionConfig.Releases.Deployed(req.Name)
	if err == driver.ErrReleaseNotFound {
		handleError(w, req.Name, err, "release not found", http.StatusNotFound)
		return
	}

	err = h.setReleaseStatus("upgrade", req.Name, processing, nil)
	if err != nil {
		handleError(w, req.Name, err, "setting status", http.StatusInternalServerError)
		return
	}

	go func(h *Handler) {
		h.upgradeRelease(req, actionConfig)
	}(h)

	h.returnResponse(w, req.Name, http.StatusAccepted, "upgrade request accepted")
}

func (h *Handler) logActionState(zlog *zerolog.Event,
	err error,
	action string,
	chart string,
	releaseName string,
	status string,
	message string,
) {
	if err != nil {
		zlog = zlog.Err(err)
	}

	zlog.Str("chart", chart).
		Str("action", action).
		Str("releaseName", releaseName).
		Str("status", status).
		Msg(message)

	h.setReleaseStatusSilent(action, releaseName, status, err)
}

func (h *Handler) upgradeRelease(req UpgradeReleaseRequest, actionConfig *action.Configuration) {
	// find chart
	upgradeClient := action.NewUpgrade(actionConfig)
	upgradeClient.Namespace = req.Namespace
	upgradeClient.Description = req.Description
	upgradeClient.ChartPathOptions.Version = req.Version

	chart, err := h.getChart("upgrade", req.Chart, req.Name, upgradeClient.ChartPathOptions, true, h.EnvSettings)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"chart": req.Chart, "releaseName": req.Name},
			err, "getting chart")

		return
	}

	values := make(map[string]interface{})

	valuesStr, err := base64.StdEncoding.DecodeString(req.Values)
	if err != nil {
		h.logActionState(zlog.Error(), err, "upgrade", req.Chart, req.Name, failed, "values decoding failed")
		return
	}

	err = yaml.Unmarshal(valuesStr, &values)
	if err != nil {
		h.logActionState(zlog.Error(), err, "upgrade", req.Chart, req.Name, failed, "values un-marshalling failed")
		return
	}

	// Upgrade chart
	_, err = upgradeClient.Run(req.Name, chart, values)
	if err != nil {
		h.logActionState(zlog.Error(), err, "upgrade", req.Chart, req.Name, failed, "chart upgrade failed")
		return
	}

	h.logActionState(zlog.Info(), nil, "upgrade", req.Chart, req.Name, success, "chart upgradeable is successful")
}

type ActionStatusRequest struct {
	Name   string `json:"name" validate:"required"`
	Action string `json:"action" validate:"required"`
}

func (a *ActionStatusRequest) Validate() error {
	validate := validator.New()

	err := validate.Struct(a)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"action": a.Action, "releaseName": a.Name},
			err, "validating request for status")

		return err
	}

	if a.Action != "install" && a.Action != "upgrade" && a.Action != "uninstall" && a.Action != "rollback" {
		return errors.New("invalid action")
	}

	return nil
}

func (h *Handler) GetActionStatus(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	var request ActionStatusRequest

	err := schema.NewDecoder().Decode(&request, r.URL.Query())
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "parsing request for status")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	err = request.Validate()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "validating request for status")
		http.Error(w, err.Error(), http.StatusBadRequest)

		return
	}

	stat, err := h.getReleaseStatus(request.Action, request.Name)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting status")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	response := map[string]string{
		"status": stat.Status,
	}

	if stat.Status == success {
		response["message"] = "action completed successfully"
	}

	if stat.Status == failed {
		response["message"] = "action failed with error: " + *stat.Err
	}

	w.WriteHeader(http.StatusAccepted)

	err = json.NewEncoder(w).Encode(response)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	w.Header().Set("Content-Type", "application/json")
}
