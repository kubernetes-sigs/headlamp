package serviceproxy_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/serviceproxy"
	"github.com/stretchr/testify/require"
)

func TestRequestHandler(t *testing.T) {
	tests := []struct {
		name       string
		url        string
		wantStatus int
	}{
		{
			name:       "valid request",
			url:        "/clusters/test/serviceproxy/default/my-service?request=/test",
			wantStatus: http.StatusOK,
		},
		{
			name:       "invalid cluster name",
			url:        "/clusters/invalid/serviceproxy/default/my-service?request=/test",
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "invalid namespace",
			url:        "/clusters/test/serviceproxy/invalid/my-service?request=/test",
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "invalid service name",
			url:        "/clusters/test/serviceproxy/default/invalid?request=/test",
			wantStatus: http.StatusNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			kubeConfigStore := kubeconfig.NewContextStore()
			err := kubeConfigStore.AddContext(&kubeconfig.Context{Name: "test"})
			require.NoError(t, err)

			w := httptest.NewRecorder()
			r := httptest.NewRequest("GET", tt.url, nil)
			r = mux.SetURLVars(r, map[string]string{
				"clusterName": "test",
				"namespace":   "default",
				"name":        "my-service",
			})

			serviceproxy.RequestHandler(kubeConfigStore, w, r)

			if w.Code != tt.wantStatus {
				t.Errorf("RequestHandler() status code = %d, want %d", w.Code, tt.wantStatus)
			}
		})
	}
}
