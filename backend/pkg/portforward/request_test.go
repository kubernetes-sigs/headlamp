//nolint:testpackage // Tests private cached session state through the production HTTP handler.
package portforward

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	authenticationv1 "k8s.io/api/authentication/v1"
	"k8s.io/client-go/tools/clientcmd/api"
)

type portForwardTestAPI struct {
	server *httptest.Server
	calls  atomic.Int32
}

func newPortForwardTestAPI(t *testing.T) *portForwardTestAPI {
	t.Helper()

	apiServer := &portForwardTestAPI{}
	apiServer.server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiServer.calls.Add(1)
		w.Header().Set("Content-Type", "application/json")

		if r.URL.Path != "/apis/authentication.k8s.io/v1/selfsubjectreviews" {
			// Start-path tests deliberately stop before allocating a real forward.
			http.Error(w, "permission denied", http.StatusForbidden)
			return
		}

		user := authenticationv1.UserInfo{Username: "alice", UID: "alice-id"}

		switch r.Header.Get("Authorization") {
		case "Bearer alice", "Bearer alice-refreshed":
		case "Bearer bob":
			user = authenticationv1.UserInfo{Username: "bob", UID: "bob-id"}
		case "Bearer recreated-alice":
			user.UID = "new-alice-id"
		case "Bearer anonymous":
			user.Username = "system:anonymous"
		case "Bearer unavailable":
			http.Error(w, "authentication unavailable", http.StatusServiceUnavailable)
			return
		default:
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		review := authenticationv1.SelfSubjectReview{}
		review.APIVersion = "authentication.k8s.io/v1"
		review.Kind = "SelfSubjectReview"
		review.Status.UserInfo = user
		require.NoError(t, json.NewEncoder(w).Encode(review))
	}))
	t.Cleanup(apiServer.server.Close)

	return apiServer
}

func portForwardTestStore(t *testing.T, upstream string) kubeconfig.ContextStore {
	t.Helper()

	store := kubeconfig.NewContextStore()
	for _, name := range []string{"shared", "shared-extra", "shared\x00stateless-user"} {
		require.NoError(t, store.AddContext(&kubeconfig.Context{
			Name: name, Cluster: &api.Cluster{Server: upstream, InsecureSkipTLSVerify: true},
			KubeContext: &api.Context{Cluster: name, AuthInfo: name}, AuthInfo: &api.AuthInfo{},
		}))
	}

	return store
}

func portForwardTestRequest(t *testing.T, server, method, path, token, body string) (int, string) {
	t.Helper()
	request, err := http.NewRequestWithContext(t.Context(), method, server+path, strings.NewReader(body))
	require.NoError(t, err)

	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}

	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)

	defer func() { _ = response.Body.Close() }()

	data, err := io.ReadAll(response.Body)
	require.NoError(t, err)

	return response.StatusCode, string(data)
}

func testPortForwardOwnerKey(t *testing.T, store kubeconfig.ContextStore,
	contextKey string, user authenticationv1.UserInfo,
) string {
	t.Helper()

	kContext, err := store.GetContext(contextKey)
	require.NoError(t, err)

	return portForwardOwnerKey(contextKey, kContext.Cluster, user)
}

