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

package portforward_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/user"
	"path/filepath"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	corev1client "k8s.io/client-go/kubernetes/typed/core/v1"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/portforward"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func getDefaultKubeConfigPath(t *testing.T) string {
	t.Helper()

	user, err := user.Current()
	require.NoError(t, err)

	homeDirectory := user.HomeDir

	return filepath.Join(homeDirectory, ".kube", "config")
}

// findPodWithPort finds a suitable pod to port-forward to, returning its name and port.
func findPodWithPort(t *testing.T, clientSet interface{}) (podName, targetPort string) {
	namespace := os.Getenv("HEADLAMP_TEST_NAMESPACE")
	if namespace == "" {
		namespace = "headlamp"
	}

	podList, err := clientSet.(interface {
		CoreV1() corev1client.CoreV1Interface
	}).CoreV1().
		Pods(namespace).List(context.Background(), metav1.ListOptions{})
	require.NoError(t, err)
	require.NotEmpty(t, podList.Items)

	// Select the pod and make sure it has a port to forward to
	for _, pod := range podList.Items {
		if len(pod.Spec.Containers) > 0 && len(pod.Spec.Containers[0].Ports) > 0 {
			return pod.Name, fmt.Sprint(pod.Spec.Containers[0].Ports[0].ContainerPort)
		}
	}

	return "", ""
}

// makeJSONRequest creates an HTTP request with the given payload.
func makeJSONRequest(payload map[string]interface{}) *http.Request {
	jsonData, _ := json.Marshal(payload)
	req := &http.Request{Header: make(http.Header)}
	req.Body = io.NopCloser(bytes.NewReader(jsonData))
	req.Header.Set("Content-Type", "application/json")

	return req
}

// TestStartPortForward runs tests for the StartPortForward function.
func TestStartPortForward(t *testing.T) {
	t.Parallel()

	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	// Create cache and kubeconfig store
	ch := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()

	// Setup kubeconfig
	kubeConfigPath := getDefaultKubeConfigPath(t)
	kContexts, contextErrors, err := kubeconfig.LoadContextsFromFile(kubeConfigPath, kubeconfig.KubeConfig)
	require.NoError(t, err)
	require.Empty(t, contextErrors)
	require.NotEmpty(t, kContexts)

	kc := kContexts[0]
	err = kubeConfigStore.AddContext(&kc)
	require.NoError(t, err)

	// Find a pod to portforward to
	clientSet, err := kc.ClientSetWithToken("")
	require.NoError(t, err)
	require.NotNil(t, clientSet)

	podName, targetPort := findPodWithPort(t, clientSet)
	require.NotEmpty(t, podName)
	require.NotEmpty(t, targetPort)

	const clusterName = "minikube"

	const namespace = "headlamp"

	const waitTime = 7 * time.Second

	// Execute test steps in separate functions to reduce main function length
	pfID, port := testStartPortForward(t, kubeConfigStore, ch, clusterName, namespace, podName, targetPort)
	cacheKey := "PORT_FORWARD_" + clusterName + pfID

	// Allow time for pod uptime check
	time.Sleep(waitTime)

	testVerifyPortForward(t, port)
	testStopPortForward(t, ch, clusterName, pfID, cacheKey)
	testListPortForwards(t, ch, clusterName, pfID)
	testGetPortForwardByID(t, ch, clusterName, pfID)
	testDeletePortForward(t, ch, clusterName, pfID, cacheKey)
}

// testStartPortForward tests starting a port forward.
func testStartPortForward(
	t *testing.T,
	kubeConfigStore kubeconfig.ContextStore,
	ch cache.Cache[interface{}],
	clusterName, namespace, podName, targetPort string,
) (pfID, port string) {
	t.Helper()

	startReq := makeJSONRequest(map[string]interface{}{
		"cluster":    clusterName,
		"pod":        podName,
		"namespace":  namespace,
		"targetPort": targetPort,
	})
	startResp := httptest.NewRecorder()

	portforward.StartPortForward(kubeConfigStore, ch, startResp, startReq)

	startResult := startResp.Result()
	defer startResult.Body.Close()

	require.Equal(t, http.StatusOK, startResult.StatusCode)

	data, err := io.ReadAll(startResult.Body)
	require.NoError(t, err)
	require.Contains(t, string(data), targetPort)

	var pfResponse map[string]interface{}
	err = json.Unmarshal(data, &pfResponse)
	require.NoError(t, err)

	return pfResponse["id"].(string), pfResponse["port"].(string)
}

