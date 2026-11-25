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

package helm

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/release"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

func TestRepoLifecycleHandlers(t *testing.T) {
	repoSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/x-yaml")
		_, _ = w.Write([]byte("apiVersion: v1\nentries: {}\n"))
	}))
	defer repoSrv.Close()

	h, err := NewHandlerWithSettings(cache.New[interface{}](), newIsolatedEnvSettings(t))
	require.NoError(t, err)

	reqAdd := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		"/helm/repositories",
		bytes.NewBufferString(`{"name":"test-repo","url":"`+repoSrv.URL+`"}`),
	)
	recAdd := httptest.NewRecorder()
	h.AddRepo(recAdd, reqAdd)
	assert.Equal(t, http.StatusOK, recAdd.Code)

	reqList := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/helm/repositories", nil)
	recList := httptest.NewRecorder()
	h.ListRepo(recList, reqList)
	assert.Equal(t, http.StatusOK, recList.Code)
	assert.Contains(t, recList.Body.String(), "test-repo")

	reqUpd := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPut,
		"/helm/repositories/update",
		bytes.NewBufferString(`{"name":"test-repo","url":"`+repoSrv.URL+`"}`),
	)
	recUpd := httptest.NewRecorder()
	h.UpdateRepository(recUpd, reqUpd)
	assert.Equal(t, http.StatusOK, recUpd.Code)

	reqDel := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodDelete,
		"/helm/repositories/remove?name=test-repo",
		nil,
	)
	recDel := httptest.NewRecorder()
	h.RemoveRepo(recDel, reqDel)
	assert.Equal(t, http.StatusOK, recDel.Code)
}

func TestUpgradeReleaseValidationErrors(t *testing.T) {
	h, err := NewHandlerWithSettings(cache.New[interface{}](), newIsolatedEnvSettings(t))
	require.NoError(t, err)

	badCfg := clientcmd.NewDefaultClientConfig(
		clientcmdapi.Config{},
		&clientcmd.ConfigOverrides{CurrentContext: "nonexistent"},
	)

	reqBad := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPut,
		"/helm/releases/upgrade",
		bytes.NewBufferString("{bad"),
	)
	recBad := httptest.NewRecorder()
	h.UpgradeRelease(badCfg, recBad, reqBad)
	assert.Equal(t, http.StatusBadRequest, recBad.Code)

	reqMissing := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPut,
		"/helm/releases/upgrade",
		bytes.NewBufferString(`{}`),
	)
	recMissing := httptest.NewRecorder()
	h.UpgradeRelease(badCfg, recMissing, reqMissing)
	assert.Equal(t, http.StatusBadRequest, recMissing.Code)

	reqBadChart := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPut,
		"/helm/releases/upgrade",
		bytes.NewBufferString(`{"name":"rel","namespace":"ns","description":"d","chart":"../bad","version":"1.0.0"}`),
	)
	recBadChart := httptest.NewRecorder()
	h.UpgradeRelease(badCfg, recBadChart, reqBadChart)
	assert.Equal(t, http.StatusBadRequest, recBadChart.Code)

	reqValidUp := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPut,
		"/helm/releases/upgrade",
		bytes.NewBufferString(`{"name":"rel","namespace":"ns","description":"d","chart":"repo/ch","version":"1.0.0"}`),
	)
	recValidUp := httptest.NewRecorder()
	h.UpgradeRelease(badCfg, recValidUp, reqValidUp)
	assert.Equal(t, http.StatusBadRequest, recValidUp.Code)
}

func TestInstallAndStatusValidationErrors(t *testing.T) {
	h, err := NewHandlerWithSettings(cache.New[interface{}](), newIsolatedEnvSettings(t))
	require.NoError(t, err)

	badCfg := clientcmd.NewDefaultClientConfig(
		clientcmdapi.Config{},
		&clientcmd.ConfigOverrides{CurrentContext: "nonexistent"},
	)

	reqValidInst := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		"/helm/release/install",
		bytes.NewBufferString(`{"name":"rel","namespace":"ns","description":"d","chart":"repo/ch","version":"1.0.0"}`),
	)
	recValidInst := httptest.NewRecorder()
	h.InstallRelease(badCfg, recValidInst, reqValidInst)
	assert.Equal(t, http.StatusBadRequest, recValidInst.Code)

	reqInstallBad := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		"/helm/release/install",
		bytes.NewBufferString(`{bad`),
	)
	recInstallBad := httptest.NewRecorder()
	h.InstallRelease(badCfg, recInstallBad, reqInstallBad)
	assert.Equal(t, http.StatusBadRequest, recInstallBad.Code)

	reqStatusMissing := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodGet,
		"/helm/action/status",
		nil,
	)
	recStatusMissing := httptest.NewRecorder()
	h.GetActionStatus(badCfg, recStatusMissing, reqStatusMissing)
	assert.Equal(t, http.StatusBadRequest, recStatusMissing.Code)
}

