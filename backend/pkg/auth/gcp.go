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

package auth

import (
	"fmt"
	"net/http"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/gcp"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const (
	// Cookie names for OAuth flow state
	gcpOAuthStateCookie      = "gcp_oauth_state"
	gcpOAuthClusterCookie    = "gcp_oauth_cluster"
	gcpOAuthVerifierCookie   = "gcp_oauth_verifier"
	gcpOAuthChallengeCookie  = "gcp_oauth_challenge"

	// OAuth flow timeout
	oauthFlowTimeout = 10 * time.Minute
)

// HandleGCPAuthLogin initiates the GCP OAuth login flow for GKE clusters.
func HandleGCPAuthLogin(gcpAuth *gcp.GCPAuthenticator, baseURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cluster := r.URL.Query().Get("cluster")
		if cluster == "" {
			http.Error(w, "cluster parameter required", http.StatusBadRequest)
			return
		}

		// Generate state token for CSRF protection
		state, err := gcp.GenerateRandomState()
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to generate state")
			http.Error(w, "failed to generate state", http.StatusInternalServerError)
			return
		}

		// Generate PKCE code verifier and challenge for enhanced security
		codeVerifier, err := gcp.GenerateCodeVerifier()
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to generate code verifier")
			http.Error(w, "failed to generate code verifier", http.StatusInternalServerError)
			return
		}

		codeChallenge := gcp.GenerateCodeChallenge(codeVerifier)

		secure := IsSecureContext(r)

		// Store state, cluster, and PKCE verifier/challenge in cookies for validation in callback
		setOAuthCookie(w, gcpOAuthStateCookie, state, secure)
		setOAuthCookie(w, gcpOAuthClusterCookie, cluster, secure)
		setOAuthCookie(w, gcpOAuthVerifierCookie, codeVerifier, secure)
		setOAuthCookie(w, gcpOAuthChallengeCookie, codeChallenge, secure)

		// Redirect to Google OAuth
		authURL := gcpAuth.GetAuthCodeURL(state, codeChallenge)

		logger.Log(logger.LevelInfo, map[string]string{
			"cluster": cluster,
		}, nil, "initiating GCP OAuth flow")

		http.Redirect(w, r, authURL, http.StatusFound)
	}
}

