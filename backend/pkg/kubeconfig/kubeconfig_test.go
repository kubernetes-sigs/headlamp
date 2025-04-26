package kubeconfig_test

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const kubeConfigFilePath = "./test_data/kubeconfig1"

func TestLoadAndStoreKubeConfigs(t *testing.T) {
	contextStore := kubeconfig.NewContextStore()

	t.Run("valid_file", func(t *testing.T) {
		kubeConfigFile := kubeConfigFilePath

		err := kubeconfig.LoadAndStoreKubeConfigs(contextStore, kubeConfigFile, kubeconfig.KubeConfig, nil)
		require.NoError(t, err)

		contexts, err := contextStore.GetContexts()
		require.NoError(t, err)

		require.Equal(t, 2, len(contexts))

		ctx, err := contextStore.GetContext("minikube")
		require.NoError(t, err)

		require.Equal(t, "minikube", ctx.Name)
	})

	t.Run("invalid_file", func(t *testing.T) {
		kubeConfigFile := "invalid_kubeconfig"

		err := kubeconfig.LoadAndStoreKubeConfigs(contextStore, kubeConfigFile, kubeconfig.KubeConfig, nil)
		require.Error(t, err)
	})
}

func TestLoadContextsFromKubeConfigFile(t *testing.T) {
	t.Run("valid_file", func(t *testing.T) {
		kubeConfigFile := kubeConfigFilePath

		contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(kubeConfigFile, kubeconfig.KubeConfig)
		require.NoError(t, err, "Expected no error for valid file")
		require.Empty(t, contextErrors, "Expected no context errors for valid file")
		require.Equal(t, 2, len(contexts), "Expected 2 contexts from valid file")
	})

	t.Run("invalid_file", func(t *testing.T) {
		kubeConfigFile := "invalid_kubeconfig"

		contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(kubeConfigFile, kubeconfig.KubeConfig)
		require.Error(t, err, "Expected error for invalid file")
		require.Empty(t, contextErrors, "Expected no context errors for invalid file")
		require.Empty(t, contexts, "Expected no contexts from invalid file")
	})

	t.Run("autherror", func(t *testing.T) {
		kubeConfigFile := "./test_data/kubeconfig_autherr"

		contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(kubeConfigFile, kubeconfig.KubeConfig)
		require.NoError(t, err, "Expected no error for auth error file")
		require.NotEmpty(t, contextErrors, "Expected context errors for invalid auth file")
		require.Equal(t, contextErrors[0].ContextName, "invalid-context")
		require.Equal(t, 0, len(contexts), "Expected no contexts from invalid auth file")
	})

	t.Run("partially_valid_contexts", func(t *testing.T) {
		kubeConfigFile := "./test_data/kubeconfig_partialcontextvalid"

		contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(kubeConfigFile, kubeconfig.KubeConfig)
		require.NoError(t, err, "Expected no error for partially valid file")
		require.NotEmpty(t, contextErrors, "Expected some context errors for partially valid file")
		require.Equal(t, 1, len(contexts), "Expected 1 contexts from the partially valid file")
		require.Equal(t, "valid-context", contexts[0].Name, "Expected context name to be 'valid-context'")
	})
}

func TestContext(t *testing.T) {
	kubeConfigFile := config.GetDefaultKubeConfigPath()

	configStore := kubeconfig.NewContextStore()

	err := kubeconfig.LoadAndStoreKubeConfigs(configStore, kubeConfigFile, kubeconfig.KubeConfig, nil)
	require.NoError(t, err)

	testContext, err := configStore.GetContext("minikube")
	require.NoError(t, err)

	require.Equal(t, "minikube", testContext.Name)
	require.NotNil(t, testContext.ClientConfig())
	require.Equal(t, "default", testContext.KubeContext.Namespace)

	restConf, err := testContext.RESTConfig()
	require.NoError(t, err)
	require.NotNil(t, restConf)

	// Test proxy request handler

	request, err := http.NewRequestWithContext(context.Background(), "GET", "/version", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()

	err = testContext.ProxyRequest(rr, request)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, rr.Code)

	t.Logf("Proxy request Response: %s", rr.Body.String())
	assert.Contains(t, rr.Body.String(), "major")
	assert.Contains(t, rr.Body.String(), "minor")
}

