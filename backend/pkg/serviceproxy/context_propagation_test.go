package serviceproxy //nolint:testpackage // testing unexported types Connection and handleServiceProxy

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

const testTimeout = 5 * time.Second

func setupSlowUpstream(t *testing.T) (*httptest.Server, chan struct{}, chan struct{}) {
	t.Helper()

	reqStarted := make(chan struct{})
	reqCancelled := make(chan struct{})

	var (
		once       sync.Once
		cancelOnce sync.Once
	)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		once.Do(func() { close(reqStarted) })

		timer := time.NewTimer(testTimeout * 2)
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

	timer := time.NewTimer(testTimeout)
	defer timer.Stop()

	select {
	case <-ch:
		return
	case <-timer.C:
		t.Fatal(msg)
	}
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

	requireSignal(t, reqStarted, "timed out waiting for request")

	cancel()

	requireSignal(t, reqCancelled, "context propagation failed: upstream not cancelled")

	timer := time.NewTimer(testTimeout)
	defer timer.Stop()

	select {
	case err := <-errCh:
		if err == nil {
			t.Fatal("expected error, got nil")
		} else if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected context.Canceled error, got %v", err)
		}
	case <-timer.C:
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

	requireSignal(t, reqStarted, "timed out waiting for request")

	cancel()

	requireSignal(t, reqCancelled, "context propagation failed: upstream not cancelled")
	requireSignal(t, done, "handleServiceProxy hung after cancellation")
}
