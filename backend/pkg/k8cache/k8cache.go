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
	"sync"
	"time"

	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
)

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

// CreateResponseCapture initializes responseCapture with a http.ResponseWriter and empty bytes.Buffer for the body.
func CreateResponseCapture(w http.ResponseWriter) *responseCapture {
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

// GenerateKey function helps to generate a unique key based on the request from the client
// The function accepts url( which includes all the information of request ) and contextID which
// helps to differentiate in multiple contexts.
func GenerateKey(url *url.URL, contextID string) (string, error) {
	namespace, err := ExtractNamespace(url.String())
	if err != nil {
		return "", err
	}

	k := CacheKey{Kind: url.Path, Namespace: namespace, Context: contextID}

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

const gzipEncoding = "gzip"

// FilterHeaderCache ensures that the cached headers accurately reflect the state of the
// decompressed body that is being stored, and prevents client side decompression
// issues serving from cache.
func FilterHeadersForCache(responseHeaders http.Header, encoding string) http.Header {
	cacheHeader := make(http.Header)

	for idx, header := range responseHeaders {
		if strings.EqualFold(idx, "Content-Encoding") && encoding == gzipEncoding {
			continue
		}

		cacheHeader[idx] = append(cacheHeader[idx], header...)
	}

	return cacheHeader
}

var (
	clientsetCache = make(map[string]*kubernetes.Clientset)
	mu             sync.Mutex
)

// getClientMD is used to get a clientset for the given context and token.
// It will reuse clientsets if a matching one is already cached.
func getClientSet(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
	contextKey := strings.Split(k.ClusterID, "+")
	if len(contextKey) < 2 {
		// log and handle gracefully
		return nil, errors.New("unexpected format in getClientSet")
	}

	cacheKey := fmt.Sprintf("%s-%s", contextKey[1], token)

	mu.Lock()
	defer mu.Unlock()

	if cs, found := clientsetCache[cacheKey]; found {
		return cs, nil
	}

	cs, err := k.ClientSetWithToken(token)
	if err != nil {
		return nil, fmt.Errorf("error while creating clientset for key %s: %w", cacheKey, err)
	}

	clientsetCache[cacheKey] = cs

	return cs, nil
}

// GetKindAndVerb returns Kind and Verb ( get , watch etc ) from the requested URL.
func GetKindAndVerb(r *http.Request) (string, string) {
	apiPath := mux.Vars(r)["api"]
	parts := strings.Split(apiPath, "/")

	last := parts[len(parts)-1]

	var kubeVerb string

	switch r.Method {
	case "GET":
		if r.URL.Query().Get("watch") == "1" {
			kubeVerb = "watch"
		} else {
			kubeVerb = "get"
		}
	default:
		kubeVerb = "unknown"
	}

	return last, kubeVerb
}

// This function checks the user's permission to access the resource.
// If the user is authorized and has permission to view the resources, it returns true.
// Otherwise, it returns false if authorization fails.
func IsAllowed(url *url.URL,
	k *kubeconfig.Context,
	w http.ResponseWriter,
	r *http.Request,
) (bool, error) {
	token := r.Header.Get("Authorization")

	clientset, err := getClientSet(k, token)
	if err != nil {
		return false, err
	}

	last, kubeVerb := GetKindAndVerb(r)

	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Resource: last,
				Verb:     kubeVerb,
			},
		},
	}

	result, err := clientset.AuthorizationV1().SelfSubjectAccessReviews().Create(
		context.TODO(),
		review,
		metav1.CreateOptions{},
	)
	if err != nil {
		return false, err
	}

	return result.Status.Allowed, nil
}

// LoadFromCache ensure that if the user has the permission to view the resources then
// it will check if the generated key is found in the cache if the key is present in the cache
// then it will return directly to the client in []byte form and returns true ,Otherwise it will return false.
func LoadFromCache(k8scache cache.Cache[string], isAllowed bool,
	key string, w http.ResponseWriter, r *http.Request,
) (bool, error) {
	if r.Method == "PUT" || r.Method == "DELETE" || r.Method == "POST" || r.Method == "OPTIONS" {
		return false, errors.New("method is non-cachable")
	}

	k8Resource, err := k8scache.Get(context.Background(), key)
	if err == nil && strings.TrimSpace(k8Resource) != "" && isAllowed {
		var cachedData CachedResponseData

		cachedData, err := UnmarshalCacheData(k8Resource, cachedData)
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

// RequestK8ClusterAPIAndStore ensures if the key was not found inside the cache then this will make actual call to k8's
// and this will capture the response body and convert the captured response to string.
// After converting it will store the response with the key and TTL of 10*min.
func RequestK8ClusterAPIAndStore(k8scache cache.Cache[string],
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

	headersToCache := FilterHeadersForCache(capturedHeaders, encoding)

	if !strings.Contains(url.Path, "selfsubjectrulesreviews") {
		cachedData := CachedResponseData{
			StatusCode: rcw.StatusCode,
			Headers:    headersToCache,
			Body:       dcmpBody,
		}

		jsonBytes, err := MarshalToStore(cachedData)
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

// StoreAfterAuthError Stores resource(pods , nodes , etc) and returns to client
// if we get error while Authorizing user's permissions for every resources.
func StoreAfterAuthError(k8scache cache.Cache[string], next http.Handler, key string,
	w http.ResponseWriter, r *http.Request, rcw *responseCapture,
) {
	served, _ := LoadFromCache(k8scache, true, key, w, r)
	if served {
		return
	}

	next.ServeHTTP(rcw, r)

	err := RequestK8ClusterAPIAndStore(k8scache, r.URL, rcw, r, key)
	if err != nil {
		return
	}
}

type Details struct {
	Kind string `json:"kind"`
}

type MetaData struct {
	ResourceVersion string `json:"resourceVersion"`
}

// AuthErrorResponse is the Error Response for UnAuthorized user.
type AuthErrResponse struct {
	Kind       string   `json:"kind"`
	APIVersion string   `json:"apiVersion"`
	MetaData   MetaData `json:"metadata"`
	Message    string   `json:"message"`
	Reason     string   `json:"reason"`
	Details    Details  `json:"details"`
	Code       int      `json:"code"`
}

// ReturnAuthErrorResponse return Unauthorizated Error when the user is not Authorized to access any resources.
func ReturnAuthErrorResponse(r *http.Request, contextKey string) ([]byte, error) {
	last, kubeVerb := GetKindAndVerb(r)

	authErrorResponse := AuthErrResponse{
		Kind:       "Status",
		APIVersion: "v1",
		MetaData:   MetaData{},
		Message: fmt.Sprintf("%s is forbidden: User \"system:serviceaccount:default:%s\" cannot", last, contextKey) +
			fmt.Sprintf("%s resource \"%s\" in API group \"\" at the cluster scope", kubeVerb, last),
		Reason: "Forbidden",
		Details: Details{
			Kind: last,
		},
		Code: 403,
	}

	response, err := json.Marshal(authErrorResponse)
	if err != nil {
		return nil, err
	}

	return response, nil
}

// WriteResponseToClient returns UnAuthorized error response when the user Unauthorized.
// This helps to prevent requests to make actual call to clusterAPI.
func WriteResponseToClient(response []byte, w http.ResponseWriter) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_, writeErr := w.Write(response)

	if writeErr != nil {
		return writeErr
	}

	return nil
}
