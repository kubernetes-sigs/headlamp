//go:build e2e

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

package e2e_test

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/stretchr/testify/require"
	authenticationv1 "k8s.io/api/authentication/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

type multiplexFrame struct {
	Type      string `json:"type"`
	ClusterID string `json:"clusterId"`
	Path      string `json:"path"`
	Query     string `json:"query"`
	UserID    string `json:"userId"`
	Data      string `json:"data,omitempty"`
	Reopen    bool   `json:"reopen,omitempty"`
}

type liveMultiplexer struct {
	client    kubernetes.Interface
	namespace string
	address   string
	token     string
	route     multiplexFrame
}

func startLiveMultiplexer(t *testing.T) *liveMultiplexer {
	t.Helper()

	binary, err := filepath.Abs(os.Getenv("HEADLAMP_E2E_BINARY"))
	require.NoError(t, err)
	require.NotEmpty(t, os.Getenv("HEADLAMP_E2E_BINARY"), "set HEADLAMP_E2E_BINARY to a built Headlamp backend")
	contextName := os.Getenv("HEADLAMP_E2E_CONTEXT")
	require.NotEmpty(t, contextName, "explicitly select the disposable test cluster with HEADLAMP_E2E_CONTEXT")

	raw, err := clientcmd.NewDefaultClientConfigLoadingRules().Load()
	require.NoError(t, err)

	raw.CurrentContext = contextName
	require.NoError(t, clientcmdapi.MinifyConfig(raw))
	require.NoError(t, clientcmdapi.FlattenConfig(raw))
	config, err := clientcmd.NewNonInteractiveClientConfig(*raw, contextName, nil, nil).ClientConfig()
	require.NoError(t, err)
	require.True(t, config.ExecProvider == nil && config.AuthProvider == nil,
		"the live multiplexer suite requires a static bearer token or client certificate and key")
	require.True(t, config.BearerToken != "" || (len(config.CertData) > 0 && len(config.KeyData) > 0),
		"the selected context must supply a bearer token or client certificate and key")

	client, err := kubernetes.NewForConfig(config)
	require.NoError(t, err)

	backendConfig := raw.DeepCopy()
	backendContext := backendConfig.Contexts[contextName]
	require.NotNil(t, backendContext)
	backendConfig.AuthInfos[backendContext.AuthInfo] = &clientcmdapi.AuthInfo{}
	address := startLiveBackend(t, binary, backendConfig)
	namespace, err := client.CoreV1().Namespaces().Create(t.Context(),
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{GenerateName: "headlamp-multiplexer-e2e-"}}, metav1.CreateOptions{})
	require.NoError(t, err)
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()

		require.NoError(t, client.CoreV1().Namespaces().Delete(ctx, namespace.Name, metav1.DeleteOptions{}))
	})
	_, err = client.CoreV1().ConfigMaps(namespace.Name).Create(t.Context(), &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "observed"}, Data: map[string]string{"revision": "initial"},
	}, metav1.CreateOptions{})
	require.NoError(t, err)
	const serviceAccount = "multiplexer-client"
	_, err = client.CoreV1().ServiceAccounts(namespace.Name).Create(t.Context(), &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{Name: serviceAccount},
	}, metav1.CreateOptions{})
	require.NoError(t, err)
	_, err = client.RbacV1().Roles(namespace.Name).Create(t.Context(), &rbacv1.Role{
		ObjectMeta: metav1.ObjectMeta{Name: "multiplexer-watch"},
		Rules: []rbacv1.PolicyRule{{
			APIGroups: []string{""},
			Resources: []string{"configmaps"},
			Verbs:     []string{"get", "list", "watch"},
		}},
	}, metav1.CreateOptions{})
	require.NoError(t, err)
	_, err = client.RbacV1().RoleBindings(namespace.Name).Create(t.Context(), &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: "multiplexer-watch"},
		Subjects: []rbacv1.Subject{{
			Kind: "ServiceAccount", Name: serviceAccount, Namespace: namespace.Name,
		}},
		RoleRef: rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "Role", Name: "multiplexer-watch"},
	}, metav1.CreateOptions{})
	require.NoError(t, err)
	tokenRequest, err := client.CoreV1().ServiceAccounts(namespace.Name).CreateToken(
		t.Context(), serviceAccount, &authenticationv1.TokenRequest{}, metav1.CreateOptions{})
	require.NoError(t, err)
	require.NotEmpty(t, tokenRequest.Status.Token)
	list, err := client.CoreV1().ConfigMaps(namespace.Name).List(t.Context(),
		metav1.ListOptions{FieldSelector: "metadata.name=observed"})
	require.NoError(t, err)
	t.Logf("real backend %s; Kubernetes context %q; isolated namespace %q", binary, contextName, namespace.Name)

	return &liveMultiplexer{
		client: client, namespace: namespace.Name, address: address, token: tokenRequest.Status.Token,
		route: multiplexFrame{
			Type: "REQUEST", ClusterID: contextName, UserID: "same-routing-id",
			Path: "/api/v1/namespaces/" + namespace.Name + "/configmaps",
			Query: url.Values{
				"watch": {"1"}, "resourceVersion": {list.ResourceVersion},
				"fieldSelector": {"metadata.name=observed"},
			}.Encode(),
		},
	}
}

