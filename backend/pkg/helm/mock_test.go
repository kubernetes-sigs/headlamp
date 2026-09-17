package helm_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
)

func mockHelmServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "index.yaml") {
			w.WriteHeader(http.StatusOK)

			if _, err := w.Write([]byte(`apiVersion: v1
entries:
  headlamp:
  - apiVersion: v2
    appVersion: 0.11.0
    name: headlamp
    type: application
    urls:
    - https://github.com/headlamp-k8s/headlamp/releases/download/headlamp-helm-0.11.0/headlamp-0.11.0.tgz
    version: 0.11.0
  - apiVersion: v2
    appVersion: 0.9.0
    name: headlamp
    type: application
    urls:
    - https://github.com/kinvolk/headlamp/releases/download/headlamp-helm-0.9.0/headlamp-0.9.0.tgz
    version: 0.9.0
  - apiVersion: v2
    appVersion: 0.1.0
    created: "2021-10-06T16:50:00Z"
    description: Headlamp is an easy-to-use and extensible Kubernetes web UI.
    digest: 8e50b9e
    name: headlamp
    type: application
    urls:
    - https://github.com/kubernetes-sigs/headlamp/releases/download/headlamp-0.1.0/headlamp-0.1.0.tgz
    version: 0.1.0
`)); err != nil {
				http.Error(w, "internal server error", http.StatusInternalServerError)
				return
			}

			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))
}
