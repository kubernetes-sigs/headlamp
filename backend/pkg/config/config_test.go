package config_test

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
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
				assert.Equal(t, "info", conf.LogLevel)
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
		{
			name: "oidc_use_cookie",
			args: []string{"go run ./cmd", "--oidc-use-cookie", "--oidc-client-id=my-id"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, true, conf.OidcUseCookie)
				assert.Equal(t, "my-id", conf.OidcClientID)
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
			"HEADLAMP_CONFIG_ME_USER_INFO_URL": "/oauth2/userinfo",
		},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, "user.name", conf.MeUsernamePath)
			assert.Equal(t, "user.email", conf.MeEmailPath)
			assert.Equal(t, "user.groups", conf.MeGroupsPath)
			assert.Equal(t, "/oauth2/userinfo", conf.MeUserInfoURL)
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
	{
		name: "in_cluster_context_name_env",
		args: []string{"go run ./cmd"},
		env: map[string]string{
			"HEADLAMP_CONFIG_IN_CLUSTER_CONTEXT_NAME": "mycluster",
		},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, "mycluster", conf.InClusterContextName)
		},
	},
	{
		name: "log_level_from_env",
		args: []string{"go run ./cmd"},
		env: map[string]string{
			"HEADLAMP_CONFIG_LOG_LEVEL": "warn",
		},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, "warn", conf.LogLevel)
		},
	},
}

