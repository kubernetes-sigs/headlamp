package portforward

import (
	"context"
	"crypto/sha256"
	"errors"
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

func portForwardOwnerKey(contextKey string, cluster *api.Cluster, user authenticationv1.UserInfo) string {
	authority := fmt.Sprintf("%q:%q:%t:%q:%q:%q", cluster.Server, cluster.TLSServerName,
		cluster.InsecureSkipTLSVerify, cluster.CertificateAuthority, cluster.CertificateAuthorityData, cluster.ProxyURL)
	identity := fmt.Sprintf("%q:%q:%q:%q", contextKey, authority, user.Username, user.UID)

	return fmt.Sprintf("portforward-owner:%x", sha256.Sum256([]byte(identity)))
}

func requestToken(r *http.Request) (string, error) {
	if headers, supplied := r.Header["Authorization"]; supplied {
		if len(headers) != 1 {
			return "", errors.New("exactly one authorization credential is required")
		}

		token := auth.BearerTokenValue(headers[0])
		if token == "" {
			return "", errors.New("supplied authorization credential is empty")
		}

		return token, nil
	}

	clusterName := mux.Vars(r)["clusterName"]
	if auth.SanitizeClusterName(clusterName) == "" {
		return "", nil
	}

	return auth.GetTokenFromCookie(r, clusterName)
}

// RequestHandler authenticates all port-forward operations and isolates their
// cached sessions by the Kubernetes-verified principal, not a client routing ID.
func RequestHandler(store kubeconfig.ContextStore, sessions cache.Cache[interface{}],
	unsafeUseServiceAccountToken bool, contextKey string, w http.ResponseWriter, r *http.Request,
) {
	kContext, err := store.GetContext(contextKey)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "getting portforward context")
		http.Error(w, "cluster not found", http.StatusNotFound)

		return
	}

	handleRequestContext(kContext, sessions, unsafeUseServiceAccountToken, contextKey, !kContext.Internal, w, r)
}

// RequestHandlerWithContext uses a context freshly resolved from this request's
// kubeconfig, never credentials inherited from a cached stateless routing key.
func RequestHandlerWithContext(kContext *kubeconfig.Context, sessions cache.Cache[interface{}],
	unsafeUseServiceAccountToken bool, contextKey string, w http.ResponseWriter, r *http.Request,
) {
	token, err := requestToken(r)
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "reading stateless portforward credentials")
		http.Error(w, "invalid credentials", http.StatusUnauthorized)

		return
	}

	if token == "" && requestContextUsesLocalCredentials(kContext.AuthInfo) {
		logger.Log(logger.LevelWarn, nil, nil, "stateless portforward requires embedded or independent credentials")
		http.Error(w, "request kubeconfig credential files and providers require an independent request token",
			http.StatusBadRequest)

		return
	}

	handleRequestContext(kContext, sessions, unsafeUseServiceAccountToken, contextKey, true, w, r)
}

func requestContextUsesLocalCredentials(info *api.AuthInfo) bool {
	return info != nil && (info.TokenFile != "" || info.ClientCertificate != "" || info.ClientKey != "" ||
		info.Exec != nil || info.AuthProvider != nil)
}

//nolint:funlen // Authentication must complete before dispatching any local session operation.
func handleRequestContext(kContext *kubeconfig.Context, sessions cache.Cache[interface{}],
	unsafeUseServiceAccountToken bool, contextKey string, allowContextCredentials bool,
	w http.ResponseWriter, r *http.Request,
) {
	kContext = kContext.Copy()

	token, err := requestToken(r)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading portforward credentials")
		http.Error(w, "invalid credentials", http.StatusUnauthorized)

		return
	}

	if token == "" && !allowContextCredentials {
		logger.Log(logger.LevelWarn, nil, nil, "cached stateless portforward context requires request credentials")
		http.Error(w, "authentication required", http.StatusUnauthorized)

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

	cacheKey := portForwardOwnerKey(contextKey, kContext.Cluster, user)

	switch r.Method {
	case http.MethodPost:
		startPortForwardForOwner(kContext, sessions, unsafeUseServiceAccountToken, contextKey, cacheKey, w, r)
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
