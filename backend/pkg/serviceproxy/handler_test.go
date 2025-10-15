package serviceproxy //nolint

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

//nolint:funlen
func TestHandleServiceProxy(t *testing.T) {
	tests := []struct {
		name           string
		proxyService   *proxyService
		requestURI     string
		mockResponse   string
		mockStatusCode int
		expectedCode   int
		expectedBody   string
		useMockServer  bool
	}{
		// Success cases
		{
			name:           "successful request",
			proxyService:   &proxyService{URIPrefix: "http://example.com"},
			requestURI:     "/test",
			mockResponse:   "Hello, World!",
			mockStatusCode: http.StatusOK,
			expectedCode:   http.StatusOK,
			expectedBody:   "Hello, World!",
			useMockServer:  true,
		},
		{
			name:           "successful request with different response",
			proxyService:   &proxyService{URIPrefix: "http://api.example.com"},
			requestURI:     "/api/v1/data",
			mockResponse:   `{"status": "success", "data": "test"}`,
			mockStatusCode: http.StatusOK,
			expectedCode:   http.StatusOK,
			expectedBody:   `{"status": "success", "data": "test"}`,
			useMockServer:  true,
		},
		{
			name:           "request with query parameters",
			proxyService:   &proxyService{URIPrefix: "https://service.example.com"},
			requestURI:     "/api?param=value&test=123",
			mockResponse:   "Query processed",
			mockStatusCode: http.StatusOK,
			expectedCode:   http.StatusOK,
			expectedBody:   "Query processed",
			useMockServer:  true,
		},
		{
			name:           "empty response",
			proxyService:   &proxyService{URIPrefix: "http://empty.example.com"},
			requestURI:     "/empty",
			mockResponse:   "",
			mockStatusCode: http.StatusOK,
			expectedCode:   http.StatusOK,
			expectedBody:   "",
			useMockServer:  true,
		},
		// Error cases
		{
			name:           "server returns 404",
			proxyService:   &proxyService{URIPrefix: "http://example.com"},
			requestURI:     "/notfound",
			mockResponse:   "error response",
			mockStatusCode: http.StatusNotFound,
			expectedCode:   http.StatusInternalServerError,
			expectedBody:   "failed HTTP GET, status code 404\n",
			useMockServer:  true,
		},
		{
			name:           "server returns 500",
			proxyService:   &proxyService{URIPrefix: "http://example.com"},
			requestURI:     "/error",
			mockResponse:   "error response",
			mockStatusCode: http.StatusInternalServerError,
			expectedCode:   http.StatusInternalServerError,
			expectedBody:   "failed HTTP GET, status code 500\n",
			useMockServer:  true,
		},
		{
			name:           "invalid URL in proxy service",
			proxyService:   &proxyService{URIPrefix: "://invalid-url"},
			requestURI:     "/test",
			mockResponse:   "",
			mockStatusCode: http.StatusOK,
			expectedCode:   http.StatusInternalServerError,
			expectedBody:   "invalid host uri: parse \"://invalid-url\": missing protocol scheme\n",
			useMockServer:  false,
		},
		{
			name:           "invalid request URI",
			proxyService:   &proxyService{URIPrefix: "http://example.com"},
			requestURI:     "://invalid-request-uri",
			mockResponse:   "",
			mockStatusCode: http.StatusOK,
			expectedCode:   http.StatusInternalServerError,
			expectedBody:   "invalid request uri: parse \"://invalid-request-uri\": missing protocol scheme\n",
			useMockServer:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a mock HTTP server for cases that need it
			if tt.useMockServer {
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.WriteHeader(tt.mockStatusCode)

					if _, err := w.Write([]byte(tt.mockResponse)); err != nil {
						t.Fatal(err)
					}
				}))
				defer server.Close()

				// Update the proxy service to use the mock server
				tt.proxyService.URIPrefix = server.URL
			}

			// Create connection and test
			conn := NewConnection(tt.proxyService)
			w := httptest.NewRecorder()
			handleServiceProxy(conn, tt.requestURI, w)

			assert.Equal(t, tt.expectedCode, w.Code)
			assert.Equal(t, tt.expectedBody, w.Body.String())
		})
	}
}

func TestDisableResponseCaching(t *testing.T) {
	w := httptest.NewRecorder()
	disableResponseCaching(w)

	assert.Equal(t, "no-cache, private, max-age=0", w.Header().Get("Cache-Control"))
	assert.Equal(t, "no-cache", w.Header().Get("Pragma"))
	assert.Equal(t, "0", w.Header().Get("X-Accel-Expires"))
}

// createMockService creates a mock Kubernetes service for testing.
func createMockService(namespace, name string) *corev1.Service {
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
		},
		Spec: corev1.ServiceSpec{
			Ports: []corev1.ServicePort{
				{
					Name: "https",
					Port: 443,
				},
			},
		},
	}
}

