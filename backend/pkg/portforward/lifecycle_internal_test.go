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

package portforward

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"
)

func newMockPodClientset(t *testing.T, handler http.HandlerFunc) *kubernetes.Clientset {
	t.Helper()

	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	cs, err := kubernetes.NewForConfig(&rest.Config{Host: srv.URL})
	require.NoError(t, err)

	return cs
}

func TestHandlePodCheckStates(t *testing.T) {
	t.Run("running pod returns false", func(t *testing.T) {
		cs := newMockPodClientset(t, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(&corev1.Pod{
				ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default"},
				Status:     corev1.PodStatus{Phase: corev1.PodRunning},
			})
		})

		pf := &portForward{mu: &sync.Mutex{}, ID: "pf1", Pod: "p1", Namespace: "default", closeChan: make(chan struct{})}
		assert.False(t, handlePodCheck(cs, cache.New[interface{}](), pf, map[string]string{"id": "pf1"}))
	})

	t.Run("ECONNREFUSED continues monitoring", func(t *testing.T) {
		cs, err := kubernetes.NewForConfig(&rest.Config{
			Host:      "http://127.0.0.1:1",
			Transport: roundTripperFunc(func(*http.Request) (*http.Response, error) { return nil, syscall.ECONNREFUSED }),
		})
		require.NoError(t, err)

		pf := &portForward{mu: &sync.Mutex{}, ID: "pf1", Pod: "p1", Namespace: "default", closeChan: make(chan struct{})}
		assert.False(t, handlePodCheck(cs, cache.New[interface{}](), pf, map[string]string{"id": "pf1"}))
	})
}

func TestHandlePodCheckStopAndReconnect(t *testing.T) {
	t.Run("terminating pod without service stops port-forward", func(t *testing.T) {
		now := metav1.Now()
		cs := newMockPodClientset(t, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(&corev1.Pod{
				ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default", DeletionTimestamp: &now},
				Status:     corev1.PodStatus{Phase: corev1.PodRunning},
			})
		})

		pf := &portForward{
			mu:        &sync.Mutex{},
			ID:        "pf1",
			Pod:       "p1",
			Namespace: "default",
			cacheKey:  "c1",
			closeChan: make(chan struct{}),
		}
		c := cache.New[interface{}]()
		assert.True(t, handlePodCheck(cs, c, pf, map[string]string{"id": "pf1"}))
		assert.Equal(t, STOPPED, pf.Status)
		assert.Contains(t, pf.Error, "pod is terminating")
	})
}

func TestHandlePodCheckServiceReconnect(t *testing.T) {
	t.Run("non-running pod with service attempts reconnect and stops on user cancel", func(t *testing.T) {
		cs := newMockPodClientset(t, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(&corev1.Pod{
				ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default"},
				Status:     corev1.PodStatus{Phase: corev1.PodFailed},
			})
		})

		pf := &portForward{
			mu:               &sync.Mutex{},
			ID:               "pf-svc",
			Pod:              "p1",
			Namespace:        "default",
			Service:          "my-svc",
			ServiceNamespace: "default",
			cacheKey:         "c1",
			closeChan:        make(chan struct{}),
		}

		origCh := pf.closeChan
		c := cache.New[interface{}]()
		done := make(chan bool, 1)

		go func() {
			done <- handlePodCheck(cs, c, pf, map[string]string{"id": "pf-svc"})
		}()

		require.Eventually(t, func() bool {
			pf.mu.Lock()
			status := pf.Status
			ch := pf.closeChan
			pf.mu.Unlock()

			if status == RECONNECTING && ch != origCh {
				safeCloseChan(ch)
				return true
			}

			return false
		}, 5*time.Second, 5*time.Millisecond)

		select {
		case res := <-done:
			assert.True(t, res)
		case <-time.After(5 * time.Second):
			t.Fatal("handlePodCheck did not finish in time")
		}

		pf.mu.Lock()
		assert.Equal(t, STOPPED, pf.Status)
		pf.mu.Unlock()
	})
}

