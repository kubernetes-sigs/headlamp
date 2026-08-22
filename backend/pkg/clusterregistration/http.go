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

package clusterregistration

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

// Registration events carry no payload, so clients re-read the snapshot.
const (
	registrationFrame = "event: registration\ndata: {}\n\n"
	keepaliveFrame    = ": keepalive\n\n"

	// keepaliveInterval is the interval between keepalive comments on an idle stream.
	keepaliveInterval = 20 * time.Second
)

// ServeSnapshot writes the current registration snapshot.
func (r *Registry) ServeSnapshot(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(r.Snapshot()); err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding cluster registrations")
	}
}

// ServeEvents streams registration changes as server-sent events.
func (r *Registry) ServeEvents(w http.ResponseWriter, request *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming is not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	changes, unsubscribe := r.subscribe()
	defer unsubscribe()

	heartbeat := time.NewTicker(keepaliveInterval)
	defer heartbeat.Stop()

	write := func(frame string) {
		_, _ = fmt.Fprint(w, frame)

		flusher.Flush()
	}

	// A client that (re)connects may have missed changes.
	write(registrationFrame)

	for {
		select {
		case <-request.Context().Done():
			return
		case <-changes:
			write(registrationFrame)
		case <-heartbeat.C:
			write(keepaliveFrame)
		}
	}
}
