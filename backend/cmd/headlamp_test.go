/*
Copyright 2025 The Kubernetes Authors.

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

package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	minikubeName = "minikube"
)

func makeJSONReq(method, url string, jsonObj interface{}) (*http.Request, error) {
	var jsonBytes []byte = nil

	if jsonObj != nil {
		b, err := json.Marshal(jsonObj)
		if err != nil {
			return nil, err
		}

		jsonBytes = b
	}

	return http.NewRequestWithContext(context.Background(), method, url, bytes.NewBuffer(jsonBytes))
}

func getResponse(handler http.Handler, method, url string, body interface{}) (*httptest.ResponseRecorder, error) {
	req, err := makeJSONReq(method, url, body)
	if err != nil {
		return nil, err
	}

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	return rr, nil
}

func getResponseFromRestrictedEndpoint(handler http.Handler, method, url string, body interface{}) (*httptest.ResponseRecorder, error) { //nolint:lll
	token := uuid.New().String()
	os.Setenv("HEADLAMP_BACKEND_TOKEN", token)

	defer os.Unsetenv("HEADLAMP_BACKEND_TOKEN")

	req, err := makeJSONReq(method, url, body)
	if err != nil {
		return nil, err
	}

	req.Header.Set("X-HEADLAMP_BACKEND-TOKEN", token)

	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	return rr, nil
}

//nolint:gocognit,funlen
func TestDynamicClusters(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	var (
		newCluster        = "mynewcluster"
		newClusterServer  = "https://mysupercluster.io"
		newCluster2       = "mynewcluster-2"
		newCluster2Server = "https://mysupercluster2.io"
		newCluster3       = "mynewcluster-3"
		newCluster3Server = "https://mysupercluster3.io"
	)

	tests := []struct {
		name                string
		clusters            []ClusterReq
		expectedState       int
		expectedNumClusters int
	}{
		{
			name: "create",
			clusters: []ClusterReq{
				{
					Name:                     &newCluster,
					Server:                   &newClusterServer,
					CertificateAuthorityData: []byte("abcde"),
				},
				{
					Name:                     &newCluster2,
					Server:                   &newCluster2Server,
					InsecureSkipTLSVerify:    true,
					CertificateAuthorityData: []byte("abcde"),
				},
				{
					Name:                     &newCluster3,
					Server:                   &newCluster3Server,
					CertificateAuthorityData: []byte("abcde"),
				},
			},
			expectedState:       http.StatusCreated,
			expectedNumClusters: 3,
		},
		{
			name: "override",
			clusters: []ClusterReq{
				{
					Name:                     &newCluster,
					Server:                   &newClusterServer,
					CertificateAuthorityData: []byte("abcde"),
				},
				{
					Name:                     &newCluster, // same name will override
					Server:                   &newCluster2Server,
					CertificateAuthorityData: []byte("abcde"),
				},
			},
			expectedState:       http.StatusCreated,
			expectedNumClusters: 1,
		},
		{
			name: "invalid",
			clusters: []ClusterReq{
				{
					Name:                     nil,
					Server:                   &newClusterServer,
					CertificateAuthorityData: []byte("abcde"),
				},
				{
					Name:                     &newCluster,
					Server:                   nil,
					CertificateAuthorityData: []byte("abcde"),
				},
			},
			expectedState:       http.StatusBadRequest,
			expectedNumClusters: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cache := cache.New[interface{}]()
			kubeConfigStore := kubeconfig.NewContextStore()
			c := HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{
						UseInCluster:          false,
						KubeConfigPath:        "",
						EnableDynamicClusters: true,
						KubeConfigStore:       kubeConfigStore,
					},
					Cache:            cache,
					TelemetryConfig:  GetDefaultTestTelemetryConfig(),
					TelemetryHandler: &telemetry.RequestHandler{},
				},
			}
			handler := createHeadlampHandler(&c)

			var resp *httptest.ResponseRecorder

			for _, clusterReq := range tc.clusters {
				r, err := getResponseFromRestrictedEndpoint(handler, "POST", "/cluster", clusterReq)
				if err != nil {
					t.Fatal(err)
				}

				assert.Equal(t, r.Code, tc.expectedState)

				// Verify if the created cluster matches what we asked to be created
				if r.Code == http.StatusCreated {
					var config clientConfig

					err = json.Unmarshal(r.Body.Bytes(), &config)
					if err != nil {
						t.Fatal(err)
					}

					configuredClusters := c.getClusters()

					var cluster *Cluster

					// Get cluster we created
					for i, val := range configuredClusters {
						if val.Name == *clusterReq.Name {
							cluster = &configuredClusters[i]
							break
						}
					}

					assert.NotNil(t, cluster)
					assert.Equal(t, *clusterReq.Name, cluster.Name)
					assert.Equal(t, *clusterReq.Server, cluster.Server)
				}

				resp = r
			}

			// The response for the /config should be the same as the previous /cluster call.
			configResp, err := getResponse(handler, "GET", "/config", nil)
			if err != nil {
				t.Fatal(err)
			}

			if resp.Code == http.StatusCreated {
				var clusterConfig clientConfig

				err = json.Unmarshal(resp.Body.Bytes(), &clusterConfig)
				if err != nil {
					t.Fatal(err)
				}

				var config clientConfig

				err = json.Unmarshal(configResp.Body.Bytes(), &config)
				if err != nil {
					t.Fatal(err)
				}

				assert.Equal(t, len(clusterConfig.Clusters), len(config.Clusters))
				assert.Equal(t, tc.expectedNumClusters, len(c.getClusters()))
			}
		})
	}
}

func TestDynamicClustersKubeConfig(t *testing.T) {
	kubeConfigByte, err := os.ReadFile("./headlamp_testdata/kubeconfig")
	require.NoError(t, err)

	kubeConfig := base64.StdEncoding.EncodeToString(kubeConfigByte)
	req := ClusterReq{
		KubeConfig: &kubeConfig,
	}
	cache := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()

	c := HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster:          false,
				KubeConfigPath:        "",
				EnableDynamicClusters: true,
				KubeConfigStore:       kubeConfigStore,
			},
			Cache:            cache,
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}
	handler := createHeadlampHandler(&c)

	r, err := getResponseFromRestrictedEndpoint(handler, "POST", "/cluster", req)
	if err != nil {
		t.Fatal(err)
	}

	clusters := c.getClusters()

	assert.Equal(t, http.StatusCreated, r.Code)
	assert.Equal(t, 2, len(clusters))

	var contextWithoutNamespace *Cluster

	var minikubeCluster *Cluster

	for i, cluster := range clusters {
		if cluster.Name == minikubeName {
			// Using the slice addressing here to avoid the
			// implicit memory aliasing in the loop.
			minikubeCluster = &clusters[i]
		} else if cluster.Name == "docker-desktop" {
			contextWithoutNamespace = &clusters[i]
		}
	}

	assert.NotNil(t, contextWithoutNamespace)
	assert.Equal(t, "", contextWithoutNamespace.Metadata["namespace"])

	assert.NotNil(t, minikubeCluster)
	assert.Equal(t, minikubeName, minikubeCluster.Name)
	assert.Equal(t, "default", minikubeCluster.Metadata["namespace"])
}

func TestInvalidKubeConfig(t *testing.T) {
	cache := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()

	absPath, err := filepath.Abs("./headlamp_testdata/kubeconfig_partialcontextvalid")
	assert.NoError(t, err)

	c := HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster:          false,
				KubeConfigPath:        absPath,
				EnableDynamicClusters: true,
				KubeConfigStore:       kubeConfigStore,
			},
			Cache: cache,
		},
	}

	err = kubeconfig.LoadAndStoreKubeConfigs(kubeConfigStore, absPath, kubeconfig.KubeConfig, nil)
	assert.Error(t, err)

	clusters := c.getClusters()

	assert.Equal(t, 1, len(clusters))
}

//nolint:funlen
func TestExternalProxy(t *testing.T) {
	// Create a new server for testing
	proxyServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)

		_, err := w.Write([]byte("OK"))
		if err != nil {
			t.Fatal(err)
		}
	}))
	defer proxyServer.Close()

	type test struct {
		handler             http.Handler
		useForwardedHeaders bool
		useNoProxyURL       bool
		useProxyURL         bool
	}

	// get the proxyServer URL
	proxyURL, err := url.Parse(proxyServer.URL)
	if err != nil {
		t.Fatal(err)
	}

	cache := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()

	tests := []test{
		{
			handler: createHeadlampHandler(&HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{
						UseInCluster:    false,
						ProxyURLs:       []string{proxyURL.String()},
						KubeConfigStore: kubeConfigStore,
					},
					Cache: cache,
				},
			}),
			useForwardedHeaders: true,
		},
		{
			handler: createHeadlampHandler(&HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{
						UseInCluster:    false,
						ProxyURLs:       []string{},
						KubeConfigStore: kubeConfigStore,
					},
					Cache: cache,
				},
			}),
			useNoProxyURL: true,
		},
		{
			handler: createHeadlampHandler(&HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{
						UseInCluster:    false,
						KubeConfigStore: kubeConfigStore,
						ProxyURLs:       []string{proxyURL.String()},
					},
					Cache: cache,
				},
			}),
			useProxyURL: true,
		},
	}

	for _, tc := range tests {
		ctx := context.Background()

		req, err := http.NewRequestWithContext(ctx, "GET", "/externalproxy", nil)
		if err != nil {
			t.Fatal(err)
		}

		if tc.useForwardedHeaders {
			// Test with Forward-to header
			req.Header.Set("Forward-to", proxyURL.String())
		} else if tc.useProxyURL || tc.useNoProxyURL {
			// Test with proxy-to header
			req.Header.Set("proxy-to", proxyURL.String())
		}

		rr := httptest.NewRecorder()
		tc.handler.ServeHTTP(rr, req)

		if tc.useNoProxyURL {
			if status := rr.Code; status != http.StatusBadRequest {
				t.Errorf("handler returned wrong status code: got %v want %v",
					status, http.StatusBadRequest)
			}

			continue
		}

		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v",
				status, http.StatusOK)
		}

		if rr.Body.String() != "OK" {
			t.Errorf("handler returned unexpected body: got %v want %v",
				rr.Body.String(), "OK")
		}
	}
}

func TestDrainAndCordonNode(t *testing.T) { //nolint:funlen
	type test struct {
		handler http.Handler
	}

	cache := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()
	tests := []test{
		{
			handler: createHeadlampHandler(&HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{
						UseInCluster:    false,
						KubeConfigPath:  config.GetDefaultKubeConfigPath(),
						KubeConfigStore: kubeConfigStore,
					},
					Cache:            cache,
					TelemetryConfig:  GetDefaultTestTelemetryConfig(),
					TelemetryHandler: &telemetry.RequestHandler{},
				},
			}),
		},
	}

	var drainNodePayload struct {
		Cluster  string `json:"cluster"`
		NodeName string `json:"nodeName"`
	}

	for _, tc := range tests {
		drainNodePayload.Cluster = minikubeName
		drainNodePayload.NodeName = minikubeName

		rr, err := getResponse(tc.handler, "POST", "/drain-node", drainNodePayload)
		if err != nil {
			t.Fatal(err)
		}

		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v",
				status, http.StatusOK)
		}

		cacheKey := uuid.NewSHA1(uuid.Nil, []byte(drainNodePayload.NodeName+drainNodePayload.Cluster)).String()
		cacheItemTTL := DrainNodeCacheTTL * time.Minute
		ctx := context.Background()

		err = cache.SetWithTTL(ctx, cacheKey, "success", cacheItemTTL)
		if err != nil {
			t.Fatal(err)
		}

		url := fmt.Sprintf(
			"/drain-node-status?cluster=%s&nodeName=%s",
			drainNodePayload.Cluster, drainNodePayload.NodeName,
		)

		rr, err = getResponse(tc.handler, "GET", url, nil)
		if err != nil {
			t.Fatal(err)
		}

		if status := rr.Code; status != http.StatusOK {
			t.Errorf("handler returned wrong status code: got %v want %v",
				status, http.StatusOK)
		}
	}
}

func TestDeletePlugin(t *testing.T) {
	// create temp dir for plugins
	tempDir, err := os.MkdirTemp("", "plugins")
	require.NoError(t, err)

	defer os.RemoveAll(tempDir)

	// create user-plugins dir
	userPluginDir := tempDir + "/user-plugins"
	err = os.Mkdir(userPluginDir, 0o755)
	require.NoError(t, err)

	// create dev plugins dir
	devPluginDir := tempDir + "/plugins"
	err = os.Mkdir(devPluginDir, 0o755)
	require.NoError(t, err)

	// create plugin in dev dir
	pluginDir := devPluginDir + "/test-plugin"
	err = os.Mkdir(pluginDir, 0o755)
	require.NoError(t, err)

	// create plugin file
	pluginFile := pluginDir + "/main.js"
	_, err = os.Create(pluginFile)
	require.NoError(t, err)

	cache := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()

	c := HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster:    false,
				KubeConfigPath:  config.GetDefaultKubeConfigPath(),
				PluginDir:       devPluginDir,
				UserPluginDir:   userPluginDir,
				KubeConfigStore: kubeConfigStore,
			},
			Cache: cache,
		},
	}

	handler := createHeadlampHandler(&c)

	rr, err := getResponseFromRestrictedEndpoint(handler, "DELETE", "/plugins/test-plugin", nil)
	require.NoError(t, err)

	assert.Equal(t, http.StatusOK, rr.Code)

	// check if plugin was deleted
	_, err = os.Stat(pluginDir)
	assert.True(t, os.IsNotExist(err))
}

func TestHandleClusterAPI_XForwardedHost(t *testing.T) {
	// Create a new server for testing
	proxyServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify that X-Forwarded-Host is set to r.Host
		assert.Equal(t, r.Host, r.Header.Get("X-Forwarded-Host"))
		w.WriteHeader(http.StatusOK)
		_, err := w.Write([]byte("OK"))
		require.NoError(t, err)
	}))
	defer proxyServer.Close()

	kubeConfigStore := kubeconfig.NewContextStore()

	err := kubeConfigStore.AddContext(&kubeconfig.Context{
		Name: "test",
		Cluster: &api.Cluster{
			Server: proxyServer.URL,
		},
	})
	require.NoError(t, err)

	cache := cache.New[interface{}]()

	c := HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster:    false,
				KubeConfigPath:  config.GetDefaultKubeConfigPath(),
				KubeConfigStore: kubeConfigStore,
			},
			Cache:            cache,
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}

	handler := createHeadlampHandler(&c)

	// Create a test request to the cluster API endpoint
	ctx := context.Background()
	req, err := http.NewRequestWithContext(ctx, "GET", "/clusters/test/version", nil)
	require.NoError(t, err)

	// Create a response recorder to capture the response
	rr := httptest.NewRecorder()

	// Serve the test request
	handler.ServeHTTP(rr, req)

	// Check the status code and response body
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "OK", rr.Body.String())
}

// handleClusterRenameRequest handles a cluster rename request.
func handleClusterRenameRequest(
	t *testing.T,
	handler http.Handler,
	tc struct {
		name          string
		clusterReq    RenameClusterRequest
		expectedState int
	},
) {
	var r *httptest.ResponseRecorder

	var err error

	if tc.clusterReq.Source == "kubeconfig" {
		url := "/cluster/minikubetestnondynamic?ClusterID=./headlamp_testdata/kubeconfig_rename:minikubetestnondynamic"
		r, err = getResponseFromRestrictedEndpoint(handler, "PUT", url, tc.clusterReq)
		require.NoError(t, err)
		assert.Equal(t, tc.expectedState, r.Code)
	} else {
		url := "/cluster/minikubetest?ClusterID=minikubetest"
		r, err = getResponseFromRestrictedEndpoint(handler, "PUT", url, tc.clusterReq)
		require.NoError(t, err)
		assert.Equal(t, tc.expectedState, r.Code)
	}
}

// TestCheckUniqueName checks the CheckUniqueName function which checks if a new name is unique among existing contexts.
func TestCheckUniqueName(t *testing.T) {
	// Need the parsed *api.Config so we can reference the contexts
	kubeConfig, err := clientcmd.LoadFromFile("./headlamp_testdata/name_validation_test")
	require.NoError(t, err)

	cases := []struct {
		label        string
		newName      string
		expectUnique bool
	}{
		{"default name usage", "random-cluster-x", false},
		{"custom name usage", "superfly-name", false},
		{"another default name usage", "random-cluster-y", false},
		{"unique name usage", "amazing-name", true},
	}

	for _, tc := range cases {
		t.Run(tc.label, func(t *testing.T) {
			got := CheckUniqueName(kubeConfig.Contexts, "random-cluster-y", tc.newName)
			if got != tc.expectUnique {
				t.Fatalf("CheckUniqueName(%q) = %v; want %v", tc.newName, got, tc.expectUnique)
			}
		})
	}
}

// runClusterRenameTests used to run the cluster rename tests.
func runClusterRenameTests(
	t *testing.T,
	handler http.Handler,
	tests []struct {
		name          string
		clusterReq    RenameClusterRequest
		expectedState int
	},
) {
	resetConfigByte, err := os.ReadFile("./headlamp_testdata/kubeconfig_rename")
	require.NoError(t, err)

	for _, tc := range tests {
		handleClusterRenameRequest(t, handler, tc)
	}

	// This test modifies the test file, so we have to restore the test file at the end of the test.
	err = os.WriteFile("./headlamp_testdata/kubeconfig_rename", resetConfigByte, 0o600)
	require.NoError(t, err)
}

// TestRenameCluster checks the cluster rename functionality.
// note: needed to split into multiple parts for linter.
func TestRenameCluster(t *testing.T) { //nolint:funlen
	kubeConfigByte, err := os.ReadFile("./headlamp_testdata/kubeconfig")
	require.NoError(t, err)

	kubeConfig := base64.StdEncoding.EncodeToString(kubeConfigByte)
	req := ClusterReq{
		KubeConfig: &kubeConfig,
	}
	cache := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()

	c := HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster:          false,
				KubeConfigPath:        "./headlamp_testdata/kubeconfig",
				EnableDynamicClusters: true,
				KubeConfigStore:       kubeConfigStore,
			},
			Cache:            cache,
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}
	handler := createHeadlampHandler(&c)

	r, err := getResponseFromRestrictedEndpoint(handler, "POST", "/cluster", req)
	if err != nil {
		t.Fatal(err)
	}

	assert.Equal(t, http.StatusCreated, r.Code)

	tests := []struct {
		name          string
		clusterReq    RenameClusterRequest
		expectedState int
	}{
		{
			name: "stateless",
			clusterReq: RenameClusterRequest{
				NewClusterName: "minikubetestworksnew",
				Stateless:      true,
			},
			expectedState: http.StatusCreated,
		},
		{
			name: "passStatefull",
			clusterReq: RenameClusterRequest{
				NewClusterName: "minikubetestworkskubeconfig",
				Stateless:      false,
				Source:         "kubeconfig",
			},
			expectedState: http.StatusCreated,
		},
	}

	runClusterRenameTests(t, handler, tests)

	remErr := c.KubeConfigStore.RemoveContext("minikubetest")
	require.NoError(t, remErr, "Failed to remove context: minikubetest")

	remErrNonDy := c.KubeConfigStore.RemoveContext("minikubetestworkskubeconfig")
	require.NoError(t, remErrNonDy, "Failed to remove context: minikubetestworkskubeconfig")

	clusters := c.getClusters()
	assert.Equal(t, 2, len(clusters))
}

func TestFileExists(t *testing.T) {
	// Test for existing file
	assert.True(t, fileExists("./headlamp_testdata/kubeconfig"),
		"fileExists() should return true for existing file")

	// Test for non-existent file
	assert.False(t, fileExists("./headlamp_testdata/nonexistent"),
		"fileExists() should return false for non-existent file")

	// Test for directory
	assert.False(t, fileExists("./headlamp_testdata"),
		"fileExists() should return false for directory")
}

//nolint:funlen
func TestBaseURLReplace(t *testing.T) {
	// Create a temporary directory for testing
	tempDir, err := os.MkdirTemp("", "baseurl_test")
	require.NoError(t, err)

	defer os.RemoveAll(tempDir)

	// Create a sample index.html file
	indexContent := []byte(`<!DOCTYPE html>
<html>
<head>
    <script>var headlampBaseUrl = __baseUrl__;</script>
    <link rel="stylesheet" href="./styles.css">
</head>
<body>
    <img src="./image.png">
</body>
</html>`)
	err = os.WriteFile(
		filepath.Join(tempDir,
			"index.html"),
		indexContent,
		0o600)

	require.NoError(t, err)

	// Test cases
	testCases := []struct {
		name           string
		baseURL        string
		expectedOutput string
	}{
		{
			name:    "Empty base URL",
			baseURL: "",
			expectedOutput: `<!DOCTYPE html>
<html>
<head>
    <script>var headlampBaseUrl = '/';</script>
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <img src="/image.png">
</body>
</html>`,
		},
		{
			name:    "Custom base URL",
			baseURL: "/custom",
			expectedOutput: `<!DOCTYPE html>
<html>
<head>
    <script>var headlampBaseUrl = '/custom';</script>
    <link rel="stylesheet" href="/custom/styles.css">
</head>
<body>
    <img src="/custom/image.png">
</body>
</html>`,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			baseURLReplace(tempDir, tc.baseURL)

			// Read the modified index.html
			modifiedContent, err := os.ReadFile(filepath.Join(tempDir, "index.html"))
			require.NoError(t, err)

			assert.Equal(t, tc.expectedOutput, string(modifiedContent))
		})
	}
}

func TestBaseURLReplaceWithCurrentIndexHTMLContentAndRSPackBuild(t *testing.T) {
	// This is the current contents of index.html given the recent changes to support both rsbuild and webpack
	// after the front-end is built, one of the BASE_URL variables will have been replaced with string contents
	// depending on which build system was used. In either case though, if the server knows the base URL,
	// we want to ensure it is used, so headlampBaseUrl will be forced to the value we want
	output := makeBaseURLReplacements([]byte(`
<!DOCTYPE html>
<html>
<head>
    <script>
        __baseUrl__ = '%BASE_URL%<%= BASE_URL %>'.replace('%BASE_' + 'URL%', '').replace('<' + '%= BASE_URL %>', '');
        headlampBaseUrl = __baseUrl__;
    </script>
</head>
</html>
`), "/headlamp")

	assert.Equal(t, string(output), `
<!DOCTYPE html>
<html>
<head>
    <script>
        __baseUrl__ = '%BASE_URL%<%= BASE_URL %>'.replace('%BASE_' + 'URL%', '').replace('<' + '%= BASE_URL %>', '');
        headlampBaseUrl = '/headlamp';
    </script>
</head>
</html>
`)
}

//nolint:funlen
func TestGetOidcCallbackURL(t *testing.T) {
	tests := []struct {
		name           string
		request        *http.Request
		config         *HeadlampConfig
		expectedResult string
	}{
		{
			name: "HTTPS request with no base URL",
			request: &http.Request{
				URL:  &url.URL{Scheme: "https"},
				Host: "example.com",
				TLS:  &tls.ConnectionState{},
			},
			config: &HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{BaseURL: ""},
				},
			},
			expectedResult: "https://example.com/oidc-callback",
		},
		{
			name: "HTTP request with base URL",
			request: &http.Request{
				URL:  &url.URL{Scheme: "http"},
				Host: "example.com",
			},
			config: &HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{BaseURL: "/headlamp"},
				},
			},
			expectedResult: "http://example.com/headlamp/oidc-callback",
		},
		{
			name: "Request with X-Forwarded-Proto header",
			request: &http.Request{
				URL:    &url.URL{},
				Host:   "example.com",
				Header: http.Header{"X-Forwarded-Proto": []string{"https"}},
			},
			config: &HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{BaseURL: ""},
				},
			},
			expectedResult: "https://example.com/oidc-callback",
		},
		{
			name: "Localhost request",
			request: &http.Request{
				URL:  &url.URL{},
				Host: "localhost:8080",
			},
			config: &HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{BaseURL: ""},
				},
			},
			expectedResult: "http://localhost:8080/oidc-callback",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := getOidcCallbackURL(tt.request, tt.config)
			if result != tt.expectedResult {
				t.Errorf("getOidcCallbackURL() = %v, want %v", result, tt.expectedResult)
			}
		})
	}
}

func TestOIDCTokenRefreshMiddleware(t *testing.T) {
	kubeConfigStore := kubeconfig.NewContextStore()
	config := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG:      &headlampconfig.HeadlampCFG{KubeConfigStore: kubeConfigStore},
			Cache:            cache.New[interface{}](),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := config.OIDCTokenRefreshMiddleware(handler)

	// Test case: non-cluster request
	req := httptest.NewRequest("GET", "/non-cluster", nil)
	rec := httptest.NewRecorder()
	middleware.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	// Test case: cluster request without token
	req = httptest.NewRequest("GET", "/clusters/test-cluster", nil)
	rec = httptest.NewRecorder()
	middleware.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestStartHeadlampServer(t *testing.T) {
	// Create a temporary directory for plugins
	tempDir, err := os.MkdirTemp("", "headlamp-test")
	require.NoError(t, err)

	defer os.RemoveAll(tempDir)

	config := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				Port:            8080,
				PluginDir:       tempDir,
				KubeConfigStore: kubeconfig.NewContextStore(),
			},
			Cache:           cache.New[interface{}](),
			TelemetryConfig: GetDefaultTestTelemetryConfig(),
		},
	}

	// Use a channel to signal when the server is ready
	ready := make(chan struct{})

	// Use a goroutine to start the server
	go func() {
		// Signal that the server is about to start
		close(ready)
		StartHeadlampServer(config)
	}()

	// Wait for the server to be ready
	<-ready

	// Give the server a moment to start
	time.Sleep(100 * time.Millisecond)

	// Try to connect to the server
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", "http://localhost:8080/config", nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	client := &http.Client{}

	resp, err := client.Do(req)
	if err == nil {
		defer resp.Body.Close()
	}

	assert.NoError(t, err, "Server should be running and accepting connections")

	// If the server started successfully, we should get a response
	if resp != nil {
		assert.Equal(t, http.StatusOK, resp.StatusCode, "Server should return OK status")
	}
}

func TestStartHeadlampServerTLS(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "headlamp-test")
	require.NoError(t, err)
	defer os.RemoveAll(tempDir)

	cfg := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				Port:            8185,
				PluginDir:       tempDir,
				KubeConfigStore: kubeconfig.NewContextStore(),
				TLSCertPath:     "headlamp_testdata/headlamp.crt",
				TLSKeyPath:      "headlamp_testdata/headlamp.key",
			},
			Cache:           cache.New[interface{}](),
			TelemetryConfig: GetDefaultTestTelemetryConfig(),
		},
	}

	go StartHeadlampServer(cfg)
	time.Sleep(200 * time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pool, err := x509.SystemCertPool()
	if pool == nil {
		pool = x509.NewCertPool()
	}

	require.NoError(t, err)
	crt, err := os.ReadFile("headlamp_testdata/headlamp.crt")
	require.NoError(t, err)
	pool.AppendCertsFromPEM(crt)

	req, err := http.NewRequestWithContext(ctx, "GET", "https://localhost:8185/config", nil)
	require.NoError(t, err)

	resp, err := (&http.Client{
		Transport: &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12, RootCAs: pool}},
	}).Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

//nolint:funlen
func TestHandleClusterHelm(t *testing.T) {
	// Set up test environment
	os.Setenv("HEADLAMP_BACKEND_TOKEN", "test-token")
	defer os.Unsetenv("HEADLAMP_BACKEND_TOKEN")

	config := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG:      &headlampconfig.HeadlampCFG{KubeConfigStore: kubeconfig.NewContextStore()},
			Cache:            cache.New[interface{}](),
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}

	// Add a mock context to the kubeConfigStore
	mockContext := &kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server: "https://test-cluster.example.com",
		},
		AuthInfo: &api.AuthInfo{
			Token: "test-token",
		},
	}

	err := config.KubeConfigStore.AddContext(mockContext)
	require.NoError(t, err, "Failed to add mock context to kubeConfigStore")

	router := mux.NewRouter()
	handleClusterHelm(config, router)

	// Test cases for failed cases
	testCases := []struct {
		name           string
		method         string
		path           string
		token          string
		expectedStatus int
	}{
		{
			"List Releases - Valid Token",
			"GET",
			"/clusters/test-cluster/helm/releases/list",
			"test-token", http.StatusInternalServerError,
		},
		{
			"Install Release - Valid Token",
			"POST",
			"/clusters/test-cluster/helm/release/install",
			"test-token",
			http.StatusBadRequest,
		},
		{
			"Get Release History - Valid Token",
			"GET",
			"/clusters/test-cluster/helm/release/history",
			"test-token",
			http.StatusInternalServerError,
		},
		{
			"List Releases - Invalid Token",
			"GET",
			"/clusters/test-cluster/helm/releases/list",
			"invalid-token",
			http.StatusForbidden,
		},
		{
			"Install Release - No Token",
			"POST",
			"/clusters/test-cluster/helm/release/install",
			"",
			http.StatusForbidden,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			if tc.token != "" {
				req.Header.Set("X-HEADLAMP_BACKEND-TOKEN", tc.token)
			}

			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			assert.Equal(t, tc.expectedStatus, w.Code)
		})
	}
}

// GetDefaultTestTelemetryConfig returns a default telemetry configuration for testing purposes.
func GetDefaultTestTelemetryConfig() config.Config {
	return config.Config{
		ServiceName:        "headlamp-test",
		ServiceVersion:     &[]string{"0.30.0"}[0],
		TracingEnabled:     &[]bool{false}[0],
		MetricsEnabled:     &[]bool{false}[0],
		JaegerEndpoint:     &[]string{""}[0],
		OTLPEndpoint:       &[]string{""}[0],
		UseOTLPHTTP:        &[]bool{false}[0],
		StdoutTraceEnabled: &[]bool{false}[0],
		SamplingRate:       &[]float64{0}[0],
	}
}

//nolint:funlen
func TestProcessWebSocketProtocolHeader(t *testing.T) {
	tests := []struct {
		name                   string
		initialHeader          http.Header
		expectedAuthHeader     string
		expectedProtocolHeader string
	}{
		{
			name:                   "No Sec-Websocket-Protocol header",
			initialHeader:          http.Header{},
			expectedAuthHeader:     "",
			expectedProtocolHeader: "",
		},
		{
			name: "Header with non-token protocols",
			initialHeader: http.Header{
				"Sec-Websocket-Protocol": []string{"test"},
			},
			expectedAuthHeader:     "",
			expectedProtocolHeader: "test",
		},
		{
			name: "Header with single token protocol",
			initialHeader: http.Header{
				"Sec-Websocket-Protocol": []string{"base64url.bearer.authorization.k8s.io.dGVzdC10b2tlbg=="}, // "test-token"
			},
			expectedAuthHeader:     "Bearer test-token",
			expectedProtocolHeader: "",
		},
		{
			name: "Header with single token protocol and raw base64 encoding",
			initialHeader: http.Header{
				"Sec-Websocket-Protocol": []string{"base64url.bearer.authorization.k8s.io.dGVzdC10b2tlbg"}, // "test-token"
			},
			expectedAuthHeader:     "Bearer test-token",
			expectedProtocolHeader: "",
		},
		{
			name: "Header with multiple protocols including token",
			initialHeader: http.Header{
				"Sec-Websocket-Protocol": []string{"test1, base64url.bearer.authorization.k8s.io.dGVzdC10b2tlbg==, test2"},
			},
			expectedAuthHeader:     "Bearer test-token",
			expectedProtocolHeader: "test1, test2",
		},
		{
			name: "Header with token protocol but Authorization already exists",
			initialHeader: http.Header{
				"Sec-Websocket-Protocol": []string{"base64url.bearer.authorization.k8s.io.dGVzdC10b2tlbg=="},
				"Authorization":          []string{"Bearer existing-token"},
			},
			expectedAuthHeader:     "Bearer existing-token",
			expectedProtocolHeader: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.Header = tt.initialHeader

			processWebSocketProtocolHeader(req)

			assert.Equal(t, tt.expectedAuthHeader, req.Header.Get("Authorization"))
			assert.Equal(t, tt.expectedProtocolHeader, req.Header.Get("Sec-Websocket-Protocol"))
		})
	}
}

func TestProcessTokenProtocol(t *testing.T) {
	const tokenPrefix = "base64url.bearer.authorization.k8s.io." // #nosec G101

	tests := []struct {
		name               string
		protocol           string
		initialAuthHeader  string
		expectedAuthHeader string
	}{
		{
			name:               "Valid token, no existing Auth header",
			protocol:           tokenPrefix + "dGVzdC10b2tlbg==", // "test-token"
			initialAuthHeader:  "",
			expectedAuthHeader: "Bearer test-token",
		},
		{
			name:               "Valid token, existing Auth header",
			protocol:           tokenPrefix + "dGVzdC10b2tlbg==",
			initialAuthHeader:  "Bearer existing-token",
			expectedAuthHeader: "Bearer existing-token", // Should not overwrite
		},
		{
			name:               "Empty token in protocol",
			protocol:           tokenPrefix,
			initialAuthHeader:  "",
			expectedAuthHeader: "", // Should not set Auth header
		},
		{
			name:               "Invalid base64 token",
			protocol:           tokenPrefix + "invalid-base64",
			initialAuthHeader:  "",
			expectedAuthHeader: "Bearer invalid-base64", // Uses raw string if decode fails
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			if tt.initialAuthHeader != "" {
				req.Header.Set("Authorization", tt.initialAuthHeader)
			}

			processTokenProtocol(req, tt.protocol, tokenPrefix)

			assert.Equal(t, tt.expectedAuthHeader, req.Header.Get("Authorization"))
		})
	}
}

// newFakeK8sServer create a mock k8s server for testing purpose,
// this would help to test Caching Machanism without making request
// to the k8s server.
func newFakeK8sServer(authAllowed bool) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)

			status := fmt.Sprintf(`{"status":{"allowed":%v}}`, authAllowed)
			_, _ = w.Write([]byte(status))

			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)

		if authAllowed {
			_, _ = w.Write([]byte(`{"kind":"List","apiVersion":"v1","items":[{"metadata":{"name":"resource-test"}}]}`))
		} else {
			_, _ = w.Write([]byte(`{"kind":"Status","apiVersion":"v1","metadata":{"resourceVersion":""},` +
				`"message":"resource is forbidden: User \"system:serviceaccount:default:test\" cannot get resource ` +
				`\"resource\" in API group \"\" at the cluster scope","reason":"Forbidden","details":{"kind":"resource"},` +
				`"code":403}`))
		}
	}))
}

// newHeadlampConfig create mock HeadlampConfig for testing CacheMiddleware
// mechanism without creating actual HeadlampConfig.
func newHeadlampConfig(fakeK8s *httptest.Server, testName string) *HeadlampConfig {
	store := kubeconfig.NewContextStore()

	err := store.AddContext(&kubeconfig.Context{
		ClusterID: fmt.Sprintf("./home/user/kube/config+test-cluster-%s", testName),
		Name:      "test",
		Cluster:   &api.Cluster{Server: fakeK8s.URL},
		AuthInfo:  &api.AuthInfo{Token: "test-token"},
	})
	if err != nil {
		panic(err)
	}

	return &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG:      &headlampconfig.HeadlampCFG{KubeConfigStore: store, CacheEnabled: true},
			TelemetryHandler: &telemetry.RequestHandler{},
			Cache:            cache.New[interface{}](),
		},
	}
}

// stringResponse converts the response from the request into
// string value for comparing results.
func stringResponse(resp *http.Response) (string, error) {
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	bodyString := string(bodyBytes)

	return bodyString, nil
}

// httpRequestWithContext create request by providing context, url and method, and return
// http.Response and error.
func httpRequestWithContext(ctx context.Context, url string, method string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, nil)
	if err != nil {
		return nil, err
	}

	return http.DefaultClient.Do(req)
}

const istrue = true

// TestCacheMiddleware_CacheHitAndCacheMiss test whether the k8s is storing into the cache
// and returns the data if the data is present in the cache.
func TestCacheMiddleware_CacheHitAndCacheMiss(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != strconv.FormatBool(istrue) {
		t.Skip("skipping integration test")
	}

	fakeK8s := newFakeK8sServer(true)
	defer fakeK8s.Close()

	c := newHeadlampConfig(fakeK8s, t.Name())

	ctx := context.Background()

	proxyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Use the incoming request's context
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, fakeK8s.URL+r.URL.Path, nil)
		if err != nil {
			http.Error(w, "failed to create request", http.StatusInternalServerError)
			return
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, "proxy error", http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		_, err = io.Copy(w, resp.Body)
		assert.NoError(t, err)
	})

	// 4. Wrap the proxy handler with the CacheMiddleWare
	router := mux.NewRouter()
	router.PathPrefix("/clusters/{clusterName}/{api:.*}").Handler(
		CacheMiddleWare(c)(proxyHandler))

	ts := httptest.NewServer(router)
	defer ts.Close()

	expectedResponse := `{"kind":"List","apiVersion":"v1","items":[{"metadata":{"name":"resource-test"}}]}`

	resp1, err := httpRequestWithContext(ctx, ts.URL+"/clusters/test/api/v1/resource", "GET")
	assert.NoError(t, err)

	defer resp1.Body.Close()

	resp2, err := httpRequestWithContext(ctx, ts.URL+"/clusters/test/api/v1/resource", "GET")
	assert.NoError(t, err)

	defer resp2.Body.Close()

	resp1String, err := stringResponse(resp1)
	assert.NoError(t, err)
	resp2String, err := stringResponse(resp2)
	assert.NoError(t, err)

	assert.Equal(t, expectedResponse, resp1String)
	assert.Equal(t, "", resp1.Header.Get("X-HEADLAMP-CACHE")) // response is from k8s server, hence X-HEADLAMP-CACHE: ""
	assert.Equal(t, http.StatusOK, resp1.StatusCode)
	assert.Equal(t, expectedResponse, resp2String)
	assert.Equal(t, "true", resp2.Header.Get("X-HEADLAMP-CACHE")) // response is from cache, hence X-HEADLAMP-CACHE: true
	assert.Equal(t, http.StatusOK, resp2.StatusCode)
}

// TestCacheMiddleware_AuthErrorResponse test if the user is not authorized
// to access a resource, CacheMiddleware should return AuthErrorResponse to
// the client without going to k8 server.
func TestCacheMiddleware_AuthErrorResponse(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != strconv.FormatBool(istrue) {
		t.Skip("skipping integration test")
	}

	fakeK8s := newFakeK8sServer(false)
	defer fakeK8s.Close()

	c := newHeadlampConfig(fakeK8s, t.Name())

	proxyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Use the incoming request's context
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, fakeK8s.URL+r.URL.Path, nil)
		if err != nil {
			http.Error(w, "failed to create request", http.StatusInternalServerError)
			return
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, "proxy error", http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		_, err = io.Copy(w, resp.Body)
		assert.NoError(t, err)
	})

	router := mux.NewRouter()
	router.PathPrefix("/clusters/{clusterName}/{api:.*}").Handler(
		CacheMiddleWare(c)(proxyHandler))

	ts := httptest.NewServer(router)
	defer ts.Close()

	ctx := context.Background()

	expectedResponse := `{"kind":"Status","apiVersion":"v1","metadata":{"resourceVersion":""},` +
		`"message":"resource is forbidden: User \"system:serviceaccount:default:test\" cannot get resource ` +
		`\"resource\" in API group \"\" at the cluster scope","reason":"Forbidden","details":{"kind":"resource"},` +
		`"code":403}`

	resp1, err := httpRequestWithContext(ctx, ts.URL+"/clusters/test/api/v1/resource", "GET")
	assert.NoError(t, err)

	defer resp1.Body.Close()

	resp1String, err := stringResponse(resp1)
	assert.NoError(t, err)
	assert.Equal(t, expectedResponse, resp1String) // expected authErroResponse to the client.
	assert.Equal(t, "true", resp1.Header.Get("X-HEADLAMP-CACHE"))
	assert.Equal(t, http.StatusForbidden, resp1.StatusCode)
}

// TestCacheMiddlware_CacheInvalidation test if the request is modifying
// it should delete the keys, making new fresh request to k8s server and store
// into the cache if the request is same it should return response from the client.
func TestCacheMiddleware_CacheInvalidation(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != strconv.FormatBool(istrue) {
		t.Skip("skipping integration test")
	}

	fakeK8s := newFakeK8sServer(true)
	defer fakeK8s.Close()

	c := newHeadlampConfig(fakeK8s, t.Name())

	proxyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Use the incoming request's context
		req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, fakeK8s.URL+r.URL.Path, nil)
		if err != nil {
			http.Error(w, "failed to create request", http.StatusInternalServerError)
			return
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, "proxy error", http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		_, err = io.Copy(w, resp.Body)
		assert.NoError(t, err)
	})

	router := mux.NewRouter()
	router.PathPrefix("/clusters/{clusterName}/{api:.*}").Handler(
		CacheMiddleWare(c)(proxyHandler))

	ts := httptest.NewServer(router)
	defer ts.Close()

	ctx := context.Background()

	expectedResponse := `{"kind":"List","apiVersion":"v1","items":[{"metadata":{"name":"resource-test"}}]}`

	resp, err := httpRequestWithContext(ctx, ts.URL+"/clusters/test/api/v1/resource", "POST")
	assert.NoError(t, err)

	defer resp.Body.Close()

	assert.Equal(t, "", resp.Header.Get("X-HEADLAMP-CACHE"))
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	resp1, err := httpRequestWithContext(ctx, ts.URL+"/clusters/test/api/v1/resource", "GET")
	assert.NoError(t, err)

	defer resp1.Body.Close()

	resp1String, err := stringResponse(resp1)
	assert.NoError(t, err)
	assert.Equal(t, expectedResponse, resp1String)
	assert.Equal(t, "true", resp1.Header.Get("X-HEADLAMP-CACHE"))
	assert.Equal(t, http.StatusOK, resp1.StatusCode)
}

// newRealK8sHeadlampConfig creates a HeadlampConfig for integration tests
// that use a real Kubernetes cluster (e.g. minikube in CI).
// Uses a temp config dir so Headlamp's dynamic clusters file does not overwrite
// the main kubeconfig with stale entries.
//
//nolint:funlen
func newRealK8sHeadlampConfig(t *testing.T) (*HeadlampConfig, string) {
	t.Helper()

	kubeConfigPath := os.Getenv("KUBECONFIG")
	if kubeConfigPath == "" {
		kubeConfigPath = config.GetDefaultKubeConfigPath()
	}

	// KUBECONFIG may be a list of files separated by os.PathListSeparator.
	paths := strings.Split(kubeConfigPath, string(os.PathListSeparator))
	kubeconfigExists := false

	for _, p := range paths {
		if p == "" {
			continue
		}

		if _, err := os.Stat(p); err == nil {
			kubeconfigExists = true
			break
		} else if !os.IsNotExist(err) {
			// For errors other than non-existence, let the loaders handle them;
			// treat this as "exists" so we don't incorrectly skip.
			kubeconfigExists = true
			break
		}
	}

	if !kubeconfigExists {
		t.Skipf("kubeconfig not found at %s, skipping real K8s integration test", kubeConfigPath)
	}

	tempDir, err := os.MkdirTemp("", "headlamp-integration-test")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(tempDir) })

	pluginDir := filepath.Join(tempDir, "plugins")
	userPluginDir := filepath.Join(tempDir, "user-plugins")

	require.NoError(t, os.MkdirAll(pluginDir, 0o755))
	require.NoError(t, os.MkdirAll(userPluginDir, 0o755))

	// Use temp dir as config home so Headlamp's dynamic clusters file
	// (which can have stale minikube entries) does not overwrite the main kubeconfig.
	tempConfigHome := filepath.Join(tempDir, "config-home")
	if runtime.GOOS == "darwin" {
		require.NoError(t, os.MkdirAll(
			filepath.Join(tempConfigHome, "Library", "Application Support", "Headlamp", "kubeconfigs"),
			0o755,
		))
		t.Cleanup(setEnvForTest(t, "HOME", tempConfigHome))
	} else {
		require.NoError(t, os.MkdirAll(filepath.Join(tempConfigHome, "Headlamp", "kubeconfigs"), 0o755))
		t.Cleanup(setEnvForTest(t, "XDG_CONFIG_HOME", tempConfigHome))
	}

	kubeConfigStore := kubeconfig.NewContextStore()
	err = kubeconfig.LoadAndStoreKubeConfigs(kubeConfigStore, kubeConfigPath, kubeconfig.KubeConfig, nil)
	require.NoError(t, err, "failed to load kubeconfig")

	cfg, err := clientcmd.LoadFromFile(kubeConfigPath)
	require.NoError(t, err, "failed to load kubeconfig for current context")

	clusterName := cfg.CurrentContext

	if clusterName == "" {
		clusters := (&HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{KubeConfigStore: kubeConfigStore},
			},
		}).getClusters()
		for _, c := range clusters {
			if c.Error == "" {
				clusterName = c.Name
				break
			}
		}
	}

	if clusterName == "" {
		t.Skip("no current or valid cluster in kubeconfig, skipping real K8s integration test")
	}

	c := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster:    false,
				KubeConfigPath:  kubeConfigPath,
				KubeConfigStore: kubeConfigStore,
				CacheEnabled:    true,
				PluginDir:       pluginDir,
				UserPluginDir:   userPluginDir,
			},
			Cache:            cache.New[interface{}](),
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}

	return c, clusterName
}

// setEnvForTest sets an env var for the test and returns a cleanup that restores it.
func setEnvForTest(t *testing.T, key, value string) func() {
	t.Helper()

	old, had := os.LookupEnv(key)
	require.NoError(t, os.Setenv(key, value))

	return func() {
		if had {
			_ = os.Setenv(key, old)
		} else {
			_ = os.Unsetenv(key)
		}
	}
}

// TestCacheMiddleware_CacheHitAndCacheMiss_RealK8s tests cache hit/miss with a
// real Kubernetes API server (e.g. minikube). Requires HEADLAMP_RUN_INTEGRATION_TESTS=true
// and a running cluster.
func TestCacheMiddleware_CacheHitAndCacheMiss_RealK8s(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != strconv.FormatBool(istrue) {
		t.Skip("skipping integration test")
	}

	c, clusterName := newRealK8sHeadlampConfig(t)
	handler := createHeadlampHandler(c)
	ts := httptest.NewServer(handler)
	t.Cleanup(ts.Close)

	apiPath := "/clusters/" + clusterName + "/api/v1/namespaces/default/pods"
	ctx := context.Background()

	resp1, err := httpRequestWithContext(ctx, ts.URL+apiPath, "GET")
	require.NoError(t, err)
	defer resp1.Body.Close()

	require.Equal(t, http.StatusOK, resp1.StatusCode, "first GET should succeed")
	firstFromCache := resp1.Header.Get("X-HEADLAMP-CACHE")

	resp2, err := httpRequestWithContext(ctx, ts.URL+apiPath, "GET")
	require.NoError(t, err)
	defer resp2.Body.Close()

	require.Equal(t, http.StatusOK, resp2.StatusCode, "second GET should succeed")
	secondFromCache := resp2.Header.Get("X-HEADLAMP-CACHE")

	assert.NotEqual(t, "true", firstFromCache, "first request should not be from cache")
	assert.Equal(t, "true", secondFromCache, "second request should be from cache")
}

// TestCacheMiddleware_CacheInvalidation_RealK8s tests cache invalidation with a
// real Kubernetes API server. Creates a ConfigMap, invalidates via DELETE, then
// verifies the next GET fetches fresh data. Requires HEADLAMP_RUN_INTEGRATION_TESTS=true
// and a running cluster.
//
//nolint:funlen // Integration test requires setup, requests, and assertions in one function
func TestCacheMiddleware_CacheInvalidation_RealK8s(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != strconv.FormatBool(istrue) {
		t.Skip("skipping integration test")
	}

	c, clusterName := newRealK8sHeadlampConfig(t)
	handler := createHeadlampHandler(c)
	ts := httptest.NewServer(handler)
	t.Cleanup(ts.Close)

	cmName := "headlamp-cache-test-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	cmPath := "/clusters/" + clusterName + "/api/v1/namespaces/default/configmaps/" + cmName
	listPath := "/clusters/" + clusterName + "/api/v1/namespaces/default/configmaps"
	ctx := context.Background()

	cmBody := []byte(fmt.Sprintf(
		`{"kind":"ConfigMap","apiVersion":"v1","metadata":{"name":"%s"},"data":{"test":"value"}}`,
		cmName,
	))

	createReq, err := http.NewRequestWithContext(ctx, "POST", ts.URL+listPath, bytes.NewReader(cmBody))
	require.NoError(t, err)
	createReq.Header.Set("Content-Type", "application/json")

	createResp, err := http.DefaultClient.Do(createReq)
	require.NoError(t, err)
	createResp.Body.Close()
	require.Equal(t, http.StatusCreated, createResp.StatusCode, "creating ConfigMap should succeed")

	t.Cleanup(func() {
		delReq, _ := http.NewRequestWithContext(context.Background(), "DELETE", ts.URL+cmPath, nil)
		resp, _ := http.DefaultClient.Do(delReq)

		if resp != nil {
			resp.Body.Close()
		}
	})

	resp1, err := httpRequestWithContext(ctx, ts.URL+cmPath, "GET")
	require.NoError(t, err)

	defer resp1.Body.Close()
	require.Equal(t, http.StatusOK, resp1.StatusCode)

	delResp, err := httpRequestWithContext(ctx, ts.URL+cmPath, "DELETE")
	require.NoError(t, err)
	delResp.Body.Close()
	require.Contains(t, []int{http.StatusOK, http.StatusAccepted}, delResp.StatusCode, "DELETE should succeed")

	// If DELETE returned 202 Accepted (asynchronous), poll until resource is deleted.
	// If it returned 200 OK (synchronous), the resource should be immediately unavailable.
	if delResp.StatusCode == http.StatusAccepted {
		// Poll with timeout for asynchronous deletion
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			resp, err := httpRequestWithContext(ctx, ts.URL+cmPath, "GET")
			if err == nil {
				resp.Body.Close()

				if resp.StatusCode == http.StatusNotFound {
					break
				}
			}

			time.Sleep(500 * time.Millisecond)
		}
	}

	resp2, err := httpRequestWithContext(ctx, ts.URL+cmPath, "GET")
	require.NoError(t, err)
	defer resp2.Body.Close()

	require.Equal(t, http.StatusNotFound, resp2.StatusCode,
		"GET after DELETE should return 404 (cache invalidated)")
}

//nolint:funlen
func TestHandleClusterServiceProxy(t *testing.T) {
	cfg := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG:      &headlampconfig.HeadlampCFG{KubeConfigStore: kubeconfig.NewContextStore()},
			TelemetryHandler: &telemetry.RequestHandler{},
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
		},
	}

	// Backend service the proxy should call
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("OK"))

			return
		}

		http.NotFound(w, r)
	}))
	t.Cleanup(backend.Close)

	// Extract host:port to feed into the Service external name + port
	bu, err := url.Parse(backend.URL)
	require.NoError(t, err)
	host, portStr, err := net.SplitHostPort(strings.TrimPrefix(bu.Host, "["))
	require.NoError(t, err)
	portNum, err := strconv.Atoi(strings.TrimSuffix(portStr, "]"))
	require.NoError(t, err)

	// Fake k8s API that returns a Service pointing to backend
	kubeAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api/v1/namespaces/default/services/my-service" {
			svc := &corev1.Service{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "my-service",
					Namespace: "default",
				},
				Spec: corev1.ServiceSpec{
					ExternalName: host,
					Ports: []corev1.ServicePort{
						{
							Name: "http",
							Port: int32(portNum), //nolint:gosec
						},
					},
				},
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(svc)

			return
		}

		http.NotFound(w, r)
	}))
	t.Cleanup(kubeAPI.Close)

	// Add a context that matches clusterName in URL
	err = cfg.KubeConfigStore.AddContext(&kubeconfig.Context{
		Name: "kubernetes",
		KubeContext: &api.Context{
			Cluster:  "kubernetes",
			AuthInfo: "kubernetes",
		},
		Cluster:  &api.Cluster{Server: kubeAPI.URL}, // client-go will talk to this
		AuthInfo: &api.AuthInfo{},
	})
	require.NoError(t, err)

	router := mux.NewRouter()
	handleClusterServiceProxy(cfg, router)

	cluster := "kubernetes"
	ns := "default"
	svc := "my-service"

	// Case 1: Missing ?request => route doesn't match => 404, no headers set
	{
		req := httptest.NewRequest(http.MethodGet,
			"/clusters/"+cluster+"/serviceproxy/"+ns+"/"+svc, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusNotFound, rr.Code)
		assert.Empty(t, rr.Header().Get("Cache-Control"))
	}

	// Case 2: ?request present but missing Authorization => 401, headers set
	{
		req := httptest.NewRequest(http.MethodGet,
			"/clusters/"+cluster+"/serviceproxy/"+ns+"/"+svc+"?request=/healthz", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		assert.Equal(t, http.StatusUnauthorized, rr.Code)
		assert.Equal(t, "no-cache, private, max-age=0", rr.Header().Get("Cache-Control"))
		assert.Equal(t, "no-cache", rr.Header().Get("Pragma"))
		assert.Equal(t, "0", rr.Header().Get("X-Accel-Expires"))
	}

	// Case 3 (Happy path): ?request present and Authorization provided => proxy reaches backend => 200 OK
	{
		req := httptest.NewRequest(http.MethodGet,
			"/clusters/"+cluster+"/serviceproxy/"+ns+"/"+svc+"?request=/healthz", nil)
		req.Header.Set("Authorization", "Bearer test-token")

		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		// Handler always sets no-cache headers
		assert.Equal(t, "no-cache, private, max-age=0", rr.Header().Get("Cache-Control"))
		assert.Equal(t, "no-cache", rr.Header().Get("Pragma"))
		assert.Equal(t, "0", rr.Header().Get("X-Accel-Expires"))

		// Happy path: backend returns OK
		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Equal(t, "OK", rr.Body.String())
	}
}