//nolint:funlen // Exercises real HTTP requests, upstream authentication, and session-control isolation together.
func TestPortForwardAuthenticatedOwnershipEndToEnd(t *testing.T) {
	upstream := newPortForwardTestAPI(t)
	store := portForwardTestStore(t, upstream.server.URL)
	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })

	ownerKey := testPortForwardOwnerKey(t, store, "shared", authenticationv1.UserInfo{Username: "alice", UID: "alice-id"})
	closed := make(chan struct{})
	victim := portForward{
		ID: "victim", Cluster: "shared", cacheKey: ownerKey, Pod: "private-pod",
		Namespace: "private", Status: RUNNING, closeChan: closed,
	}
	portforwardstore(sessions, victim)
	legacy := victim
	legacy.ID, legacy.cacheKey = "unowned-legacy", "shared"
	portforwardstore(sessions, legacy)

	router := mux.NewRouter()
	router.PathPrefix("/clusters/{clusterName}/portforward").Handler(
		auth.NewBackendTokenMiddleware(true)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			RequestHandler(store, sessions, false, mux.Vars(r)["clusterName"], w, r)
		})))
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)

	for _, token := range []string{"", "forged", "expired", "anonymous", "bob", "recreated-alice"} {
		t.Run("unrelated-"+token, func(t *testing.T) {
			status, body := portForwardTestRequest(t, server.URL, http.MethodGet,
				"/clusters/shared/portforward/list", token, "")
			if token == "bob" || token == "recreated-alice" {
				require.Equal(t, http.StatusOK, status)
				require.JSONEq(t, "[]", body)
			} else {
				require.Equal(t, http.StatusUnauthorized, status)
			}

			require.NotContains(t, body, "private-pod")

			status, _ = portForwardTestRequest(t, server.URL, http.MethodGet,
				"/clusters/shared/portforward?id=victim", token, "")
			require.NotEqual(t, http.StatusOK, status)

			for _, stop := range []string{"true", "false"} {
				status, _ = portForwardTestRequest(t, server.URL, http.MethodDelete,
					"/clusters/shared/portforward", token, `{"id":"victim","stopOrDelete":`+stop+`}`)
				require.NotEqual(t, http.StatusOK, status)
			}

			select {
			case <-closed:
				t.Fatal("unrelated caller stopped victim's session")
			default:
			}

			got, err := getPortForwardByID(sessions, ownerKey, victim.ID)
			require.NoError(t, err)
			require.Equal(t, RUNNING, got.Status)
		})
	}

	for _, cluster := range []string{"shared-extra", "shared%00stateless-user"} {
		status, body := portForwardTestRequest(t, server.URL, http.MethodGet,
			"/clusters/"+cluster+"/portforward/list", "alice", "")
		require.Equal(t, http.StatusOK, status)
		require.JSONEq(t, "[]", body)
	}

	status, body := portForwardTestRequest(t, server.URL, http.MethodGet,
		"/clusters/shared/portforward/list", "alice-refreshed", "")
	require.Equal(t, http.StatusOK, status)
	require.Contains(t, body, "private-pod")
	require.NotContains(t, body, "unowned-legacy")
	require.NotContains(t, body, ownerKey)

	status, _ = portForwardTestRequest(t, server.URL, http.MethodGet,
		"/clusters/shared/portforward?id=victim", "alice", "")
	require.Equal(t, http.StatusOK, status)
	status, _ = portForwardTestRequest(t, server.URL, http.MethodDelete,
		"/clusters/shared/portforward", "alice-refreshed", `{"id":"victim","stopOrDelete":true}`)
	require.Equal(t, http.StatusOK, status)

	select {
	case <-closed:
	default:
		t.Fatal("owner did not stop its session")
	}

	status, _ = portForwardTestRequest(t, server.URL, http.MethodDelete,
		"/clusters/shared/portforward", "alice", `{"id":"victim","stopOrDelete":false}`)
	require.Equal(t, http.StatusOK, status)

	_, err := getPortForwardByID(sessions, ownerKey, victim.ID)
	require.Error(t, err)
}

