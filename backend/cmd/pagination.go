package main

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/gorilla/mux"
)

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
	return r.Body.Write(b)
	// return r.ResponseWriter.Write(b)
}

// CreateResponseCapture initializes responseCapture with a http.ResponseWriter and empty bytes.Buffer for the body.
func CreateResponseCapture(w http.ResponseWriter) *responseCapture {
	return &responseCapture{
		ResponseWriter: w,
		Body:           &bytes.Buffer{},
		StatusCode:     http.StatusOK,
	}
}

type Item struct {
	Metadata metav1.ObjectMeta `json:"metadata"`
}
type ResourceResponse struct {
	Kind     string          `json:"kind"`
	Verison  string          `json:"apiVersion"`
	Metadata metav1.ListMeta `json:"metadata"`
	Items    []Item          `json:"items"`
}

// handleGzip function compress response if the response  header have Content-Encoding as gzip.
func handleGzip(rcw *responseCapture) ([]byte, error) {
	bodyBytes := rcw.Body.Bytes()
	if rcw.Header().Get("Content-Encoding") == "gzip" {
		reader, err := gzip.NewReader(bytes.NewReader(bodyBytes))
		if err != nil {
			return nil, err
		}
		defer reader.Close()
		bodyBytes, err = io.ReadAll(reader)
		if err != nil {
			return nil, err
		}
	}

	return bodyBytes, nil
}

// returnResponseToClient helps to return the response to the client.
func returnResponseToClient(rcw *responseCapture, v any, w http.ResponseWriter) error {
	var err error
	if rcw.Header().Get("Content-Encoding") == "gzip" {
		w.Header().Set("Content-Encoding", "gzip")
		gz := gzip.NewWriter(w)
		defer gz.Close()
		err = json.NewEncoder(gz).Encode(v)
	} else {
		err = json.NewEncoder(w).Encode(v)
	}

	return err
}

// sliceTheResponse helps to slice the full list to identify the startIndex and endIndex that will be
// equal to the full page, which is going to be sliced from the full list.
func sliceTheResponse(page int, pageSize int, sizeOfResponse int) (int, int) {
	start := (page - 1) * pageSize
	if start >= sizeOfResponse {
		return sizeOfResponse, sizeOfResponse // slice empty if page out of range
	}
	end := start + pageSize
	if end > sizeOfResponse {
		end = sizeOfResponse
	}
	return start, end
}

// This helps to unmarshal the response that is coming from K8s server, so we can
// further slice the full list of response into the pages.
func UnmarshalCacheData(bodyBytes []byte) (ResourceResponse, error) {
	var resourceResponseFullList ResourceResponse

	err := json.Unmarshal(bodyBytes, &resourceResponseFullList)
	if err != nil {
		return ResourceResponse{}, err
	}

	return resourceResponseFullList, nil
}

var limit = 15

// handlePagination is the middleware which will help to paginate the response coming from
// the K8's server.
func handlePagination(c *HeadlampConfig) mux.MiddlewareFunc {
	return func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			rcw := CreateResponseCapture(w)

			q := r.URL.Query()

			pageNo := q.Get("pageNo")

			h.ServeHTTP(rcw, r)

			bodyBytes, err := handleGzip(rcw)
			if err != nil {
				log.Fatalf("error while converting from gzip: %v ", err)
			}

			responseFullList, err := UnmarshalCacheData(bodyBytes)
			if err != nil {
				log.Fatalf("error while unmarshalling bodybytes: %v", responseFullList)
			}

			if pageNo == "" {
				if err := returnResponseToClient(rcw, responseFullList, w); err != nil {
					log.Fatalf("error while returning response to client: %v", err)
				}
				return
			}

			page, _ := strconv.Atoi(pageNo)

			startPage, endPage := sliceTheResponse(page, limit, len(responseFullList.Items))

			returnedData := responseFullList.Items[startPage:endPage]

			if err := returnResponseToClient(rcw, returnedData, w); err != nil {
				log.Fatalf("error while returning response to client: %v", err)
			}

			// To check the response time, this help understand how much time is it taking to send
			// the desired page that the client wants to access in the frontend.
			fmt.Println("time: ", time.Since(start))
		})
	}
}
