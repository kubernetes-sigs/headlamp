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
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/chartutil"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/getter"
	kubefake "helm.sh/helm/v3/pkg/kube/fake"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/repo"
	"helm.sh/helm/v3/pkg/storage"
	"helm.sh/helm/v3/pkg/storage/driver"
	helmtime "helm.sh/helm/v3/pkg/time"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/cli-runtime/pkg/genericclioptions"
	"k8s.io/client-go/discovery"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// unauthorizedRESTGetter mirrors the staticRESTGetter fake used by TestVerifyUser
// in release_test.go: its empty host makes the whoami check performed by
// VerifyUser fail, simulating an unauthorized/anonymous user.
type unauthorizedRESTGetter struct{}

var _ genericclioptions.RESTClientGetter = (*unauthorizedRESTGetter)(nil)

func (u *unauthorizedRESTGetter) ToRESTConfig() (*rest.Config, error) {
	return &rest.Config{Host: ""}, nil
}

func (u *unauthorizedRESTGetter) ToDiscoveryClient() (discovery.CachedDiscoveryInterface, error) {
	return nil, nil
}

func (u *unauthorizedRESTGetter) ToRESTMapper() (meta.RESTMapper, error) {
	return nil, nil
}

func (u *unauthorizedRESTGetter) ToRawKubeConfigLoader() clientcmd.ClientConfig {
	return nil
}

func TestGetActionStatus_NilErr(t *testing.T) {
	h := &Handler{
		Cache: cache.New[interface{}](),
	}

	// Set a failed status in the cache with a nil Err pointer
	statusVal := stat{
		Status: "failed",
		Err:    nil,
	}
	err := h.Cache.Set(context.Background(), "helm_install_test-release", statusVal)
	require.NoError(t, err)

	url := "/clusters/minikube/helm/releases/status?action=install&name=test-release"
	req, err := http.NewRequestWithContext(context.Background(), "GET", url, nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()

	// GetActionStatus panics if it dereferences a nil pointer.
	// This call should not panic.
	h.GetActionStatus(nil, rr, req)

	assert.Equal(t, http.StatusAccepted, rr.Code)

	// The response should indicate "unknown error"
	assert.Contains(t, rr.Body.String(), "action failed with error: unknown error")
}

func TestGetActionStatusErrors(t *testing.T) {
	h := &Handler{Cache: cache.New[interface{}]()}
	tests := []struct {
		name       string
		query      string
		wantStatus int
		wantError  string
	}{
		{
			name:       "unknown query parameter",
			query:      "action=install&name=test-release&unexpected=value",
			wantStatus: http.StatusBadRequest,
			wantError:  `invalid path "unexpected"`,
		},
		{
			name:       "missing release name",
			query:      "action=install",
			wantStatus: http.StatusBadRequest,
			wantError:  "'Name' failed on the 'required' tag",
		},
		{
			name:       "missing action",
			query:      "name=test-release",
			wantStatus: http.StatusBadRequest,
			wantError:  "'Action' failed on the 'required' tag",
		},
		{
			name:       "unsupported action",
			query:      "action=delete&name=test-release",
			wantStatus: http.StatusBadRequest,
			wantError:  "invalid action",
		},
		{
			name:       "missing cached status",
			query:      "action=install&name=missing-release",
			wantStatus: http.StatusInternalServerError,
			wantError:  "key not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(context.Background(),
				http.MethodGet, "/helm/releases/status?"+tt.query, nil)
			rr := httptest.NewRecorder()

			h.GetActionStatus(nil, rr, req)

			assert.Equal(t, tt.wantStatus, rr.Code)
			assert.Contains(t, rr.Body.String(), tt.wantError)
		})
	}
}

func TestGetChart_InvalidType(t *testing.T) {
	h := &Handler{
		Cache:       cache.New[interface{}](),
		EnvSettings: cli.New(),
	}

	// Create a temp directory for the fake chart
	chartDir := t.TempDir()
	chartYaml := filepath.Join(chartDir, "Chart.yaml")

	chartContent := []byte("apiVersion: v2\nname: test-lib\nversion: 1.0.0\ntype: library\n")
	err := os.WriteFile(chartYaml, chartContent, 0o600)
	require.NoError(t, err)

	opts := action.ChartPathOptions{}
	loadedChart, err := h.getChart("install", chartDir, "test-release", opts, false, h.EnvSettings)

	assert.Nil(t, loadedChart)
	require.Error(t, err)
	assert.Equal(t, "chart type \"library\" is not installable", err.Error())

	// Verify that the failed status was logged to the cache
	statusVal, err := h.Cache.Get(context.Background(), "helm_install_test-release")
	require.NoError(t, err)

	statusMap := statusVal.(stat)
	assert.Equal(t, "failed", statusMap.Status)
	assert.NotNil(t, statusMap.Err)
	assert.Contains(t, *statusMap.Err, "chart type \"library\" is not installable")
}

func TestReleaseExists(t *testing.T) {
	actionConfig := &action.Configuration{Releases: storage.Init(driver.NewMemory())}

	for name, status := range map[string]release.Status{
		"deployed-release":        release.StatusDeployed,
		"failed-release":          release.StatusFailed,
		"pending-upgrade-release": release.StatusPendingUpgrade,
	} {
		require.NoError(t, actionConfig.Releases.Create(&release.Release{
			Name:      name,
			Namespace: "default",
			Version:   1,
			Info:      &release.Info{Status: status},
		}))
	}

	tests := []struct {
		name        string
		releaseName string
		wantErr     error
	}{
		{name: "deployed release", releaseName: "deployed-release"},
		{name: "failed release", releaseName: "failed-release"},
		{name: "pending release", releaseName: "pending-upgrade-release"},
		{name: "missing release", releaseName: "missing-release", wantErr: driver.ErrReleaseNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := releaseExists(actionConfig, tt.releaseName)
			if tt.wantErr != nil {
				assert.ErrorIs(t, err, tt.wantErr)
				return
			}

			assert.NoError(t, err)
		})
	}
}

