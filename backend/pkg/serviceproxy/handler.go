package serviceproxy

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/kubernetes"
)

// RequestHandler is an HTTP handler that proxies requests to a Kubernetes service.
func RequestHandler(
	kubeConfigStore kubeconfig.ContextStore,
	unsafeUseServiceAccountToken bool,
	w http.ResponseWriter,
	r *http.Request,
) {
	clusterName, namespace, name, requestURI := parseInfoFromRequest(r)

	defer disableResponseCaching(w)
	// Get the context
	ctx, err := kubeConfigStore.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get context")
		w.WriteHeader(http.StatusNotFound)

		return
	}

	bearerToken := ""

	if !shouldUseUnsafeServiceAccountToken(ctx, unsafeUseServiceAccountToken) {
		token, err := getAuthToken(r, clusterName)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to get auth token")
			w.WriteHeader(http.StatusUnauthorized)

			return
		}

		bearerToken = token
	}

	// Get a ClientSet with the auth token
	cs, err := ctx.ClientSetWithToken(bearerToken)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get ClientSet")
		w.WriteHeader(http.StatusNotFound)

		return
	}

	// Get the service
	ps, status, err := getServiceFromCluster(r.Context(), cs, namespace, name)
	if err != nil {
		w.WriteHeader(status)
		return
	}

	// Get a service connection object and make the request
	conn := NewConnection(ps)

	handleServiceProxy(r.Context(), conn, requestURI, w)
}

func shouldUseUnsafeServiceAccountToken(ctx *kubeconfig.Context, unsafeUseServiceAccountToken bool) bool {
	return unsafeUseServiceAccountToken && ctx.UsesInClusterServiceAccountToken()
}

func parseInfoFromRequest(r *http.Request) (string, string, string, string) {
	clusterName := mux.Vars(r)["clusterName"]
	namespace := mux.Vars(r)["namespace"]
	name := mux.Vars(r)["name"]
	requestURI := r.URL.Query().Get("request")

	return clusterName, namespace, name, requestURI
}

func getAuthToken(r *http.Request, clusterName string) (string, error) {
	// Try to get token from cookie first
	tokenFromCookie, err := auth.GetTokenFromCookie(r, clusterName)
	if err == nil && tokenFromCookie != "" {
		return tokenFromCookie, nil
	}

	// Fall back to Authorization header
	authToken := r.Header.Get("Authorization")
	if len(authToken) == 0 {
		return "", fmt.Errorf("unauthorized")
	}

	bearerToken := auth.BearerTokenValue(authToken)
	if bearerToken == "" {
		return "", fmt.Errorf("unauthorized")
	}

	return bearerToken, nil
}

func getServiceFromCluster(
	ctx context.Context, cs kubernetes.Interface, namespace string, name string,
) (*proxyService, int, error) {
	ps, err := GetService(ctx, cs, namespace, name)
	if err != nil {
		if errors.IsUnauthorized(err) {
			return nil, http.StatusUnauthorized, err
		}

		return nil, http.StatusNotFound, err
	}

	return ps, http.StatusOK, err
}

func disableResponseCaching(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-cache, private, max-age=0")
	w.Header().Set("Expires", time.Unix(0, 0).Format(http.TimeFormat))
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Accel-Expires", "0")
}

type trackingResponseWriter struct {
	http.ResponseWriter
	wroteHeader  bool
	bytesWritten int
}

func (w *trackingResponseWriter) WriteHeader(code int) {
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(code)
}

func (w *trackingResponseWriter) Write(p []byte) (int, error) {
	n, err := w.ResponseWriter.Write(p)
	if n > 0 {
		w.wroteHeader = true
		w.bytesWritten += n
	}

	return n, err
}

func (w *trackingResponseWriter) HasWritten() bool {
	return w.wroteHeader || w.bytesWritten > 0
}

func handleServiceProxy(ctx context.Context, conn ServiceConnection, requestURI string, w http.ResponseWriter) {
	trackedWriter := &trackingResponseWriter{ResponseWriter: w}

	if err := conn.Get(ctx, requestURI, trackedWriter); err != nil {
		logger.Log(logger.LevelError, nil, err, "service get request failed")

		if !trackedWriter.HasWritten() {
			http.Error(trackedWriter, err.Error(), http.StatusInternalServerError)
		}

		return
	}
}
