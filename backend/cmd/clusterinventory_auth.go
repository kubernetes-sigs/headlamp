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
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
)

var errUserAuthRequired = errors.New("user authentication is required for this OIDC connection")

// authenticatedHandler validates the desktop credential before resolving a
// connection, since stateless resolution can register a context or renew its TTL.
func (c *HeadlampConfig) authenticatedHandler(next http.Handler) http.Handler {
	return auth.NewBackendTokenMiddleware(c.UseInCluster)(c.requireUserAuthentication(next))
}

// requestClusterName returns the cluster a request targets: the {clusterName}
// route variable, or the cluster query of the legacy drain status route.
func requestClusterName(r *http.Request, pathTemplate string) string {
	if clusterName := mux.Vars(r)["clusterName"]; clusterName != "" {
		return clusterName
	}

	if strings.HasSuffix(pathTemplate, "/drain-node-status") {
		return r.URL.Query().Get("cluster")
	}

	return ""
}

// resolveRequestContext returns the connection the request will use. A user's own
// kubeconfig shadows a global connection with the same name, so the lookup follows
// the handlers' resolution. The result is attached to the returned request: the
// WebSocket user-id subprotocol is consumed on first use and must not be resolved twice.
// It returns nil when the cluster is unknown, leaving the error to the handler.
func (c *HeadlampConfig) resolveRequestContext(
	r *http.Request,
	clusterName string,
) (*http.Request, *kubeconfig.Context) {
	if mux.Vars(r)["clusterName"] == "" {
		// The legacy drain status route names its cluster in the query.
		kContext, err := c.KubeConfigStore.GetContext(clusterName)
		if err != nil {
			return r, nil
		}

		return r, kContext
	}

	contextKey, err := c.getContextKeyForRequest(r)
	if err != nil {
		return r, nil
	}

	contextKey, kContext, err := c.getContextWithWebSocketFallback(r, contextKey)
	if err != nil {
		return r, nil
	}

	resolved := resolvedClusterContext{key: contextKey, context: kContext}

	return r.WithContext(context.WithValue(r.Context(), resolvedClusterContextKey{}, resolved)), kContext
}

// requireUserAuthentication runs before cluster handlers and the response
// cache. Kubernetes validates the user's token and applies that user's RBAC.
func (c *HeadlampConfig) requireUserAuthentication(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		pathTemplate, _ := mux.CurrentRoute(r).GetPathTemplate()

		clusterName := requestClusterName(r, pathTemplate)
		if clusterName == "" {
			next.ServeHTTP(w, r)
			return
		}

		if strings.HasSuffix(pathTemplate, "/clusters/{clusterName}/set-token") {
			next.ServeHTTP(w, r)
			return
		}

		r, kContext := c.resolveRequestContext(r, clusterName)
		if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			processWebSocketProtocolHeader(r)
		}

		c.normalizeClusterCredentials(r, clusterName, kContext)

		if kContext.RequiresUserAuthentication() && auth.BearerTokenValue(r.Header.Get("Authorization")) == "" {
			http.Error(w, errUserAuthRequired.Error(), http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// normalizeClusterCredentials makes cache authorization and cluster handlers use
// the same selected credential, including auth-proxy and cookie authentication.
func (c *HeadlampConfig) normalizeClusterCredentials(r *http.Request, cluster string, k *kubeconfig.Context) {
	if c.shouldUseUnsafeServiceAccountTokenForContext(k) {
		clearRequestAuthorization(r)
	} else {
		token := c.proxyAuthToken(r)
		if token == "" {
			token = c.requestTokenForContext(r, cluster, k)
		}

		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
	}

	clearConfiguredProxyTokenHeader(r, c.ProxyAuthTokenHeader)
	r.Header.Del("Cookie")
}
