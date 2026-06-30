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
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

// OIDCTokenRefreshConfig holds the configuration needed by the OIDC token
// refresh middleware. It is a subset of the full HeadlampConfig, containing
// only the fields relevant to authentication and token lifecycle.
type OIDCTokenRefreshConfig struct {
	KubeConfigStore              kubeconfig.ContextStore
	Cache                        cache.Cache[interface{}]
	Telemetry                    *telemetry.Telemetry
	TelemetryHandler             *telemetry.RequestHandler
	Metrics                      *telemetry.Metrics
	OidcUseAccessToken           bool
	OidcIdpIssuerURL             string
	OidcValidatorIdpIssuerURL    string
	BaseURL                      string
	SessionTTL                   int
	UseInCluster                 bool
	UnsafeUseServiceAccountToken bool
}

// oidcMiddlewareRoute is the api.route attribute value used by the OIDC token
// refresh middleware for telemetry. It is also the span/operation name.
const oidcMiddlewareRoute = "OIDCTokenRefreshMiddleware"

// SetTokenFromCookie retrieves a token from the request cookie and sets
// it as the Authorization header.
func SetTokenFromCookie(r *http.Request, clusterName string) {
	tokenFromCookie, err := GetTokenFromCookie(r, clusterName)
	if err == nil && tokenFromCookie != "" {
		r.Header.Set("Authorization", fmt.Sprintf("Bearer %s", tokenFromCookie))
	}
}

// NewOIDCTokenRefreshMiddleware creates an HTTP middleware that checks whether
// the incoming request carries an OIDC token that is about to expire and, if
// so, refreshes it transparently using the configured OIDC provider.
//
//nolint:funlen
func NewOIDCTokenRefreshMiddleware(config OIDCTokenRefreshConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			start := time.Now()
			// status is captured by the deferred RecordDuration below. Each early-return
			// branch sets it before calling next.ServeHTTP. The happy path leaves it as
			// "success".
			status := "success"

			var span trace.Span
			if config.Telemetry != nil {
				_, span = telemetry.CreateSpan(ctx, r, "auth", oidcMiddlewareRoute)

				config.TelemetryHandler.RecordEvent(span, "Middleware started")

				defer span.End()
			}

			defer func() {
				config.TelemetryHandler.RecordDuration(ctx, start,
					attribute.String("api.route", oidcMiddlewareRoute),
					attribute.String("status", status))
			}()

			config.incrementRequestCounter(ctx)

			if config.shouldSkipOIDCRefresh(w, r, span, &status, next) {
				return
			}

			cluster, token := ParseClusterAndToken(r)
			if config.shouldBypassOIDCRefresh(cluster, token, w, r, span, &status, next) {
				return
			}

			kContext, err := config.KubeConfigStore.GetContext(cluster)
			if config.handleGetContextError(err, cluster, w, r, span, ctx, &status, next) {
				return
			}

			if config.shouldUseUnsafeServiceAccountTokenForContext(kContext) {
				config.TelemetryHandler.RecordEvent(span, "Using service account token, skipping OIDC refresh")

				status = "service_account_token"

				next.ServeHTTP(w, r)

				return
			}

			oidcAuthConfig, err := kContext.OidcConfig()
			if config.handleOIDCAuthConfigError(err, w, r, span, &status, next) {
				return
			}

			if !IsTokenAboutToExpire(token) {
				config.TelemetryHandler.RecordEvent(span, "Token not about to expire, skipping refresh")

				status = "token_valid"

				next.ServeHTTP(w, r)

				return
			}

			RefreshAndSetToken(RefreshAndSetTokenParams{
				Ctx:                       ctx,
				OIDCAuthConfig:            oidcAuthConfig,
				Cache:                     config.Cache,
				Token:                     token,
				Cluster:                   cluster,
				Span:                      span,
				Writer:                    w,
				Request:                   r,
				TelemetryHandler:          config.TelemetryHandler,
				OIDCUseAccessToken:        config.OidcUseAccessToken,
				OIDCIdpIssuerURL:          config.OidcIdpIssuerURL,
				OIDCValidatorIdpIssuerURL: config.OidcValidatorIdpIssuerURL,
				BaseURL:                   config.BaseURL,
				SessionTTL:                config.SessionTTL,
			})

			next.ServeHTTP(w, r)
		})
	}
}