func TestPortForwardAuthenticationFailsClosed(t *testing.T) {
	upstream := newPortForwardTestAPI(t)
	store := portForwardTestStore(t, upstream.server.URL)
	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "desktop-launch-token")

	router := mux.NewRouter()
	router.PathPrefix("/clusters/{clusterName}/portforward").Handler(
		auth.NewBackendTokenMiddleware(false)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			RequestHandler(store, sessions, false, "shared", w, r)
		})))
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	status, _ := portForwardTestRequest(t, server.URL, http.MethodGet,
		"/clusters/shared/portforward/list", "alice", "")
	require.Equal(t, http.StatusForbidden, status)
	require.Zero(t, upstream.calls.Load())

	tokenFile := filepath.Join(t.TempDir(), "stored-token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("alice"), 0o600))

	kContext, err := store.GetContext("shared")
	require.NoError(t, err)

	kContext.AuthInfo.TokenFile = tokenFile

	for _, test := range []struct {
		token string
		want  int
	}{
		{"forged", http.StatusUnauthorized},
		{"unavailable", http.StatusServiceUnavailable},
		{"alice", http.StatusOK},
	} {
		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
			"/clusters/shared/portforward/list", nil)
		request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
		request.Header.Set("Authorization", "Bearer "+test.token)

		response := httptest.NewRecorder()
		RequestHandler(store, sessions, false, "shared", response, request)
		require.Equal(t, test.want, response.Code)
	}

	kContext.Source = kubeconfig.InCluster
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
		"/clusters/shared/portforward/list", nil)
	request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
	response := httptest.NewRecorder()
	RequestHandler(store, sessions, false, "shared", response, request)
	require.Equal(t, http.StatusUnauthorized, response.Code)
	response = httptest.NewRecorder()
	RequestHandler(store, sessions, true, "shared", response, request)
	require.Equal(t, http.StatusOK, response.Code)
}

func TestPortForwardCreationKeepsOwnerScope(t *testing.T) {
	upstream := newPortForwardTestAPI(t)
	store := portForwardTestStore(t, upstream.server.URL)
	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })

	key := testPortForwardOwnerKey(t, store, "shared", authenticationv1.UserInfo{Username: "alice", UID: "alice-id"})
	for _, state := range []string{RUNNING, RECONNECTING, STOPPED} {
		victim := portForward{ID: "same-id", Cluster: "shared", cacheKey: key, Status: state}
		portforwardstore(sessions, victim)

		for _, token := range []string{"alice", "bob", "forged"} {
			request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/portforward",
				strings.NewReader(`{"id":"same-id","pod":"p","namespace":"default","port":"8080","targetPort":"80"}`))
			request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
			request.Header.Set("Authorization", "Bearer "+token)

			response := httptest.NewRecorder()
			StartPortForward(store, sessions, false, "shared", response, request)

			switch {
			case token == "forged":
				require.Equal(t, http.StatusUnauthorized, response.Code)
			case token == "alice" && (state == RUNNING || state == RECONNECTING):
				require.Equal(t, http.StatusConflict, response.Code)
			default:
				require.Equal(t, http.StatusInternalServerError, response.Code)
			}

			got, err := getPortForwardByID(sessions, key, victim.ID)
			require.NoError(t, err)
			require.Equal(t, state, got.Status)
		}
	}
}

func TestPortForwardCookieOwnership(t *testing.T) {
	upstream := newPortForwardTestAPI(t)
	store := portForwardTestStore(t, upstream.server.URL)
	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })

	key := testPortForwardOwnerKey(t, store, "shared", authenticationv1.UserInfo{Username: "alice", UID: "alice-id"})
	portforwardstore(sessions, portForward{ID: "cookie-owner", Cluster: "shared", cacheKey: key})

	for _, token := range []string{"alice", "alice-refreshed", "bob"} {
		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
			"/clusters/shared/portforward/list", nil)
		request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
		cookies := httptest.NewRecorder()
		require.NoError(t, auth.SetTokenCookie(cookies, request, "shared", token, "", 3600))

		for _, cookie := range cookies.Result().Cookies() {
			if cookie.MaxAge > 0 {
				request.AddCookie(cookie)
			}
		}

		response := httptest.NewRecorder()
		RequestHandler(store, sessions, false, "shared", response, request)
		require.Equal(t, http.StatusOK, response.Code)

		if token == "bob" {
			require.JSONEq(t, "[]", response.Body.String())
		} else {
			require.Contains(t, response.Body.String(), "cookie-owner")
		}
	}
}
