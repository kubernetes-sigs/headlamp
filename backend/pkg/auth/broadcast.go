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
// The token is stored once, in a shared cookie keyed by issuer + client-id and
// scoped to <baseURL>/clusters/. The source has its own chunk zero and logout
// marker cleared, each target only its logout marker, so the response header
// size does not grow with token size x number of clusters (reverse proxies such as Envoy
// reject upstream response headers over 60KB). Which clusters may read the
// shared cookie is resolved on the server from each cluster's kubeconfig
// (SharedTokenIdentity), never from a client-supplied cookie; the OIDC
// refresh middleware strips the shared cookies before any handler can forward
// them to an API server.
// Returns shared=true when the token was stored in the shared cookie; the
// caller then must not also store it in the source cluster's own cookie. An
// error means the token could not be stored (oversized); an empty token is
// skipped, as SetTokenCookie does.
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
// Refresh-path: this runs at initial OIDC login. When any cluster on the
// shared token (source included) later refreshes it, RefreshAndSetToken
// writes the renewed token to the shared cookie, so all of
// them keep working from a single refresh lineage. Whichever token
// the flag broadcasts (id_token, or access_token when --oidc-use-access-token
// is set) is the same one SetTokenCookie stores.
//
// Chunked cookies: SetTokenCookie and SetSharedTokenCookie write the token in
// chunks and clear the chunk following the last one; reassembly stops at the
// first missing or empty chunk. A re-issued token that needs fewer chunks is
// therefore read back intact and any stale higher chunks from a longer
// predecessor are ignored until they expire.
//
// Gated by the --oidc-use-token-broadcast flag (disabled by default).
func BroadcastOIDCToken(params BroadcastOIDCTokenParams) (bool, error) {
	if params.Token == "" {
		return false, nil
	}

	issuer, clientID, ok := loadBroadcastSourceIdentity(params.KubeConfigStore, params.SourceCluster)
	if !ok {
		return false, nil
	}

	kContexts, err := params.KubeConfigStore.GetContexts()
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldSourceCluster: params.SourceCluster}, err,
			"failed to get contexts for broadcasting OIDC token")

		return false, nil
	}

	var targets []string

	for _, kCtx := range kContexts {
		if kCtx.Name != params.SourceCluster && isBroadcastTarget(params.SourceCluster, issuer, clientID, kCtx) {
			targets = append(targets, kCtx.Name)
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

	// The source reads the shared token too: one cookie, one refresh lineage.
	// A private copy refreshed on its own would rotate the refresh token away
	// from the shared cookie (or vice versa) and force a re-login on whichever
	// refreshes second. Only the source's own chunk zero is cleared: a sibling
	// holding a private (set-token) or older OIDC cookie keeps using it, its
	// own lineage, as before; only its logout marker is lifted.
	joinSharedToken(params.Writer, params.Request, params.SourceCluster, params.BaseURL)

	for _, target := range targets {
		ClearLogoutMarker(params.Writer, params.Request, target, params.BaseURL)

		logger.Log(logger.LevelInfo,
			map[string]string{logFieldSourceCluster: params.SourceCluster, logFieldTargetCluster: target},
			nil, "broadcasted OIDC token to cluster")
	}

	return true, nil
}

// loadBroadcastSourceIdentity returns the issuer + client-id of the source
// cluster when it is eligible for the shared token (SharedTokenIdentity: an
// operator-configured context with an OIDC auth-provider carrying both). A
// client-controlled context never resolves a shared key, so sharing its token
// would leave it without one. Logs and returns ok=false otherwise so the
// caller falls back to the cluster's own cookie.
func loadBroadcastSourceIdentity(
	store kubeconfig.ContextStore, sourceCluster string,
) (issuer, clientID string, ok bool) {
	sourceContext, err := store.GetContext(sourceCluster)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldSourceCluster: sourceCluster}, err,
			"failed to get source context for broadcasting OIDC token")

		return "", "", false
	}

	issuer, clientID, ok = SharedTokenIdentity(sourceContext)
	if !ok {
		logger.Log(logger.LevelInfo,
			map[string]string{logFieldSourceCluster: sourceCluster},
			nil, "skipping OIDC token broadcast: source cluster is not eligible for the shared token")

		return "", "", false
	}

	return issuer, clientID, true
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

// isBroadcastTarget reports whether a candidate target context is eligible for
// the shared token (SharedTokenIdentity, the same predicate the read side
// uses) and shares the source's issuer + client-id. Nothing is read from disk:
// the CA file matters for that cluster's own login and refresh, not here.
//
// Not eligible are non-OIDC contexts, contexts without issuer or client-id, and
// client-controlled contexts: internal ones, as getClusters() skips them (they
// are per-user stateless clusters that must never be visible to other users,
// and their store keys embed a "\x00"-separated user ID, e.g. "prod\x00alice",
// which SanitizeClusterName collapses to "prodalice", so broadcasting to one
// could overwrite the cookie of an unrelated, legitimately configured cluster
// whose name sanitizes the same way), and dynamic clusters, whose kubeconfig
// may claim any issuer and point at any API server.
//
// An OIDC context that is not eligible is logged at Info level so operators
// can spot misconfiguration. Legitimate issuer/client-id mismatches are
// intentionally silent because logging them per-target on every login would be
// noisy in fleets with many non-matching contexts. Either way one bad target
// does not affect the others.
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
