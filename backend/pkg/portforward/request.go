package portforward

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	authenticationv1 "k8s.io/api/authentication/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/clientcmd/api"
)

func portForwardOwnerKey(contextKey string, user authenticationv1.UserInfo) string {
	identity := fmt.Sprintf("%q:%q:%q", contextKey, user.Username, user.UID)
	return fmt.Sprintf("portforward-owner:%x", sha256.Sum256([]byte(identity)))
}

func requestToken(r *http.Request) (string, error) {
	if header := r.Header.Get("Authorization"); header != "" {
		return auth.BearerTokenValue(header), nil
	}

	return auth.GetTokenFromCookie(r, mux.Vars(r)["clusterName"])
}

// RequestHandler authenticates all port-forward operations and isolates their
// cached sessions by the Kubernetes-verified principal, not a client routing ID.
//
//nolint:funlen // Authentication must complete before dispatching any local session operation.
func RequestHandler(store kubeconfig.ContextStore, sessions cache.Cache[interface{}],
	unsafeUseServiceAccountToken bool, contextKey string, w http.ResponseWriter, r *http.Request,
) {
	kContext, err := store.GetContext(contextKey)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting portforward context")
		http.Error(w, "cluster not found", http.StatusNotFound)

		return
	}

	token, err := requestToken(r)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading portforward credentials")
		http.Error(w, "invalid credentials", http.StatusUnauthorized)

		return
	}

	useServiceAccount := unsafeUseServiceAccountToken && kContext.UsesInClusterServiceAccountToken()
	if useServiceAccount {
		token = ""
	} else if token == "" && kContext.UsesInClusterServiceAccountToken() {
		logger.Log(logger.LevelWarn, nil, nil, "portforward requires user credentials")
		http.Error(w, "authentication required", http.StatusUnauthorized)

		return
	}

	kContext = kContext.Copy()
	if token != "" {
		// A user token must never authenticate through a stored certificate or token file instead.
		kContext.AuthInfo = &api.AuthInfo{Token: token}
	}

	client, err := kContext.ClientSetWithToken(token)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating portforward authentication client")
		http.Error(w, "could not authenticate portforward request", http.StatusServiceUnavailable)

		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	review, err := client.AuthenticationV1().SelfSubjectReviews().Create(ctx,
		&authenticationv1.SelfSubjectReview{}, metav1.CreateOptions{})
	if err != nil {
		status := http.StatusServiceUnavailable
		if apierrors.IsUnauthorized(err) {
			status = http.StatusUnauthorized
		} else if apierrors.IsForbidden(err) {
			status = http.StatusForbidden
		}

		logger.Log(logger.LevelWarn, nil, err, "authenticating portforward request")
		http.Error(w, "could not authenticate portforward request", status)

		return
	}

	user := review.Status.UserInfo
	if user.Username == "" || user.Username == "system:anonymous" {
		logger.Log(logger.LevelWarn, nil, nil, "rejecting anonymous portforward request")
		http.Error(w, "authentication required", http.StatusUnauthorized)

		return
	}

	cacheKey := portForwardOwnerKey(contextKey, user)

	switch r.Method {
	case http.MethodPost:
		startPortForwardForOwner(store, sessions, unsafeUseServiceAccountToken, contextKey, cacheKey, w, r)
	case http.MethodDelete:
		StopOrDeletePortForward(sessions, cacheKey, w, r)
	case http.MethodGet:
		if strings.HasSuffix(r.URL.Path, "/portforward/list") {
			GetPortForwards(sessions, cacheKey, w, r)
		} else {
			GetPortForwardByID(sessions, cacheKey, w, r)
		}
	default:
		w.Header().Set("Allow", "GET, POST, DELETE")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