// testVerifyPortForward verifies that the port forward is working.
func testVerifyPortForward(t *testing.T, port string) {
	t.Helper()

	verifyReq, err := http.NewRequestWithContext(
		context.Background(),
		"GET",
		fmt.Sprintf("http://localhost:%s/config", port),
		nil,
	)
	require.NoError(t, err)

	verifyResp, err := http.DefaultClient.Do(verifyReq)
	require.NoError(t, err)
	defer verifyResp.Body.Close()

	require.Equal(t, http.StatusOK, verifyResp.StatusCode)

	verifyData, err := io.ReadAll(verifyResp.Body)
	require.NoError(t, err)
	assert.Contains(t, string(verifyData), "incluster")
}

// testStopPortForward tests stopping a port forward.
func testStopPortForward(t *testing.T, ch cache.Cache[interface{}], clusterName, pfID, cacheKey string) {
	t.Helper()

	stopReq := makeJSONRequest(map[string]interface{}{
		"cluster":      clusterName,
		"id":           pfID,
		"stopOrDelete": true,
	})
	stopResp := httptest.NewRecorder()

	portforward.StopOrDeletePortForward(ch, stopResp, stopReq)

	stopResult := stopResp.Result()
	defer stopResult.Body.Close()

	stopData, err := io.ReadAll(stopResult.Body)
	require.NoError(t, err)
	require.Contains(t, string(stopData), "stopped")

	// Check if portforward is stopped in cache
	chState, err := ch.Get(context.Background(), cacheKey)
	require.NoError(t, err)

	chData, err := json.Marshal(chState)
	require.NoError(t, err)
	assert.Contains(t, string(chData), "Stopped")
}

// testListPortForwards tests listing port forwards.
func testListPortForwards(t *testing.T, ch cache.Cache[interface{}], clusterName, pfID string) {
	t.Helper()

	listReq := &http.Request{
		Header: make(http.Header),
		URL:    &url.URL{RawQuery: "cluster=" + clusterName},
	}
	listResp := httptest.NewRecorder()

	portforward.GetPortForwards(ch, listResp, listReq)

	listResult := listResp.Result()
	defer listResult.Body.Close()

	require.Equal(t, http.StatusOK, listResult.StatusCode)

	listData, err := io.ReadAll(listResult.Body)
	require.NoError(t, err)

	var pfList []map[string]interface{}
	err = json.Unmarshal(listData, &pfList)
	require.NoError(t, err)

	assert.NotEmpty(t, pfList)
	assert.Contains(t, pfList[0]["id"], pfID)
	assert.Contains(t, pfList[0]["status"], "Stopped")
}

// testGetPortForwardByID tests getting a port forward by ID.
func testGetPortForwardByID(t *testing.T, ch cache.Cache[interface{}], clusterName, pfID string) {
	t.Helper()

	getReq := &http.Request{
		Header: make(http.Header),
		URL:    &url.URL{RawQuery: "cluster=" + clusterName + "&id=" + pfID},
	}
	getResp := httptest.NewRecorder()

	portforward.GetPortForwardByID(ch, getResp, getReq)

	getResult := getResp.Result()
	defer getResult.Body.Close()

	require.Equal(t, http.StatusOK, getResult.StatusCode)

	getData, err := io.ReadAll(getResult.Body)
	require.NoError(t, err)

	var pfData map[string]interface{}
	err = json.Unmarshal(getData, &pfData)
	require.NoError(t, err)

	assert.NotEmpty(t, pfData)
	assert.Contains(t, pfData["id"], pfID)
}

// testDeletePortForward tests deleting a port forward.
func testDeletePortForward(t *testing.T, ch cache.Cache[interface{}], clusterName, pfID, cacheKey string) {
	t.Helper()

	deleteReq := makeJSONRequest(map[string]interface{}{
		"cluster":      clusterName,
		"id":           pfID,
		"stopOrDelete": false,
	})
	deleteResp := httptest.NewRecorder()

	portforward.StopOrDeletePortForward(ch, deleteResp, deleteReq)

	deleteResult := deleteResp.Result()
	defer deleteResult.Body.Close()

	deleteData, err := io.ReadAll(deleteResult.Body)
	require.NoError(t, err)
	require.Contains(t, string(deleteData), "stopped")

	// Verify port forward was deleted
	chState, err := ch.Get(context.Background(), cacheKey)
	require.Error(t, err)
	require.Nil(t, chState)
}
