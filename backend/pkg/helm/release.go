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
	"fmt"
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

// HelmAPIError represents a structured error response for Helm API calls
type HelmAPIError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

func (e *HelmAPIError) Error() string {
	return e.Message
}

// SafeRequestWrapper provides a centralized error handling mechanism for Helm API calls
type SafeRequestWrapper struct {
	handler *Handler
}

func NewSafeRequestWrapper(handler *Handler) *SafeRequestWrapper {
	return &SafeRequestWrapper{handler: handler}
}

// HandleRequest safely executes a Helm API request with consistent error handling
func (w *SafeRequestWrapper) HandleRequest(
	writer http.ResponseWriter,
	requestName string,
	clientConfig clientcmd.ClientConfig,
	requestFunc func(*action.Configuration) (interface{}, error),
) {
	// Extract namespace from client config or use default
	namespace := "default"
	if clientConfig != nil {
		rawConfig, err := clientConfig.RawConfig()
		if err == nil && len(rawConfig.Contexts) > 0 {
			contextName := rawConfig.CurrentContext
			if context, exists := rawConfig.Contexts[contextName]; exists {
				namespace = context.Namespace
				if namespace == "" {
					namespace = "default"
				}
			}
		}
	}

	// Create action configuration
	actionConfig, err := NewActionConfig(clientConfig, namespace)
	if err != nil {
		w.handleError(writer, requestName, fmt.Sprintf("creating action config: %v", err), http.StatusInternalServerError)
		return
	}

	// Execute the request function
	result, err := requestFunc(actionConfig)
	if err != nil {
		w.handleError(writer, requestName, fmt.Sprintf("executing request: %v", err), http.StatusInternalServerError)
		return
	}

	// Validate result is not nil or empty
	if result == nil {
		w.handleError(writer, requestName, "request returned empty result", http.StatusNotFound)
		return
	}

	// Encode and send response
	writer.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(writer).Encode(result); err != nil {
		w.handleError(writer, requestName, fmt.Sprintf("encoding response: %v", err), http.StatusInternalServerError)
		return
	}
}

// HandleError logs the error and sends a structured error response
func (w *SafeRequestWrapper) handleError(writer http.ResponseWriter, requestName, message string, statusCode int) {
	logger.Log(logger.LevelError, map[string]string{"request": requestName},
		errors.New(message), message)

	errorResponse := HelmAPIError{
		Code:    statusCode,
		Message: message,
	}

	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(statusCode)
	json.NewEncoder(writer).Encode(errorResponse)
}

// ValidateRequest validates common request parameters
func (w *SafeRequestWrapper) ValidateRequest(request interface{}) error {
	validate := validator.New()
	return validate.Struct(request)
}

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
	// Create safe request wrapper
	wrapper := NewSafeRequestWrapper(h)

	// Parse request
	var req ListReleaseRequest
	decoder := schema.NewDecoder()

	if err := decoder.Decode(&req, r.URL.Query()); err != nil {
		wrapper.handleError(w, "list_releases", fmt.Sprintf("parsing request: %v", err), http.StatusBadRequest)
		return
	}

	// Use safe request wrapper to handle the request
	wrapper.HandleRequest(w, "list_releases", clientConfig, func(actionConfig *action.Configuration) (interface{}, error) {
		releases, err := getReleases(req, actionConfig)
		if err != nil {
			return nil, err
		}

		// Ensure releases is not nil to prevent null responses
		if releases == nil {
			releases = []*release.Release{}
		}

		return ListReleaseResponse{Releases: releases}, nil
	})
}

type GetReleaseRequest struct {
	Name      string `json:"name" validate:"required"`
	Namespace string `json:"namespace" validate:"required"`
}

func (req *GetReleaseRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(req)
}

func decodeGetReleaseRequest(r *http.Request) (GetReleaseRequest, error) {
	var req GetReleaseRequest

	decoder := schema.NewDecoder()
	if err := decoder.Decode(&req, r.URL.Query()); err != nil {
		return req, err
	}

	return req, req.Validate()
}

func (h *Handler) GetRelease(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// Create safe request wrapper
	wrapper := NewSafeRequestWrapper(h)

	// Parse request
	req, err := decodeGetReleaseRequest(r)
	if err != nil {
		wrapper.handleError(w, "get_release", fmt.Sprintf("validating request: %v", err), http.StatusBadRequest)
		return
	}

	// Use safe request wrapper to handle the request
	wrapper.HandleRequest(w, "get_release", clientConfig, func(actionConfig *action.Configuration) (interface{}, error) {
		// Check if release exists
		_, err := actionConfig.Releases.Deployed(req.Name)
		if err == driver.ErrReleaseNotFound {
			return nil, fmt.Errorf("release '%s' not found", req.Name)
		}
		if err != nil {
			return nil, fmt.Errorf("checking release existence: %v", err)
		}

		// Get the release
		getClient := action.NewGet(actionConfig)
		result, err := getClient.Run(req.Name)
		if err != nil {
			return nil, fmt.Errorf("getting release: %v", err)
		}

		return result, nil
	})
}