//nolint:funlen // Keeps the real process's readiness and bounded cleanup together.
func startLiveBackend(t *testing.T, binary string, raw *clientcmdapi.Config) string {
	t.Helper()

	directory := t.TempDir()

	kubeconfig := filepath.Join(directory, "kubeconfig")
	require.NoError(t, clientcmd.WriteToFile(*raw, kubeconfig))

	staticDirectory := filepath.Join(directory, "static")
	require.NoError(t, os.Mkdir(staticDirectory, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(staticDirectory, "index.html"),
		[]byte("<!doctype html><title>Multiplexer protocol E2E</title>"), 0o600))

	output, err := os.CreateTemp(directory, "backend-*.log")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, output.Close()) })

	listener, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	require.NoError(t, err)

	port := listener.Addr().(*net.TCPAddr).Port
	require.NoError(t, listener.Close())
	//nolint:gosec // The caller explicitly selects the test binary; no shell is used.
	command := exec.CommandContext(t.Context(), binary, "-listen-addr=127.0.0.1", "-port="+strconv.Itoa(port),
		"-kubeconfig="+kubeconfig, "-kubeconfig-dir="+filepath.Join(directory, "managed"),
		"-html-static-dir="+staticDirectory, "-log-level=warn")
	command.Env = append(os.Environ(), "HEADLAMP_BACKEND_TOKEN=", "HOME="+directory,
		"XDG_CONFIG_HOME="+directory, "TMPDIR="+directory)
	command.Stderr = output
	stdout, err := command.StdoutPipe()
	require.NoError(t, err)
	require.NoError(t, command.Start())

	exited, ready, scanned := make(chan struct{}), make(chan struct{}), make(chan struct{})

	var exitErr error
	go func() { exitErr = command.Wait(); close(exited) }()
	go func() {
		defer close(scanned)

		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			_, _ = fmt.Fprintln(output, scanner.Text())
			if scanner.Text() == "HEADLAMP_BACKEND_READY" {
				close(ready)
			}
		}
	}()

	t.Cleanup(func() {
		select {
		case <-exited:
			return
		default:
		}

		_ = command.Process.Signal(os.Interrupt)

		select {
		case <-exited:
		case <-time.After(5 * time.Second):
			require.NoError(t, command.Process.Kill())
			<-exited
		}
	})

	select {
	case <-ready:
	case <-exited:
		<-scanned

		log, _ := os.ReadFile(output.Name())
		t.Fatalf("Headlamp exited before readiness: %v\n%s", exitErr, log)
	case <-time.After(20 * time.Second):
		t.Fatal("Headlamp did not report readiness")
	}

	return fmt.Sprintf("ws://127.0.0.1:%d/wsMultiplexer", port)
}

