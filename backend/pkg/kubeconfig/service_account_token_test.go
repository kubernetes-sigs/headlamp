package kubeconfig //nolint:testpackage

import (
	"path"
	"testing"

	"github.com/stretchr/testify/assert"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestResolveServiceAccountTokenPath(t *testing.T) {
	defaultTokenPath := path.Join("/", "var", "run", "secrets", "kubernetes.io", "serviceaccount", "token")

	tests := []struct {
		name                    string
		clusterBearerTokenFile  string
		serviceAccountTokenPath string
		expected                string
	}{
		{
			name:                    "explicit path wins",
			clusterBearerTokenFile:  defaultTokenPath,
			serviceAccountTokenPath: path.Join("/", "custom", "token"),
			expected:                path.Join("/", "custom", "token"),
		},
		{
			name:                   "cluster bearer token file fallback",
			clusterBearerTokenFile: path.Join("/", "cluster", "token"),
			expected:               path.Join("/", "cluster", "token"),
		},
		{
			name:     "default path fallback",
			expected: defaultTokenPath,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clusterConfig := &rest.Config{BearerTokenFile: tt.clusterBearerTokenFile}

			assert.Equal(t, tt.expected, resolveServiceAccountTokenPath(clusterConfig, tt.serviceAccountTokenPath))
		})
	}
}

func TestGetInClusterContextServiceAccountTokenFile(t *testing.T) {
	defaultTokenPath := path.Join("/", "var", "run", "secrets", "kubernetes.io", "serviceaccount", "token")

	tests := []struct {
		name                         string
		unsafeUseServiceAccountToken bool
		clusterBearerTokenFile       string
		serviceAccountTokenPath      string
		expectedTokenFile            string
	}{
		{
			name:                    "unsafe disabled leaves token file empty",
			clusterBearerTokenFile:  path.Join("/", "cluster", "token"),
			serviceAccountTokenPath: path.Join("/", "custom", "token"),
		},
		{
			name:                         "unsafe enabled uses explicit path",
			unsafeUseServiceAccountToken: true,
			clusterBearerTokenFile:       path.Join("/", "cluster", "token"),
			serviceAccountTokenPath:      path.Join("/", "custom", "token"),
			expectedTokenFile:            path.Join("/", "custom", "token"),
		},
		{
			name:                         "unsafe enabled uses cluster bearer token file fallback",
			unsafeUseServiceAccountToken: true,
			clusterBearerTokenFile:       path.Join("/", "cluster", "token"),
			expectedTokenFile:            path.Join("/", "cluster", "token"),
		},
		{
			name:                         "unsafe enabled uses default path fallback",
			unsafeUseServiceAccountToken: true,
			expectedTokenFile:            defaultTokenPath,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			context := newInClusterContextFromConfig(
				&rest.Config{
					Host:            "https://kubernetes.default.svc",
					BearerTokenFile: tt.clusterBearerTokenFile,
				},
				DefaultInClusterContextName,
				"", "", "", "",
				false,
				"",
				tt.unsafeUseServiceAccountToken,
				tt.serviceAccountTokenPath,
			)

			assert.Equal(t, tt.expectedTokenFile, context.AuthInfo.TokenFile)
			assert.Equal(t, InCluster, context.Source)
			assert.Equal(t, tt.expectedTokenFile != "", context.UsesInClusterServiceAccountToken())
		})
	}
}

func TestContextUsesInClusterServiceAccountToken(t *testing.T) {
	tests := []struct {
		name     string
		context  *Context
		expected bool
	}{
		{
			name:     "nil context",
			context:  nil,
			expected: false,
		},
		{
			name: "in-cluster token file",
			context: &Context{
				Source:   InCluster,
				AuthInfo: &api.AuthInfo{TokenFile: "/service-account/token"},
			},
			expected: true,
		},
		{
			name: "in-cluster without token file",
			context: &Context{
				Source:   InCluster,
				AuthInfo: &api.AuthInfo{},
			},
			expected: false,
		},
		{
			name: "kubeconfig token file",
			context: &Context{
				Source:   KubeConfig,
				AuthInfo: &api.AuthInfo{TokenFile: "/user/token"},
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.context.UsesInClusterServiceAccountToken())
		})
	}
}