func TestLoadContextsFromBase64String(t *testing.T) {
	t.Run("valid_base64", func(t *testing.T) {
		kubeConfigFile := kubeConfigFilePath
		kubeConfigContent, err := os.ReadFile(kubeConfigFile)
		require.NoError(t, err)

		base64String := base64.StdEncoding.EncodeToString(kubeConfigContent)

		contexts, contextErrors, err := kubeconfig.LoadContextsFromBase64String(base64String, kubeconfig.DynamicCluster)
		require.NoError(t, err, "Expected no error for valid base64")
		require.Empty(t, contextErrors, "Expected no context errors for valid base64")
		require.Equal(t, 2, len(contexts), "Expected 2 contexts from valid base64")
		assert.Equal(t, kubeconfig.DynamicCluster, contexts[0].Source)
	})

	t.Run("invalid_base64", func(t *testing.T) {
		invalidBase64String := "invalid_base64"
		source := 2

		contexts, contextErrors, err := kubeconfig.LoadContextsFromBase64String(invalidBase64String, source)
		require.Error(t, err, "Expected error for invalid base64")
		require.Empty(t, contextErrors, "Expected no context errors for invalid base64")
		require.Empty(t, contexts, "Expected no contexts from invalid base64")
	})

	t.Run("partially_valid_base64", func(t *testing.T) {
		partiallyValidContent := `
apiVersion: v1
kind: Config
contexts:
- name: valid-context
  context:
    cluster: valid-cluster
    user: valid-user
- name: invalid-context
  context:
    cluster: invalid-cluster
    user: invalid-user
clusters:
- name: valid-cluster
  cluster:
    server: https://valid.example.com
users:
- name: valid-user
  user:
    token: valid-token
`
		base64String := base64.StdEncoding.EncodeToString([]byte(partiallyValidContent))

		contexts, contextErrors, err := kubeconfig.LoadContextsFromBase64String(base64String, kubeconfig.DynamicCluster)
		require.NoError(t, err, "Expected no error for partially valid base64")
		require.NotEmpty(t, contextErrors, "Expected some context errors for partially valid base64")
		require.Equal(t, 1, len(contexts), "Expected 1 valid context from partially valid base64")
		assert.Equal(t, "valid-context", contexts[0].Name, "Expected context name to be 'valid-context'")
	})
}

func TestUnmarshalKubeconfig(t *testing.T) {
	tests := []struct {
		name    string
		input   []byte
		want    map[string]interface{}
		wantErr bool
	}{
		{
			name: "Valid YAML",
			input: []byte(`apiVersion: v1
kind: Config
contexts:
- name: test-context
  context:
    cluster: test-cluster
    user: test-user`),
			want: map[string]interface{}{
				"apiVersion": "v1",
				"kind":       "Config",
				"contexts": []interface{}{
					map[interface{}]interface{}{
						"name": "test-context",
						"context": map[interface{}]interface{}{
							"cluster": "test-cluster",
							"user":    "test-user",
						},
					},
				},
			},
			wantErr: false,
		},
		{
			name:    "Invalid YAML",
			input:   []byte(`invalid: yaml: content`),
			want:    nil,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := kubeconfig.UnmarshalKubeconfig(tt.input)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.want, got)
			}
		})
	}
}