type GetReleaseHistoryRequest struct {
	Name      string `json:"name" validate:"required"`
	Namespace string `json:"namespace" validate:"required"`
}

type GetReleaseHistoryResponse struct {
	Releases []*release.Release `json:"releases"`
}

func (h *Handler) GetReleaseHistory(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// Create safe request wrapper
	wrapper := NewSafeRequestWrapper(h)

	// Parse request
	var req GetReleaseHistoryRequest
	decoder := schema.NewDecoder()

	if err := decoder.Decode(&req, r.URL.Query()); err != nil {
		wrapper.handleError(w, "get_release_history", fmt.Sprintf("decoding request: %v", err), http.StatusBadRequest)
		return
	}

	// Use safe request wrapper to handle the request
	wrapper.HandleRequest(w, "get_release_history", clientConfig, func(actionConfig *action.Configuration) (interface{}, error) {
		// Check if release exists
		_, err := actionConfig.Releases.Deployed(req.Name)
		if err == driver.ErrReleaseNotFound {
			return nil, fmt.Errorf("release '%s' not found", req.Name)
		}
		if err != nil {
			return nil, fmt.Errorf("checking release existence: %v", err)
		}

		// Get release history
		getClient := action.NewHistory(actionConfig)
		result, err := getClient.Run(req.Name)
		if err != nil {
			return nil, fmt.Errorf("getting release history: %v", err)
		}

		return GetReleaseHistoryResponse{Releases: result}, nil
	})
}

type UninstallReleaseRequest struct {
	Name      string `json:"name" validate:"required"`
	Namespace string `json:"namespace" validate:"required"`
}

func (req *UninstallReleaseRequest) Validate() error {
	validate := validator.New()
	return validate.Struct(req)
}

func decodeUninstallReleaseRequest(r *http.Request) (UninstallReleaseRequest, error) {
	var req UninstallReleaseRequest

	decoder := schema.NewDecoder()
	if err := decoder.Decode(&req, r.URL.Query()); err != nil {
		return req, err
	}

	return req, req.Validate()
}

func (h *Handler) UninstallRelease(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// Create safe request wrapper
	wrapper := NewSafeRequestWrapper(h)

	// Parse request
	req, err := decodeUninstallReleaseRequest(r)
	if err != nil {
		wrapper.handleError(w, "uninstall_release", fmt.Sprintf("validating request: %v", err), http.StatusBadRequest)
		return
	}

	// Create action config for validation
	actionConfig, err := NewActionConfig(clientConfig, req.Namespace)
	if err != nil {
		wrapper.handleError(w, "uninstall_release", fmt.Sprintf("creating action config: %v", err), http.StatusInternalServerError)
		return
	}

	// Check if release exists
	_, err = actionConfig.Releases.Deployed(req.Name)
	if err == driver.ErrReleaseNotFound {
		wrapper.handleError(w, "uninstall_release", fmt.Sprintf("release '%s' not found", req.Name), http.StatusNotFound)
		return
	}
	if err != nil {
		wrapper.handleError(w, "uninstall_release", fmt.Sprintf("checking release existence: %v", err), http.StatusInternalServerError)
		return
	}

	// Set status and start async uninstall
	err = h.setReleaseStatus("uninstall", req.Name, processing, nil)
	if err != nil {
		wrapper.handleError(w, "uninstall_release", fmt.Sprintf("setting status: %v", err), http.StatusInternalServerError)
		return
	}

	go func(h *Handler) {
		h.uninstallRelease(req, actionConfig)
	}(h)

	// Return acceptance response
	response := map[string]string{"message": "uninstall request accepted"}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(response)
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

func decodeRollbackReleaseRequest(r *http.Request) (RollbackReleaseRequest, error) {
	var req RollbackReleaseRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return req, err
	}

	return req, req.Validate()
}

