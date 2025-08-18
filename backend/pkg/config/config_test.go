package config_test

import (
	"os"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseBasic(t *testing.T) {
	tests := []struct {
		name   string
		args   []string
		verify func(*testing.T, *config.Config)
	}{
		{
			name: "no_args_no_env",
			args: nil,
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, false, conf.DevMode)
				assert.Equal(t, "", conf.ListenAddr)
				assert.Equal(t, uint(4466), conf.Port)
				assert.Equal(t, "profile,email", conf.OidcScopes)
			},
		},
		{
			name: "with_args",
			args: []string{"go run ./cmd", "--port=3456"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, uint(3456), conf.Port)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conf, err := config.Parse(tt.args)
			require.NoError(t, err)
			require.NotNil(t, conf)

			tt.verify(t, conf)
		})
	}
}

func TestParseWithEnv(t *testing.T) {
	tests := []struct {
		name   string
		args   []string
		env    map[string]string
		verify func(*testing.T, *config.Config)
	}{
		{
			name: "from_env",
			args: []string{"go run ./cmd", "-in-cluster"},
			env: map[string]string{
				"HEADLAMP_CONFIG_OIDC_CLIENT_SECRET": "superSecretBotsStayAwayPlease",
			},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "superSecretBotsStayAwayPlease", conf.OidcClientSecret)
			},
		},
		{
			name: "both_args_and_env",
			args: []string{"go run ./cmd", "--port=9876"},
			env: map[string]string{
				"HEADLAMP_CONFIG_PORT": "1234",
			},
			verify: func(t *testing.T, conf *config.Config) {
				assert.NotEqual(t, uint(1234), conf.Port)
				assert.Equal(t, uint(9876), conf.Port)
			},
		},
		{
			name: "kubeconfig_from_default_env",
			args: []string{"go run ./cmd"},
			env: map[string]string{
				"KUBECONFIG": "~/.kube/test_config.yaml",
			},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "~/.kube/test_config.yaml", conf.KubeConfigPath)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for key, value := range tt.env {
				os.Setenv(key, value)
			}
			defer func(env map[string]string) {
				for key := range env {
					os.Unsetenv(key)
				}
			}(tt.env)

			conf, err := config.Parse(tt.args)
			require.NoError(t, err)
			require.NotNil(t, conf)

			tt.verify(t, conf)
		})
	}
}

func TestParseErrors(t *testing.T) {
	tests := []struct {
		name          string
		args          []string
		errorContains string
	}{
		{
			name:          "oidc_settings_without_incluster",
			args:          []string{"go run ./cmd", "-oidc-client-id=noClient"},
			errorContains: "are only meant to be used in inCluster mode",
		},
		{
			name:          "invalid_base_url",
			args:          []string{"go run ./cmd", "--base-url=testingthis"},
			errorContains: "base-url",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conf, err := config.Parse(tt.args)
			require.Error(t, err)
			require.Nil(t, conf)
			assert.Contains(t, err.Error(), tt.errorContains)
		})
	}
}

func TestParseFlags(t *testing.T) {
	tests := []struct {
		name   string
		args   []string
		verify func(*testing.T, *config.Config)
	}{
		{
			name: "enable_dynamic_clusters",
			args: []string{"go run ./cmd", "--enable-dynamic-clusters"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, true, conf.EnableDynamicClusters)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conf, err := config.Parse(tt.args)
			require.NoError(t, err)
			require.NotNil(t, conf)

			tt.verify(t, conf)
		})
	}
}