func newReleaseListActionConfig(t *testing.T) *action.Configuration {
	t.Helper()

	actionConfig := &action.Configuration{
		Releases:   storage.Init(driver.NewMemory()),
		KubeClient: &kubefake.PrintingKubeClient{Out: io.Discard},
	}
	fixtures := []struct {
		name   string
		status release.Status
	}{
		{"alpha", release.StatusDeployed},
		{"bravo", release.StatusFailed},
		{"charlie", release.StatusUninstalled},
		{"delta", release.StatusSuperseded},
		{"echo", release.StatusUninstalling},
		{"foxtrot", release.StatusPendingInstall},
		{"golf", release.StatusPendingUpgrade},
		{"hotel", release.StatusPendingRollback},
	}
	deployedAt := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	for i, fixture := range fixtures {
		require.NoError(t, actionConfig.Releases.Create(&release.Release{
			Name:      fixture.name,
			Namespace: "default",
			Version:   1,
			Info: &release.Info{
				Status:       fixture.status,
				LastDeployed: helmtime.Time{Time: deployedAt.Add(-time.Duration(i) * time.Hour)},
			},
		}))
	}

	return actionConfig
}

func TestGetReleasesDefaults(t *testing.T) {
	actionConfig := newReleaseListActionConfig(t)
	tests := []struct {
		name    string
		request ListReleaseRequest
		want    []string
	}{
		{
			name: "default deployed and failed releases",
			want: []string{"alpha", "bravo"},
		},
		{
			name: "false flags and nonpositive pagination preserve defaults",
			request: ListReleaseRequest{
				All: new(false), Deployed: new(false), Pending: new(false),
				Limit: new(0), Offset: new(-1), Filter: new(""),
			},
			want: []string{"alpha", "bravo"},
		},
		{
			name:    "all overrides individual status flags",
			request: ListReleaseRequest{All: new(true), Deployed: new(true)},
			want:    []string{"alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			releases, err := getReleases(tt.request, actionConfig)
			require.NoError(t, err)

			names := make([]string, 0, len(releases))
			for _, rel := range releases {
				names = append(names, rel.Name)
			}

			assert.Equal(t, tt.want, names)
		})
	}
}

func TestGetReleasesStatusFilters(t *testing.T) {
	actionConfig := newReleaseListActionConfig(t)
	tests := []struct {
		name    string
		request ListReleaseRequest
		want    []string
	}{
		{
			name:    "deployed only",
			request: ListReleaseRequest{Deployed: new(true)},
			want:    []string{"alpha"},
		},
		{
			name:    "failed only",
			request: ListReleaseRequest{Failed: new(true)},
			want:    []string{"bravo"},
		},
		{
			name:    "uninstalled only",
			request: ListReleaseRequest{Uninstalled: new(true)},
			want:    []string{"charlie"},
		},
		{
			name:    "superseded only",
			request: ListReleaseRequest{Superseded: new(true)},
			want:    []string{"delta"},
		},
		{
			name:    "uninstalling only",
			request: ListReleaseRequest{Uninstalling: new(true)},
			want:    []string{"echo"},
		},
		{
			name:    "pending includes install upgrade and rollback",
			request: ListReleaseRequest{Pending: new(true)},
			want:    []string{"foxtrot", "golf", "hotel"},
		},
		{
			name:    "status flags combine",
			request: ListReleaseRequest{Deployed: new(true), Pending: new(true)},
			want:    []string{"alpha", "foxtrot", "golf", "hotel"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			releases, err := getReleases(tt.request, actionConfig)
			require.NoError(t, err)

			names := make([]string, 0, len(releases))
			for _, rel := range releases {
				names = append(names, rel.Name)
			}

			assert.Equal(t, tt.want, names)
		})
	}
}

func TestGetReleasesQueryOptions(t *testing.T) {
	actionConfig := newReleaseListActionConfig(t)
	tests := []struct {
		name    string
		request ListReleaseRequest
		want    []string
	}{
		{
			name:    "release name regular expression",
			request: ListReleaseRequest{Filter: new("^br")},
			want:    []string{"bravo"},
		},
		{
			name:    "no matching releases",
			request: ListReleaseRequest{Filter: new("^missing$")},
			want:    []string{},
		},
		{
			name:    "date sorting precedes pagination",
			request: ListReleaseRequest{ByDate: new(true), Limit: new(1)},
			want:    []string{"bravo"},
		},
		{
			name:    "name sorting with limit and offset",
			request: ListReleaseRequest{All: new(true), Limit: new(2), Offset: new(1)},
			want:    []string{"bravo", "charlie"},
		},
		{
			name:    "offset beyond results",
			request: ListReleaseRequest{Offset: new(10)},
			want:    []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			releases, err := getReleases(tt.request, actionConfig)
			require.NoError(t, err)

			names := make([]string, 0, len(releases))
			for _, rel := range releases {
				names = append(names, rel.Name)
			}

			assert.Equal(t, tt.want, names)
		})
	}
}

func TestGetReleasesInvalidFilter(t *testing.T) {
	actionConfig := newReleaseListActionConfig(t)

	_, err := getReleases(ListReleaseRequest{Filter: new("[")}, actionConfig)
	require.ErrorContains(t, err, "error parsing regexp")
}

// apiServerConfig points a client config at a fake Kubernetes API server that
// answers every request with the given status and JSON body.
func apiServerConfig(t *testing.T, status int, body string) clientcmd.ClientConfig {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)

	return clientConfigFor(srv.URL)
}