func TestParseWithEnv(t *testing.T) {
	for _, tt := range ParseWithEnvTests {
		t.Run(tt.name, func(t *testing.T) {
			for key, value := range tt.env {
				require.NoError(t, os.Setenv(key, value))
			}
			defer func(env map[string]string) {
				for key := range env {
					require.NoError(t, os.Unsetenv(key))
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
			errorContains: "flags are only meant to be used in inCluster mode or with --oidc-use-cookie",
		},
		{
			name:          "invalid_base_url",
			args:          []string{"go run ./cmd", "--base-url=testingthis"},
			errorContains: "base-url",
		},
		{
			name:          "no_browser_without_embed",
			args:          []string{"go run ./cmd", "--no-browser"},
			errorContains: "no-browser cannot be used when running without embedded frontend",
		},
		{
			name:          "no_browser_in_cluster",
			args:          []string{"go run ./cmd", "--no-browser", "--in-cluster"},
			errorContains: "no-browser cannot be used in in-cluster mode",
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
		{
			name: "in_cluster_context_name_flag",
			args: []string{"go run ./cmd", "--in-cluster-context-name=mycluster"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "mycluster", conf.InClusterContextName)
			},
		},
		{
			name: "log_level_flag",
			args: []string{"go run ./cmd", "--log-level=warn"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "warn", conf.LogLevel)
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
				require.NoError(t, os.Setenv(key, value))
			}
			defer func(env map[string]string) {
				for key := range env {
					require.NoError(t, os.Unsetenv(key))
				}
			}(tt.env)

			conf, err := config.Parse(tt.args)
			require.NoError(t, err)
			require.NotNil(t, conf)

			tt.verify(t, conf)
		})
	}
}

var applyMeDefaultsTests = []struct {
	name             string
	usernamePath     string
	emailPath        string
	groupsPath       string
	userInfoURL      string
	wantUsernamePath string
	wantEmailPath    string
	wantGroupsPath   string
	wantUserInfoURL  string
}{
	{
		name:             "all_empty_uses_defaults",
		usernamePath:     "",
		emailPath:        "",
		groupsPath:       "",
		userInfoURL:      "",
		wantUsernamePath: config.DefaultMeUsernamePath,
		wantEmailPath:    config.DefaultMeEmailPath,
		wantGroupsPath:   config.DefaultMeGroupsPath,
		wantUserInfoURL:  config.DefaultMeUserInfoURL,
	},
	{
		name:             "whitespace_only_uses_defaults",
		usernamePath:     "   ",
		emailPath:        "  ",
		groupsPath:       "\t",
		userInfoURL:      "  ",
		wantUsernamePath: config.DefaultMeUsernamePath,
		wantEmailPath:    config.DefaultMeEmailPath,
		wantGroupsPath:   config.DefaultMeGroupsPath,
		wantUserInfoURL:  config.DefaultMeUserInfoURL,
	},
	{
		name:             "all_custom_values_preserved",
		usernamePath:     "custom.username",
		emailPath:        "custom.email",
		groupsPath:       "custom.groups",
		userInfoURL:      "/oauth2/userinfo",
		wantUsernamePath: "custom.username",
		wantEmailPath:    "custom.email",
		wantGroupsPath:   "custom.groups",
		wantUserInfoURL:  "/oauth2/userinfo",
	},
	{
		name:             "partial_empty_uses_defaults_for_empty",
		usernamePath:     "my.user",
		emailPath:        "",
		groupsPath:       "my.groups",
		userInfoURL:      "",
		wantUsernamePath: "my.user",
		wantEmailPath:    config.DefaultMeEmailPath,
		wantGroupsPath:   "my.groups",
		wantUserInfoURL:  config.DefaultMeUserInfoURL,
	},
	{
		name:             "values_with_surrounding_whitespace_are_trimmed",
		usernamePath:     "  trimmed.user  ",
		emailPath:        "  trimmed.email  ",
		groupsPath:       "  trimmed.groups  ",
		userInfoURL:      "  /some/url  ",
		wantUsernamePath: "trimmed.user",
		wantEmailPath:    "trimmed.email",
		wantGroupsPath:   "trimmed.groups",
		wantUserInfoURL:  "/some/url",
	},
}

func TestApplyMeDefaults(t *testing.T) {
	for _, tt := range applyMeDefaultsTests {
		t.Run(tt.name, func(t *testing.T) {
			gotUsername, gotEmail, gotGroups, gotUserInfo := config.ApplyMeDefaults(
				tt.usernamePath, tt.emailPath, tt.groupsPath, tt.userInfoURL,
			)
			assert.Equal(t, tt.wantUsernamePath, gotUsername)
			assert.Equal(t, tt.wantEmailPath, gotEmail)
			assert.Equal(t, tt.wantGroupsPath, gotGroups)
			assert.Equal(t, tt.wantUserInfoURL, gotUserInfo)
		})
	}
}

func TestValidateSessionTTL(t *testing.T) {
	tests := []struct {
		name          string
		args          []string
		expectError   bool
		errorContains string
	}{
		{
			name:          "session_ttl_zero",
			args:          []string{"go run ./cmd", "--session-ttl=0"},
			expectError:   true,
			errorContains: "session-ttl cannot be negative or equal to zero",
		},
		{
			name:          "session_ttl_negative",
			args:          []string{"go run ./cmd", "--session-ttl=-1"},
			expectError:   true,
			errorContains: "session-ttl cannot be negative or equal to zero",
		},
		{
			name:          "session_ttl_exceeds_one_year",
			args:          []string{"go run ./cmd", "--session-ttl=31536001"},
			expectError:   true,
			errorContains: "session-ttl cannot be greater than 1 year",
		},
		{
			name:        "session_ttl_exactly_one_year",
			args:        []string{"go run ./cmd", "--session-ttl=31536000"},
			expectError: false,
		},
		{
			name:        "session_ttl_minimum_valid",
			args:        []string{"go run ./cmd", "--session-ttl=1"},
			expectError: false,
		},
		{
			name:        "session_ttl_default",
			args:        []string{"go run ./cmd"},
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

var validateTracingTests = []struct {
	name          string
	args          []string
	expectError   bool
	errorContains string
}{
	{
		name: "tracing_enabled_without_service_name",
		args: []string{
			"go run ./cmd",
			"--tracing-enabled=true",
			"--service-name=",
		},
		expectError:   true,
		errorContains: "service-name is required when tracing is enabled",
	},
	{
		name: "tracing_enabled_with_service_name",
		args: []string{
			"go run ./cmd",
			"--tracing-enabled=true",
			"--service-name=myapp",
			"--otlp-endpoint=localhost:4317",
		},
		expectError: false,
	},
	{
		name: "otlp_http_without_endpoint",
		args: []string{
			"go run ./cmd",
			"--tracing-enabled=true",
			"--service-name=myapp",
			"--use-otlp-http=true",
			"--otlp-endpoint=",
		},
		expectError:   true,
		errorContains: "otlp-endpoint must be configured when use-otlp-http is enabled",
	},
	{
		name: "tracing_disabled_no_validation",
		args: []string{
			"go run ./cmd",
			"--tracing-enabled=false",
		},
		expectError: false,
	},
}

func TestValidateTracing(t *testing.T) {
	for _, tt := range validateTracingTests {
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

func TestMakeHeadlampKubeConfigsDir(t *testing.T) {
	tmpDir := t.TempDir()

	switch runtime.GOOS {
	case "windows":
		t.Setenv("APPDATA", tmpDir)
	case "darwin":
		t.Setenv("HOME", tmpDir)
	default:
		t.Setenv("XDG_CONFIG_HOME", tmpDir)
	}

	dir, err := config.MakeHeadlampKubeConfigsDir()
	require.NoError(t, err)
	assert.NotEmpty(t, dir)

	info, err := os.Stat(dir)
	require.NoError(t, err)
	assert.True(t, info.IsDir())
	assert.True(t, strings.HasPrefix(dir, tmpDir))
}

func TestDefaultHeadlampKubeConfigFile(t *testing.T) {
	tmpDir := t.TempDir()

	switch runtime.GOOS {
	case "windows":
		t.Setenv("APPDATA", tmpDir)
	case "darwin":
		t.Setenv("HOME", tmpDir)
	default:
		t.Setenv("XDG_CONFIG_HOME", tmpDir)
	}

	path, err := config.DefaultHeadlampKubeConfigFile()
	require.NoError(t, err)
	assert.NotEmpty(t, path)
	assert.Equal(t, "config", filepath.Base(path))
	assert.True(t, strings.HasPrefix(path, tmpDir))

	info, err := os.Stat(filepath.Dir(path))
	require.NoError(t, err)
	assert.True(t, info.IsDir())
}
