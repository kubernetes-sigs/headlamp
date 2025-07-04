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
package k8cache

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
)

// var k8scache = cache.New[string]()

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

func (r *responseCapture) WriteHeader(code int) {
	r.StatusCode = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *responseCapture) Write(b []byte) (int, error) {
	r.Body.Write(b)
	return r.ResponseWriter.Write(b)
}

// Initialize responseCapture with a http.ResponseWriter and empty bytes.Buffer for the body.
func Initialize(w http.ResponseWriter) *responseCapture {
	return &responseCapture{
		ResponseWriter: w,
		Body:           &bytes.Buffer{},
		StatusCode:     http.StatusOK,
	}
}

// ExtractNamespace extracts the namespace from the parameter from the given raw URL. This is used to make
// cache key more specific to a particular namespace.
func ExtractNamespace(rawURL string) (string, error) {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}

	namespace := parsedURL.Query().Get("namespace")

	return namespace, nil
}

// It is used to convert the captured response from gzip to string which can be easily convert
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

// Generate Key generates a unique cache key based on the requested URL's path (kind of resource),
// Namespace, and the kubernetes context. this ensures that the cached response are specific to the exact
// resource, namespace ,and cluster being requested.
func GenerateKey(url *url.URL, contextKey string, token string) (string, error) {
	namespace, err := ExtractNamespace(url.String())
	if err != nil {
		return "", err
	}

	split := strings.Split(url.Path, "/")
	last := split[len(split)-1]
	k := CacheKey{Kind: last, Namespace: namespace, Context: contextKey}

	key, err := k.SHA()
	if err != nil {
		return "", err
	}

	return key, nil
}

// UnmarshalCachedData deserialize a JSON string received from cache
// back into a CacheResposeData struct. This function is used to recontructing
// the full HTTP response (status, headers, body) when serving the k8's to the client.
// this is the essential part as it gives the clarity about the incoming k8;s requests.
func UnmarshalCachedata(cacheResource string,
	cachedData CachedResponseData,
) (CachedResponseData, error) {
	err := json.Unmarshal([]byte(cacheResource), &cachedData)
	if err != nil {
		return CachedResponseData{}, err
	}

	return cachedData, nil
}

// This function is used when serving response from cache to ensure the client
// receives correct metadata about the response.
func SetHeader(cacheData CachedResponseData, w http.ResponseWriter) {
	for idx, header := range cacheData.Headers {
		w.Header()[idx] = header
	}

	w.WriteHeader(cacheData.StatusCode)
}

// MarshallToStore serialize a cacheResponseData struct into JSON []byte.
// This function is used before storing the K8's response data into cache.
// ensuring a consistent and structured format for all cached entries.
func MarshallToStore(cacheData CachedResponseData) ([]byte, error) {
	jsonByte, err := json.Marshal(cacheData)
	if err != nil {
		return nil, err
	}

	return jsonByte, nil
}

const gzipEncoding = "gzip"

// This ensures that the cached headers accurately reflect the state of the
// decompressed body that is being stored, and prevents client side decompression
// issues serving from cache.
func SetHeadersTocache(responseHeaders http.Header, encoding string) http.Header {
	cacheHeader := make(http.Header)

	for idx, header := range responseHeaders {
		if strings.EqualFold(idx, "Content-Encoding") && encoding == gzipEncoding {
			continue
		}

		cacheHeader[idx] = append(cacheHeader[idx], header...)
	}

	return cacheHeader
}

// This function checks the user's permission to access the resource.
// If the user is authorized and has permission to view the resources, it returns true.
// Otherwise, it returns false if authorization fails.
func IsAllowed(url *url.URL,
	kContext *kubeconfig.Context,
	w http.ResponseWriter,
	r *http.Request,
) bool {
	// Load the right kubeconfig file and context
	configOverrides := &clientcmd.ConfigOverrides{
		CurrentContext: kContext.Name,
	}

	config, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: kContext.KubeConfigPath},
		configOverrides,
	).ClientConfig()
	if err != nil {
		return false
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return false
	}

	apiPath := mux.Vars(r)["api"] // should be e.g. "api/v1/secrets"
	parts := strings.Split(apiPath, "/")

	last := parts[len(parts)-1]

	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Resource: last,
				Verb:     "get",
			},
		},
	}

	result, err := clientset.AuthorizationV1().SelfSubjectAccessReviews().Create(
		context.TODO(),
		review,
		metav1.CreateOptions{},
	)
	if err != nil {
		return false
	}

	return result.Status.Allowed
}

// If the user has the permission to view the resources then it will check if the generated key is found
// in the cache if the key is present in the cache then it will return directly to the client in []byte form
// and returns true ,Otherwise it will return false.
func LoadfromCache(k8scache cache.Cache[string], isAllowed bool, key string, w http.ResponseWriter) (bool, error) {
	k8Resource, err := k8scache.Get(context.Background(), key)
	if err == nil && strings.TrimSpace(k8Resource) != "" {
		if !isAllowed {
			return false, errors.New("user not aurhorized")
		}

		var cachedData CachedResponseData

		cachedData, err := UnmarshalCachedata(k8Resource, cachedData)
		if err != nil {
			return false, err
		}

		SetHeader(cachedData, w)

		_, writeErr := w.Write([]byte(cachedData.Body))

		if writeErr == nil {
			return true, nil
		}
	}

	return false, nil
}

// If the key was not found inside the cache then this will make actual call to k8's
// and this will capture the response body and convert the captured response to string.
// After converting it will store the response with the key and TTL of 10*min.
func RequestToK8sAndStore(k8scache cache.Cache[string], kContext *kubeconfig.Context,
	url *url.URL,
	rcw *responseCapture,
	r *http.Request,
	key string,
) error {
	capturedHeaders := rcw.Header()
	encoding := capturedHeaders.Get("Content-Encoding")
	bodyBytes := rcw.Body.Bytes()

	dcmpBody, err := GetResponseBody(bodyBytes, encoding)
	if err != nil {
		return err
	}

	headersToCache := SetHeadersTocache(capturedHeaders, encoding)

	if !strings.Contains(url.Path, "selfsubjectrulesreviews") {
		cachedData := CachedResponseData{
			StatusCode: rcw.StatusCode,
			Headers:    headersToCache,
			Body:       dcmpBody,
		}

		jsonBytes, err := MarshallToStore(cachedData)
		if err != nil {
			return err
		}

		if !strings.Contains(string(jsonBytes), "Failure") {
			if err = k8scache.SetWithTTL(context.Background(), key, string(jsonBytes), 10*time.Minute); err != nil {
				return err
			}
		}
	}

	return nil
}