func TestActionConfigErrorsAcrossReleaseHandlers(t *testing.T) {
	h, err := NewHandler(cache.New[interface{}]())
	require.NoError(t, err)

	badCfg := clientcmd.NewDefaultClientConfig(
		clientcmdapi.Config{},
		&clientcmd.ConfigOverrides{CurrentContext: "nonexistent"},
	)

	recGet := httptest.NewRecorder()
	h.GetRelease(badCfg, recGet, httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/helm/releases?name=r&namespace=ns", nil,
	))
	assert.Equal(t, http.StatusInternalServerError, recGet.Code)

	recHist := httptest.NewRecorder()
	h.GetReleaseHistory(badCfg, recHist, httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/helm/release/history?name=r&namespace=ns", nil,
	))
	assert.Equal(t, http.StatusInternalServerError, recHist.Code)

	recUninst := httptest.NewRecorder()
	h.UninstallRelease(badCfg, recUninst, httptest.NewRequestWithContext(
		context.Background(), http.MethodDelete, "/helm/releases/uninstall?name=r&namespace=ns", nil,
	))
	assert.Equal(t, http.StatusInternalServerError, recUninst.Code)

	recRoll := httptest.NewRecorder()
	h.RollbackRelease(badCfg, recRoll, httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPut,
		"/helm/releases/rollback",
		bytes.NewBufferString(`{"name":"r","namespace":"ns","revision":1}`),
	))
	assert.Equal(t, http.StatusInternalServerError, recRoll.Code)
}

func TestListReleaseSuccessWithMockK8s(t *testing.T) {
	k8sSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"kind":"SecretList","apiVersion":"v1","items":[]}`))
	}))
	defer k8sSrv.Close()

	h, err := NewHandler(cache.New[interface{}]())
	require.NoError(t, err)

	cfg := clientcmd.NewDefaultClientConfig(clientcmdapi.Config{
		Clusters:  map[string]*clientcmdapi.Cluster{"c1": {Server: k8sSrv.URL}},
		AuthInfos: map[string]*clientcmdapi.AuthInfo{"u1": {Token: "tok"}},
		Contexts:  map[string]*clientcmdapi.Context{"ctx1": {Cluster: "c1", AuthInfo: "u1"}},
	}, &clientcmd.ConfigOverrides{CurrentContext: "ctx1"})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/helm/releases/list", nil)
	rec := httptest.NewRecorder()
	h.ListRelease(cfg, rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), `"releases":[]`)
}

func encodeTestHelmRelease(t *testing.T, name, ns string, version int) string {
	t.Helper()

	rel := &release.Release{
		Name:      name,
		Namespace: ns,
		Version:   version,
		Info:      &release.Info{Status: release.StatusDeployed},
	}
	raw, err := json.Marshal(rel)
	require.NoError(t, err)

	var gzBuf bytes.Buffer

	gz := gzip.NewWriter(&gzBuf)
	_, err = gz.Write(raw)
	require.NoError(t, err)
	require.NoError(t, gz.Close())

	inner := base64.StdEncoding.EncodeToString(gzBuf.Bytes())

	return base64.StdEncoding.EncodeToString([]byte(inner))
}

func TestGetAndHistoryReleaseWithMockK8s(t *testing.T) {
	encoded := encodeTestHelmRelease(t, "my-rel", "default", 1)

	k8sSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		secretJSON := `{"kind":"Secret","apiVersion":"v1","metadata":{"name":"sh.helm.release.v1.my-rel.v1",` +
			`"namespace":"default","labels":{"owner":"helm","name":"my-rel","status":"deployed","version":"1"}},` +
			`"type":"helm.sh/release.v1","data":{"release":"` + encoded + `"}}`

		if r.Method == http.MethodDelete {
			_, _ = w.Write([]byte(`{"kind":"Status","apiVersion":"v1","status":"Success"}`))
			return
		}

		if r.URL.Path == "/api/v1/namespaces/default/secrets/sh.helm.release.v1.my-rel.v1" {
			_, _ = w.Write([]byte(secretJSON))
			return
		}

		_, _ = w.Write([]byte(`{"kind":"SecretList","apiVersion":"v1","items":[` + secretJSON + `]}`))
	}))
	defer k8sSrv.Close()

	h, err := NewHandler(cache.New[interface{}]())
	require.NoError(t, err)

	cfg := clientcmd.NewDefaultClientConfig(clientcmdapi.Config{
		Clusters:  map[string]*clientcmdapi.Cluster{"c1": {Server: k8sSrv.URL}},
		AuthInfos: map[string]*clientcmdapi.AuthInfo{"u1": {Token: "tok"}},
		Contexts:  map[string]*clientcmdapi.Context{"ctx1": {Cluster: "c1", AuthInfo: "u1"}},
	}, &clientcmd.ConfigOverrides{CurrentContext: "ctx1"})

	recGet := httptest.NewRecorder()
	h.GetRelease(cfg, recGet, httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/helm/releases?name=my-rel&namespace=default", nil,
	))
	assert.Equal(t, http.StatusOK, recGet.Code)

	recHist := httptest.NewRecorder()
	h.GetReleaseHistory(cfg, recHist, httptest.NewRequestWithContext(
		context.Background(), http.MethodGet, "/helm/release/history?name=my-rel&namespace=default", nil,
	))
	assert.Equal(t, http.StatusOK, recHist.Code)

	recUninst := httptest.NewRecorder()
	h.UninstallRelease(cfg, recUninst, httptest.NewRequestWithContext(
		context.Background(), http.MethodDelete, "/helm/releases/uninstall?name=my-rel&namespace=default", nil,
	))
	assert.Equal(t, http.StatusAccepted, recUninst.Code)

	require.Eventually(t, func() bool {
		st, err := h.getReleaseStatus("uninstall", "my-rel")
		return err == nil && st.Status == success
	}, 2*time.Second, 20*time.Millisecond)
}