// clientConfigFor returns a client config for the API server at url.
func clientConfigFor(url string) clientcmd.ClientConfig {
	return clientcmd.NewDefaultClientConfig(api.Config{
		Clusters:       map[string]*api.Cluster{"fake": {Server: url}},
		AuthInfos:      map[string]*api.AuthInfo{"fake": {}},
		Contexts:       map[string]*api.Context{"fake": {Cluster: "fake", AuthInfo: "fake"}},
		CurrentContext: "fake",
	}, &clientcmd.ConfigOverrides{})
}

func TestReleaseLookupErrorStatus(t *testing.T) {
	// The upgrade route only accepts charts from a registered repository, so register "repo".
	h := newChartRefHandler(t, "repo")
	h.Cache = cache.New[interface{}]()
	query := "?name=test-release&namespace=default"
	routes := []struct {
		name, method, target, body string
		serve                      func(clientcmd.ClientConfig, http.ResponseWriter, *http.Request)
	}{
		{"get", http.MethodGet, "/helm/releases" + query, "", h.GetRelease},
		{"history", http.MethodGet, "/helm/release/history" + query, "", h.GetReleaseHistory},
		{"uninstall", http.MethodDelete, "/helm/releases/uninstall" + query, "", h.UninstallRelease},
		{
			"rollback", http.MethodPut, "/helm/releases/rollback",
			`{"name":"test-release","namespace":"default","revision":1}`, h.RollbackRelease,
		},
		{
			"upgrade", http.MethodPut, "/helm/releases",
			`{"name":"test-release","namespace":"default","description":"d","chart":"repo/c","version":"1.0.0"}`,
			h.UpgradeRelease,
		},
	}
	answers := []struct {
		name       string
		status     int
		body       string
		wantStatus int
	}{
		{
			"missing release", http.StatusOK,
			`{"kind":"SecretList","apiVersion":"v1","metadata":{},"items":[]}`, http.StatusNotFound,
		},
		{
			"forbidden", http.StatusForbidden,
			`{"kind":"Status","apiVersion":"v1","status":"Failure","reason":"Forbidden","code":403}`, http.StatusForbidden,
		},
		{
			"server error", http.StatusInternalServerError,
			`{"kind":"Status","apiVersion":"v1","status":"Failure","reason":"InternalError","code":500}`,
			http.StatusInternalServerError,
		},
	}

	for _, answer := range answers {
		clientConfig := apiServerConfig(t, answer.status, answer.body)

		for _, route := range routes {
			t.Run(answer.name+"/"+route.name, func(t *testing.T) {
				req := httptest.NewRequestWithContext(context.Background(),
					route.method, route.target, strings.NewReader(route.body))
				rr := httptest.NewRecorder()

				route.serve(clientConfig, rr, req)

				assert.Equal(t, answer.wantStatus, rr.Code)
			})
		}
	}
}

func TestVerifyUserTimesOut(t *testing.T) {
	defaultTimeout := verifyUserTimeout
	verifyUserTimeout = 100 * time.Millisecond

	t.Cleanup(func() { verifyUserTimeout = defaultTimeout })

	// The fake API server stalls well past the timeout before it answers.
	done := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-done:
		case <-time.After(3 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	t.Cleanup(func() { close(done) })

	actionConfig, err := NewActionConfig(clientConfigFor(srv.URL), "default")
	require.NoError(t, err)

	start := time.Now()

	assert.False(t, VerifyUser(actionConfig, InstallRequest{}))
	assert.Less(t, time.Since(start), 2*time.Second)
}

func TestDecodeGetReleaseHistoryRequest(t *testing.T) {
	for _, query := range []string{
		"name=my-release&namespace=default",
		"namespace=%64efault&name=%6dy-release",
	} {
		t.Run(query, func(t *testing.T) {
			r := httptest.NewRequestWithContext(context.Background(),
				http.MethodGet, "/helm/release/history?"+query, nil)

			req, err := decodeGetReleaseHistoryRequest(r)

			require.NoError(t, err)
			assert.Equal(t, GetReleaseHistoryRequest{Name: "my-release", Namespace: "default"}, req)
		})
	}
}

func TestGetReleaseHistorySuccess(t *testing.T) {
	client := k8sfake.NewClientset()
	releases := storage.Init(driver.NewSecrets(client.CoreV1().Secrets("default")))
	rel := &release.Release{
		Name:      "my-release",
		Namespace: "default",
		Version:   1,
		Info:      &release.Info{Status: release.StatusDeployed},
	}
	require.NoError(t, releases.Create(rel))

	secrets, err := client.CoreV1().Secrets("default").List(context.Background(), metav1.ListOptions{})
	require.NoError(t, err)
	body, err := json.Marshal(secrets)
	require.NoError(t, err)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/version":
			_, _ = w.Write([]byte(`{"gitVersion":"v1.34.0"}`))
		case "/api/v1/namespaces/default/secrets":
			assert.Equal(t, "name=my-release,owner=helm", r.URL.Query().Get("labelSelector"))

			_, _ = w.Write(body)
		default:
			t.Errorf("unexpected Kubernetes API request: %s %s", r.Method, r.URL)
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	r := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
		"/helm/release/history?name=my-release&namespace=default", nil)
	rr := httptest.NewRecorder()
	h := &Handler{}

	h.GetReleaseHistory(clientConfigFor(srv.URL), rr, r)

	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))

	var response GetReleaseHistoryResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &response))
	require.Len(t, response.Releases, 1)
	assert.Equal(t, rel.Name, response.Releases[0].Name)
	assert.Equal(t, rel.Namespace, response.Releases[0].Namespace)
	assert.Equal(t, rel.Version, response.Releases[0].Version)
}

