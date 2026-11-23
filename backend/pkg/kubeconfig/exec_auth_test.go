/*
Copyright 2026 The Kubernetes Authors.

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

package kubeconfig_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestProxyUsesHeadlampExecAuthenticator(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	callsFile := filepath.Join(t.TempDir(), "calls")
	execConfig := &api.ExecConfig{
		APIVersion:      "client.authentication.k8s.io/v1beta1",
		InteractiveMode: api.NeverExecInteractiveMode,
		Env: []api.ExecEnvVar{
			{Name: "TEST_EXIT_CODE", Value: "1"},
			{Name: "TEST_CALLS_FILE", Value: callsFile},
		},
	}

	if runtime.GOOS == "windows" {
		execConfig.Command = "cmd"
		execConfig.Args = []string{"/C", `..\exec\testdata\test-plugin.bat`}
	} else {
		execConfig.Command = "../exec/testdata/test-plugin.sh"
	}

	connection := &kubeconfig.Context{
		Name:        "exec-auth",
		KubeContext: &api.Context{Cluster: "cluster", AuthInfo: "user"},
		Cluster:     &api.Cluster{Server: server.URL, InsecureSkipTLSVerify: true},
		AuthInfo:    &api.AuthInfo{Exec: execConfig},
	}

	for range 2 {
		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/pods", nil)
		require.NoError(t, connection.ProxyRequest(httptest.NewRecorder(), request))
	}

	calls, err := os.ReadFile(callsFile) //nolint:gosec // Test file in a temp directory.
	require.NoError(t, err)
	require.Equal(t, 1, strings.Count(string(calls), "x"), "a failed plugin should not run again right away")
}
