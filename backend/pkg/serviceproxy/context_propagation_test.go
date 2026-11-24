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

package serviceproxy //nolint:testpackage // Tests exercise unexported service proxy internals.

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"k8s.io/client-go/tools/clientcmd/api"
)

func getTimeout(t *testing.T) time.Duration {
	t.Helper()

	if deadline, ok := t.Deadline(); ok {
		// Use 10% of the remaining deadline, capped at 5s to stay below
		// the upstream 10s HTTP timeout — otherwise cancellation regressions
		// can be masked by the upstream's own timeout firing first.
		timeout := time.Until(deadline) / 10
		if timeout > 5*time.Second {
			return 5 * time.Second
		}

		return timeout
	}

	return 2 * time.Second
}

func setupSlowUpstream(t *testing.T) (*httptest.Server, chan struct{}, chan struct{}) {
	t.Helper()

	timeout := getTimeout(t)

	reqStarted := make(chan struct{})
	reqCancelled := make(chan struct{})

	var (
		once       sync.Once
		cancelOnce sync.Once
	)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		once.Do(func() { close(reqStarted) })

		timer := time.NewTimer(timeout * 2)
		defer timer.Stop()

		select {
		case <-r.Context().Done():
			cancelOnce.Do(func() { close(reqCancelled) })
			return
		case <-timer.C:
			w.WriteHeader(http.StatusOK)
		}
	}))

	return ts, reqStarted, reqCancelled
}

func requireSignal(t *testing.T, ch <-chan struct{}, msg string) {
	t.Helper()

	timer := time.NewTimer(getTimeout(t))
	defer timer.Stop()

	select {
	case <-ch:
		return
	case <-timer.C:
		t.Fatal(msg)
	}
}

func requireError(t *testing.T, ch <-chan error, expected error, msg string) {
	t.Helper()

	timer := time.NewTimer(getTimeout(t))
	defer timer.Stop()

	select {
	case err := <-ch:
		if err == nil {
			t.Fatal("expected error, got nil")
		} else if !errors.Is(err, expected) {
			t.Fatalf("expected %v error, got %v", expected, err)
		}
	case <-timer.C:
		t.Fatal(msg)
	}
}

type streamingResponseRecorder struct {
	*httptest.ResponseRecorder
	chunkWritten chan struct{}
	chunkSize    int
	once         sync.Once
}

func (w *streamingResponseRecorder) Write(p []byte) (int, error) {
	n, err := w.ResponseRecorder.Write(p)
	if w.Body.Len() >= w.chunkSize {
		w.once.Do(func() { close(w.chunkWritten) })
	}

	return n, err
}

func TestContextPropagation_ConnectionGet(t *testing.T) {
	ts, reqStarted, reqCancelled := setupSlowUpstream(t)
	defer ts.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	conn := &Connection{URI: ts.URL}
	w := httptest.NewRecorder()
	errCh := make(chan error, 1)

	go func() {
		errCh <- conn.Get(ctx, "/slow", w)
	}()

	requireSignal(t, reqStarted, "timed out waiting for request")

	cancel()

	requireSignal(t, reqCancelled, "context propagation failed: upstream not cancelled")

	requireError(t, errCh, context.Canceled, "timed out waiting for Get()")
}

func TestContextPropagation_HandleServiceProxy(t *testing.T) {
	ts, reqStarted, reqCancelled := setupSlowUpstream(t)
	defer ts.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	conn := &Connection{URI: ts.URL}
	w := httptest.NewRecorder()
	done := make(chan struct{})

	go func() {
		defer close(done)

		handleServiceProxy(ctx, conn, "/slow", w)
	}()

	requireSignal(t, reqStarted, "timed out waiting for request")

	cancel()

	requireSignal(t, reqCancelled, "context propagation failed: upstream not cancelled")
	requireSignal(t, done, "handleServiceProxy hung after cancellation")
}