func TestMonitorPodAndManagePortForwardCloseChan(t *testing.T) {
	cs := newMockPodClientset(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	pf := &portForward{
		mu:        &sync.Mutex{},
		ID:        "pf-close",
		Pod:       "p1",
		Namespace: "default",
		closeChan: make(chan struct{}),
	}

	done := make(chan struct{})

	go func() {
		monitorPodAndManagePortForward(cs, cache.New[interface{}](), pf)
		close(done)
	}()

	close(pf.closeChan)
	<-done
}

func TestStopAndGetPortForwardsHandlers(t *testing.T) {
	c := cache.New[interface{}]()

	t.Run("StopOrDeletePortForward validation and not found", func(t *testing.T) {
		reqBad := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/", bytes.NewBufferString("{bad"))
		recBad := httptest.NewRecorder()
		StopOrDeletePortForward(c, "ctx1", recBad, reqBad)
		assert.Equal(t, http.StatusBadRequest, recBad.Code)

		reqEmpty := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/", bytes.NewBufferString(`{}`))
		recEmpty := httptest.NewRecorder()
		StopOrDeletePortForward(c, "ctx1", recEmpty, reqEmpty)
		assert.Equal(t, http.StatusBadRequest, recEmpty.Code)

		reqMissing := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodDelete,
			"/",
			bytes.NewBufferString(`{"id":"missing-id","stopOrDelete":true}`),
		)
		recMissing := httptest.NewRecorder()
		StopOrDeletePortForward(c, "ctx1", recMissing, reqMissing)
		assert.Equal(t, http.StatusNotFound, recMissing.Code)
	})

	t.Run("GetPortForwards missing cluster returns 400", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward/list", nil)
		rec := httptest.NewRecorder()
		GetPortForwards(c, "ctx1", rec, req)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("GetPortForwardByID error paths", func(t *testing.T) {
		reqNoCluster := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward", nil)
		recNoCluster := httptest.NewRecorder()
		GetPortForwardByID(c, "ctx1", recNoCluster, reqNoCluster)
		assert.Equal(t, http.StatusBadRequest, recNoCluster.Code)

		reqNoID := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward", nil),
			map[string]string{"clusterName": "c1"},
		)
		recNoID := httptest.NewRecorder()
		GetPortForwardByID(c, "ctx1", recNoID, reqNoID)
		assert.Equal(t, http.StatusBadRequest, recNoID.Code)

		reqNotFound := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward?id=missing", nil),
			map[string]string{"clusterName": "c1"},
		)
		recNotFound := httptest.NewRecorder()
		GetPortForwardByID(c, "ctx1", recNotFound, reqNotFound)
		assert.Equal(t, http.StatusNotFound, recNotFound.Code)
	})
}

func TestStoredPortForwardCRUD(t *testing.T) {
	c := cache.New[interface{}]()

	t.Run("GetPortForwards, GetPortForwardByID, and StopOrDeletePortForward succeed for stored entry", func(t *testing.T) {
		pf := portForward{
			ID: "pf-stored", Pod: "p1", Cluster: "c1", cacheKey: "ctx1",
			Namespace: "default", TargetPort: "80", Port: "8080", Status: RUNNING,
			closeChan: make(chan struct{}), mu: &sync.Mutex{},
		}
		portforwardstore(c, pf)

		reqList := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward/list", nil),
			map[string]string{"clusterName": "c1"},
		)
		recList := httptest.NewRecorder()
		GetPortForwards(c, "ctx1", recList, reqList)
		assert.Equal(t, http.StatusOK, recList.Code)

		reqGet := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward?id=pf-stored", nil),
			map[string]string{"clusterName": "c1"},
		)
		recGet := httptest.NewRecorder()
		GetPortForwardByID(c, "ctx1", recGet, reqGet)
		assert.Equal(t, http.StatusOK, recGet.Code)

		reqStop := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodDelete,
			"/portforward",
			bytes.NewBufferString(`{"id":"pf-stored","stopOrDelete":true}`),
		)
		recStop := httptest.NewRecorder()
		StopOrDeletePortForward(c, "ctx1", recStop, reqStop)
		assert.Equal(t, http.StatusOK, recStop.Code)
	})
}

func TestStoredPortForwardStopAndDelete(t *testing.T) {
	c := cache.New[interface{}]()

	t.Run("stopOrDelete true stops without deleting", func(t *testing.T) {
		stopChan := make(chan struct{})
		pfStop := portForward{
			ID: "pf-stop-only", Pod: "p1", Cluster: "c1", cacheKey: "ctx1",
			Namespace: "default", TargetPort: "80", Port: "8081", Status: RUNNING,
			closeChan: stopChan, mu: &sync.Mutex{},
		}
		portforwardstore(c, pfStop)

		reqStopOnly := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodDelete,
			"/portforward",
			bytes.NewBufferString(`{"id":"pf-stop-only","stopOrDelete":true}`),
		)
		recStopOnly := httptest.NewRecorder()
		StopOrDeletePortForward(c, "ctx1", recStopOnly, reqStopOnly)
		assert.Equal(t, http.StatusOK, recStopOnly.Code)

		select {
		case <-stopChan:
		default:
			t.Fatal("expected stop channel to be closed")
		}

		got, err := getPortForwardByID(c, "ctx1", "pf-stop-only")
		require.NoError(t, err)
		assert.Equal(t, STOPPED, got.Status)
	})

	t.Run("stopOrDelete false deletes entry", func(t *testing.T) {
		delChan := make(chan struct{})
		pfDel := portForward{
			ID: "pf-delete", Pod: "p1", Cluster: "c1", cacheKey: "ctx1",
			Namespace: "default", TargetPort: "80", Port: "8082", Status: RUNNING,
			closeChan: delChan, mu: &sync.Mutex{},
		}
		portforwardstore(c, pfDel)

		reqDelete := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodDelete,
			"/portforward",
			bytes.NewBufferString(`{"id":"pf-delete","stopOrDelete":false}`),
		)
		recDelete := httptest.NewRecorder()
		StopOrDeletePortForward(c, "ctx1", recDelete, reqDelete)
		assert.Equal(t, http.StatusOK, recDelete.Code)

		select {
		case <-delChan:
		default:
			t.Fatal("expected delete channel to be closed")
		}

		_, err := getPortForwardByID(c, "ctx1", "pf-delete")
		require.Error(t, err)
	})
}