func TestGetContextsFromKubeconfig(t *testing.T) {
	tests := []struct {
		name       string
		kubeconfig map[string]interface{}
		want       []interface{}
		wantErr    bool
	}{
		{
			name: "Valid contexts",
			kubeconfig: map[string]interface{}{
				"contexts": []interface{}{
					map[string]interface{}{
						"name": "context1",
					},
					map[string]interface{}{
						"name": "context2",
					},
				},
			},
			want: []interface{}{
				map[string]interface{}{
					"name": "context1",
				},
				map[string]interface{}{
					"name": "context2",
				},
			},
			wantErr: false,
		},
		{
			name: "Missing contexts",
			kubeconfig: map[string]interface{}{
				"clusters": []interface{}{},
			},
			want:    nil,
			wantErr: true,
		},
		{
			name: "Invalid contexts type",
			kubeconfig: map[string]interface{}{
				"contexts": "invalid",
			},
			want:    nil,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := kubeconfig.GetContextsFromKubeconfig(tt.kubeconfig)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, got)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.want, got)
			}
		})
	}
}

func TestErrorTypes(t *testing.T) {
	t.Run("ContextError", func(t *testing.T) {
		err := kubeconfig.ContextError{
			ContextName: "test-context",
			Reason:      "test reason",
		}
		assert.Equal(t, "Error in context 'test-context': test reason", err.Error())
	})

	t.Run("ClusterError", func(t *testing.T) {
		err := kubeconfig.ClusterError{
			ClusterName: "test-cluster",
			Reason:      "test reason",
		}
		assert.Equal(t, "Error in cluster 'test-cluster': test reason", err.Error())
	})

	t.Run("UserError", func(t *testing.T) {
		err := kubeconfig.UserError{
			UserName: "test-user",
			Reason:   "test reason",
		}
		assert.Equal(t, "Error in user 'test-user': test reason", err.Error())
	})

	t.Run("DataError", func(t *testing.T) {
		err := kubeconfig.DataError{
			Field:  "test-field",
			Reason: "test reason",
		}
		assert.Equal(t, "Error in field 'test-field': test reason", err.Error())
	})

	t.Run("Base64Error", func(t *testing.T) {
		err := kubeconfig.Base64Error{
			ContextName: "test-context",
			ClusterName: "test-cluster",
			UserName:    "test-user",
			Errors: []error{
				kubeconfig.UserError{UserName: "test-user", Reason: "invalid base64"},
				kubeconfig.ClusterError{ClusterName: "test-cluster", Reason: "invalid base64"},
			},
		}
		expected := "Base64 decoding errors in context 'test-context', cluster 'test-cluster', user 'test-user':\n" +
			"Error in user 'test-user': invalid base64\n" +
			"Error in cluster 'test-cluster': invalid base64"
		assert.Equal(t, expected, err.Error())
	})
}

func TestCustomObjectDeepCopy(t *testing.T) {
	original := &kubeconfig.CustomObject{
		TypeMeta: metav1.TypeMeta{
			Kind:       "CustomObject",
			APIVersion: "v1",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-object",
		},
		CustomName: "test-custom-name",
	}

	t.Run("DeepCopyObject", func(t *testing.T) {
		copied := original.DeepCopyObject()
		assert.Equal(t, original, copied)
		assert.NotSame(t, original, copied)
	})

	t.Run("DeepCopy", func(t *testing.T) {
		copied := original.DeepCopy()
		assert.Equal(t, original, copied)
		assert.NotSame(t, original, copied)
		assert.Equal(t, original.CustomName, copied.CustomName)
	})

	t.Run("DeepCopy with nil", func(t *testing.T) {
		var nilObj *kubeconfig.CustomObject
		copied := nilObj.DeepCopy()
		assert.Nil(t, copied)
	})
}

