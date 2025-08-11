package main

import (
	"bytes"
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

var limit string = "15"

type responseCapture struct {
	http.ResponseWriter
	StatusCode int
	Body       *bytes.Buffer
}

func (r *responseCapture) WriteHeader(code int) {
	r.StatusCode = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *responseCapture) Write(b []byte) (int, error) {
	r.Body.Write(b)
	return r.ResponseWriter.Write(b)
}

// CreateResponseCapture initializes responseCapture with a http.ResponseWriter and empty bytes.Buffer for the body.
func CreateResponseCapture(w http.ResponseWriter) *responseCapture {
	return &responseCapture{
		ResponseWriter: w,
		Body:           &bytes.Buffer{},
		StatusCode:     http.StatusOK,
	}
}

type ResourceMetadata struct {
	ResourceVersion string `json:"resourceVersion"`
	ContinueToken   string `json:"continue"`
}

type Metadata struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Uuid      string `json:"uuid"`
}

type Item struct {
	Metadata Metadata `json:"metadata"`
}
type ResourceResponse struct {
	Metadata ResourceMetadata `json:"metadata"`
	Items    []Item           `json:"items"`
}

var paginationMap = make(map[int]*ResourceResponse)

func handlePagination(c *HeadlampConfig) mux.MiddlewareFunc {
	return func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

			rcw := CreateResponseCapture(w)

			q := r.URL.Query()
			q.Set("limit", limit)
			r.URL.RawQuery = q.Encode()

			h.ServeHTTP(rcw, r)

			var currentPageResponse ResourceResponse
			json.Unmarshal(rcw.Body.Bytes(), &currentPageResponse)

			paginationMap[0] = &currentPageResponse

			// Loop to pre-fetch pages 1 through 4
			currentContinueToken := currentPageResponse.Metadata.ContinueToken
			for i := 1; i <= 4; i++ {
				// Stop if there is no next page
				if currentContinueToken == "" {
					break
				}

				// Create a new request for the next page
				query := r.URL.Query()
				query.Set("continue", currentContinueToken)
				r.URL.RawQuery = query.Encode()

				// Clear the response capture buffer before the next request
				rcw.Body.Reset()

				// Serve the next request
				h.ServeHTTP(rcw, r)

				// Unmarshal the new response
				var nextResponse ResourceResponse
				json.Unmarshal(rcw.Body.Bytes(), &nextResponse)

				// Store the new response in the map
				paginationMap[i] = &nextResponse

				// Update the continue token for the next loop iteration
				currentContinueToken = nextResponse.Metadata.ContinueToken
			}
		})
	}
}
