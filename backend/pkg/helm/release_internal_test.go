package helm

import (
	"context"
	"encoding/json"
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
	"helm.sh/helm/v3/pkg/cli"
	kubefake "helm.sh/helm/v3/pkg/kube/fake"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage"
	"helm.sh/helm/v3/pkg/storage/driver"
	helmtime "helm.sh/helm/v3/pkg/time"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

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
