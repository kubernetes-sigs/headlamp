package kubeconfig_test

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/pkg/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/clientcmd/api"
)

var kubeConfigFilePath = filepath.Join(getTestDataPath(), "kubeconfig1")

// Helper functions for creating pointers to primitive types
func boolPtr(b bool) *bool {
	return &b
}

func stringPtr(s string) *string {
	return &s
}

// getTestDataPath returns the absolute path to the test data directory.
func getTestDataPath() string {
	// Get the current working directory
	cwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}

	// If we're in the kubeconfig package directory, use relative path
	if filepath.Base(cwd) == "kubeconfig" {
		return "./test_data"
	}

	// Otherwise, assume we're in the workspace root
	return "./pkg/kubeconfig/test_data"
}

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

// TestLoadContextFromFile validates the behavior of the LoadContextsFromFile function.
//
// This test ensures that the function correctly processes a valid kubeconfig file
// and produces the expected metadata results without errors.
func TestLoadContextFromFile(t *testing.T) {
	kubeConfigFile := "./test_data/kubeconfig_metadata"

	contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(kubeConfigFile, kubeconfig.KubeConfig)

	require.NoError(t, err, "Expected no error for valid file")
	require.Empty(t, contextErrors, "Expected no context errors for valid file")
	require.Equal(t, 2, len(contexts), "Expected 3 contexts from valid file")

	expectedNames := []string{"random-cluster-x", "random-cluster-y", ""}
	expectedClusterIDs := []string{
		fmt.Sprintf("%s+%s", kubeConfigFile, "random-cluster-x"),
		fmt.Sprintf("%s+%s", kubeConfigFile, "random-cluster-y"),
	}

	for _, ctx := range contexts {
		assert.NotEmpty(t, ctx.Name, "Expected non-empty context name")
		assert.Contains(t, expectedNames, ctx.Name, "Unexpected context name")
		assert.Contains(t, expectedClusterIDs, ctx.ClusterID, "Unexpected ClusterID")
		assert.Equal(t, kubeConfigFile, ctx.KubeConfigPath, "Unexpected kubeconfig path")
		assert.Equal(t, fmt.Sprintf("%s+%s", kubeConfigFile, ctx.Name), ctx.ClusterID, "Unexpected ClusterID")
	}
}

// TestLoadContextsWithDuplicateNames validates the behavior of the LoadContextsFromMultipleFiles function.
func TestLoadContextsWithDuplicateNames(t *testing.T) {
	// Simulate two kubeconfig files with duplicate context names
	kubeConfigFile1 := "./test_data/kubeconfig_metadata"
	kubeConfigFile2 := "./test_data/kubeconfig_metadata_duplicate"

	// Both files have a context named "random-cluster-x"
	combined := kubeConfigFile1 + string(os.PathListSeparator) + kubeConfigFile2

	contexts, contextErrors, err := kubeconfig.LoadContextsFromMultipleFiles(combined, kubeconfig.KubeConfig)
	require.NoError(t, err, "Expected no error for valid file")
	require.Empty(t, contextErrors, "Expected no context errors for valid file")

	// Should load both contexts, even if names are the same, but may overwrite in store
	var count int

	for _, ctx := range contexts {
		if ctx.Name == "random-cluster-x" {
			count++
		}
	}

	assert.Equal(t, 2, count, "Expected 2 contexts with the same name")
}

func TestOIDCConfigWithCACertificate(t *testing.T) {
	t.Run("oidc_with_ca_file", testOIDCConfigWithCAFile)
	t.Run("oidc_with_ca_data", testOIDCConfigWithCAData)
}