func TestStoredPortForwardReconnect(t *testing.T) {
	c := cache.New[interface{}]()

	t.Run("tryReconnectOnce fails when no ready endpoints exist", func(t *testing.T) {
		cs := newMockPodClientset(t, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"kind":"EndpointSliceList","apiVersion":"discovery.k8s.io/v1","items":[]}`))
		})
		pf := &portForward{
			mu: &sync.Mutex{}, ID: "pf-rec", Pod: "p1", Namespace: "default",
			Service: "svc1", ServiceNamespace: "default", closeChan: make(chan struct{}),
		}
		ok, abort := tryReconnectOnce(cs, c, pf, map[string]string{"id": "pf-rec"})
		assert.False(t, ok)
		assert.False(t, abort)

		csReady := newMockPodClientset(t, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")

			body := `{"kind":"EndpointSliceList","apiVersion":"discovery.k8s.io/v1","items":` +
				`[{"endpoints":[{"conditions":{"ready":true},"targetRef":{"kind":"Pod","name":"pod-1","namespace":"ns-1"}}]}]}`
			_, _ = w.Write([]byte(body))
		})
		podName, podNS, err := resolveServicePod(csReady, "default", "svc1")
		require.NoError(t, err)
		assert.Equal(t, "pod-1", podName)
		assert.Equal(t, "ns-1", podNS)
	})
}

func TestStartPortForwardAndRequestHandlerErrors(t *testing.T) {
	t.Run("startPortForward fails on invalid config", func(t *testing.T) {
		kCtx := &kubeconfig.Context{
			Name:        "c1",
			KubeContext: &api.Context{Cluster: "c1", AuthInfo: "u1"},
			Cluster:     &api.Cluster{Server: ""},
		}
		err := startPortForward(kCtx, cache.New[interface{}](), portForwardRequest{
			ID:         "pf1",
			Namespace:  "default",
			Pod:        "pod1",
			Port:       "8080",
			TargetPort: "80",
		}, "", "c1", "c1")
		require.Error(t, err)
	})

	t.Run("RequestHandler missing context returns 404", func(t *testing.T) {
		store := kubeconfig.NewContextStore()
		req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/portforward", nil)
		rec := httptest.NewRecorder()
		RequestHandler(store, cache.New[interface{}](), false, false, "missing", rec, req)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}

func TestStartPortForwardForOwnerErrors(t *testing.T) {
	t.Run("duplicate in-flight returns 409 and RBAC denial returns 500", func(t *testing.T) {
		k8sSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":{"allowed":false}}`))
		}))
		defer k8sSrv.Close()

		kCtx := &kubeconfig.Context{
			Name:        "c1",
			KubeContext: &api.Context{Cluster: "c1", AuthInfo: "u1"},
			Cluster:     &api.Cluster{Server: k8sSrv.URL},
			AuthInfo:    &api.AuthInfo{Token: "tok"},
		}
		body := `{"id":"dup-id","namespace":"default","pod":"pod1","targetPort":"80"}`

		inFlightPortForwards.Store("c1\x00dup-id", struct{}{})

		recDup := httptest.NewRecorder()
		reqDup := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPost,
			"/portforward",
			bytes.NewBufferString(body),
		)
		startPortForwardForOwner(kCtx, cache.New[interface{}](), false, "c1", "c1", recDup, reqDup)
		assert.Equal(t, http.StatusConflict, recDup.Code)
		inFlightPortForwards.Delete("c1\x00dup-id")

		recRBAC := httptest.NewRecorder()
		reqRBAC := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPost,
			"/portforward",
			bytes.NewBufferString(body),
		)
		startPortForwardForOwner(kCtx, cache.New[interface{}](), false, "c1", "c1", recRBAC, reqRBAC)
		assert.Equal(t, http.StatusInternalServerError, recRBAC.Code)

		recUnauth := httptest.NewRecorder()
		reqUnauth := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPost,
			"/portforward",
			bytes.NewBufferString(body),
		)
		reqUnauth.Header.Set("Authorization", "Bearer ")
		startPortForwardForOwner(kCtx, cache.New[interface{}](), false, "c1", "c1", recUnauth, reqUnauth)
		assert.Equal(t, http.StatusUnauthorized, recUnauth.Code)
	})
}
