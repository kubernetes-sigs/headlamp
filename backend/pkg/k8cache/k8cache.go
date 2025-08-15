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

// Package k8cache provides caching utilities for Kubernetes API responses.
// It includes middleware for intercepting cluster API requests, generating
// unique cache keys, storing and retrieving responses, and invalidating
// entries when resources change. The package aims to reduce redundant
// API calls, improve performance, and handle authorization gracefully
// while maintaining consistency across multiple Kubernetes contexts.
package k8cache

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	authorizationv1 "k8s.io/api/authorization/v1"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/kubernetes"
	watchCache "k8s.io/client-go/tools/cache"
)

// ResponseCapture is a struct that will capture statusCode, Headers and Body
// while the response is coming from the K8s clusters.
type ResponseCapture struct {
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
func (r *ResponseCapture) WriteHeader(code int) {
	r.StatusCode = code
	r.ResponseWriter.WriteHeader(code)
}

// Write help to write the body of the response data into the CacheResponseData struct.
func (r *ResponseCapture) Write(b []byte) (int, error) {
	r.Body.Write(b)
	return r.ResponseWriter.Write(b)
}

// CreateResponseCapture initializes responseCapture with a http.ResponseWriter and empty bytes.Buffer for the body.
func CreateResponseCapture(w http.ResponseWriter) *ResponseCapture {
	return &ResponseCapture{
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

		defer reader.Close()

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

// GetAPIGroup parse the urlPath and return apiGroup and version
// that can be used while generating key for cache.
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

	k := CacheKey{
		Kind:      kind,
		Namespace: namespace,
		Context:   contextID,
	}

	// Create a stable representation
	raw := fmt.Sprintf("%s+%s+%s+%s", apiGroup, k.Kind, k.Namespace, k.Context)

	return raw, nil
}

// UnmarshalCachedData deserialize a JSON string received from cache
// back into a CachedResponseData struct. This function is used to reconstructing
// the full HTTP response (status, headers, body) when serving the k8s to the client.
// this is the essential part as it gives the clarity about the incoming k8s requests.
func UnmarshalCacheData(cacheResource string,
) (CachedResponseData, error) {
	var cachedData CachedResponseData

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

// FilterHeaderForCache ensures that the cached headers accurately reflect the state of the
// decompressed body that is being stored, and prevents client side decompression
// issues serving from cache.
func FilterHeaderForCache(responseHeaders http.Header, encoding string) http.Header {
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

// GetClientSet return *kubernetes.ClientSet and error which further used for creating
// SSAR requests to k8s server to authorize user. getClientSet uses kubeconfig.Context and
// authentication bearer token  which will help to create clientSet based on the user's
// identity.
func GetClientSet(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
	contextKey := strings.Split(k.ClusterID, "+")
	if len(contextKey) < 2 {
		// log and handle gracefully
		return nil, fmt.Errorf("unexpected ClusterID format in getClientSet: %q", k.ClusterID)
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

	isWatch, _ := strconv.ParseBool(r.URL.Query().Get("watch"))

	switch r.Method {
	case "GET":
		if isWatch {
			kubeVerb = "watch"
		} else {
			kubeVerb = "get"
		}
	default:
		kubeVerb = "unknown"
	}

	return last, kubeVerb
}

// IsAllowed checks the user's permission to access the resource.
// If the user is authorized and has permission to view the resources, it returns true.
// Otherwise, it returns false if authorization fails.
func IsAllowed(
	k *kubeconfig.Context,
	w http.ResponseWriter,
	r *http.Request,
) (bool, error) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	token = strings.TrimSpace(token)

	clientset, err := GetClientSet(k, token)
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

	return result.Status.Allowed, err
}

// LoadFromCache checks if a cached resource exists and the user has permission to view it.
// If found, it writes the cached data to the ResponseWriter and returns (true, nil).
// If not found or on error, it returns (false, error).
func LoadFromCache(k8scache cache.Cache[string], isAllowed bool,
	key string, w http.ResponseWriter, r *http.Request,
) (bool, error) {
	k8Resource, err := k8scache.Get(context.Background(), key)
	if err == nil && strings.TrimSpace(k8Resource) != "" && isAllowed {
		var cachedData CachedResponseData

		cachedData, err := UnmarshalCacheData(k8Resource)
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

// StoreK8sResponseInCache ensures if the key was not found inside the cache then this will make actual call to k8's
// and this will capture the response body and convert the captured response to string.
// After converting it will store the response with the key and TTL of 10*min.
func StoreK8sResponseInCache(k8scache cache.Cache[string],
	url *url.URL,
	rcw *ResponseCapture,
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

	headersToCache := FilterHeaderForCache(capturedHeaders, encoding)
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

// ServeFromCacheOrForwardToK8s Stores resource(pods , nodes , etc) and returns to client
// if we get error while Authorizing user's permissions for every resources.
func ServeFromCacheOrForwardToK8s(k8scache cache.Cache[string], isAllowed bool, next http.Handler, key string,
	w http.ResponseWriter, r *http.Request, rcw *ResponseCapture,
) {
	served, _ := LoadFromCache(k8scache, isAllowed, key, w, r)
	if served {
		return
	}

	next.ServeHTTP(rcw, r)

	err := StoreK8sResponseInCache(k8scache, r.URL, rcw, r, key)
	if err != nil {
		return
	}
}

func contains(slice []string, str string) bool {
	for _, v := range slice {
		if v == str {
			return true
		}
	}

	return false
}

// returnGVRList return gvrList which is group, version, resource which is all the supported resources
// that are supported by the k8s server.
func returnGVRList(apiResourceLists []*metav1.APIResourceList) []schema.GroupVersionResource {
	skipKinds := map[string]bool{
		"Lease": true,
		"Event": true,
	}

	var gvrList []schema.GroupVersionResource

	for _, apiResource := range apiResourceLists {
		for _, resource := range apiResource.APIResources {
			if strings.Contains(resource.Name, "/") || skipKinds[resource.Kind] {
				continue
			}

			if contains(resource.Verbs, "list") && contains(resource.Verbs, "watch") {
				gv, err := schema.ParseGroupVersion(apiResource.GroupVersion)
				if err != nil {
					continue
				}

				gvrList = append(gvrList, schema.GroupVersionResource{
					Group:    gv.Group,
					Version:  gv.Version,
					Resource: resource.Name,
				})
			}
		}
	}

	return gvrList
}

// Corrected CheckForChanges.
var (
	watcherRegistry sync.Map
	contextCancel   sync.Map
)

// CheckForChanges lets 1 go routine to run for a contextKey which prevents
// running go routines for every requests which can become performance issue if
// there are many resource and events are going on.
func CheckForChanges(
	k8scache cache.Cache[string],
	contextKey string,
	kContext kubeconfig.Context,
) {
	if _, loaded := watcherRegistry.Load(contextKey); loaded {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())

	contextCancel.Store(contextKey, cancel)

	watcherRegistry.Store(contextKey, struct{}{})

	go runWatcher(ctx, k8scache, contextKey, kContext)
}

// runWatcher is a long-lived goroutine that sets up and runs Kubernetes informers.
// It watches for resource changes and invalidates corresponding cache entries.
// This function will only exit when its context is cancelled.
func runWatcher(
	ctx context.Context,
	k8scache cache.Cache[string],
	contextKey string,
	kContext kubeconfig.Context,
) {
	logger.Log(logger.LevelInfo, nil, nil, "running runWatcher for watching k8s resource: "+contextKey)

	config, err := kContext.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "error getting REST config for context:")
		return
	}

	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "error creating dynamic client for context: "+contextKey)
		return
	}

	discoveryClient := discovery.NewDiscoveryClientForConfigOrDie(config)

	apiResourceLists, err := discoveryClient.ServerPreferredResources()
	if apiResourceLists == nil && err != nil {
		logger.Log(logger.LevelError, nil, err, "error fetching resource list for context: "+contextKey)
		return
	}

	gvrList := returnGVRList(apiResourceLists)
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(dynamicClient, 0, "", nil)

	runInformerToWatch(gvrList, factory, contextKey, k8scache)

	factory.Start(ctx.Done())

	factory.WaitForCacheSync(ctx.Done())

	<-ctx.Done()
	logger.Log(logger.LevelInfo, nil, nil, "Watcher for context"+contextKey+"is shutting down...")
}

// runInformerToWatch watches changes such as Addition, Deletion and Updation of a resource
// and if so capture the data into the key and store all unique keys, and return unique
// keys which will be delete in runWatcher.
func runInformerToWatch(gvrList []schema.GroupVersionResource,
	factory dynamicinformer.DynamicSharedInformerFactory,
	contextKey string, k8scache cache.Cache[string],
) {
	for _, gvr := range gvrList {
		informer := factory.ForResource(gvr).Informer()

		if _, err := informer.AddEventHandler(watchCache.ResourceEventHandlerFuncs{
			AddFunc: func(obj interface{}) {
				unstructuredObj := obj.(*unstructured.Unstructured)
				if time.Since(unstructuredObj.GetCreationTimestamp().Time) > time.Minute {
					return
				}
				namespace := unstructuredObj.GetNamespace()
				key := fmt.Sprintf("%s+%s+%s+%s", gvr.Group, gvr.Resource, namespace, contextKey)
				logger.Log(logger.LevelInfo, nil, nil, key+"while going to be deleted from the cache")
				if err := k8scache.Delete(context.Background(), key); err != nil {
					logger.Log(logger.LevelError, nil, err, "error while deleting key "+key)
					return
				}
			},
			UpdateFunc: func(oldObj, newObj interface{}) {
				unstructuredObj := newObj.(*unstructured.Unstructured)
				namespace := unstructuredObj.GetNamespace()
				key := fmt.Sprintf("%s+%s+%s+%s", gvr.Group, gvr.Resource, namespace, contextKey)
				logger.Log(logger.LevelInfo, nil, nil, key+"while going to be deleted from the cache")
				if err := k8scache.Delete(context.Background(), key); err != nil {
					logger.Log(logger.LevelError, nil, err, "error while deleting key "+key)
					return
				}
			},
			DeleteFunc: func(obj interface{}) {
				unstructuredObj := obj.(*unstructured.Unstructured)
				namespace := unstructuredObj.GetNamespace()
				key := fmt.Sprintf("%s+%s+%s+%s", gvr.Group, gvr.Resource, namespace, contextKey)
				logger.Log(logger.LevelInfo, nil, nil, key+"while going to be deleted from the cache")
				if err := k8scache.Delete(context.Background(), key); err != nil {
					logger.Log(logger.LevelError, nil, err, "error while deleting key "+key)
					return
				}
			},
		}); err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to add event handler for resource: "+gvr.Resource)
			return
		}
	}
}