func TestGetReleaseHistory_Validation(t *testing.T) {
	h := &Handler{}

	tests := []struct {
		name       string
		url        string
		wantStatus int
	}{
		{
			name:       "missing both name and namespace",
			url:        "/clusters/minikube/helm/releases/history",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing namespace",
			url:        "/clusters/minikube/helm/releases/history?name=my-release",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "missing name",
			url:        "/clusters/minikube/helm/releases/history?namespace=default",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "empty name and namespace",
			url:        "/clusters/minikube/helm/releases/history?name=&namespace=",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "empty name",
			url:        "/clusters/minikube/helm/releases/history?name=&namespace=default",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "empty namespace",
			url:        "/clusters/minikube/helm/releases/history?name=my-release&namespace=",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "unknown query parameter",
			url:        "/clusters/minikube/helm/releases/history?name=my-release&namespace=default&unexpected=value",
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, tt.url, nil)
			require.NoError(t, err)

			rr := httptest.NewRecorder()
			h.GetReleaseHistory(nil, rr, req)

			assert.Equal(t, tt.wantStatus, rr.Code)
		})
	}
}

func writeK8sError(w http.ResponseWriter, err error) {
	var statusErr apierrors.APIStatus
	if errors.As(err, &statusErr) {
		st := statusErr.Status()
		if st.APIVersion == "" {
			st.APIVersion = "v1"
		}

		if st.Kind == "" {
			st.Kind = "Status"
		}

		code := int(st.Code)
		if code == 0 {
			code = http.StatusInternalServerError
		}

		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(&st)

		return
	}

	http.Error(w, err.Error(), http.StatusInternalServerError)
}

func writeJSONOrK8sError(w http.ResponseWriter, statusCode int, val any, err error) {
	if err != nil {
		writeK8sError(w, err)
		return
	}

	if statusCode != http.StatusOK {
		w.WriteHeader(statusCode)
	}

	_ = json.NewEncoder(w).Encode(val)
}

func decodeSecretBody(w http.ResponseWriter, r *http.Request) (*corev1.Secret, bool) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return nil, false
	}

	var sec corev1.Secret
	if _, _, err := scheme.Codecs.UniversalDeserializer().Decode(body, nil, &sec); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return nil, false
	}

	return &sec, true
}

func handleFakeSecretRequest(w http.ResponseWriter, r *http.Request, client *k8sfake.Clientset) {
	secrets := client.CoreV1().Secrets("default")
	name := strings.TrimPrefix(r.URL.Path, "/api/v1/namespaces/default/secrets/")

	switch r.Method {
	case http.MethodGet:
		if r.URL.Path == "/api/v1/secrets" || r.URL.Path == "/api/v1/namespaces/default/secrets" {
			filtered, err := secrets.List(r.Context(),
				metav1.ListOptions{LabelSelector: r.URL.Query().Get("labelSelector")})
			writeJSONOrK8sError(w, http.StatusOK, filtered, err)

			return
		}

		got, err := secrets.Get(r.Context(), name, metav1.GetOptions{})
		writeJSONOrK8sError(w, http.StatusOK, got, err)
	case http.MethodPost:
		sec, ok := decodeSecretBody(w, r)
		if !ok {
			return
		}

		created, err := secrets.Create(r.Context(), sec, metav1.CreateOptions{})
		writeJSONOrK8sError(w, http.StatusCreated, created, err)
	case http.MethodPut:
		sec, ok := decodeSecretBody(w, r)
		if !ok {
			return
		}

		if sec.Name == "" {
			sec.Name = name
		}

		updated, err := secrets.Update(r.Context(), sec, metav1.UpdateOptions{})
		writeJSONOrK8sError(w, http.StatusOK, updated, err)
	case http.MethodDelete:
		err := secrets.Delete(r.Context(), name, metav1.DeleteOptions{})
		writeJSONOrK8sError(w, http.StatusOK,
			map[string]string{"kind": "Status", "apiVersion": "v1", "status": "Success"}, err)
	default:
		http.NotFound(w, r)
	}
}

