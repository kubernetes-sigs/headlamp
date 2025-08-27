// Copyright 2025 The Kubernetes Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package k8cache_test

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
)

// TestResponseCapture_WriteHeader tests that WriteHeader sets the status code and calls the underlying ResponseWriter.
func TestResponseCapture_WriteHeader(t *testing.T) {
	rec := httptest.NewRecorder()
	capture := &k8cache.ResponseCapture{
		ResponseWriter: rec,
		Body:           &bytes.Buffer{},
	}

	capture.WriteHeader(http.StatusTeapot)

	if capture.StatusCode != http.StatusTeapot {
		t.Errorf("expected StatusCode %d, got %d", http.StatusTeapot, capture.StatusCode)
	}

	if rec.Result().StatusCode != http.StatusTeapot {
		t.Errorf("expected recorder StatusCode %d, got %d", http.StatusTeapot, rec.Result().StatusCode)
	}
}

// TestResponseCapture_Integration tests integration with an HTTP handler.
func TestResponseCapture_Integration(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)

		if _, err := w.Write([]byte("integration test")); err != nil {
			t.Errorf("unexpected error writing response: %v", err)
		}
	})

	rec := httptest.NewRecorder()
	capture := &k8cache.ResponseCapture{
		ResponseWriter: rec,
		Body:           &bytes.Buffer{},
	}

	handler.ServeHTTP(capture, httptest.NewRequest("GET", "/", nil))

	if capture.StatusCode != http.StatusAccepted {
		t.Errorf("expected StatusCode %d, got %d", http.StatusAccepted, capture.StatusCode)
	}

	if capture.Body.String() != "integration test" {
		t.Errorf("expected body %q, got %q", "integration test", capture.Body.String())
	}

	if rec.Result().StatusCode != http.StatusAccepted {
		t.Errorf("expected recorder StatusCode %d, got %d", http.StatusAccepted, rec.Result().StatusCode)
	}

	if rec.Body.String() != "integration test" {
		t.Errorf("expected recorder body %q, got %q", "integration test", rec.Body.String())
	}
}

type errorWriter struct {
	http.ResponseWriter
}

func (e *errorWriter) Write(p []byte) (int, error) {
	return 0, errors.New("simulated write error")
}

func TestResponseCapture_Write_Error(t *testing.T) {
	rec := httptest.NewRecorder()
	ew := &errorWriter{ResponseWriter: rec}

	capture := &k8cache.ResponseCapture{
		ResponseWriter: ew,
		Body:           &bytes.Buffer{}, // still a *bytes.Buffer
	}

	n, err := capture.Write([]byte("fail"))
	if err == nil {
		t.Errorf("expected error from ResponseWriter.Write, got nil")
	}

	if n != 0 {
		t.Errorf("expected written length 0, got %d", n)
	}
}

// Update the existing TestResponseCapture_Write to ensure no error is returned.
func TestResponseCapture_Write(t *testing.T) {
	rec := httptest.NewRecorder()
	capture := &k8cache.ResponseCapture{
		ResponseWriter: rec,
		Body:           &bytes.Buffer{},
	}

	data := []byte("hello world")

	n, err := capture.Write(data)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if n != len(data) {
		t.Errorf("expected written length %d, got %d", len(data), n)
	}

	if capture.Body.String() != "hello world" {
		t.Errorf("expected body %q, got %q", "hello world", capture.Body.String())
	}

	if rec.Body.String() != "hello world" {
		t.Errorf("expected recorder body %q, got %q", "hello world", rec.Body.String())
	}
}

// TestResponseCapture_Write_BodySuccess tests that ResponseCapture.Write writes to
// Body and ResponseWriter when Body.Write succeeds.
func TestResponseCapture_Write_BodySuccess(t *testing.T) {
	rec := httptest.NewRecorder()
	buf := &bytes.Buffer{}
	capture := &k8cache.ResponseCapture{
		ResponseWriter: rec,
		Body:           buf,
	}

	data := []byte("body success")

	n, err := capture.Write(data)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if n != len(data) {
		t.Errorf("expected written length %d, got %d", len(data), n)
	}

	if buf.String() != "body success" {
		t.Errorf("expected body %q, got %q", "body success", buf.String())
	}

	if rec.Body.String() != "body success" {
		t.Errorf("expected recorder body %q, got %q", "body success", rec.Body.String())
	}
}