//nolint:funlen
func TestHandleConfigLoadError(t *testing.T) {
	testKubeconfig := map[string]interface{}{
		"clusters": []interface{}{
			map[interface{}]interface{}{
				"name": "test-cluster",
				"cluster": map[interface{}]interface{}{
					"certificate-authority-data": "invalid-base64",
				},
			},
		},
		"users": []interface{}{
			map[interface{}]interface{}{
				"name": "test-user",
				"user": map[interface{}]interface{}{
					"client-certificate-data": "invalid-base64",
					"client-key-data":         "invalid-base64",
				},
			},
		},
	}

	tests := []struct {
		name        string
		err         error
		contextName string
		clusterName string
		userName    string
		kubeconfig  map[string]interface{}
		want        error
	}{
		{
			name:        "illegal base64",
			err:         errors.New("illegal base64 data"),
			contextName: "test-context",
			clusterName: "test-cluster",
			userName:    "test-user",
			kubeconfig:  testKubeconfig,
			want: kubeconfig.Base64Error{
				ContextName: "test-context",
				ClusterName: "test-cluster",
				UserName:    "test-user",
				Errors: []error{
					kubeconfig.UserError{
						UserName: "test-user",
						Reason:   "Invalid base64 encoding in client-certificate-data. Please ensure it's correctly encoded.",
					},
					kubeconfig.UserError{
						UserName: "test-user",
						Reason:   "Invalid base64 encoding in client-key-data. Please ensure it's correctly encoded.",
					},
					kubeconfig.ClusterError{
						ClusterName: "test-cluster",
						Reason:      "Invalid base64 encoding in certificate-authority-data. Please ensure it's correctly encoded.",
					},
				},
			},
		},
		{
			name:        "no server found",
			err:         errors.New("no server found"),
			contextName: "test-context",
			clusterName: "test-cluster",
			userName:    "test-user",
			kubeconfig:  testKubeconfig,
			want: kubeconfig.ClusterError{
				ClusterName: "test-cluster",
				Reason:      "No server URL specified. Please check the cluster configuration.",
			},
		},
		{
			name:        "unable to read client-cert",
			err:         errors.New("unable to read client-cert"),
			contextName: "test-context",
			clusterName: "test-cluster",
			userName:    "test-user",
			kubeconfig:  testKubeconfig,
			want: kubeconfig.UserError{
				UserName: "test-user",
				Reason:   "Unable to read client certificate. Please ensure the certificate file exists and is readable.",
			},
		},
		{
			name:        "unable to read client-key",
			err:         errors.New("unable to read client-key"),
			contextName: "test-context",
			clusterName: "test-cluster",
			userName:    "test-user",
			kubeconfig:  testKubeconfig,
			want: kubeconfig.UserError{
				UserName: "test-user",
				Reason:   "Unable to read client key. Please ensure the key file exists and is readable.",
			},
		},
		{
			name:        "unable to read certificate-authority",
			err:         errors.New("unable to read certificate-authority"),
			contextName: "test-context",
			clusterName: "test-cluster",
			userName:    "test-user",
			kubeconfig:  testKubeconfig,
			want: kubeconfig.ClusterError{
				ClusterName: "test-cluster",
				Reason:      "Unable to read certificate authority. Please ensure the CA file exists and is readable.",
			},
		},
		{
			name:        "unable to read token",
			err:         errors.New("unable to read token"),
			contextName: "test-context",
			clusterName: "test-cluster",
			userName:    "test-user",
			kubeconfig:  testKubeconfig,
			want: kubeconfig.UserError{
				UserName: "test-user",
				Reason:   "Unable to read token. Please ensure the token file exists and is readable.",
			},
		},
		{
			name:        "default error",
			err:         errors.New("some other error"),
			contextName: "test-context",
			clusterName: "test-cluster",
			userName:    "test-user",
			kubeconfig:  testKubeconfig,
			want: kubeconfig.ContextError{
				ContextName: "test-context",
				Reason:      "Error loading config: some other error",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := kubeconfig.HandleConfigLoadError(tt.err, tt.contextName, tt.clusterName, tt.userName, tt.kubeconfig)
			assert.Equal(t, tt.want, got)
		})
	}
}