func newFakeHelmSecretsServer(
	t *testing.T,
	rel *release.Release,
	authUser string,
) (*httptest.Server, *k8sfake.Clientset) {
	t.Helper()

	client := k8sfake.NewClientset()

	if rel != nil {
		releases := storage.Init(driver.NewSecrets(client.CoreV1().Secrets(rel.Namespace)))
		require.NoError(t, releases.Create(rel))
	}

	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.URL.Path == "/version":
			_, _ = w.Write([]byte(`{"gitVersion":"v1.34.0"}`))
		case r.URL.Path == "/api":
			_, _ = w.Write([]byte(`{"kind":"APIVersions","versions":["v1"]}`))
		case r.URL.Path == "/api/v1":
			_, _ = w.Write([]byte(`{"kind":"APIResourceList","groupVersion":"v1","resources":[]}`))
		case r.URL.Path == "/apis":
			_, _ = w.Write([]byte(`{"kind":"APIGroupList","groups":[]}`))
		case r.URL.Path == "/apis/authentication.k8s.io/v1/selfsubjectreviews" && r.Method == http.MethodPost:
			_, _ = w.Write([]byte(
				`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
					`"status":{"userInfo":{"username":"` + authUser + `"}}}`))
		case r.URL.Path == "/api/v1/secrets",
			r.URL.Path == "/api/v1/namespaces/default/secrets",
			strings.HasPrefix(r.URL.Path, "/api/v1/namespaces/default/secrets/"):
			handleFakeSecretRequest(w, r, client)
		default:
			http.NotFound(w, r)
		}
	})), client
}

func newTestChartRepoHandler(t *testing.T) *Handler {
	t.Helper()

	repoDir := t.TempDir()
	ch := &chart.Chart{
		Metadata: &chart.Metadata{
			APIVersion: chart.APIVersionV2,
			Name:       "demo",
			Version:    "1.0.0",
			Type:       "application",
		},
	}

	_, err := chartutil.Save(ch, repoDir)
	require.NoError(t, err)

	repoSrv := httptest.NewServer(http.FileServer(http.Dir(repoDir)))
	t.Cleanup(repoSrv.Close)

	index, err := repo.IndexDirectory(repoDir, repoSrv.URL)
	require.NoError(t, err)
	index.SortEntries()
	require.NoError(t, index.WriteFile(filepath.Join(repoDir, "index.yaml"), 0o600))

	settings := cli.New()
	settings.RepositoryConfig = filepath.Join(t.TempDir(), "repositories.yaml")
	settings.RepositoryCache = t.TempDir()

	file := repo.NewFile()
	file.Update(&repo.Entry{Name: "myrepo", URL: repoSrv.URL})
	require.NoError(t, file.WriteFile(settings.RepositoryConfig, 0o600))

	chartRepo, err := repo.NewChartRepository(&repo.Entry{Name: "myrepo", URL: repoSrv.URL}, getter.All(settings))
	require.NoError(t, err)

	chartRepo.CachePath = settings.RepositoryCache
	_, err = chartRepo.DownloadIndexFile()
	require.NoError(t, err)

	return &Handler{
		EnvSettings: settings,
		Cache:       cache.New[interface{}](),
	}
}

func TestListRelease(t *testing.T) {
	rel := &release.Release{
		Name:      "my-release",
		Namespace: "default",
		Version:   1,
		Info:      &release.Info{Status: release.StatusDeployed},
	}

	srv, _ := newFakeHelmSecretsServer(t, rel, "dev")
	defer srv.Close()

	h := &Handler{}

	t.Run("invalid query returns 400", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/helm/releases?bad=1", nil)
		rr := httptest.NewRecorder()
		h.ListRelease(clientConfigFor(srv.URL), rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("lists releases on 200", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/helm/releases?namespace=default", nil)
		rr := httptest.NewRecorder()
		h.ListRelease(clientConfigFor(srv.URL), rr, req)
		require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

		var resp ListReleaseResponse
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
		require.Len(t, resp.Releases, 1)
		assert.Equal(t, "my-release", resp.Releases[0].Name)
	})

	t.Run("api server error returns 500", func(t *testing.T) {
		errCfg := apiServerConfig(t, http.StatusInternalServerError, `{"kind":"Status","code":500}`)
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/helm/releases?namespace=default", nil)
		rr := httptest.NewRecorder()
		h.ListRelease(errCfg, rr, req)
		assert.Equal(t, http.StatusInternalServerError, rr.Code)
	})
}

func TestGetReleaseHandler(t *testing.T) {
	rel := &release.Release{
		Name:      "my-release",
		Namespace: "default",
		Version:   1,
		Info:      &release.Info{Status: release.StatusDeployed},
	}

	srv, _ := newFakeHelmSecretsServer(t, rel, "dev")
	defer srv.Close()

	h := &Handler{}

	t.Run("missing params returns 400", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/helm/releases?name=my-release", nil)
		rr := httptest.NewRecorder()
		h.GetRelease(clientConfigFor(srv.URL), rr, req)
		assert.Equal(t, http.StatusBadRequest, rr.Code)
	})

	t.Run("returns release on 200", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
			"/helm/releases?name=my-release&namespace=default", nil)
		rr := httptest.NewRecorder()
		h.GetRelease(clientConfigFor(srv.URL), rr, req)
		require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())

		var got release.Release
		require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
		assert.Equal(t, "my-release", got.Name)
	})
}

func TestUninstallReleaseHandler(t *testing.T) {
	rel := &release.Release{
		Name:      "my-release",
		Namespace: "default",
		Version:   1,
		Chart:     &chart.Chart{Metadata: &chart.Metadata{Name: "demo", Version: "1.0.0"}},
		Info:      &release.Info{Status: release.StatusDeployed},
	}

	srv, client := newFakeHelmSecretsServer(t, rel, "dev")
	defer srv.Close()

	h := &Handler{Cache: cache.New[interface{}]()}

	badReq := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/helm/releases/uninstall", nil)
	badRR := httptest.NewRecorder()
	h.UninstallRelease(clientConfigFor(srv.URL), badRR, badReq)
	assert.Equal(t, http.StatusBadRequest, badRR.Code)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodDelete,
		"/helm/releases/uninstall?name=my-release&namespace=default", nil)
	rr := httptest.NewRecorder()
	h.UninstallRelease(clientConfigFor(srv.URL), rr, req)
	require.Equal(t, http.StatusAccepted, rr.Code)

	require.Eventually(t, func() bool {
		st, err := h.getReleaseStatus("uninstall", "my-release")
		return err == nil && st.Status == success
	}, 2*time.Second, 20*time.Millisecond)

	releases := storage.Init(driver.NewSecrets(client.CoreV1().Secrets("default")))
	_, err := releases.Last("my-release")
	require.ErrorIs(t, err, driver.ErrReleaseNotFound)
}

func TestRollbackReleaseHandler(t *testing.T) {
	rel := &release.Release{
		Name:      "my-release",
		Namespace: "default",
		Version:   1,
		Chart:     &chart.Chart{Metadata: &chart.Metadata{Name: "demo", Version: "1.0.0"}},
		Info:      &release.Info{Status: release.StatusDeployed},
	}

	srv, client := newFakeHelmSecretsServer(t, rel, "dev")
	defer srv.Close()

	h := &Handler{Cache: cache.New[interface{}]()}

	badReq := httptest.NewRequestWithContext(context.Background(), http.MethodPut,
		"/helm/releases/rollback", strings.NewReader("{"))
	badRR := httptest.NewRecorder()
	h.RollbackRelease(clientConfigFor(srv.URL), badRR, badReq)
	assert.Equal(t, http.StatusBadRequest, badRR.Code)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodPut,
		"/helm/releases/rollback", strings.NewReader(`{"name":"my-release","namespace":"default","revision":1}`))
	rr := httptest.NewRecorder()
	h.RollbackRelease(clientConfigFor(srv.URL), rr, req)
	require.Equal(t, http.StatusAccepted, rr.Code)

	require.Eventually(t, func() bool {
		st, err := h.getReleaseStatus("rollback", "my-release")
		return err == nil && st.Status == success
	}, 2*time.Second, 20*time.Millisecond)

	releases := storage.Init(driver.NewSecrets(client.CoreV1().Secrets("default")))
	rolled, err := releases.Last("my-release")
	require.NoError(t, err)
	assert.Equal(t, 2, rolled.Version)
	assert.Equal(t, release.StatusDeployed, rolled.Info.Status)
}

func TestReleaseWorkerFailures(t *testing.T) {
	srv, _ := newFakeHelmSecretsServer(t, nil, "alice")
	defer srv.Close()

	h := &Handler{Cache: cache.New[interface{}]()}

	cfg, err := NewActionConfig(clientConfigFor(srv.URL), "default")
	require.NoError(t, err)

	h.uninstallRelease(UninstallReleaseRequest{Name: "missing", Namespace: "default"}, cfg)
	st, err := h.getReleaseStatus("uninstall", "missing")
	require.NoError(t, err)
	assert.Equal(t, failed, st.Status)

	h.rollbackRelease(RollbackReleaseRequest{Name: "missing", Namespace: "default", Revision: 1}, cfg)
	st, err = h.getReleaseStatus("rollback", "missing")
	require.NoError(t, err)
	assert.Equal(t, failed, st.Status)
}

func TestVerifyUser(t *testing.T) {
	t.Run("authenticated user returns true", func(t *testing.T) {
		srv, _ := newFakeHelmSecretsServer(t, nil, "alice")
		defer srv.Close()

		cfg, err := NewActionConfig(clientConfigFor(srv.URL), "default")
		require.NoError(t, err)
		assert.True(t, VerifyUser(cfg, InstallRequest{}))
	})

	t.Run("anonymous user returns false", func(t *testing.T) {
		srv, _ := newFakeHelmSecretsServer(t, nil, "system:anonymous")
		defer srv.Close()

		cfg, err := NewActionConfig(clientConfigFor(srv.URL), "default")
		require.NoError(t, err)
		assert.False(t, VerifyUser(cfg, InstallRequest{}))
	})
}

func TestInstallAndUpgradeReleaseFlows(t *testing.T) {
	rel := &release.Release{
		Name:      "demo-rel",
		Namespace: "default",
		Version:   1,
		Chart:     &chart.Chart{Metadata: &chart.Metadata{Name: "demo", Version: "1.0.0"}},
		Info:      &release.Info{Status: release.StatusDeployed},
	}

	srv, client := newFakeHelmSecretsServer(t, rel, "alice")
	defer srv.Close()

	h := newTestChartRepoHandler(t)
	h.Debug = false

	installBody := `{"name":"demo-new","namespace":"default","description":"d","chart":"myrepo/demo","version":"1.0.0"}`
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost,
		"/helm/releases", strings.NewReader(installBody))
	rr := httptest.NewRecorder()
	h.InstallRelease(clientConfigFor(srv.URL), rr, req)
	require.Equal(t, http.StatusAccepted, rr.Code)

	require.Eventually(t, func() bool {
		st, err := h.getReleaseStatus("install", "demo-new")
		return err == nil && st.Status == success
	}, 2*time.Second, 20*time.Millisecond)

	releases := storage.Init(driver.NewSecrets(client.CoreV1().Secrets("default")))
	installed, err := releases.Last("demo-new")
	require.NoError(t, err)
	assert.Equal(t, 1, installed.Version)
	assert.Equal(t, release.StatusDeployed, installed.Info.Status)

	upBody := `{"name":"demo-rel","namespace":"default","description":"d","chart":"myrepo/demo","version":"1.0.0"}`
	upReq := httptest.NewRequestWithContext(context.Background(), http.MethodPut,
		"/helm/releases", strings.NewReader(upBody))
	upRR := httptest.NewRecorder()
	h.UpgradeRelease(clientConfigFor(srv.URL), upRR, upReq)
	require.Equal(t, http.StatusAccepted, upRR.Code)

	require.Eventually(t, func() bool {
		st, err := h.getReleaseStatus("upgrade", "demo-rel")
		return err == nil && st.Status == success
	}, 2*time.Second, 20*time.Millisecond)

	upgraded, err := releases.Last("demo-rel")
	require.NoError(t, err)
	assert.Equal(t, 2, upgraded.Version)
	assert.Equal(t, release.StatusDeployed, upgraded.Info.Status)
}

func TestInstallAndUpgradeInvalidValues(t *testing.T) {
	srv, _ := newFakeHelmSecretsServer(t, nil, "alice")
	defer srv.Close()

	h := newTestChartRepoHandler(t)
	h.Debug = false

	cfg, err := NewActionConfig(clientConfigFor(srv.URL), "default")
	require.NoError(t, err)

	for _, tc := range []struct {
		name      string
		values    string
		errSubstr string
	}{
		{
			name:      "invalid base64",
			values:    "!!!",
			errSubstr: "illegal base64 data",
		},
		{
			name:      "invalid yaml",
			values:    base64.StdEncoding.EncodeToString([]byte("key: [unclosed")),
			errSubstr: "yaml:",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			common := CommonInstallUpdateRequest{
				Name: "bad-val", Namespace: "default", Description: "d",
				Chart: "myrepo/demo", Version: "1.0.0", Values: tc.values,
			}

			require.NoError(t, h.setReleaseStatus("install", "bad-val", "", nil))
			h.installRelease(InstallRequest{CommonInstallUpdateRequest: common}, cfg)
			st, err := h.getReleaseStatus("install", "bad-val")
			require.NoError(t, err)
			assert.Equal(t, failed, st.Status)
			require.NotNil(t, st.Err)
			assert.Contains(t, *st.Err, tc.errSubstr)

			require.NoError(t, h.setReleaseStatus("upgrade", "bad-val", "", nil))
			h.upgradeRelease(UpgradeReleaseRequest{CommonInstallUpdateRequest: common}, cfg)
			st, err = h.getReleaseStatus("upgrade", "bad-val")
			require.NoError(t, err)
			assert.Equal(t, failed, st.Status)
			require.NotNil(t, st.Err)
			assert.Contains(t, *st.Err, tc.errSubstr)
		})
	}
}

func TestReleaseHandlers_InstallErrors(t *testing.T) {
	badClientCfg := clientcmd.NewDefaultClientConfig(api.Config{}, nil)
	h := newTestChartRepoHandler(t)

	for _, tc := range []struct {
		name   string
		body   string
		status int
	}{
		{name: "bad_json", body: "{", status: http.StatusBadRequest},
		{name: "missing_fields", body: `{"name":"r"}`, status: http.StatusBadRequest},
		{
			name:   "bad_chart_ref",
			body:   `{"name":"r","namespace":"default","description":"d","chart":"../bad","version":"1.0.0"}`,
			status: http.StatusBadRequest,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(context.Background(), http.MethodPost,
				"/helm/releases", strings.NewReader(tc.body))
			rr := httptest.NewRecorder()
			h.InstallRelease(badClientCfg, rr, req)
			assert.Equal(t, tc.status, rr.Code)
		})
	}
}

func TestReleaseHandlers_UpgradeErrors(t *testing.T) {
	badClientCfg := clientcmd.NewDefaultClientConfig(api.Config{}, nil)
	h := newTestChartRepoHandler(t)

	for _, tc := range []struct {
		name   string
		body   string
		status int
	}{
		{name: "bad_json", body: "{", status: http.StatusBadRequest},
		{name: "missing_fields", body: `{"name":"r"}`, status: http.StatusBadRequest},
		{
			name:   "bad_chart_ref",
			body:   `{"name":"r","namespace":"default","description":"d","chart":"../bad","version":"1.0.0"}`,
			status: http.StatusBadRequest,
		},
		{
			name:   "bad_client_config",
			body:   `{"name":"r","namespace":"default","description":"d","chart":"myrepo/demo","version":"1.0.0"}`,
			status: http.StatusInternalServerError,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(context.Background(), http.MethodPut,
				"/helm/releases", strings.NewReader(tc.body))
			rr := httptest.NewRecorder()
			h.UpgradeRelease(badClientCfg, rr, req)
			assert.Equal(t, tc.status, rr.Code)
		})
	}

	srv, _ := newFakeHelmSecretsServer(t, nil, "alice")
	defer srv.Close()

	reqBody := `{"name":"missing","namespace":"default","description":"d","chart":"myrepo/demo","version":"1.0.0"}`
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPut,
		"/helm/releases", strings.NewReader(reqBody))
	rr := httptest.NewRecorder()
	h.UpgradeRelease(clientConfigFor(srv.URL), rr, req)
	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestReleaseHandlers_ConfigAndStatusErrors(t *testing.T) {
	badClientCfg := clientcmd.NewDefaultClientConfig(api.Config{}, nil)
	h := newTestChartRepoHandler(t)

	t.Run("action_config_errors_on_read_and_mutation_handlers", func(t *testing.T) {
		rr := httptest.NewRecorder()
		listReq := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/helm/releases", nil)
		h.ListRelease(badClientCfg, rr, listReq)
		assert.Equal(t, http.StatusInternalServerError, rr.Code)

		rr = httptest.NewRecorder()
		h.GetRelease(badClientCfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodGet,
			"/helm/releases?unknown=1", nil))
		assert.Equal(t, http.StatusBadRequest, rr.Code)

		rr = httptest.NewRecorder()
		h.GetRelease(badClientCfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodGet,
			"/helm/releases?name=r&namespace=default", nil))
		assert.Equal(t, http.StatusInternalServerError, rr.Code)

		rr = httptest.NewRecorder()
		h.GetReleaseHistory(badClientCfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodGet,
			"/helm/releases/history?name=r&namespace=default", nil))
		assert.Equal(t, http.StatusInternalServerError, rr.Code)

		rr = httptest.NewRecorder()
		h.UninstallRelease(badClientCfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodDelete,
			"/helm/releases?unknown=1", nil))
		assert.Equal(t, http.StatusBadRequest, rr.Code)

		rr = httptest.NewRecorder()
		h.UninstallRelease(badClientCfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodDelete,
			"/helm/releases?name=r&namespace=default", nil))
		assert.Equal(t, http.StatusInternalServerError, rr.Code)

		rr = httptest.NewRecorder()
		h.RollbackRelease(badClientCfg, rr, httptest.NewRequestWithContext(context.Background(), http.MethodPut,
			"/helm/releases/rollback", strings.NewReader(`{"name":"r","namespace":"default","revision":1}`)))
		assert.Equal(t, http.StatusInternalServerError, rr.Code)
	})

	t.Run("get_action_status_success_and_failed_with_err", func(t *testing.T) {
		require.NoError(t, h.setReleaseStatus("install", "ok-rel", success, nil))

		rr := httptest.NewRecorder()
		h.GetActionStatus(nil, rr, httptest.NewRequestWithContext(context.Background(), http.MethodGet,
			"/helm/releases/status?action=install&name=ok-rel", nil))
		require.Equal(t, http.StatusAccepted, rr.Code)
		assert.Contains(t, rr.Body.String(), "action completed successfully")

		require.NoError(t, h.setReleaseStatus("install", "fail-rel", failed, errors.New("boom")))

		rr = httptest.NewRecorder()
		h.GetActionStatus(nil, rr, httptest.NewRequestWithContext(context.Background(), http.MethodGet,
			"/helm/releases/status?action=install&name=fail-rel", nil))
		require.Equal(t, http.StatusAccepted, rr.Code)
		assert.Contains(t, rr.Body.String(), "action failed with error: boom")
	})
}

func TestGetChart_LoadAndDependencyErrors(t *testing.T) {
	h := newTestChartRepoHandler(t)
	h.Debug = false

	t.Run("corrupt_chart_archive", func(t *testing.T) {
		corruptPath := filepath.Join(t.TempDir(), "corrupt-0.1.0.tgz")
		require.NoError(t, os.WriteFile(corruptPath, []byte("not-a-gzip"), 0o600))

		_, err := h.getChart("install", corruptPath, "rel", action.ChartPathOptions{}, false, h.EnvSettings)
		require.Error(t, err)
	})
}

type badRESTClientGetter struct {
	genericclioptions.RESTClientGetter
}

func (badRESTClientGetter) ToRESTConfig() (*rest.Config, error) {
	return nil, errors.New("bad rest config")
}

func TestVerifyUserBadRestConfig(t *testing.T) {
	cfg := &action.Configuration{
		RESTClientGetter: badRESTClientGetter{},
	}
	assert.False(t, VerifyUser(cfg, InstallRequest{}))
}

func TestInstallAndUpgradeWorkerErrors(t *testing.T) {
	anonSrv, _ := newFakeHelmSecretsServer(t, nil, "system:anonymous")
	defer anonSrv.Close()

	h := newTestChartRepoHandler(t)
	h.Debug = false

	anonCfg, err := NewActionConfig(clientConfigFor(anonSrv.URL), "default")
	require.NoError(t, err)
	h.installRelease(InstallRequest{CommonInstallUpdateRequest: CommonInstallUpdateRequest{
		Name: "anon-rel", Namespace: "default", Chart: "myrepo/demo", Version: "1.0.0",
	}}, anonCfg)
	_, err = h.getReleaseStatus("install", "anon-rel")
	require.Error(t, err)

	rel := &release.Release{
		Name:      "existing-rel",
		Namespace: "default",
		Version:   1,
		Chart:     &chart.Chart{Metadata: &chart.Metadata{Name: "demo", Version: "1.0.0"}},
		Info:      &release.Info{Status: release.StatusDeployed},
	}

	srv, _ := newFakeHelmSecretsServer(t, rel, "alice")
	defer srv.Close()

	cfg, err := NewActionConfig(clientConfigFor(srv.URL), "default")
	require.NoError(t, err)

	h.installRelease(InstallRequest{CommonInstallUpdateRequest: CommonInstallUpdateRequest{
		Name: "bad-chart-rel", Namespace: "default", Chart: "myrepo/does-not-exist", Version: "1.0.0",
	}}, cfg)
	st, err := h.getReleaseStatus("install", "bad-chart-rel")
	require.NoError(t, err)
	assert.Equal(t, failed, st.Status)

	h.installRelease(InstallRequest{CommonInstallUpdateRequest: CommonInstallUpdateRequest{
		Name: "existing-rel", Namespace: "default", Chart: "myrepo/demo", Version: "1.0.0",
	}}, cfg)
	st, err = h.getReleaseStatus("install", "existing-rel")
	require.NoError(t, err)
	assert.Equal(t, failed, st.Status)

	h.upgradeRelease(UpgradeReleaseRequest{CommonInstallUpdateRequest: CommonInstallUpdateRequest{
		Name: "bad-up-chart", Namespace: "default", Chart: "myrepo/does-not-exist", Version: "1.0.0",
	}}, cfg)
	st, err = h.getReleaseStatus("upgrade", "bad-up-chart")
	require.NoError(t, err)
	assert.Equal(t, failed, st.Status)

	h.upgradeRelease(UpgradeReleaseRequest{CommonInstallUpdateRequest: CommonInstallUpdateRequest{
		Name: "not-installed", Namespace: "default", Chart: "myrepo/demo", Version: "1.0.0",
	}}, cfg)
	st, err = h.getReleaseStatus("upgrade", "not-installed")
	require.NoError(t, err)
	assert.Equal(t, failed, st.Status)
}

// TestUpgradeRelease_UnauthorizedUser_DoesNotFetchChart verifies that upgradeRelease
// performs the same VerifyUser authorization check as installRelease, rejecting an
// unauthorized user before getChart is ever invoked.
func TestUpgradeRelease_UnauthorizedUser_DoesNotFetchChart(t *testing.T) {
	h := &Handler{
		Cache:       cache.New[interface{}](),
		EnvSettings: cli.New(),
	}

	// A loadable library chart is a sentinel: getChart must reject it and record
	// a chart-type failure if it runs before authorization.
	chartDir := t.TempDir()
	chartYaml := filepath.Join(chartDir, "Chart.yaml")
	chartContent := []byte("apiVersion: v2\nname: test-chart\nversion: 1.0.0\ntype: library\n")
	require.NoError(t, os.WriteFile(chartYaml, chartContent, 0o600))

	// RESTClientGetter with an empty host: the whoami check inside VerifyUser
	// fails against it, simulating an unauthorized/anonymous user.
	actionConfig := &action.Configuration{
		RESTClientGetter: &unauthorizedRESTGetter{},
	}

	req := UpgradeReleaseRequest{
		CommonInstallUpdateRequest: CommonInstallUpdateRequest{
			Name:        "test-upgrade-release",
			Namespace:   "default",
			Description: "upgrade",
			Chart:       chartDir,
			Values:      base64.StdEncoding.EncodeToString([]byte("{}")),
			Version:     "1.0.0",
		},
	}

	require.NoError(t, h.setReleaseStatus("upgrade", req.Name, processing, nil))
	h.upgradeRelease(req, actionConfig)

	status, err := h.getReleaseStatus("upgrade", req.Name)
	require.NoError(t, err)
	assert.Equal(t, failed, status.Status)
	require.NotNil(t, status.Err)
	assert.Equal(t, "insufficient privileges", *status.Err)
}