//nolint:funlen
func TestGetAuthToken(t *testing.T) {
	tests := []struct {
		name          string
		clusterName   string
		setupRequest  func() *http.Request
		expectedToken string
		expectError   bool
		errorMsg      string
	}{
		{
			name:        "token from cookie",
			clusterName: "my-cluster",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				req.AddCookie(&http.Cookie{
					Name:  "headlamp-auth-my-cluster.0",
					Value: "cookie-token-xyz",
				})
				return req
			},
			expectedToken: "cookie-token-xyz",
			expectError:   false,
		},
		{
			name:        "token from Authorization header when no cookie exists",
			clusterName: "test-cluster",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				req.Header.Set("Authorization", "Bearer header-token-123")
				return req
			},
			expectedToken: "header-token-123",
			expectError:   false,
		},
		{
			name:        "cookie takes precedence over Authorization header",
			clusterName: "test-cluster",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				req.AddCookie(&http.Cookie{
					Name:  "headlamp-auth-test-cluster.0",
					Value: "cookie-token-wins",
				})
				req.Header.Set("Authorization", "Bearer header-token-loses")
				return req
			},
			expectedToken: "cookie-token-wins",
			expectError:   false,
		},
		{
			name:        "no Authorization header and no cookie returns error",
			clusterName: "test-cluster",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				return req
			},
			expectError: true,
			errorMsg:    "unauthorized",
		},
		{
			name:        "Authorization header with only Bearer keyword",
			clusterName: "test-cluster",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				req.Header.Set("Authorization", "Bearer")
				return req
			},
			expectedToken: "Bearer",
			expectError:   false,
		},
		{
			name:        "Authorization header with Bearer and space only - error",
			clusterName: "test-cluster",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				req.Header.Set("Authorization", "Bearer ")
				return req
			},
			expectError: true,
			errorMsg:    "unauthorized",
		},
		{
			name:        "valid token with Bearer prefix",
			clusterName: "test-cluster",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				req.Header.Set("Authorization", "Bearer valid-token-value")
				return req
			},
			expectedToken: "valid-token-value",
			expectError:   false,
		},
		{
			name:        "Authorization header without Bearer prefix",
			clusterName: "test-cluster",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/test", nil)
				req.Header.Set("Authorization", "just-a-token")
				return req
			},
			expectedToken: "just-a-token",
			expectError:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := tt.setupRequest()
			token, err := getAuthToken(req, tt.clusterName)

			if tt.expectError {
				assert.Error(t, err)

				if tt.errorMsg != "" {
					assert.Contains(t, err.Error(), tt.errorMsg)
				}
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expectedToken, token)
			}
		})
	}
}

//nolint:funlen
func TestGetServiceFromCluster(t *testing.T) {
	tests := []struct {
		name           string
		namespace      string
		serviceName    string
		setupService   bool
		mockError      error
		expectedStatus int
		expectError    bool
	}{
		{
			name:           "service not found",
			namespace:      "default",
			serviceName:    "nonexistent-service",
			setupService:   false,
			mockError:      nil,
			expectedStatus: http.StatusNotFound,
			expectError:    true,
		},
		{
			name:           "service found successfully",
			namespace:      "default",
			serviceName:    "test-service",
			setupService:   true,
			mockError:      nil,
			expectedStatus: http.StatusOK,
			expectError:    false,
		},
		{
			name:           "service in different namespace",
			namespace:      "kube-system",
			serviceName:    "metrics-server",
			setupService:   true,
			mockError:      nil,
			expectedStatus: http.StatusOK,
			expectError:    false,
		},
		{
			name:           "unauthorized access",
			namespace:      "default",
			serviceName:    "restricted-service",
			setupService:   false,
			mockError:      errors.NewUnauthorized("user does not have permission"),
			expectedStatus: http.StatusUnauthorized,
			expectError:    true,
		},
		{
			name:         "forbidden access",
			namespace:    "default",
			serviceName:  "forbidden-service",
			setupService: false,
			mockError: errors.NewForbidden(
				schema.GroupResource{Resource: "services"},
				"forbidden-service",
				nil,
			),
			expectedStatus: http.StatusNotFound,
			expectError:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var cs *fake.Clientset

			switch {
			case tt.mockError != nil:
				// Create a fake clientset with a reactor to simulate errors
				cs = fake.NewSimpleClientset()
				cs.PrependReactor("get", "services", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
					return true, nil, tt.mockError
				})
			case tt.setupService:
				// Setup a mock service
				service := createMockService(tt.namespace, tt.serviceName)
				cs = fake.NewSimpleClientset(service)
			default:
				// Empty clientset (service not found)
				cs = fake.NewSimpleClientset()
			}

			ps, status, err := getServiceFromCluster(cs, tt.namespace, tt.serviceName)

			assert.Equal(t, tt.expectedStatus, status)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, ps)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, ps)
				assert.Equal(t, tt.serviceName, ps.Name)
				assert.Equal(t, tt.namespace, ps.Namespace)
			}
		})
	}
}