func (h *Handler) RollbackRelease(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// Create safe request wrapper
	wrapper := NewSafeRequestWrapper(h)

	// Parse request and validate
	req, err := decodeRollbackReleaseRequest(r)
	if err != nil {
		wrapper.handleError(w, "rollback_release", fmt.Sprintf("validating request: %v", err), http.StatusBadRequest)
		return
	}

	// Create action config for validation
	actionConfig, err := NewActionConfig(clientConfig, req.Namespace)
	if err != nil {
		wrapper.handleError(w, "rollback_release", fmt.Sprintf("creating action config: %v", err), http.StatusInternalServerError)
		return
	}

	// Check if release exists
	_, err = actionConfig.Releases.Deployed(req.Name)
	if err == driver.ErrReleaseNotFound {
		wrapper.handleError(w, "rollback_release", fmt.Sprintf("release '%s' not found", req.Name), http.StatusNotFound)
		return
	}
	if err != nil {
		wrapper.handleError(w, "rollback_release", fmt.Sprintf("checking release existence: %v", err), http.StatusInternalServerError)
		return
	}

	// Set status and start async rollback
	err = h.setReleaseStatus("rollback", req.Name, processing, nil)
	if err != nil {
		wrapper.handleError(w, "rollback_release", fmt.Sprintf("setting status: %v", err), http.StatusInternalServerError)
		return
	}

	go func(h *Handler) {
		h.rollbackRelease(req, actionConfig)
	}(h)

	// Return acceptance response
	response := map[string]string{"message": "rollback request accepted"}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(response)
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

func (h *Handler) returnResponse(w http.ResponseWriter, reqName string, statusCode int, message string) {
	response := map[string]string{
		"message": message,
	}

	w.WriteHeader(statusCode)

	err := json.NewEncoder(w).Encode(response)
	if err != nil {
		// Use structured error response for consistency
		errorResponse := HelmAPIError{
			Code:    http.StatusInternalServerError,
			Message: "encoding response: " + err.Error(),
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(errorResponse)
		return
	}

	w.Header().Set("Content-Type", "application/json")
}

func (h *Handler) InstallRelease(clientConfig clientcmd.ClientConfig, w http.ResponseWriter, r *http.Request) {
	// Create safe request wrapper
	wrapper := NewSafeRequestWrapper(h)

	// Parse request
	var req InstallRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		wrapper.handleError(w, "install_release", fmt.Sprintf("parsing request: %v", err), http.StatusBadRequest)
		return
	}

	if err := req.Validate(); err != nil {
		wrapper.handleError(w, "install_release", fmt.Sprintf("validating request: %v", err), http.StatusBadRequest)
		return
	}

	// Create action config for validation
	actionConfig, err := NewActionConfig(clientConfig, req.Namespace)
	if err != nil {
		wrapper.handleError(w, "install_release", fmt.Sprintf("creating action config: %v", err), http.StatusInternalServerError)
		return
	}

	// Set status and start async install
	err = h.setReleaseStatus("install", req.Name, processing, nil)
	if err != nil {
		wrapper.handleError(w, "install_release", fmt.Sprintf("setting status: %v", err), http.StatusInternalServerError)
		return
	}

	go func(h *Handler) {
		h.installRelease(req, actionConfig)
	}(h)

	// Return acceptance response
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
	// Create safe request wrapper
	wrapper := NewSafeRequestWrapper(h)

	// Parse request and validate
	var req UpgradeReleaseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		wrapper.handleError(w, "upgrade_release", fmt.Sprintf("parsing request: %v", err), http.StatusBadRequest)
		return
	}

	if err := req.Validate(); err != nil {
		wrapper.handleError(w, "upgrade_release", fmt.Sprintf("validating request: %v", err), http.StatusBadRequest)
		return
	}

	// Create action config for validation
	actionConfig, err := NewActionConfig(clientConfig, req.Namespace)
	if err != nil {
		wrapper.handleError(w, "upgrade_release", fmt.Sprintf("creating action config: %v", err), http.StatusInternalServerError)
		return
	}

	// Check if release exists
	_, err = actionConfig.Releases.Deployed(req.Name)
	if err == driver.ErrReleaseNotFound {
		wrapper.handleError(w, "upgrade_release", fmt.Sprintf("release '%s' not found", req.Name), http.StatusNotFound)
		return
	}
	if err != nil {
		wrapper.handleError(w, "upgrade_release", fmt.Sprintf("checking release existence: %v", err), http.StatusInternalServerError)
		return
	}

	// Set status and start async upgrade
	err = h.setReleaseStatus("upgrade", req.Name, processing, nil)
	if err != nil {
		wrapper.handleError(w, "upgrade_release", fmt.Sprintf("setting status: %v", err), http.StatusInternalServerError)
		return
	}

	go func(h *Handler) {
		h.upgradeRelease(req, actionConfig)
	}(h)

	// Return acceptance response
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
	// Create safe request wrapper
	wrapper := NewSafeRequestWrapper(h)

	// Parse request
	var request ActionStatusRequest
	if err := schema.NewDecoder().Decode(&request, r.URL.Query()); err != nil {
		wrapper.handleError(w, "get_action_status", fmt.Sprintf("parsing request: %v", err), http.StatusBadRequest)
		return
	}

	if err := request.Validate(); err != nil {
		wrapper.handleError(w, "get_action_status", fmt.Sprintf("validating request: %v", err), http.StatusBadRequest)
		return
	}

	// Get status from cache
	stat, err := h.getReleaseStatus(request.Action, request.Name)
	if err != nil {
		wrapper.handleError(w, "get_action_status", fmt.Sprintf("getting status: %v", err), http.StatusInternalServerError)
		return
	}

	// Build response
	response := map[string]string{"status": stat.Status}
	if stat.Status == success {
		response["message"] = "action completed successfully"
	} else if stat.Status == failed && stat.Err != nil {
		response["message"] = "action failed with error: " + *stat.Err
	}

	// Send response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(response)
}
