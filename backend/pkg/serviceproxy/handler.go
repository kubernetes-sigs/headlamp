package serviceproxy

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/kubernetes"
)

// RequestHandler is an HTTP handler that proxies requests to a Kubernetes service.
func RequestHandler(kubeConfigStore kubeconfig.ContextStore, w http.ResponseWriter, r *http.Request) {
	clusterName, namespace, name, requestURI := parseInfoFromRequest(r)

	defer disableResponseCaching(w)
	// Get the context
	ctx, err := kubeConfigStore.GetContext(clusterName)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get context")
		w.WriteHeader(http.StatusNotFound)

		return
	}

	bearerToken, err := getAuthToken(r, clusterName)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get auth token")
		w.WriteHeader(http.StatusUnauthorized)

		return
	}

	// Get a ClientSet with the auth token
	cs, err := ctx.ClientSetWithToken(bearerToken)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get ClientSet")
		w.WriteHeader(http.StatusNotFound)

		return
	}

	// Get the service
	ps, status, err := getServiceFromCluster(cs, namespace, name)
	if err != nil {
		w.WriteHeader(status)
		return
	}

	// Get a service connection object and make the request
	conn := NewConnection(ps)

	handleServiceProxy(conn, requestURI, w)
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

	bearerToken := strings.TrimPrefix(authToken, "Bearer ")
	if bearerToken == "" {
		return "", fmt.Errorf("unauthorized")
	}

	return bearerToken, nil
}

func getServiceFromCluster(cs kubernetes.Interface, namespace string, name string) (*proxyService, int, error) {
	ps, err := GetService(cs, namespace, name)
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

func handleServiceProxy(conn ServiceConnection, requestURI string, w http.ResponseWriter) {
	resp, err := conn.Get(requestURI)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "service get request failed")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	_, err = w.Write(resp)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing response")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}
}
