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

// Package health provides Kubernetes-style health and readiness check
// handlers for the Headlamp backend server.
package health

import (
	"encoding/json"
	"net/http"
	"sync/atomic"
)

// Response is the JSON body returned by health check endpoints.
type Response struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks,omitempty"`
}

// Checker holds the state required for health and readiness checks.
type Checker struct {
	shuttingDown atomic.Bool
}

// NewChecker creates a new health checker.
func NewChecker() *Checker {
	return &Checker{}
}

// SetShuttingDown marks the server as shutting down. After this call,
// the readiness endpoint returns 503 Service Unavailable so that the
// load balancer stops routing new traffic to this instance.
func (c *Checker) SetShuttingDown() {
	c.shuttingDown.Store(true)
}

// HandlerHealthz returns an http.HandlerFunc for the /healthz (liveness) endpoint.
// It always returns 200 OK as long as the HTTP server can process the request.
func (c *Checker) HandlerHealthz() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, Response{Status: "ok"})
	}
}

// HandlerReadyz returns an http.HandlerFunc for the /readyz (readiness) endpoint.
// It returns 200 OK when the server is ready to accept traffic, and 503 when
// the server is shutting down.
func (c *Checker) HandlerReadyz() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		if c.shuttingDown.Load() {
			writeJSON(w, http.StatusServiceUnavailable, Response{
				Status: "error",
				Checks: map[string]string{
					"shutdown": "server is shutting down",
				},
			})

			return
		}

		writeJSON(w, http.StatusOK, Response{Status: "ok"})
	}
}

func writeJSON(w http.ResponseWriter, status int, resp Response) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	_ = json.NewEncoder(w).Encode(resp)
}
