package config_test

import (
	"os"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParse(t *testing.T) {
	type envVar struct {
		key   string
		value string
	}
	testCases := []struct {
		name           string
		args           []string
		envs           []envVar
		expectConfig   func(*testing.T, *config.Config)
		expectError    func(*testing.T, error)
	}{
		{
			name: "no_args_no_env",
			args: nil,
			envs: nil,
			expectConfig: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, false, conf.DevMode)
				assert.Equal(t, "", conf.ListenAddr)
				assert.Equal(t, uint(4466), conf.Port)
				assert.Equal(t, "profile,email", conf.OidcScopes)
			},
			expectError: func(t *testing.T, err error) { require.NoError(t, err) },
		},
		{
			name: "with_args",
			args: []string{"go run ./cmd", "--port=3456"},
			envs: nil,
			expectConfig: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, uint(3456), conf.Port)
			},
			expectError: func(t *testing.T, err error) { require.NoError(t, err) },
		},
		{
			name: "from_env",
			args: []string{"go run ./cmd", "-in-cluster"},
			envs: []envVar{{"HEADLAMP_CONFIG_OIDC_CLIENT_SECRET", "superSecretBotsStayAwayPlease"}},
			expectConfig: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "superSecretBotsStayAwayPlease", conf.OidcClientSecret)
			},
			expectError: func(t *testing.T, err error) { require.NoError(t, err) },
		},
		{
			name: "both_args_and_env",
			args: []string{"go run ./cmd", "--port=9876"},
			envs: []envVar{{"HEADLAMP_CONFIG_PORT", "1234"}},
			expectConfig: func(t *testing.T, conf *config.Config) {
				assert.NotEqual(t, uint(1234), conf.Port)
				assert.Equal(t, uint(9876), conf.Port)
			},
			expectError: func(t *testing.T, err error) { require.NoError(t, err) },
		},
		{
			name: "oidc_settings_without_incluster",
			args: []string{"go run ./cmd", "-oidc-client-id=noClient"},
			envs: nil,
			expectConfig: func(t *testing.T, conf *config.Config) { require.Nil(t, conf) },
			expectError: func(t *testing.T, err error) {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "are only meant to be used in inCluster mode")
			},
		},
		{
			name: "invalid_base_url",
			args: []string{"go run ./cmd", "--base-url=testingthis"},
			envs: nil,
			expectConfig: func(t *testing.T, conf *config.Config) { require.Nil(t, conf) },
			expectError: func(t *testing.T, err error) {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "base-url")
			},
		},
		{
			name: "kubeconfig_from_default_env",
			args: []string{"go run ./cmd"},
			envs: []envVar{{"KUBECONFIG", "~/.kube/test_config.yaml"}},
			expectConfig: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, conf.KubeConfigPath, "~/.kube/test_config.yaml")
			},
			expectError: func(t *testing.T, err error) { require.NoError(t, err) },
		},
		{
			name: "enable_dynamic_clusters",
			args: []string{"go run ./cmd", "--enable-dynamic-clusters"},
			envs: nil,
			expectConfig: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, true, conf.EnableDynamicClusters)
			},
			expectError: func(t *testing.T, err error) { require.NoError(t, err) },
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Set env vars
			for _, env := range tc.envs {
				os.Setenv(env.key, env.value)
				defer os.Unsetenv(env.key)
			}
			conf, err := config.Parse(tc.args)
			tc.expectError(t, err)
			if err == nil {
				require.NotNil(t, conf)
				tc.expectConfig(t, conf)
			}
		})
	}
}