//nolint:funlen
func TestParseInfoFromRequest(t *testing.T) {
	tests := []struct {
		name                string
		setupRequest        func() *http.Request
		expectedClusterName string
		expectedNamespace   string
		expectedName        string
		expectedRequestURI  string
	}{
		{
			name: "standard case with all parameters",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET",
					"/clusters/test-cluster/namespaces/test-namespace/services/test-service/proxy?request=/api/v1/data",
					nil)
				req = mux.SetURLVars(req, map[string]string{
					"clusterName": "test-cluster",
					"namespace":   "test-namespace",
					"name":        "test-service",
				})
				return req
			},
			expectedClusterName: "test-cluster",
			expectedNamespace:   "test-namespace",
			expectedName:        "test-service",
			expectedRequestURI:  "/api/v1/data",
		},
		{
			name: "cluster name with hyphens and numbers",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET",
					"/clusters/prod-cluster-123/namespaces/kube-system/services/metrics-server/proxy?request=/metrics",
					nil)
				req = mux.SetURLVars(req, map[string]string{
					"clusterName": "prod-cluster-123",
					"namespace":   "kube-system",
					"name":        "metrics-server",
				})
				return req
			},
			expectedClusterName: "prod-cluster-123",
			expectedNamespace:   "kube-system",
			expectedName:        "metrics-server",
			expectedRequestURI:  "/metrics",
		},
		{
			name: "request URI with query parameters",
			setupRequest: func() *http.Request {
				// The & in the request parameter needs to be URL encoded as %26
				req := httptest.NewRequest("GET", "/proxy?request=/api/endpoint?param1=value1%26param2=value2", nil)
				req = mux.SetURLVars(req, map[string]string{
					"clusterName": "my-cluster",
					"namespace":   "default",
					"name":        "my-service",
				})
				return req
			},
			expectedClusterName: "my-cluster",
			expectedNamespace:   "default",
			expectedName:        "my-service",
			expectedRequestURI:  "/api/endpoint?param1=value1&param2=value2",
		},
		{
			name: "empty request URI parameter",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/proxy", nil)
				req = mux.SetURLVars(req, map[string]string{
					"clusterName": "cluster1",
					"namespace":   "ns1",
					"name":        "svc1",
				})
				return req
			},
			expectedClusterName: "cluster1",
			expectedNamespace:   "ns1",
			expectedName:        "svc1",
			expectedRequestURI:  "",
		},
		{
			name: "request URI with special characters encoded",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/proxy?request=/api/v1/users%2F123%2Fprofile", nil)
				req = mux.SetURLVars(req, map[string]string{
					"clusterName": "test",
					"namespace":   "app",
					"name":        "backend",
				})
				return req
			},
			expectedClusterName: "test",
			expectedNamespace:   "app",
			expectedName:        "backend",
			expectedRequestURI:  "/api/v1/users/123/profile",
		},
		{
			name: "missing mux variables returns empty strings",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/proxy?request=/test", nil)
				// Not setting any mux vars
				return req
			},
			expectedClusterName: "",
			expectedNamespace:   "",
			expectedName:        "",
			expectedRequestURI:  "/test",
		},
		{
			name: "service name with dots (for headless services)",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/proxy?request=/health", nil)
				req = mux.SetURLVars(req, map[string]string{
					"clusterName": "cluster",
					"namespace":   "default",
					"name":        "my-service.default.svc.cluster.local",
				})
				return req
			},
			expectedClusterName: "cluster",
			expectedNamespace:   "default",
			expectedName:        "my-service.default.svc.cluster.local",
			expectedRequestURI:  "/health",
		},
		{
			name: "complex request URI with path and multiple query params",
			setupRequest: func() *http.Request {
				// The & in the request parameter needs to be URL encoded as %26
				req := httptest.NewRequest("GET", "/proxy?request=/api/v2/search?q=test%26limit=10%26offset=0", nil)
				req = mux.SetURLVars(req, map[string]string{
					"clusterName": "production",
					"namespace":   "api-namespace",
					"name":        "search-service",
				})
				return req
			},
			expectedClusterName: "production",
			expectedNamespace:   "api-namespace",
			expectedName:        "search-service",
			expectedRequestURI:  "/api/v2/search?q=test&limit=10&offset=0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := tt.setupRequest()
			clusterName, namespace, name, requestURI := parseInfoFromRequest(req)
			assert.Equal(t, tt.expectedClusterName, clusterName)
			assert.Equal(t, tt.expectedNamespace, namespace)
			assert.Equal(t, tt.expectedName, name)
			assert.Equal(t, tt.expectedRequestURI, requestURI)
		})
	}
}
