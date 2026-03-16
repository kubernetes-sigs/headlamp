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

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/portforward"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func getDefaultKubeConfigPath(t *testing.T) string {
	t.Helper()

	currentUser, err := user.Current()
	require.NoError(t, err)

	homeDirectory := currentUser.HomeDir

	return filepath.Join(homeDirectory, ".kube", "config")
}

//nolint:funlen
func TestStartPortForward(t *testing.T) {
	t.Parallel()

	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	ch := cache.New[interface{}]()
	kubeConfigStore := kubeconfig.NewContextStore()
	kubeConfigPath := getDefaultKubeConfigPath(t)
	allContexts, contextLoadErrs, err := kubeconfig.LoadContextsFromFile(kubeConfigPath, kubeconfig.KubeConfig)
	require.NoError(t, err)
	require.NotEmpty(t, allContexts)

	const minikubeName = "minikube"

	var selectedKc *kubeconfig.Context

	for i := range allContexts {
		if allContexts[i].Name == minikubeName {
			selectedKc = &allContexts[i]

			for _, ce := range contextLoadErrs { // Line 81: This 'for' is now un-cuddled from selectedKc assignment
				if ce.ContextName == minikubeName {
					t.Fatalf("Error specifically loading the required '%s' context details: %v", minikubeName, ce.Error)
				}
			}

			break // Line 86: This break is now un-cuddled
		}
	}

	require.NotNil(t, selectedKc, "context named '%s' not found in kubeconfig at %s", minikubeName, kubeConfigPath)

	err = kubeConfigStore.AddContext(selectedKc)
	require.NoError(t, err)

	clientSet, err := selectedKc.ClientSetWithToken("")
	require.NoError(t, err)
	require.NotNil(t, clientSet)

	podList, err := clientSet.CoreV1().Pods("headlamp").List(context.Background(), metav1.ListOptions{})
	require.NoError(t, err)
	require.NotEmpty(t, podList.Items,
		"no pods found in 'headlamp' namespace for cluster '%s'. Ensure test pod is deployed.",
		minikubeName)

	podName := ""
	targetPort := ""

	for _, pod := range podList.Items { // Line 107: This 'for' is now un-cuddled
		if len(pod.Spec.Containers) > 0 && len(pod.Spec.Containers[0].Ports) > 0 {
			podName = pod.Name
			targetPort = fmt.Sprint(pod.Spec.Containers[0].Ports[0].ContainerPort)

			break // Line 113: This break is now un-cuddled
		}
	}

	require.NotEmpty(t, podName, "no suitable pod with exposed ports found in 'headlamp' namespace")
	require.NotEmpty(t, targetPort)

	req := &http.Request{
		Header: make(http.Header),
	}
	resp := httptest.NewRecorder()
	req = mux.SetURLVars(req, map[string]string{"clusterName": minikubeName})

	reqPayload := map[string]interface{}{
		"pod":        podName,
		"namespace":  "headlamp",
		"targetPort": targetPort,
	}

	jsonReq, err := json.Marshal(reqPayload)
	require.NoError(t, err)

	req.Body = io.NopCloser(bytes.NewReader(jsonReq))
	req.Header.Set("Content-Type", "application/json")

	portforward.StartPortForward(kubeConfigStore, ch, resp, req)

	res := resp.Result()
	defer res.Body.Close()

	require.Equal(t, http.StatusOK, res.StatusCode, "StartPortForward API call failed")

	data, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	require.NotEmpty(t, data)
	require.Contains(t, string(data), targetPort)

	var pfRespPayload map[string]interface{}
	err = json.Unmarshal(data, &pfRespPayload)
	require.NoError(t, err)

	portVal, ok := pfRespPayload["port"]
	require.True(t, ok, "'port' field missing in StartPortForward response")
	port, ok := portVal.(string)
	require.True(t, ok, "'port' field is not a string in StartPortForward response")
	require.NotEmpty(t, port, "'port' field is empty in StartPortForward response")

	idVal, ok := pfRespPayload["id"]
	require.True(t, ok, "'id' field missing in StartPortForward response")
	id, ok := idVal.(string)
	require.True(t, ok, "'id' field is not a string in StartPortForward response")
	require.NotEmpty(t, id, "'id' field is empty in StartPortForward response")

	time.Sleep((portforward.PodAvailabilityCheckTimer + 2) * time.Second)

	targetURL := fmt.Sprintf("http://localhost:%s/config", port)
	pfReq, err := http.NewRequestWithContext(context.Background(), http.MethodGet, targetURL, nil)
	require.NoError(t, err)

	httpClient := &http.Client{Timeout: 5 * time.Second}
	pfResp, err := httpClient.Do(pfReq)
	require.NoError(t, err, "failed to connect through port-forward to %s. Port-forward might not be active.", targetURL)

	defer pfResp.Body.Close() // Line 181: This defer is now un-cuddled

	if pfResp.StatusCode != http.StatusOK {
		t.Logf("Warning: Received status %d from forwarded port. "+
			"If using a generic test pod, this might be expected.", pfResp.StatusCode)
	}

	pfRespData, err := io.ReadAll(pfResp.Body)
	require.NoError(t, err)

	if !assert.Contains(t, string(pfRespData), "incluster") {
		t.Logf("Warning: Response from forwarded port did not contain 'incluster'. Content: %s", string(pfRespData))
	}

	stopReq := &http.Request{
		Header: make(http.Header),
	}
	stopResp := httptest.NewRecorder()

	stopReqPayload := map[string]interface{}{
		"id":           id,
		"stopOrDelete": true,
	}

	jsonStopReq, err := json.Marshal(stopReqPayload)
	require.NoError(t, err)

	stopReq.Body = io.NopCloser(bytes.NewReader(jsonStopReq))
	stopReq.Header.Set("Content-Type", "application/json")
	stopReq = mux.SetURLVars(stopReq, map[string]string{"clusterName": minikubeName})

	portforward.StopOrDeletePortForward(ch, stopResp, stopReq)

	stopRes := stopResp.Result()
	defer stopRes.Body.Close()

	stopRespBody, err := io.ReadAll(stopRes.Body)
	require.NoError(t, err)
	require.Contains(t, string(stopRespBody), "stopped")

	cacheKey := "PORT_FORWARD_" + minikubeName + id
	chState, err := ch.Get(context.Background(), cacheKey)
	require.NoError(t, err, "failed to get port-forward state from cache with key %s", cacheKey)

	chData, err := json.Marshal(chState)
	require.NoError(t, err)
	assert.Contains(t, string(chData), "Stopped")

	listReq := &http.Request{
		Header: make(http.Header),
	}
	listResp := httptest.NewRecorder()

	listReq.URL = &url.URL{}
	listReq = mux.SetURLVars(listReq, map[string]string{"clusterName": minikubeName})

	portforward.GetPortForwards(ch, listResp, listReq)

	listRes := listResp.Result()
	defer listRes.Body.Close()
	require.Equal(t, http.StatusOK, listRes.StatusCode)

	listData, err := io.ReadAll(listRes.Body)
	require.NoError(t, err)
	require.NotEmpty(t, listData)

	var pfListRespPayload []map[string]interface{}
	err = json.Unmarshal(listData, &pfListRespPayload)
	require.NoError(t, err)
	assert.NotEmpty(t, pfListRespPayload)

	foundInList := false // Line 261: This assignment is now un-cuddled if necessary

	for _, item := range pfListRespPayload { // This for loop is now un-cuddled if necessary
		itemIDVal, okID := item["id"]
		itemStatusVal, okStatus := item["status"]

		if okID && okStatus { // This if is now un-cuddled if necessary
			itemID, okIDStr := itemIDVal.(string)
			itemStatus, okStatusStr := itemStatusVal.(string)

			if okIDStr && okStatusStr && itemID == id { // This if is now un-cuddled if necessary
				assert.Equal(t, "Stopped", itemStatus)

				foundInList = true // Line 273: This assignment is now un-cuddled

				break // Line 274: This break is now un-cuddled
			}
		}
	}

	assert.True(t, foundInList, "stopped port-forward ID %s not found in list or status not 'Stopped'", id)
	assert.Equal(t, "[", string(listData[0]))

	getReq := &http.Request{
		Header: make(http.Header),
	}
	getResp := httptest.NewRecorder()

	getReq.URL = &url.URL{}
	getReq.URL.RawQuery = "id=" + id
	getReq = mux.SetURLVars(getReq, map[string]string{"clusterName": minikubeName})

	portforward.GetPortForwardByID(ch, getResp, getReq)

	getRes := getResp.Result()
	defer getRes.Body.Close()
	require.Equal(t, http.StatusOK, getRes.StatusCode)

	getData, err := io.ReadAll(getRes.Body)
	require.NoError(t, err)

	var pfRespPayloadByID map[string]interface{}
	err = json.Unmarshal(getData, &pfRespPayloadByID)
	require.NoError(t, err)
	assert.NotEmpty(t, pfRespPayloadByID)
	assert.Equal(t, id, pfRespPayloadByID["id"])

	deleteReq := &http.Request{
		Header: make(http.Header),
	}
	deleteResp := httptest.NewRecorder()

	deleteReqPayload := map[string]interface{}{
		"id":           id,
		"stopOrDelete": false,
	}

	jsonDeleteReq, err := json.Marshal(deleteReqPayload)
	require.NoError(t, err)

	deleteReq.Body = io.NopCloser(bytes.NewReader(jsonDeleteReq))
	deleteReq.Header.Set("Content-Type", "application/json")
	deleteReq = mux.SetURLVars(deleteReq, map[string]string{"clusterName": minikubeName})

	portforward.StopOrDeletePortForward(ch, deleteResp, deleteReq)

	deleteRes := deleteResp.Result()
	defer deleteRes.Body.Close()

	deleteRespBody, err := io.ReadAll(deleteRes.Body)
	require.NoError(t, err)
	require.Contains(t, string(deleteRespBody), "stopped")

	chState, err = ch.Get(context.Background(), cacheKey)
	require.Error(t, err, "port-forward with key %s should be deleted from cache, but Get returned no error", cacheKey)
	require.Nil(t, chState)
}