type liveSocket struct {
	conn   *websocket.Conn
	frames <-chan multiplexFrame
	errors <-chan error
}

func (live *liveMultiplexer) connect(t *testing.T) *liveSocket {
	return live.connectWithToken(t, live.token)
}

func (live *liveMultiplexer) connectWithToken(t *testing.T, token string) *liveSocket {
	t.Helper()

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		Subprotocols:     []string{"headlamp.multiplexer.v2.k8s.io", "headlamp.multiplexer.k8s.io"},
	}

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, live.address, nil)
	recorder := httptest.NewRecorder()
	require.NoError(t, auth.SetTokenCookie(recorder, request, live.route.ClusterID, token, "", 0))

	authResponse := recorder.Result()
	for _, cookie := range authResponse.Cookies() {
		if cookie.Path == "/wsMultiplexer" {
			request.AddCookie(cookie)
		}
	}

	require.NoError(t, authResponse.Body.Close())

	conn, response, err := dialer.DialContext(t.Context(), live.address, request.Header)
	if response != nil {
		require.NoError(t, response.Body.Close())
	}

	require.NoError(t, err)
	require.Equal(t, "headlamp.multiplexer.v2.k8s.io", conn.Subprotocol())
	t.Cleanup(func() { _ = conn.Close() })

	frames, failures := make(chan multiplexFrame, 32), make(chan error, 1)

	go func() {
		for {
			var frame multiplexFrame
			if err := conn.ReadJSON(&frame); err != nil {
				failures <- err
				return
			}

			select {
			case frames <- frame:
			case <-t.Context().Done():
				return
			}
		}
	}()

	return &liveSocket{conn: conn, frames: frames, errors: failures}
}

func (socket *liveSocket) awaitError(t *testing.T, description string) multiplexFrame {
	t.Helper()

	select {
	case frame := <-socket.frames:
		require.Equal(t, "ERROR", frame.Type, description)

		return frame
	case err := <-socket.errors:
		t.Fatalf("%s: socket closed: %v", description, err)
	case <-time.After(15 * time.Second):
		t.Fatal(description)
	}

	return multiplexFrame{}
}

func (socket *liveSocket) await(t *testing.T, description string, accept func(multiplexFrame) bool) multiplexFrame {
	t.Helper()

	timeout := time.NewTimer(15 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case frame := <-socket.frames:
			require.NotEqual(t, "ERROR", frame.Type, "multiplexer error: %s", frame.Data)

			if accept(frame) {
				return frame
			}
		case err := <-socket.errors:
			t.Fatalf("%s: socket closed: %v", description, err)
		case <-timeout.C:
			t.Fatal(description)
		}
	}
}

func (socket *liveSocket) status(t *testing.T, state, description string) {
	t.Helper()
	socket.await(t, description, func(frame multiplexFrame) bool {
		return frame.Type == "STATUS" && strings.Contains(frame.Data, `"state":"`+state+`"`)
	})
}

func (socket *liveSocket) event(t *testing.T) corev1.ConfigMap {
	t.Helper()

	for {
		frame := socket.await(t, "expected a fresh Kubernetes watch event", func(frame multiplexFrame) bool {
			return frame.Type == "DATA"
		})

		var event struct {
			Type   string           `json:"type"`
			Object corev1.ConfigMap `json:"object"`
		}
		require.NoError(t, json.Unmarshal([]byte(frame.Data), &event))

		if event.Type == "ADDED" && event.Object.Data["revision"] == "initial" {
			continue
		}

		require.Equal(t, "MODIFIED", event.Type)

		return event.Object
	}
}

func (live *liveMultiplexer) update(t *testing.T, revision string) *corev1.ConfigMap {
	t.Helper()

	configMaps := live.client.CoreV1().ConfigMaps(live.namespace)
	object, err := configMaps.Get(t.Context(), "observed", metav1.GetOptions{})
	require.NoError(t, err)

	object.Data["revision"] = revision
	object, err = configMaps.Update(t.Context(), object, metav1.UpdateOptions{})
	require.NoError(t, err)

	return object
}