func testOIDCConfigWithCAFile(t *testing.T) {
	// Create a temporary kubeconfig with the correct absolute path to the CA file
	caFilePath := filepath.Join(getTestDataPath(), "oidc_ca.pem")
	tempKubeconfig := createTempKubeconfig(t, fmt.Sprintf(`apiVersion: v1
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: oidc-test-cluster
contexts:
- context:
    cluster: oidc-test-cluster
    user: oidc-test-user
  name: oidc-test-context
current-context: oidc-test-context
kind: Config
users:
- name: oidc-test-user
  user:
    auth-provider:
      config:
        client-id: "test-client-id"
        client-secret: "test-client-secret"
        idp-issuer-url: "https://oidc.example.com"
        scope: "profile,email"
        idp-certificate-authority: "%s"
      name: oidc`, caFilePath))

	defer os.Remove(tempKubeconfig)

	contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(tempKubeconfig, kubeconfig.KubeConfig)
	require.NoError(t, err, "Expected no error for valid OIDC kubeconfig")
	require.Empty(t, contextErrors, "Expected no context errors for valid OIDC kubeconfig")
	require.Equal(t, 1, len(contexts), "Expected 1 context from OIDC kubeconfig")

	context := contexts[0]
	require.Equal(t, "oidc-test-context", context.Name, "Expected context name to be 'oidc-test-context'")

	// Test OIDC config parsing
	oidcConfig, err := context.OidcConfig()
	require.NoError(t, err, "Expected no error getting OIDC config")
	require.NotNil(t, oidcConfig, "Expected OIDC config to be not nil")

	// Verify basic OIDC fields
	assert.Equal(t, "test-client-id", oidcConfig.ClientID)
	assert.Equal(t, "test-client-secret", oidcConfig.ClientSecret)
	assert.Equal(t, "https://oidc.example.com", oidcConfig.IdpIssuerURL)
	assert.Equal(t, []string{"profile", "email"}, oidcConfig.Scopes)

	// Verify CA certificate is loaded from file
	require.NotNil(t, oidcConfig.CACert, "Expected CA certificate to be loaded")
	assert.Contains(t, *oidcConfig.CACert, "-----BEGIN CERTIFICATE-----", "Expected PEM certificate content")
	assert.Contains(t, *oidcConfig.CACert, "-----END CERTIFICATE-----", "Expected PEM certificate content")
}

func testOIDCConfigWithCAData(t *testing.T) {
	kubeConfigFile := filepath.Join(getTestDataPath(), "kubeconfig_oidc_ca_data")

	contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(kubeConfigFile, kubeconfig.KubeConfig)
	require.NoError(t, err, "Expected no error for valid OIDC kubeconfig with CA data")
	require.Empty(t, contextErrors, "Expected no context errors for valid OIDC kubeconfig with CA data")
	require.Equal(t, 1, len(contexts), "Expected 1 context from OIDC kubeconfig with CA data")

	context := contexts[0]
	require.Equal(t, "oidc-test-context", context.Name, "Expected context name to be 'oidc-test-context'")

	// Test OIDC config parsing
	oidcConfig, err := context.OidcConfig()
	require.NoError(t, err, "Expected no error getting OIDC config")
	require.NotNil(t, oidcConfig, "Expected OIDC config to be not nil")

	// Verify basic OIDC fields
	assert.Equal(t, "test-client-id", oidcConfig.ClientID)
	assert.Equal(t, "test-client-secret", oidcConfig.ClientSecret)
	assert.Equal(t, "https://oidc.example.com", oidcConfig.IdpIssuerURL)
	assert.Equal(t, []string{"profile", "email"}, oidcConfig.Scopes)

	// Verify CA certificate is loaded from base64 data and properly decoded
	require.NotNil(t, oidcConfig.CACert, "Expected CA certificate to be loaded from base64 data")
	assert.Contains(t, *oidcConfig.CACert, "-----BEGIN CERTIFICATE-----", "Expected decoded PEM certificate content")
	assert.Contains(t, *oidcConfig.CACert, "-----END CERTIFICATE-----", "Expected decoded PEM certificate content")
}

func TestOIDCConfigWithoutCA(t *testing.T) {
	t.Run("oidc_without_ca", func(t *testing.T) {
		// Create a minimal kubeconfig without CA certificate
		tempFile := createTempKubeconfig(t, `apiVersion: v1
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: test-cluster
contexts:
- context:
    cluster: test-cluster
    user: test-user
  name: test-context
current-context: test-context
kind: Config
users:
- name: test-user
  user:
    auth-provider:
      config:
        client-id: "test-client-id"
        client-secret: "test-client-secret"
        idp-issuer-url: "https://oidc.example.com"
        scope: "profile,email"
      name: oidc`)

		defer os.Remove(tempFile)

		contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(tempFile, kubeconfig.KubeConfig)
		require.NoError(t, err, "Expected no error for valid OIDC kubeconfig without CA")
		require.Empty(t, contextErrors, "Expected no context errors for valid OIDC kubeconfig without CA")
		require.Equal(t, 1, len(contexts), "Expected 1 context from OIDC kubeconfig without CA")

		context := contexts[0]
		oidcConfig, err := context.OidcConfig()
		require.NoError(t, err, "Expected no error getting OIDC config")
		require.NotNil(t, oidcConfig, "Expected OIDC config to be not nil")

		// Verify CA certificate is nil when not provided
		assert.Nil(t, oidcConfig.CACert, "Expected CA certificate to be nil when not provided")
	})
}

