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

package auth

import (
	"io"
	"net/http"
	"sync"

	"github.com/felixge/httpsnoop"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

// A watch can keep its body open indefinitely after delivering the new cookie.
// Release refresh lineage at the first final headers, retaining writer capabilities.
func serveTokenRefreshResponse(next http.Handler, w http.ResponseWriter, r *http.Request, complete func()) {
	var once sync.Once

	cleanup := func() { once.Do(complete) }
	defer cleanup()

	flush := func() {
		once.Do(func() {
			if err := http.NewResponseController(w).Flush(); err != nil {
				logger.Log(logger.LevelError, nil, err, "flushing refreshed authentication cookie")
			}

			complete()
		})
	}

	var wrapped http.ResponseWriter

	wrapped = httpsnoop.Wrap(w, httpsnoop.Hooks{
		WriteHeader: func(next httpsnoop.WriteHeaderFunc) httpsnoop.WriteHeaderFunc {
			return func(code int) {
				next(code)

				if code >= http.StatusOK || code == http.StatusSwitchingProtocols {
					flush()
				}
			}
		},
		Write: func(next httpsnoop.WriteFunc) httpsnoop.WriteFunc {
			return func(p []byte) (int, error) {
				n, err := next(p)

				flush()

				return n, err
			}
		},
		Flush: func(next httpsnoop.FlushFunc) httpsnoop.FlushFunc {
			return func() { next(); flush() }
		},
		ReadFrom: func(_ httpsnoop.ReadFromFunc) httpsnoop.ReadFromFunc {
			return func(reader io.Reader) (int64, error) {
				return io.Copy(struct{ io.Writer }{wrapped}, reader)
			}
		},
	})
	next.ServeHTTP(wrapped, r)
	flush()
}