func TestMultiplexerLiveClientIsolation(t *testing.T) {
	live := startLiveMultiplexer(t)
	first, second := live.connect(t), live.connect(t)
	require.NoError(t, first.conn.WriteJSON(live.route))
	first.status(t, "connected", "first client did not establish its watch")
	require.NoError(t, second.conn.WriteJSON(live.route))
	second.status(t, "connected", "second independent client did not acquire its own subscription")

	object := live.update(t, "both-clients")
	for _, socket := range []*liveSocket{first, second} {
		event := socket.event(t)
		require.Equal(t, object.ResourceVersion, event.ResourceVersion)
		require.Equal(t, "both-clients", event.Data["revision"])
	}

	closeRequest := live.route
	closeRequest.Type = "CLOSE"
	require.NoError(t, first.conn.WriteJSON(closeRequest))
	first.status(t, "closed", "first client's unsubscribe was not acknowledged")
	object = live.update(t, "after-unsubscribe")
	require.Equal(t, object.ResourceVersion, second.event(t).ResourceVersion)

	require.NoError(t, first.conn.WriteJSON(live.route))
	first.status(t, "connected", "first client could not subscribe again")
	// Drain the legitimate replay on this newly created subscription before disconnecting it.
	first.await(t, "reopened first client did not catch up", func(frame multiplexFrame) bool {
		return frame.Type == "DATA" && strings.Contains(frame.Data, `"resourceVersion":"`+object.ResourceVersion+`"`)
	})
	require.NoError(t, first.conn.WriteControl(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, "test disconnect"), time.Now().Add(5*time.Second)))

	select {
	case <-first.errors:
	case <-time.After(10 * time.Second):
		t.Fatal("server did not acknowledge the first client's disconnect")
	}

	object = live.update(t, "after-disconnect")
	event := second.event(t)
	require.Equal(t, object.ResourceVersion, event.ResourceVersion)
	require.Equal(t, "after-disconnect", event.Data["revision"])
}

func TestMultiplexerLiveRejectsMissingAndInvalidCookieCredentials(t *testing.T) {
	live := startLiveMultiplexer(t)
	for _, token := range []string{"", "invalid-cookie-token"} {
		t.Run(strconv.Quote(token), func(t *testing.T) {
			socket := live.connectWithToken(t, token)
			require.NoError(t, socket.conn.WriteJSON(live.route))
			frame := socket.awaitError(t, "backend watch authenticated without a valid cookie")
			var errorData struct {
				Error string `json:"error"`
			}
			require.NoError(t, json.Unmarshal([]byte(frame.Data), &errorData))
			require.NotEmpty(t, errorData.Error)
		})
	}
}

func TestMultiplexerLiveWatchReopenCursor(t *testing.T) {
	for _, cursor := range []string{"collection", "explicit-empty"} {
		t.Run(cursor, func(t *testing.T) {
			live := startLiveMultiplexer(t)
			if cursor == "explicit-empty" {
				query, err := url.ParseQuery(live.route.Query)
				require.NoError(t, err)
				query.Set("resourceVersion", "")
				live.route.Query = query.Encode()
			}

			socket := live.connect(t)
			require.NoError(t, socket.conn.WriteJSON(live.route))
			socket.status(t, "connected", "client did not establish its watch")

			for _, revision := range []string{"before-reopen-1", "before-reopen-2"} {
				object := live.update(t, revision)
				require.Equal(t, object.ResourceVersion, socket.event(t).ResourceVersion)
			}

			reopen := live.route
			reopen.Reopen = true
			require.NoError(t, socket.conn.WriteJSON(reopen))
			socket.status(t, "connected", "explicit watch replacement did not connect")
			object := live.update(t, "after-reopen")
			// The first event must be fresh, not history replayed from the original opening cursor.
			event := socket.event(t)
			require.Equal(t, "after-reopen", event.Data["revision"])
			require.Equal(t, object.ResourceVersion, event.ResourceVersion)
		})
	}
}
