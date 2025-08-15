// // // Copyright 2025 The Kubernetes Authors.
// // // Licensed under the Apache License, Version 2.0 (the "License");
// // // you may not use this file except in compliance with the License.
// // // You may obtain a copy of the License at
// // //
// // //	http://www.apache.org/licenses/LICENSE-2.0
// // //
// // // Unless required by applicable law or agreed to in writing, software
// // // distributed under the License is distributed on an "AS IS" BASIS,
// // // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// // // See the License for the specific language governing permissions and
// // // limitations under the License.
package k8cache

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// CachedResponseData is a struct that will capture statusCode, Headers and Body
// while the response is coming from the K8s clusters.
type responseCapture struct {
	http.ResponseWriter
	StatusCode int
	Body       *bytes.Buffer
}

type CachedResponseData struct {
	StatusCode int         `json:"statusCode"`
	Headers    http.Header `json:"headers"`
	Body       string      `json:"body"`
}

// WriteHeader write the headers that to the Headers property in CachedResponseData struct.
func (r *responseCapture) WriteHeader(code int) {
	r.StatusCode = code
	r.ResponseWriter.WriteHeader(code)
}

// Write help to write the body of the response data into the CacheResponseData struct.
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

// GetResponseBody is used to convert the captured response from gzip to string which can be easily convert
// []byte form for sending to client.
func GetResponseBody(bodyBytes []byte, encoding string) (string, error) {
	var dcmpBody []byte

	if encoding == "gzip" {
		reader, err := gzip.NewReader(bytes.NewReader(bodyBytes))
		if err != nil {
			return "", fmt.Errorf("failed to create gzip reader: %w", err)
		}

		decompressedBody, err := io.ReadAll(reader)
		if err != nil {
			return "", fmt.Errorf("failed to decompress body: %w", err)
		}

		dcmpBody = decompressedBody

		reader.Close()
	} else {
		dcmpBody = bodyBytes
	}

	return string(dcmpBody), nil
}

func GetAPIGroup(path string) (apiGroup, version string) {
	parts := strings.Split(path, "/")

	if len(parts) < 4 {
		return "", ""
	}

	if parts[3] == "api" {
		// Core API group
		apiGroup = ""
		version = parts[4]
	} else if parts[3] == "apis" {
		// Named API group
		apiGroup = parts[4]
		version = parts[5]
	}

	return
}

// ExtractNamespace extracts the namespace from the parameter from the given raw URL. This is used to make
// cache key more specific to a particular namespace.
func ExtractNamespace(rawURL string) (string, string) {
	if idx := strings.Index(rawURL, "?"); idx != -1 {
		rawURL = rawURL[:idx]
	}

	var namespace, kind string

	urls := strings.Split(rawURL, "/")
	n := len(urls)

	for i := 0; i < n-1; i++ {
		if urls[i] == "namespaces" {
			namespace = urls[i+1]
		}
	}

	if len(urls) > 2 {
		kind = urls[n-1]
	}

	return namespace, kind
}

// GenerateKey function helps to generate a unique key based on the request from the client
// The function accepts url( which includes all the information of request ) and contextID which
// helps to differentiate in multiple contexts.
func GenerateKey(url *url.URL, contextID string) (string, error) {
	namespace, kind := ExtractNamespace(url.Path)
	apiGroup, _ := GetAPIGroup(url.Path)
	// k := CacheKey{Kind: url.Path, Namespace: namespace, Context: contextID}

	// key, err := k.SHA()
	// if err != nil {
	// 	return "", err
	// }

	key := apiGroup + "+" + kind + "+" + namespace + "+" + contextID

	return key, nil
}

// UnmarshalCachedData deserialize a JSON string received from cache
// back into a CachedResposeData struct. This function is used to recontructing
// the full HTTP response (status, headers, body) when serving the k8's to the client.
// this is the essential part as it gives the clarity about the incoming k8;s requests.
func UnmarshalCacheData(cacheResource string,
	cachedData CachedResponseData,
) (CachedResponseData, error) {
	err := json.Unmarshal([]byte(cacheResource), &cachedData)
	if err != nil {
		return CachedResponseData{}, err
	}

	return cachedData, nil
}

// SetHeader function help to serve response from cache to ensure the client
// receives correct metadata about the response.
func SetHeader(cacheData CachedResponseData, w http.ResponseWriter) {
	for idx, header := range cacheData.Headers {
		w.Header()[idx] = header
	}

	w.Header().Set("X-HEADLAMP-CACHE", "true")
	w.WriteHeader(cacheData.StatusCode)
}

// MarshallToStore serialize a cacheResponseData struct into JSON []byte.
// This function is used before storing the K8's response data into cache.
// ensuring a consistent and structured format for all cached entries.
func MarshalToStore(cacheData CachedResponseData) ([]byte, error) {
	jsonByte, err := json.Marshal(cacheData)
	if err != nil {
		return nil, err
	}

	return jsonByte, nil
}
