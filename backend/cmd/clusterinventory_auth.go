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
	"errors"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
)

var errInventoryAuthRequired = errors.New("user authentication is required for Cluster Inventory")

// inventoryClusterName returns the cluster a request targets: the {clusterName}
// route variable, or the cluster query of the legacy drain status route.
func inventoryClusterName(r *http.Request, pathTemplate string) string {
	if clusterName := mux.Vars(r)["clusterName"]; clusterName != "" {
		return clusterName
	}

	if strings.HasSuffix(pathTemplate, "/drain-node-status") {
		return r.URL.Query().Get("cluster")
	}

	return ""
}

// requireInventoryAuthentication runs before cluster handlers and the response
// cache. Kubernetes validates the user's token and applies that user's RBAC.
func (c *HeadlampConfig) requireInventoryAuthentication(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pathTemplate, _ := mux.CurrentRoute(r).GetPathTemplate()

		clusterName := inventoryClusterName(r, pathTemplate)
		if clusterName == "" {
			next.ServeHTTP(w, r)
			return
		}

		if strings.HasSuffix(pathTemplate, "/clusters/{clusterName}/set-token") {
			next.ServeHTTP(w, r)
			return
		}

		kContext, err := c.KubeConfigStore.GetContext(clusterName)
		if err != nil || kContext.Source != kubeconfig.ClusterInventory {
			next.ServeHTTP(w, r)
			return
		}

		if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			processWebSocketProtocolHeader(r)
		}

		token := c.requestTokenForContext(r, clusterName, kContext)
		if proxyToken := c.proxyAuthToken(r); proxyToken != "" {
			token = proxyToken
		}

		if token == "" {
			http.Error(w, errInventoryAuthRequired.Error(), http.StatusUnauthorized)
			return
		}

		// Use one credential for cache authorization and every downstream handler.
		// OIDC refresh has already run. Cluster cookies must not override the
		// selected token or be forwarded to the Kubernetes API server.
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Del("Cookie")
		next.ServeHTTP(w, r)
	})
}
