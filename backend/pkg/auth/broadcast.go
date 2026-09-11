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

// BroadcastOIDCToken sets the auth cookie for every kubeconfig context whose
// OIDC auth-provider has the same idp-issuer-url AND client-id as the source
// cluster.
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
// Refresh-path caveat: this runs only at initial OIDC login. The token-refresh
// middleware (OIDCTokenRefreshMiddleware, backed by RefreshAndSetToken)
// refreshes each cluster's cookie independently and is not yet broadcast-aware.
// Because refresh happens per-cluster, sibling cookies diverge as soon as any
// one cluster refreshes its token; with short token lifetimes (e.g., EKS'
// default ~1h expiry) siblings then fall back to per-cluster re-login.
// Whichever token the flag broadcasts (id_token, or access_token when
// --oidc-use-access-token is set) is the same one SetTokenCookie stores.
// Broadcast-on-refresh is tracked as a follow-up PR.
//
// Cookie-path caveat (pre-existing, general): SetTokenCookie's chunk-clear
// pre-step reads existing chunk cookies via r.Cookie(), which only sees cookies
// the browser sent on the current request path. Cluster cookies are scoped to
// /clusters/<cluster> while OIDC login completes on /oidc-callback, so stale
// chunks from a prior longer token are not actively cleared during login. This
// applies equally to the source cluster; broadcasting just makes the path
// mismatch hit more clusters per login. In the rare case a re-issued token uses
// fewer chunks than the previous one, the affected cluster(s) may need a
// one-time re-login. Also surfaced in the flag's help text.
//
// Gated by the --oidc-use-token-broadcast flag (disabled by default).
func BroadcastOIDCToken(params BroadcastOIDCTokenParams) {
	sourceOIDCConfig, ok := loadBroadcastSourceOIDCConfig(params.KubeConfigStore, params.SourceCluster)
	if !ok {
		return
	}

	kContexts, err := params.KubeConfigStore.GetContexts()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldSourceCluster: params.SourceCluster}, err,
			"failed to get contexts for broadcasting OIDC token")

		return
	}

	for _, kCtx := range kContexts {
		if kCtx.Name == params.SourceCluster || !isOIDCAuthContext(kCtx) {
			continue
		}

		broadcastToTarget(params, sourceOIDCConfig, kCtx)
	}
}

// loadBroadcastSourceOIDCConfig validates that the source cluster has a usable
// OIDC config (auth-provider type, non-nil config, non-empty issuer+client-id).
// Logs and returns ok=false on any check failure so the caller can return early.
func loadBroadcastSourceOIDCConfig(
	store kubeconfig.ContextStore, sourceCluster string,
) (*kubeconfig.OidcConfig, bool) {
	sourceContext, err := store.GetContext(sourceCluster)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldSourceCluster: sourceCluster}, err,
			"failed to get source context for broadcasting OIDC token")

		return nil, false
	}

	if !isOIDCAuthContext(sourceContext) {
		logger.Log(logger.LevelInfo,
			map[string]string{logFieldSourceCluster: sourceCluster},
			nil, "skipping OIDC token broadcast: source cluster does not use the OIDC auth-provider")

		return nil, false
	}

	oidcCfg, err := sourceContext.OidcConfig()
	if err != nil || oidcCfg == nil {
		logger.Log(logger.LevelInfo,
			map[string]string{logFieldSourceCluster: sourceCluster},
			err, "skipping OIDC token broadcast: source cluster has no usable OIDC config")

		return nil, false
	}

	if oidcCfg.IdpIssuerURL == "" || oidcCfg.ClientID == "" {
		logger.Log(logger.LevelInfo,
			map[string]string{logFieldSourceCluster: sourceCluster},
			nil, "skipping OIDC token broadcast: source cluster OIDC config is missing issuer or client-id")

		return nil, false
	}

	return oidcCfg, true
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

// broadcastToTarget evaluates one candidate target context and, if it shares
// the same issuer + client-id as the source, sets the auth cookie for it.
//
// The issuer/client-id comparison is done first via a cheap read that avoids
// filesystem I/O, so large kubeconfigs with many non-matching contexts do not
// pay the CA-file read cost during /oidc-callback. Only a matching target is
// then run through OidcConfig() to validate the config is usable before the
// cookie is set.
//
// Missing or empty issuer/client-id, or an unusable OIDC config on a matching
// target, is logged at Info level so operators can spot misconfiguration.
// Legitimate issuer/client-id mismatches are intentionally silent because
// logging them per-target on every login would be noisy in fleets with many
// non-matching contexts. Either way one bad target does not affect the others.
func broadcastToTarget(
	params BroadcastOIDCTokenParams,
	sourceOIDCConfig *kubeconfig.OidcConfig,
	kCtx *kubeconfig.Context,
) {
	issuer, clientID := oidcIssuerAndClientID(kCtx)
	if issuer == "" || clientID == "" {
		logger.Log(logger.LevelInfo,
			map[string]string{logFieldSourceCluster: params.SourceCluster, logFieldTargetCluster: kCtx.Name},
			nil, "skipping OIDC token broadcast: target cluster OIDC config is missing issuer or client-id")

		return
	}

	if issuer != sourceOIDCConfig.IdpIssuerURL || clientID != sourceOIDCConfig.ClientID {
		return
	}

	// Matching target: now pay OidcConfig()'s cost (may read the CA file), which
	// also validates the config is usable before we set the cookie.
	if _, err := kCtx.OidcConfig(); err != nil {
		logger.Log(logger.LevelInfo,
			map[string]string{logFieldSourceCluster: params.SourceCluster, logFieldTargetCluster: kCtx.Name},
			err, "skipping OIDC token broadcast: target cluster has no usable OIDC config")

		return
	}

	SetTokenCookie(params.Writer, params.Request, kCtx.Name, params.Token, params.BaseURL, params.SessionTTL)
	logger.Log(logger.LevelInfo,
		map[string]string{logFieldSourceCluster: params.SourceCluster, logFieldTargetCluster: kCtx.Name},
		nil, "broadcasted OIDC token to cluster")
}