// incrementRequestCounter increments the OIDC middleware request counter metric
// if metrics are configured.
func (c *OIDCTokenRefreshConfig) incrementRequestCounter(ctx context.Context) {
	if c.Metrics != nil {
		c.Metrics.RequestCounter.Add(ctx, 1,
			metric.WithAttributes(
				attribute.String("api.route", oidcMiddlewareRoute),
				attribute.String("status", "start"),
			))
	}
}

// shouldUseUnsafeServiceAccountToken reports whether the config is running
// in-cluster with unsafe service account token usage enabled.
func (c *OIDCTokenRefreshConfig) shouldUseUnsafeServiceAccountToken() bool {
	return c.UseInCluster && c.UnsafeUseServiceAccountToken
}

// shouldUseUnsafeServiceAccountTokenForContext reports whether the configured
// cluster context should use its in-cluster service account token instead of
// going through the OIDC refresh flow.
func (c *OIDCTokenRefreshConfig) shouldUseUnsafeServiceAccountTokenForContext(
	kContext *kubeconfig.Context,
) bool {
	return c.shouldUseUnsafeServiceAccountToken() && kContext.UsesInClusterServiceAccountToken()
}

// shouldSkipOIDCRefresh checks whether the request path is not a cluster
// request and, if so, passes it through to the next handler without
// attempting an OIDC refresh. It returns true when the request was skipped.
func (c *OIDCTokenRefreshConfig) shouldSkipOIDCRefresh(
	w http.ResponseWriter, r *http.Request, span trace.Span,
	status *string, next http.Handler,
) bool {
	if !strings.HasPrefix(r.URL.String(), "/clusters/") {
		c.TelemetryHandler.RecordEvent(span, "Not a cluster request, skipping OIDC refresh")

		*status = "skipped"

		next.ServeHTTP(w, r)

		return true
	}

	return false
}

// shouldBypassOIDCRefresh checks whether the cluster name or token is empty
// and, if so, passes the request through to the next handler. It returns
// true when the refresh was bypassed.
func (c *OIDCTokenRefreshConfig) shouldBypassOIDCRefresh(
	cluster, token string, w http.ResponseWriter, r *http.Request,
	span trace.Span, status *string, next http.Handler,
) bool {
	if cluster == "" || token == "" {
		c.TelemetryHandler.RecordEvent(span, "Missing cluster or token, bypassing OIDC refresh")

		*status = "missing"

		next.ServeHTTP(w, r)

		return true
	}

	return false
}

// handleGetContextError checks whether a kubeconfig context lookup failed
// and, on error, logs it, records telemetry, and passes the request through
// to the next handler. It returns true when an error was handled.
func (c *OIDCTokenRefreshConfig) handleGetContextError(
	err error, cluster string, w http.ResponseWriter, r *http.Request,
	span trace.Span, ctx context.Context, status *string, next http.Handler,
) bool {
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": cluster},
			err, "failed to get context")

		c.TelemetryHandler.RecordError(span, err, "Failed to get context")
		c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error", "get_context_failure"))

		*status = "get_context_failure"

		next.ServeHTTP(w, r)

		return true
	}

	return false
}

// handleOIDCAuthConfigError checks whether an OIDC auth config lookup failed
// and, on error, records a telemetry event and passes the request through to
// the next handler. It returns true when an error was handled.
func (c *OIDCTokenRefreshConfig) handleOIDCAuthConfigError(
	err error, w http.ResponseWriter, r *http.Request, span trace.Span,
	status *string, next http.Handler,
) bool {
	if err != nil {
		c.TelemetryHandler.RecordEvent(span, "OIDC auth not enabled for cluster")

		*status = "oidc_auth_not_enabled"

		next.ServeHTTP(w, r)

		return true
	}

	return false
}
