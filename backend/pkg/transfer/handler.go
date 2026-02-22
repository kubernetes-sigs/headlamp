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
	"fmt"
	"net/http"
	"path"
	"path/filepath"
	"strings"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

type podContext struct {
	cluster   string
	namespace string
	pod       string
	container string
	token     string
}

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

// DownloadHandler returns an HTTP handler that streams a tar archive
// of the requested file/directory from a container.
func DownloadHandler(store kubeconfig.ContextStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pc := parsePodContext(r)

		filePath := r.URL.Query().Get("path")
		if filePath == "" {
			http.Error(w, "path is required", http.StatusBadRequest)
			return
		}

		filePath = path.Clean(filePath)
		downloadName := fmt.Sprintf("%s-%s-%s", pc.pod, pc.container, filepath.Base(filePath))

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
			http.Error(w, err.Error(), http.StatusInternalServerError)

			return
		}

		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.tar"`, downloadName))
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
func UploadHandler(store kubeconfig.ContextStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pc := parsePodContext(r)

		destPath := r.URL.Query().Get("path")
		fileName := r.URL.Query().Get("filename")

		if destPath == "" {
			destPath = "/tmp"
		}

		fileName = filepath.Base(fileName)
		if fileName == "" || fileName == "." {
			http.Error(w, "filename query parameter is required", http.StatusBadRequest)

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
			http.Error(w, err.Error(), http.StatusInternalServerError)

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
			http.Error(w, err.Error(), http.StatusInternalServerError)

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
