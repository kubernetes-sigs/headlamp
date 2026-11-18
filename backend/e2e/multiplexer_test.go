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
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
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
	client, err := kubernetes.NewForConfig(config)
	require.NoError(t, err)

	address := startLiveBackend(t, binary, raw)
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
	list, err := client.CoreV1().ConfigMaps(namespace.Name).List(t.Context(),
		metav1.ListOptions{FieldSelector: "metadata.name=observed"})
	require.NoError(t, err)
	t.Logf("real backend %s; Kubernetes context %q; isolated namespace %q", binary, contextName, namespace.Name)

	return &liveMultiplexer{
		client: client, namespace: namespace.Name, address: address,
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

	// Keep credentials and process output inside the checkout, never in the system temp directory.
	directory, err := os.MkdirTemp(".", ".multiplexer-e2e-")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, os.RemoveAll(directory)) })

	directory, err = filepath.Abs(directory)
	require.NoError(t, err)

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
	t.Helper()

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		Subprotocols:     []string{"headlamp.multiplexer.v2.k8s.io", "headlamp.multiplexer.k8s.io"},
	}

	conn, response, err := dialer.DialContext(t.Context(), live.address, http.Header{})
	if response != nil {
		require.NoError(t, response.Body.Close())
	}

	require.NoError(t, err)
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
