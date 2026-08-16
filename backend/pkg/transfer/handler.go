// Copyright 2025 The Kubernetes Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package transfer

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path"
	"strings"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

// podContext holds request parameters for identifying a target container and authorization token.
type podContext struct {
	cluster   string
	namespace string
	pod       string
	container string
	token     string
}

// parsePodContext extracts pod identifier parameters from gorilla/mux route variables
// and resolves the bearer token.
func parsePodContext(r *http.Request) podContext {
	vars := mux.Vars(r)

	clusterName := vars["clusterName"]
	namespace := vars["namespace"]
	podName := vars["pod"]
	containerName := vars["container"]

	token := resolveAuthToken(r, clusterName)

	return podContext{
		cluster:   clusterName,
		namespace: namespace,
		pod:       podName,
		container: containerName,
		token:     token,
	}
}

// writeJSONError writes a JSON error response with the given message and status code.
// The response body has the shape {"message": "..."} so the frontend backendFetch()
// can parse it.
func writeJSONError(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(map[string]string{"message": msg})
}

// DownloadHandler returns an HTTP handler that streams a tar archive
// of the requested file/directory from a container.
//
//nolint:funlen
func DownloadHandler(store kubeconfig.ContextStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pc := parsePodContext(r)

		filePath := r.URL.Query().Get("path")
		if filePath == "" {
			writeJSONError(w, "path is required", http.StatusBadRequest)
			return
		}

		filePath = path.Clean(filePath)

		if !strings.HasPrefix(filePath, "/") {
			writeJSONError(w, "path must be absolute", http.StatusBadRequest)
			return
		}

		baseName := path.Base(filePath)
		if baseName == "." || baseName == "/" {
			baseName = "download"
		}

		downloadName := fmt.Sprintf("%s-%s-%s", pc.pod, pc.container, baseName)

		err := VerifyDownloadTarget(
			r.Context(),
			store,
			pc.cluster,
			pc.namespace,
			pc.pod,
			pc.container,
			filePath,
			pc.token,
		)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "download pre-check failed")
			writeJSONError(w, err.Error(), http.StatusInternalServerError)

			return
		}

		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.tar"`, downloadName))
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition")

		err = DownloadFromPod(
			r.Context(),
			store,
			pc.cluster,
			pc.namespace,
			pc.pod,
			pc.container,
			filePath,
			pc.token,
			w,
		)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "downloading from pod")
			return
		}
	}
}

// UploadHandler returns an HTTP handler that streams the request body
// into the specified path inside a container.
//
//nolint:funlen
func UploadHandler(store kubeconfig.ContextStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pc := parsePodContext(r)

		destPath := r.URL.Query().Get("path")
		fileName := r.URL.Query().Get("filename")

		if destPath == "" {
			destPath = "/tmp"
		}

		destPath = path.Clean(destPath)

		if !strings.HasPrefix(destPath, "/") {
			writeJSONError(w, "path must be absolute", http.StatusBadRequest)
			return
		}

		fileName = path.Base(fileName)
		if fileName == "" || fileName == "." || fileName == "/" {
			writeJSONError(w, "filename query parameter is required", http.StatusBadRequest)

			return
		}

		fullPath := path.Join(destPath, fileName)
		fullPath = path.Clean(fullPath)

		err := VerifyUploadTarget(
			r.Context(),
			store,
			pc.cluster,
			pc.namespace,
			pc.pod,
			pc.container,
			fullPath,
			pc.token,
		)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "upload pre-check failed")
			writeJSONError(w, err.Error(), http.StatusInternalServerError)

			return
		}

		err = UploadToPod(
			r.Context(),
			store,
			pc.cluster,
			pc.namespace,
			pc.pod,
			pc.container,
			fullPath,
			pc.token,
			r.Body,
		)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "uploading to pod")
			writeJSONError(w, err.Error(), http.StatusInternalServerError)

			return
		}

		w.WriteHeader(http.StatusOK)
	}
}

// resolveAuthToken tries the auth cookie first, then falls back to the
// Authorization header.
func resolveAuthToken(r *http.Request, clusterName string) string {
	token, err := auth.GetTokenFromCookie(r, clusterName)
	if err == nil && token != "" {
		return token
	}

	authHeader := r.Header.Get("Authorization")

	return strings.TrimPrefix(authHeader, "Bearer ")
}