//nolint:funlen // Integration test coordinating a streamed response and request cancellation.
func TestContextPropagation_HandleServiceProxyStreaming(t *testing.T) {
	const initialChunk = "first chunk\n"

	reqCancelled := make(chan struct{})
	stopUpstream := make(chan struct{})

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := w.Write([]byte(initialChunk)); err != nil {
			t.Errorf("failed to write initial chunk: %v", err)
			return
		}

		if err := http.NewResponseController(w).Flush(); err != nil {
			t.Errorf("failed to flush initial chunk: %v", err)
			return
		}

		select {
		case <-r.Context().Done():
			close(reqCancelled)
		case <-stopUpstream:
		}
	}))
	defer ts.Close()
	defer close(stopUpstream)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	realConn := &Connection{URI: ts.URL}
	errCh := make(chan error, 1)
	conn := mockServiceConnection{
		get: func(ctx context.Context, requestURI string, w http.ResponseWriter) error {
			err := realConn.Get(ctx, requestURI, w)
			errCh <- err

			return err
		},
	}
	w := &streamingResponseRecorder{
		ResponseRecorder: httptest.NewRecorder(),
		chunkWritten:     make(chan struct{}),
		chunkSize:        len(initialChunk),
	}
	done := make(chan struct{})

	go func() {
		defer close(done)

		handleServiceProxy(ctx, conn, "/stream", w)
	}()

	requireSignal(t, w.chunkWritten, "timed out waiting for the proxy to write the initial chunk")

	cancel()

	requireSignal(t, reqCancelled, "streaming upstream was not cancelled")
	requireError(t, errCh, context.Canceled, "timed out waiting for streaming Get()")
	requireSignal(t, done, "handleServiceProxy hung after mid-stream cancellation")

	if w.Code != http.StatusOK || w.Body.String() != initialChunk {
		t.Fatalf("unexpected streamed response: status %d, body %q", w.Code, w.Body.String())
	}
}

func TestContextPropagation_RequestHandler(t *testing.T) {
	ts, reqStarted, reqCancelled := setupSlowUpstream(t)
	defer ts.Close()

	tsURL, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("failed to parse upstream URL: %v", err)
	}

	// Fake Kubernetes API server: returns an ExternalName Service pointing
	// at the slow upstream via 127.0.0.1:<port>.
	fakeK8s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		svc := fmt.Sprintf(`{
            "kind": "Service",
            "apiVersion": "v1",
            "metadata": {"name": "test-svc", "namespace": "default"},
            "spec": {
                "type": "ExternalName",
                "externalName": "127.0.0.1",
                "ports": [{"name": "http", "port": %s, "protocol": "TCP"}]
            }
        }`, tsURL.Port())

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(svc))
	}))
	defer fakeK8s.Close()

	cancel, done := startServiceProxyRequest(t, fakeK8s.URL)
	defer cancel()

	requireSignal(t, reqStarted, "timed out waiting for upstream request")

	cancel()

	requireSignal(t, reqCancelled, "context propagation failed: upstream not cancelled")
	requireSignal(t, done, "RequestHandler hung after cancellation")
}

func TestContextPropagation_RequestHandlerServiceLookup(t *testing.T) {
	fakeK8s, reqStarted, reqCancelled := setupSlowUpstream(t)
	defer fakeK8s.Close()

	cancel, done := startServiceProxyRequest(t, fakeK8s.URL)
	defer cancel()

	requireSignal(t, reqStarted, "timed out waiting for Kubernetes Service lookup")

	cancel()

	requireSignal(t, reqCancelled, "Kubernetes Service lookup was not cancelled")
	requireSignal(t, done, "RequestHandler hung after cancellation during Service lookup")
}

func startServiceProxyRequest(t *testing.T, apiURL string) (context.CancelFunc, <-chan struct{}) {
	t.Helper()

	// Build a kubeconfig.Context pointing at the fake K8s API.
	k8sCtx := &kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server:                apiURL,
			InsecureSkipTLSVerify: true,
		},
		KubeContext: &api.Context{
			Cluster:  "test-cluster",
			AuthInfo: "test-user",
		},
		AuthInfo: &api.AuthInfo{},
	}

	store := kubeconfig.NewContextStore()
	if err := store.AddContext(k8sCtx); err != nil {
		t.Fatalf("failed to add context: %v", err)
	}

	// Wire RequestHandler into a mux router so mux.Vars() is populated.
	router := mux.NewRouter()
	router.HandleFunc("/clusters/{clusterName}/serviceproxy/{namespace}/{name}",
		func(w http.ResponseWriter, r *http.Request) {
			RequestHandler(store, false, w, r)
		})

	reqCtx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	req := httptest.NewRequestWithContext(reqCtx, http.MethodGet,
		"/clusters/test-cluster/serviceproxy/default/test-svc?request=/slow", nil)
	req.Header.Set("Authorization", "Bearer fake-token")

	w := httptest.NewRecorder()
	done := make(chan struct{})

	go func() {
		defer close(done)

		router.ServeHTTP(w, req)
	}()

	return cancel, done
}
