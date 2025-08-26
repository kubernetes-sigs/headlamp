package serviceproxy

import (
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/headlamp-k8s/headlamp/backend/pkg/kubeconfig"
	"github.com/headlamp-k8s/headlamp/backend/pkg/logger"
	"k8s.io/apimachinery/pkg/api/errors"
)

// RequestHandler - implementation of the service proxy handler.
func RequestHandler(kubeConfigStore kubeconfig.ContextStore, w http.ResponseWriter, r *http.Request) { //nolint:funlen
	name := mux.Vars(r)["name"]
	namespace := mux.Vars(r)["namespace"]
	requestURI := r.URL.Query().Get("request")

	// Disable caching
	w.Header().Set("Cache-Control", "no-cache, private, max-age=0")
	w.Header().Set("Expires", time.Unix(0, 0).Format(http.TimeFormat))
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Accel-Expires", "0")

	// Get the context
	ctx, err := kubeConfigStore.GetContext(kubeconfig.InClusterContextName)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get context")
		w.WriteHeader(http.StatusNotFound)

		return
	}

	// Get the authorization token from the header
	authToken := r.Header.Get("Authorization")
	if len(authToken) == 0 {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	bearerToken := strings.TrimPrefix(authToken, "Bearer ")
	if bearerToken == "" {
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
	ps, err := getService(cs, namespace, name)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get service")

		if errors.IsUnauthorized(err) {
			w.WriteHeader(http.StatusUnauthorized)
		} else {
			w.WriteHeader(http.StatusNotFound)
		}

		return
	}

	// Get a service connection object and make the request
	conn := NewConnection(ps)

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
