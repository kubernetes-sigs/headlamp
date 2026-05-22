package serviceproxy //nolint:testpackage // testing unexported types Connection and handleServiceProxy

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func setupSlowUpstream(t *testing.T) (*httptest.Server, chan struct{}, chan struct{}) {
	t.Helper()

	reqStarted := make(chan struct{})
	reqCancelled := make(chan struct{})

	var once sync.Once

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		once.Do(func() { close(reqStarted) })

		select {
		case <-r.Context().Done():
			close(reqCancelled)
			return
		case <-time.After(10 * time.Second):
			w.WriteHeader(http.StatusOK)
		}
	}))

	return ts, reqStarted, reqCancelled
}

func TestContextPropagation_ConnectionGet(t *testing.T) {
	ts, reqStarted, reqCancelled := setupSlowUpstream(t)
	defer ts.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	conn := &Connection{URI: ts.URL}
	errCh := make(chan error, 1)

	go func() {
		errCh <- conn.Get(ctx, "/slow", io.Discard)
	}()

	select {
	case <-reqStarted:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for request")
	}

	cancel()

	select {
	case <-reqCancelled:
	case <-time.After(5 * time.Second):
		t.Fatal("context propagation failed: upstream not cancelled")
	}

	select {
	case err := <-errCh:
		if err == nil {
			t.Fatal("expected error, got nil")
		} else if !strings.Contains(err.Error(), "context canceled") {
			t.Fatalf("expected context.Canceled error, got %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for Get()")
	}
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

	select {
	case <-reqStarted:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for request")
	}

	cancel()

	select {
	case <-reqCancelled:
	case <-time.After(5 * time.Second):
		t.Fatal("context propagation failed: upstream not cancelled")
	}

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("handleServiceProxy hung after cancellation")
	}
}
