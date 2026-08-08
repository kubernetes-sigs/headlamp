package serviceproxy //nolint:testpackage // testing unexported types Connection and handleServiceProxy

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func getTimeout(t *testing.T) time.Duration {
	t.Helper()

	if deadline, ok := t.Deadline(); ok {
		// Use 10% of the remaining deadline to avoid flakiness on slow CI
		// while still failing much faster than the full test timeout.
		return time.Until(deadline) / 10
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
