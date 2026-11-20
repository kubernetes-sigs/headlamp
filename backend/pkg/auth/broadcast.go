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

package auth

import (
	"net/http"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const (
	logFieldSourceCluster = "sourceCluster"
	logFieldTargetCluster = "targetCluster"
)

// BroadcastOIDCTokenParams groups the inputs required to broadcast an OIDC
// token's auth cookie to sibling kubeconfig contexts after a successful login.
type BroadcastOIDCTokenParams struct {
	Writer          http.ResponseWriter
	Request         *http.Request
	KubeConfigStore kubeconfig.ContextStore
	SourceCluster   string
	Token           string
	BaseURL         string
	SessionTTL      int
}

// isOIDCAuthContext reports whether the kubeconfig context's auth-provider is
// OIDC. kubeconfig.Context.AuthType() is too coarse: it returns "oidc" for any
// AuthProvider (e.g. gcp, azure), so we check AuthProvider.Name explicitly to
// avoid treating non-OIDC contexts as broadcast candidates. Note that exec
// credential plugins live on AuthInfo.Exec, not AuthInfo.AuthProvider, and are
// not relevant here.
func isOIDCAuthContext(kCtx *kubeconfig.Context) bool {
	if kCtx == nil {
		return false
	}

	if kCtx.OidcConf != nil {
		return true
	}

	if kCtx.AuthInfo == nil || kCtx.AuthInfo.AuthProvider == nil {
		return false
	}

	return kCtx.AuthInfo.AuthProvider.Name == "oidc"
}

// BroadcastOIDCToken makes the token available to every kubeconfig context
// whose OIDC auth-provider has the same idp-issuer-url AND client-id as the
// source cluster.
//
// The token is stored once, in a shared cookie keyed by issuer + client-id, so
// the response headers do not grow with the number of clusters. It returns
// true when the shared cookie was set, and the caller then skips the cluster's
// own cookie. An error means the token was too large to store.
//
// Precondition: the kube-apiserver of each target cluster must trust the same
// OIDC application (issuer + client-id) as the source cluster. For the default
// id_token the audience (aud) claim is the client-id, so broadcasting only when
// both issuer and client-id match keeps the token valid against the target
// cluster's apiserver without re-validating per cluster. Two audience caveats
// are NOT detected here and must be ensured by deployment configuration:
//   - A target apiserver configured to accept a different or additional
//     audience than the client-id (via the "audiences" list in a structured
//     AuthenticationConfiguration): the broadcast cookie may be set but the
//     target apiserver could reject the token.
//   - --oidc-use-access-token: the broadcast then carries the access_token,
//     whose audience is provider-specific and frequently NOT the client-id
//     (e.g. a resource/API identifier on Okta, Entra ID, Auth0). A matching
//     issuer+client-id therefore does not by itself guarantee the access token
//     is accepted by the target apiserver; align token audiences fleet-wide.
//
// Gated by the --oidc-use-token-broadcast flag (disabled by default).
func BroadcastOIDCToken(params BroadcastOIDCTokenParams) (bool, error) {
	if params.Token == "" {
		return false, nil
	}

	source, issuer, clientID, ok := loadBroadcastSource(params.KubeConfigStore, params.SourceCluster)
	if !ok {
		return false, nil
	}

	kContexts, err := params.KubeConfigStore.GetContexts()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldSourceCluster: params.SourceCluster}, err,
			"failed to get contexts for broadcasting OIDC token")

		return false, nil
	}

	var targets []*kubeconfig.Context

	for _, kCtx := range kContexts {
		if kCtx.Name != params.SourceCluster && isBroadcastTarget(params.SourceCluster, issuer, clientID, kCtx) {
			targets = append(targets, kCtx)
		}
	}

	if len(targets) == 0 {
		return false, nil
	}

	key := SharedTokenKey(issuer, clientID)

	// The caller logs and reports storage errors (oversized token).
	if err := SetSharedTokenCookie(
		params.Writer, params.Request, key, params.Token, params.BaseURL, params.SessionTTL,
	); err != nil {
		return false, err
	}

	// The source reads the shared token too, so it is refreshed in one place.
	// Targets keep their own cookies; only their logout markers are lifted.
	joinSharedToken(params.Writer, params.Request, source, params.BaseURL)

	for _, target := range targets {
		ClearLogoutMarker(params.Writer, params.Request, LogoutMarkerID(target), params.BaseURL)

		logger.Log(logger.LevelInfo,
			map[string]string{logFieldSourceCluster: params.SourceCluster, logFieldTargetCluster: target.Name},
			nil, "broadcasted OIDC token to cluster")
	}

	return true, nil
}

// loadBroadcastSource returns the source context and its issuer + client-id,
// or ok=false when it may not share a token (SharedTokenIdentity).
func loadBroadcastSource(
	store kubeconfig.ContextStore, sourceCluster string,
) (source *kubeconfig.Context, issuer, clientID string, ok bool) {
	source, err := store.GetContext(sourceCluster)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldSourceCluster: sourceCluster}, err,
			"failed to get source context for broadcasting OIDC token")

		return nil, "", "", false
	}

	issuer, clientID, ok = SharedTokenIdentity(source)
	if !ok {
		logger.Log(logger.LevelInfo,
			map[string]string{logFieldSourceCluster: sourceCluster},
			nil, "skipping OIDC token broadcast: source cluster is not eligible for the shared token")

		return nil, "", "", false
	}

	return source, issuer, clientID, true
}

// oidcIssuerAndClientID reads the issuer URL and client ID from a context's
// OIDC configuration without triggering the filesystem I/O (idp-certificate-
// authority read) that Context.OidcConfig() performs. Used for a cheap pre-match
// so the CA-file cost is only paid for targets that actually share the source's
// issuer + client-id.
func oidcIssuerAndClientID(kCtx *kubeconfig.Context) (issuer, clientID string) {
	if kCtx.OidcConf != nil {
		return kCtx.OidcConf.IdpIssuerURL, kCtx.OidcConf.ClientID
	}

	if kCtx.AuthInfo != nil && kCtx.AuthInfo.AuthProvider != nil {
		cfg := kCtx.AuthInfo.AuthProvider.Config
		return cfg["idp-issuer-url"], cfg["client-id"]
	}

	return "", ""
}

// isBroadcastTarget reports whether a context may receive the shared token
// (SharedTokenIdentity) and has the source's issuer + client-id.
//
// An OIDC context that is not eligible is logged at Info level so operators
// can spot misconfiguration. Issuer/client-id mismatches are silent, as
// logging them on every login would be noisy.
func isBroadcastTarget(
	sourceCluster, sourceIssuer, sourceClientID string,
	kCtx *kubeconfig.Context,
) bool {
	issuer, clientID, ok := SharedTokenIdentity(kCtx)
	if !ok {
		if isOIDCAuthContext(kCtx) {
			logger.Log(logger.LevelInfo,
				map[string]string{logFieldSourceCluster: sourceCluster, logFieldTargetCluster: kCtx.Name},
				nil, "skipping OIDC token broadcast: target cluster is not eligible for the shared token")
		}

		return false
	}

	return issuer == sourceIssuer && clientID == sourceClientID
}