// HandleGCPAuthCallback handles the OAuth callback from Google.
func HandleGCPAuthCallback(gcpAuth *gcp.GCPAuthenticator, baseURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		// Validate state token (CSRF protection)
		stateCookie, err := r.Cookie(gcpOAuthStateCookie)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "state cookie not found")
			http.Error(w, "invalid OAuth state", http.StatusBadRequest)
			return
		}

		stateParam := r.URL.Query().Get("state")
		if stateCookie.Value != stateParam {
			logger.Log(logger.LevelError, nil,
				fmt.Errorf("state mismatch: cookie=%s, param=%s", stateCookie.Value, stateParam),
				"state validation failed")
			http.Error(w, "invalid state parameter", http.StatusBadRequest)
			return
		}

		// Get cluster from cookie
		clusterCookie, err := r.Cookie(gcpOAuthClusterCookie)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "cluster cookie not found")
			http.Error(w, "cluster not found in session", http.StatusBadRequest)
			return
		}
		cluster := clusterCookie.Value

		// Get PKCE code verifier
		verifierCookie, err := r.Cookie(gcpOAuthVerifierCookie)
		codeVerifier := ""
		if err == nil {
			codeVerifier = verifierCookie.Value
		}

		// Check for OAuth errors
		if errParam := r.URL.Query().Get("error"); errParam != "" {
			errDesc := r.URL.Query().Get("error_description")
			logger.Log(logger.LevelError, map[string]string{
				"cluster": cluster,
				"error":   errParam,
				"desc":    errDesc,
			}, nil, "OAuth error from provider")
			http.Error(w, fmt.Sprintf("OAuth error: %s - %s", errParam, errDesc), http.StatusBadRequest)
			return
		}

		// Exchange code for token
		code := r.URL.Query().Get("code")
		if code == "" {
			logger.Log(logger.LevelError, map[string]string{"cluster": cluster}, nil, "no code in request")
			http.Error(w, "no code in request", http.StatusBadRequest)
			return
		}

		token, err := gcpAuth.Exchange(ctx, code, codeVerifier)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"cluster": cluster}, err, "failed to exchange code for token")
			http.Error(w, "failed to exchange token", http.StatusInternalServerError)
			return
		}

		// Get GKE access token
		gkeToken, err := gcpAuth.GetGKEAccessToken(ctx, token)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"cluster": cluster}, err, "failed to get GKE access token")
			http.Error(w, "failed to get GKE token", http.StatusInternalServerError)
			return
		}

		// Cache the refresh token for later use
		if token.RefreshToken != "" {
			if err := gcpAuth.CacheRefreshToken(ctx, cluster, gkeToken, token.RefreshToken); err != nil {
				logger.Log(logger.LevelError, map[string]string{"cluster": cluster}, err, "failed to cache refresh token")
				// Non-fatal error, continue
			}
		}

		// Set token in cookie (using existing Headlamp pattern)
		SetTokenCookie(w, r, cluster, gkeToken, baseURL)

		// Clear OAuth state cookies
		secure := IsSecureContext(r)
		clearOAuthCookie(w, gcpOAuthStateCookie, secure)
		clearOAuthCookie(w, gcpOAuthClusterCookie, secure)
		clearOAuthCookie(w, gcpOAuthVerifierCookie, secure)
		clearOAuthCookie(w, gcpOAuthChallengeCookie, secure)

		logger.Log(logger.LevelInfo, map[string]string{
			"cluster": cluster,
		}, nil, "GCP OAuth flow completed successfully")

		// Redirect to cluster view
		redirectURL := fmt.Sprintf("/#/c/%s", cluster)
		if baseURL != "" {
			redirectURL = "/" + baseURL + redirectURL
		}

		http.Redirect(w, r, redirectURL, http.StatusFound)
	}
}

// HandleGCPTokenRefresh handles token refresh requests for GKE clusters.
func HandleGCPTokenRefresh(gcpAuth *gcp.GCPAuthenticator, baseURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		cluster, token := ParseClusterAndToken(r)
		if cluster == "" || token == "" {
			http.Error(w, "cluster and token required", http.StatusBadRequest)
			return
		}

		// Get cached refresh token
		refreshToken, err := gcpAuth.GetCachedRefreshToken(ctx, cluster, token)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{
				"cluster": cluster,
			}, err, "failed to get cached refresh token")
			http.Error(w, "no refresh token available", http.StatusUnauthorized)
			return
		}

		// Refresh the token
		newToken, err := gcpAuth.RefreshToken(ctx, refreshToken)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{
				"cluster": cluster,
			}, err, "failed to refresh token")
			http.Error(w, "failed to refresh token", http.StatusInternalServerError)
			return
		}

		// Get new GKE access token
		newGKEToken, err := gcpAuth.GetGKEAccessToken(ctx, newToken)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{
				"cluster": cluster,
			}, err, "failed to get new GKE access token")
			http.Error(w, "failed to get new GKE token", http.StatusInternalServerError)
			return
		}

		// Cache the new refresh token if we got one
		if newToken.RefreshToken != "" {
			if err := gcpAuth.CacheRefreshToken(ctx, cluster, newGKEToken, newToken.RefreshToken); err != nil {
				logger.Log(logger.LevelError, map[string]string{
					"cluster": cluster,
				}, err, "failed to cache new refresh token")
				// Non-fatal, continue
			}
		}

		// Set new token in cookie
		SetTokenCookie(w, r, cluster, newGKEToken, baseURL)

		logger.Log(logger.LevelInfo, map[string]string{
			"cluster": cluster,
		}, nil, "token refreshed successfully")

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("token refreshed"))
	}
}

// setOAuthCookie sets a temporary cookie for OAuth flow state.
func setOAuthCookie(w http.ResponseWriter, name, value string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   int(oauthFlowTimeout.Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// clearOAuthCookie clears a cookie by setting it to expire immediately.
func clearOAuthCookie(w http.ResponseWriter, name string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}
