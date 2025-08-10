package main

import "net/http"

var limit string = "20"

// This sets limit and continueToken into the r.URL parameter
// it helps to set limit and "continue" while proxying to the clusterAPI.
func handlePagination(r *http.Request) {
	q := r.URL.Query()

	q.Set("limit", limit)

	continueToken := q.Get("continueToken")
	if continueToken != "" {
		q.Set("continue", continueToken)
	}

	r.URL.RawQuery = q.Encode()
}
