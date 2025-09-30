package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// getTestDataPath returns the absolute path to the test data directory.
func getTestDataPath() string {
	// Get the current working directory
	cwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}

	// If we're in the config package directory, go up to find the testdata.
	if filepath.Base(cwd) == "config" {
		return filepath.Join(cwd, "test_data")
	}

	// Otherwise, assume we're in the workspace root
	return filepath.Join(cwd, "pkg", "config", "test_data")
}

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
				assert.Equal(t, config.DefaultMeUsernamePath, conf.MeUsernamePath)
				assert.Equal(t, config.DefaultMeEmailPath, conf.MeEmailPath)
				assert.Equal(t, config.DefaultMeGroupsPath, conf.MeGroupsPath)
			},
		},
		{
			name: "with_args",
			args: []string{"go run ./cmd", "--port=3456"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, uint(3456), conf.Port)
				assert.Equal(t, config.DefaultMeUsernamePath, conf.MeUsernamePath)
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

var ParseWithEnvTests = []struct {
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
		name: "me_paths",
		args: []string{"go run ./cmd"},
		env: map[string]string{
			"HEADLAMP_CONFIG_ME_USERNAME_PATH": "user.name",
			"HEADLAMP_CONFIG_ME_EMAIL_PATH":    "user.email",
			"HEADLAMP_CONFIG_ME_GROUPS_PATH":   "user.groups",
		},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, "user.name", conf.MeUsernamePath)
			assert.Equal(t, "user.email", conf.MeEmailPath)
			assert.Equal(t, "user.groups", conf.MeGroupsPath)
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

func TestParseWithEnv(t *testing.T) {
	for _, tt := range ParseWithEnvTests {
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
		{
			name: "oidc_skip_tls_verify_flag",
			args: []string{"go run ./cmd", "--oidc-skip-tls-verify"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, true, conf.OidcSkipTLSVerify)
			},
		},
		{
			name: "oidc_ca_file_flag",
			args: []string{"go run ./cmd", "--oidc-ca-file=" + filepath.Join(getTestDataPath(), "valid_ca.pem")},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, filepath.Join(getTestDataPath(), "valid_ca.pem"), conf.OidcCAFile)
			},
		},
		{
			name: "enable_helm",
			args: []string{"go run ./cmd", "--enable-helm"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, true, conf.EnableHelm)
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

func TestOIDCTLSValidation(t *testing.T) {
	tests := []struct {
		name          string
		args          []string
		expectError   bool
		errorContains string
	}{
		{
			name:        "valid_ca_file",
			args:        []string{"go run ./cmd", "--oidc-ca-file=" + filepath.Join(getTestDataPath(), "valid_ca.pem")},
			expectError: false,
		},
		{
			name:          "invalid_ca_file",
			args:          []string{"go run ./cmd", "--oidc-ca-file=" + filepath.Join(getTestDataPath(), "invalid_ca.pem")},
			expectError:   true,
			errorContains: "invalid oidc-ca-file",
		},
		{
			name:          "non_existent_ca_file",
			args:          []string{"go run ./cmd", "--oidc-ca-file=" + filepath.Join(getTestDataPath(), "nonexistent.pem")},
			expectError:   true,
			errorContains: "error reading oidc-ca-file",
		},
		{
			name:        "skip_tls_verify_without_ca",
			args:        []string{"go run ./cmd", "--oidc-skip-tls-verify"},
			expectError: false,
		},
		{
			name: "skip_tls_verify_with_valid_ca",
			args: []string{
				"go run ./cmd",
				"--oidc-skip-tls-verify",
				"--oidc-ca-file=" + filepath.Join(getTestDataPath(), "valid_ca.pem"),
			},
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conf, err := config.Parse(tt.args)
			if tt.expectError {
				require.Error(t, err)
				require.Nil(t, conf)
				assert.Contains(t, err.Error(), tt.errorContains)
			} else {
				require.NoError(t, err)
				require.NotNil(t, conf)
			}
		})
	}
}

func TestOIDCTLSEnvironmentVariables(t *testing.T) {
	tests := []struct {
		name   string
		args   []string
		env    map[string]string
		verify func(*testing.T, *config.Config)
	}{
		{
			name: "oidc_skip_tls_verify_from_env",
			args: []string{"go run ./cmd"},
			env: map[string]string{
				"HEADLAMP_CONFIG_OIDC_SKIP_TLS_VERIFY": "true",
			},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, true, conf.OidcSkipTLSVerify)
			},
		},
		{
			name: "oidc_ca_file_from_env",
			args: []string{"go run ./cmd"},
			env: map[string]string{
				"HEADLAMP_CONFIG_OIDC_CA_FILE": filepath.Join(getTestDataPath(), "valid_ca.pem"),
			},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, filepath.Join(getTestDataPath(), "valid_ca.pem"), conf.OidcCAFile)
			},
		},
		{
			name: "both_tls_options_from_env",
			args: []string{"go run ./cmd"},
			env: map[string]string{
				"HEADLAMP_CONFIG_OIDC_SKIP_TLS_VERIFY": "true",
				"HEADLAMP_CONFIG_OIDC_CA_FILE":         filepath.Join(getTestDataPath(), "valid_ca.pem"),
			},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, true, conf.OidcSkipTLSVerify)
				assert.Equal(t, filepath.Join(getTestDataPath(), "valid_ca.pem"), conf.OidcCAFile)
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