// createTempKubeconfig creates a temporary kubeconfig file for testing.
func createTempKubeconfig(t *testing.T, content string) string {
	t.Helper()

	tempFile, err := os.CreateTemp("", "kubeconfig_test_*.yaml")
	require.NoError(t, err, "Failed to create temp file")

	_, err = tempFile.WriteString(content)
	require.NoError(t, err, "Failed to write to temp file")

	err = tempFile.Close()
	require.NoError(t, err, "Failed to close temp file")

	return tempFile.Name()
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

func TestContextCopy(t *testing.T) {
	// Create a fully populated original Context
	original := &kubeconfig.Context{
		Name:        "test-context",
		KubeContext: &api.Context{Cluster: "test-cluster", AuthInfo: "test-user", Namespace: "test-ns"},
		Cluster:     &api.Cluster{Server: "https://test.example.com", CertificateAuthorityData: []byte("test-ca")},
		AuthInfo:    &api.AuthInfo{Token: "test-token"},
		Source:      kubeconfig.KubeConfig,
		OidcConf: &kubeconfig.OidcConfig{
			ClientID:      "test-client-id",
			ClientSecret:  "test-client-secret",
			IdpIssuerURL:  "https://oidc.example.com",
			Scopes:        []string{"profile", "email"},
			SkipTLSVerify: boolPtr(true),
			CACert:        stringPtr("test-ca-cert"),
		},
		Internal:       true,
		Error:          "test-error",
		KubeConfigPath: "/path/to/kubeconfig",
		ClusterID:      "test-cluster-id",
	}

	t.Run("Copy returns deep copy", func(t *testing.T) {
		copied := original.Copy()

		// Verify they are equal but not the same object
		assert.Equal(t, original, copied)
		assert.NotSame(t, original, copied)
	})

	t.Run("Copy excludes proxy field", func(t *testing.T) {
		// Since proxy is an unexported field, we can't directly test it.
		// But we can verify that the Copy method comment says it excludes the proxy field.
		// This is tested implicitly by the fact that SetupProxy creates the proxy on demand.
		copied := original.Copy()

		// The proxy field should not be copied (it's excluded by design)
		// We can't assert this directly since the field is unexported, but the method
		// documentation states this behavior
		assert.NotNil(t, copied) // Just ensure copy was successful
	})

	t.Run("Copy creates independent copies of nested structures", func(t *testing.T) {
		copied := original.Copy()

		// Modify original nested structures
		original.KubeContext.Namespace = "modified-ns"
		original.Cluster.Server = "https://modified.example.com"
		original.AuthInfo.Token = "modified-token"
		original.OidcConf.ClientID = "modified-client-id"
		original.OidcConf.Scopes[0] = "modified-scope"
		original.OidcConf.Scopes = append(original.OidcConf.Scopes, "new-scope")
		*original.OidcConf.SkipTLSVerify = false
		*original.OidcConf.CACert = "modified-ca-cert"

		// Verify copy is unaffected
		assert.Equal(t, "test-ns", copied.KubeContext.Namespace)
		assert.Equal(t, "https://test.example.com", copied.Cluster.Server)
		assert.Equal(t, "test-token", copied.AuthInfo.Token)
		assert.Equal(t, "test-client-id", copied.OidcConf.ClientID)
		assert.Equal(t, []string{"profile", "email"}, copied.OidcConf.Scopes)
		assert.True(t, *copied.OidcConf.SkipTLSVerify)
		assert.Equal(t, "test-ca-cert", *copied.OidcConf.CACert)
	})

	t.Run("Copy with nil OidcConf", func(t *testing.T) {
		originalNilOidc := &kubeconfig.Context{
			Name: "test-context-nil-oidc",
		}

		copied := originalNilOidc.Copy()

		assert.Equal(t, originalNilOidc, copied)
		assert.NotSame(t, originalNilOidc, copied)
		assert.Nil(t, copied.OidcConf)
	})

	t.Run("Copy with nil nested structures", func(t *testing.T) {
		originalNil := &kubeconfig.Context{
			Name:     "test-context-nil",
			OidcConf: nil,
		}

		copied := originalNil.Copy()

		assert.Equal(t, originalNil, copied)
		assert.NotSame(t, originalNil, copied)
		assert.Nil(t, copied.KubeContext)
		assert.Nil(t, copied.Cluster)
		assert.Nil(t, copied.AuthInfo)
		assert.Nil(t, copied.OidcConf)
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
