/*
Copyright 2025 The Kubernetes Authors.

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

package config_test

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterdiscovery"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMain(m *testing.M) {
	clusterInventoryEnv := []string{
		"HEADLAMP_CONFIG_ENABLE_CLUSTER_INVENTORY",
		"HEADLAMP_CONFIG_CLUSTER_INVENTORY_PROVIDER_FILE",
		"HEADLAMP_CONFIG_CLUSTER_INVENTORY_LABEL_SELECTOR",
		"HEADLAMP_CONFIG_CLUSTER_INVENTORY_NAMESPACES",
		"HEADLAMP_CONFIG_CLUSTER_INVENTORY_ROOT_RECONCILE_INTERVAL",
		"HEADLAMP_CONFIG_CLUSTER_INVENTORY_NO_CRD_CACHE_TTL",
	}

	previous := map[string]string{}
	for _, key := range clusterInventoryEnv {
		previous[key] = os.Getenv(key)
		_ = os.Unsetenv(key)
	}

	code := m.Run()

	for _, key := range clusterInventoryEnv {
		if previous[key] == "" {
			_ = os.Unsetenv(key)
		} else {
			_ = os.Setenv(key, previous[key])
		}
	}

	os.Exit(code)
}

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

func setUserConfigDir(t *testing.T, dir string) {
	t.Helper()

	switch runtime.GOOS {
	case "windows":
		t.Setenv("APPDATA", dir)
	case "darwin":
		t.Setenv("HOME", dir)
	default:
		t.Setenv("XDG_CONFIG_HOME", dir)
	}
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
				// proxy-auth defaults
				assert.Equal(t, false, conf.ProxyAuthEnabled)
				assert.Equal(t, "X-Forwarded-User", conf.ProxyAuthUsernameHeader)
				assert.Equal(t, "X-Forwarded-Group", conf.ProxyAuthGroupHeader)
				assert.Equal(t, "X-Forwarded-Email", conf.ProxyAuthEmailHeader)
				assert.Equal(t, "X-Forwarded-Id-Token", conf.ProxyAuthTokenHeader)
				assert.Equal(t, "", conf.ServiceAccountTokenPath)
			},
		},
		{
			name: "with_args",
			args: []string{
				"go run ./cmd", "--port=3456",
				"--pod-debug-image=registry.example.com/debug:latest",
				"--node-shell-image=registry.example.com/shell:latest",
				"--node-shell-namespace=custom-ns",
			},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, uint(3456), conf.Port)
				assert.Equal(t, "registry.example.com/debug:latest", conf.PodDebugImage)
				assert.Equal(t, "registry.example.com/shell:latest", conf.NodeShellImage)
				assert.Equal(t, "custom-ns", conf.NodeShellNamespace)
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

func TestParseOidcAutoLogin(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd", "--oidc-auto-login=true"})
	require.NoError(t, err)
	require.NotNil(t, conf)
	assert.True(t, conf.OidcAutoLogin)
}

func TestParseCacheMaxClientsets(t *testing.T) {
	tests := []struct {
		name   string
		args   []string
		verify func(*testing.T, *config.Config)
	}{
		{
			name: "default_value",
			args: nil,
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, config.DefaultCacheMaxClientsets, conf.CacheMaxClientsets)
			},
		},
		{
			name: "flag_configured",
			args: []string{"go run ./cmd", "--cache-max-clientsets=512"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, 512, conf.CacheMaxClientsets)
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

func TestParseAppName(t *testing.T) {
	tests := []struct {
		name           string
		args           []string
		defaultAppName string
		envValue       string
		expected       string
	}{
		{
			name:           "default",
			defaultAppName: "Headlamp",
			expected:       "Headlamp",
		},
		{
			name:           "linker default",
			defaultAppName: "Branded Headlamp",
			expected:       "Branded Headlamp",
		},
		{
			name:           "environment",
			defaultAppName: "Branded Headlamp",
			envValue:       "Environment Headlamp",
			expected:       "Environment Headlamp",
		},
		{
			name:           "flag overrides environment",
			args:           []string{"headlamp-server", "--app-name=Flag Headlamp"},
			defaultAppName: "Branded Headlamp",
			envValue:       "Environment Headlamp",
			expected:       "Flag Headlamp",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envValue == "" {
				require.NoError(t, os.Unsetenv("HEADLAMP_CONFIG_APP_NAME"))
				t.Cleanup(func() {
					_ = os.Unsetenv("HEADLAMP_CONFIG_APP_NAME")
				})
			} else {
				t.Setenv("HEADLAMP_CONFIG_APP_NAME", tt.envValue)
			}

			conf, err := config.ParseWithAppNameDefault(tt.args, tt.defaultAppName)
			require.NoError(t, err)
			assert.Equal(t, tt.expected, conf.AppName)
		})
	}
}

func TestParseInvalidAppName(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		envValue string
	}{
		{
			name: "carriage return from flag",
			args: []string{"headlamp-server", "--app-name=Headlamp\rInjected"},
		},
		{
			name:     "line feed from environment",
			args:     []string{"headlamp-server"},
			envValue: "Headlamp\nInjected",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envValue == "" {
				require.NoError(t, os.Unsetenv("HEADLAMP_CONFIG_APP_NAME"))
				t.Cleanup(func() {
					_ = os.Unsetenv("HEADLAMP_CONFIG_APP_NAME")
				})
			} else {
				t.Setenv("HEADLAMP_CONFIG_APP_NAME", tt.envValue)
			}

			_, err := config.Parse(tt.args)
			require.ErrorContains(t, err, "app-name contains invalid HTTP header characters")
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
		name: "oidc_auto_login_from_env",
		args: []string{"go run ./cmd"},
		env: map[string]string{
			"HEADLAMP_CONFIG_OIDC_AUTO_LOGIN": "true",
		},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, true, conf.OidcAutoLogin)
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
	{
		name: "proxy_auth_enabled_from_env",
		args: []string{"go run ./cmd"},
		env: map[string]string{
			"HEADLAMP_CONFIG_PROXY_AUTH": "true",
		},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, true, conf.ProxyAuthEnabled)
		},
	},
	{
		name: "proxy_auth_headers_from_env",
		args: []string{"go run ./cmd"},
		env: map[string]string{
			"HEADLAMP_CONFIG_PROXY_AUTH":                 "true",
			"HEADLAMP_CONFIG_PROXY_AUTH_USERNAME_HEADER": "X-Env-User",
			"HEADLAMP_CONFIG_PROXY_AUTH_GROUP_HEADER":    "X-Env-Group",
			"HEADLAMP_CONFIG_PROXY_AUTH_EMAIL_HEADER":    "X-Env-Email",
			"HEADLAMP_CONFIG_PROXY_AUTH_TOKEN_HEADER":    "X-Env-Token-Header", // #nosec G101
		},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, true, conf.ProxyAuthEnabled)
			assert.Equal(t, "X-Env-User", conf.ProxyAuthUsernameHeader)
			assert.Equal(t, "X-Env-Group", conf.ProxyAuthGroupHeader)
			assert.Equal(t, "X-Env-Email", conf.ProxyAuthEmailHeader)
			assert.Equal(t, "X-Env-Token-Header", conf.ProxyAuthTokenHeader)
		},
	},
	{
		name: "watch_plugins_changes_env_kept_in_cluster",
		args: []string{"go run ./cmd", "--in-cluster"},
		env: map[string]string{
			"HEADLAMP_CONFIG_WATCH_PLUGINS_CHANGES": "true",
		},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, true, conf.WatchPluginsChanges)
		},
	},
	{
		name: "watch_plugins_changes_env_kept_in_cluster_from_env",
		args: []string{"go run ./cmd"},
		env: map[string]string{
			"HEADLAMP_CONFIG_IN_CLUSTER":            "true",
			"HEADLAMP_CONFIG_WATCH_PLUGINS_CHANGES": "true",
		},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, true, conf.InCluster)
			assert.Equal(t, true, conf.WatchPluginsChanges)
		},
	},
	{
		name: "watch_plugins_changes_env_false_kept_in_cluster",
		args: []string{"go run ./cmd", "--in-cluster"},
		env: map[string]string{
			"HEADLAMP_CONFIG_WATCH_PLUGINS_CHANGES": "false",
		},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, false, conf.WatchPluginsChanges)
		},
	},
}

func TestParseWithEnv(t *testing.T) {
	for _, tt := range ParseWithEnvTests {
		t.Run(tt.name, func(t *testing.T) {
			for key, value := range tt.env {
				t.Setenv(key, value)
			}

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
			name: "oidc_settings_without_incluster",
			args: []string{"go run ./cmd", "-oidc-client-id=noClient"},
			errorContains: "flags are only meant to be used in inCluster mode, with --oidc-use-cookie, " +
				"or with enabled cluster discovery",
		},
		{
			name:          "unsafe_use_service_account_token_without_incluster",
			args:          []string{"go run ./cmd", "--unsafe-use-service-account-token"},
			errorContains: "are only meant to be used with --in-cluster",
		},
		{
			name: "service_account_token_path_without_incluster",
			args: []string{
				"go run ./cmd",
				"--service-account-token-path=/custom/token/path",
			},
			errorContains: "are only meant to be used with --in-cluster",
		},
		{
			name: "service_account_token_path_requires_unsafe_flag",
			args: []string{
				"go run ./cmd",
				"--in-cluster",
				"--service-account-token-path=/custom/token/path",
			},
			errorContains: "--service-account-token-path requires --unsafe-use-service-account-token",
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

type parseFlagTest struct {
	name   string
	args   []string
	verify func(*testing.T, *config.Config)
}

var parseFlagTests = []parseFlagTest{
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
		name: "oidc_skip_logout_flag",
		args: []string{"go run ./cmd", "--oidc-skip-logout"},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, true, conf.OidcSkipLogout)
		},
	},
	{
		name: "oidc_ca_file_flag",
		args: []string{
			"go run ./cmd",
			"--oidc-ca-file=" + filepath.Join(getTestDataPath(), "valid_ca.pem"),
		},
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
	{
		name: "unsafe_use_service_account_token_flag",
		args: []string{
			"go run ./cmd",
			"--in-cluster",
			"--unsafe-use-service-account-token",
			"--service-account-token-path=/custom/token/path",
		},
		verify: func(t *testing.T, conf *config.Config) {
			assert.Equal(t, true, conf.UnsafeUseServiceAccountToken)
			assert.Equal(t, "/custom/token/path", conf.ServiceAccountTokenPath)
		},
	},
}

func TestParseFlags(t *testing.T) {
	runParseFlagTests(t, parseFlagTests)
}

func TestParseSettingsFlag(t *testing.T) {
	conf, err := config.Parse([]string{"-in-cluster", "-settings", "/etc/headlamp/settings.json"})
	require.NoError(t, err)
	assert.Equal(t, "/etc/headlamp/settings.json", conf.SettingsPath)

	conf, err = config.Parse([]string{"-in-cluster"})
	require.NoError(t, err)
	assert.Empty(t, conf.SettingsPath)
}

func runParseFlagTests(t *testing.T, tests []parseFlagTest) {
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conf, err := config.Parse(tt.args)
			require.NoError(t, err)
			require.NotNil(t, conf)

			tt.verify(t, conf)
		})
	}
}

func TestProxyAuthFlags(t *testing.T) {
	tests := []struct {
		name   string
		args   []string
		verify func(*testing.T, *config.Config)
	}{
		{
			name: "proxy_auth_enabled_flag",
			args: []string{"go run ./cmd", "--proxy-auth"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, true, conf.ProxyAuthEnabled)
			},
		},
		{
			name: "proxy_auth_username_header_flag",
			args: []string{"go run ./cmd", "--proxy-auth-username-header=X-Custom-User"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "X-Custom-User", conf.ProxyAuthUsernameHeader)
			},
		},
		{
			name: "proxy_auth_group_header_flag",
			args: []string{"go run ./cmd", "--proxy-auth-group-header=X-Custom-Group"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "X-Custom-Group", conf.ProxyAuthGroupHeader)
			},
		},
		{
			name: "proxy_auth_email_header_flag",
			args: []string{"go run ./cmd", "--proxy-auth-email-header=X-Custom-Email"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "X-Custom-Email", conf.ProxyAuthEmailHeader)
			},
		},
		{
			name: "proxy_auth_token_header_flag",
			args: []string{"go run ./cmd", "--proxy-auth-token-header=X-Custom-Token"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "X-Custom-Token", conf.ProxyAuthTokenHeader)
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

func TestParseClusterInventoryFlags(t *testing.T) {
	conf, err := config.Parse([]string{
		"go run ./cmd",
		"--enable-cluster-inventory",
		"--oidc-client-id=headlamp",
		"--oidc-idp-issuer-url=https://idp.example.com",
		"--cluster-inventory-label-selector=environment=prod,!headlamp.dev/ignore",
		"--cluster-inventory-namespaces=team-a,team-b",
		"--cluster-inventory-root-reconcile-interval=15s",
		"--cluster-inventory-no-crd-cache-ttl=1m",
	})
	require.NoError(t, err)

	assert.True(t, conf.DiscoverySources["cluster_inventory"].Enabled)
	assert.Equal(t, "environment=prod,!headlamp.dev/ignore", conf.DiscoverySources["cluster_inventory"].LabelSelector)
	assert.Equal(t, "team-a,team-b", conf.DiscoverySources["cluster_inventory"].Namespaces)
	assert.Equal(t, 15*time.Second, conf.DiscoverySources["cluster_inventory"].RootReconcileInterval)
	assert.Equal(t, time.Minute, conf.DiscoverySources["cluster_inventory"].NoCRDCacheTTL)
}

func TestParseClusterInventoryEnv(t *testing.T) {
	t.Setenv("HEADLAMP_CONFIG_ENABLE_CLUSTER_INVENTORY", "true")
	t.Setenv("HEADLAMP_CONFIG_OIDC_CLIENT_ID", "headlamp")
	t.Setenv("HEADLAMP_CONFIG_OIDC_IDP_ISSUER_URL", "https://idp.example.com")
	t.Setenv("HEADLAMP_CONFIG_CLUSTER_INVENTORY_LABEL_SELECTOR", "!headlamp.dev/ignore")
	t.Setenv("HEADLAMP_CONFIG_CLUSTER_INVENTORY_NAMESPACES", "*")

	conf, err := config.Parse([]string{"go run ./cmd"})
	require.NoError(t, err)

	assert.True(t, conf.DiscoverySources["cluster_inventory"].Enabled)
	assert.Equal(t, "!headlamp.dev/ignore", conf.DiscoverySources["cluster_inventory"].LabelSelector)
	assert.Equal(t, "*", conf.DiscoverySources["cluster_inventory"].Namespaces)
}

func TestParseClusterInventoryDefaultIntervals(t *testing.T) {
	conf, err := config.Parse([]string{
		"go run ./cmd",
		"--enable-cluster-inventory",
		"--oidc-client-id=headlamp",
		"--oidc-idp-issuer-url=https://idp.example.com",
	})
	require.NoError(t, err)

	assert.Equal(t, clusterdiscovery.DefaultRootReconcileInterval,
		conf.DiscoverySources["cluster_inventory"].RootReconcileInterval)
	assert.Equal(t, clusterdiscovery.DefaultNoCRDCacheTTL, conf.DiscoverySources["cluster_inventory"].NoCRDCacheTTL)
	assert.Empty(t, conf.DiscoverySources["cluster_inventory"].LabelSelector)
	assert.Empty(t, conf.DiscoverySources["cluster_inventory"].Namespaces)
}

// Every discovery source gets the same tuning flags, not only Cluster Inventory.
func TestParseClusterAPITuningFlags(t *testing.T) {
	conf, err := config.Parse([]string{
		"go run ./cmd",
		"--enable-cluster-api",
		"--oidc-client-id=headlamp",
		"--oidc-idp-issuer-url=https://idp.example.com",
		"--cluster-api-root-reconcile-interval=15s",
		"--cluster-api-no-crd-cache-ttl=1m",
	})
	require.NoError(t, err)

	assert.True(t, conf.DiscoverySources["cluster_api"].Enabled)
	assert.Equal(t, 15*time.Second, conf.DiscoverySources["cluster_api"].RootReconcileInterval)
	assert.Equal(t, time.Minute, conf.DiscoverySources["cluster_api"].NoCRDCacheTTL)
	// The sources are configured independently.
	assert.Equal(t, clusterdiscovery.DefaultRootReconcileInterval,
		conf.DiscoverySources["cluster_inventory"].RootReconcileInterval)
}

func TestParseClusterAPIDefaultIntervals(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd"})
	require.NoError(t, err)

	assert.Equal(t, clusterdiscovery.DefaultRootReconcileInterval,
		conf.DiscoverySources["cluster_api"].RootReconcileInterval)
	assert.Equal(t, clusterdiscovery.DefaultNoCRDCacheTTL, conf.DiscoverySources["cluster_api"].NoCRDCacheTTL)
}

func TestClusterInventoryValidation(t *testing.T) {
	for _, tc := range []struct {
		name    string
		args    []string
		wantErr string
	}{
		{name: "disabled"},
		{name: "requires OIDC", args: []string{"--enable-cluster-inventory"}, wantErr: "cluster discovery requires"},
		{
			name: "requires issuer",
			args: []string{"--enable-cluster-inventory", "--oidc-client-id=headlamp"}, wantErr: "cluster discovery requires",
		},
		{
			name:    "rejects provider files",
			args:    []string{"--enable-cluster-inventory", "--cluster-inventory-provider-file=/old/config.json"},
			wantErr: "no longer supported",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			conf, err := config.Parse(append([]string{"headlamp"}, tc.args...))
			if tc.wantErr != "" {
				require.ErrorContains(t, err, tc.wantErr)
				require.Nil(t, conf)

				return
			}

			require.NoError(t, err)
			assert.False(t, conf.DiscoverySources["cluster_inventory"].Enabled)
		})
	}

	t.Run("rejects legacy provider environment", func(t *testing.T) {
		t.Setenv("HEADLAMP_CONFIG_ENABLE_CLUSTER_INVENTORY", "true")
		t.Setenv("HEADLAMP_CONFIG_CLUSTER_INVENTORY_PROVIDER_FILE", "/old/config.json")

		_, err := config.Parse([]string{"headlamp"})
		require.ErrorContains(t, err, "no longer supported")
	})
}

func TestClusterInventoryRejectsInvalidNamespaces(t *testing.T) {
	invalidNamespaces := []struct {
		name       string
		namespaces string
	}{
		{name: "invalid DNS label", namespaces: "Team_A"},
		{name: "empty list entry", namespaces: "team-a,,team-b"},
		{name: "repeated wildcard", namespaces: "*,*"},
	}

	for _, tt := range invalidNamespaces {
		t.Run("enabled rejects "+tt.name, func(t *testing.T) {
			conf, err := config.Parse([]string{
				"go run ./cmd",
				"--enable-cluster-inventory",
				"--oidc-client-id=headlamp",
				"--oidc-idp-issuer-url=https://idp.example.com",
				"--cluster-inventory-namespaces=" + tt.namespaces,
			})
			require.Error(t, err)
			require.Nil(t, conf)
			assert.Contains(t, err.Error(), "cluster-inventory-namespaces")
		})
	}
}

func TestClusterInventoryRejectsInvalidLabelSelector(t *testing.T) {
	conf, err := config.Parse([]string{
		"go run ./cmd",
		"--enable-cluster-inventory",
		"--oidc-client-id=headlamp",
		"--oidc-idp-issuer-url=https://idp.example.com",
		"--cluster-inventory-label-selector=headlamp.dev/ignore in (",
	})
	require.Error(t, err)
	require.Nil(t, conf)
	assert.Contains(t, err.Error(), "invalid cluster-inventory-label-selector")
}

func TestClusterInventoryOIDCAuthValidation(t *testing.T) {
	t.Run("oidc auth allows global oidc flags without in-cluster", func(t *testing.T) {
		conf, err := config.Parse([]string{
			"go run ./cmd",
			"--enable-cluster-inventory",
			"--oidc-client-id=headlamp",
			"--oidc-idp-issuer-url=https://idp.example.com",
		})
		require.NoError(t, err)
		assert.Empty(t, conf.ClusterInventoryProviderFile)
	})

	t.Run("oidc auth requires oidc identity flags", func(t *testing.T) {
		conf, err := config.Parse([]string{
			"go run ./cmd",
			"--enable-cluster-inventory",
			"--oidc-idp-issuer-url=https://idp.example.com",
		})
		require.Error(t, err)
		require.Nil(t, conf)
		assert.Contains(t, err.Error(), "cluster discovery requires")
	})

	t.Run("oidc auth rejects blank scopes", func(t *testing.T) {
		conf, err := config.Parse([]string{
			"go run ./cmd",
			"--enable-cluster-inventory",
			"--oidc-client-id=headlamp",
			"--oidc-idp-issuer-url=https://idp.example.com",
			"--oidc-scopes=, ,\t",
		})
		require.Error(t, err)
		require.Nil(t, conf)
		assert.Contains(t, err.Error(), "cluster discovery requires")
	})
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

func TestOIDCSkipLogoutEnvironmentVariable(t *testing.T) {
	t.Setenv("HEADLAMP_CONFIG_OIDC_SKIP_LOGOUT", "true")

	conf, err := config.Parse([]string{"go run ./cmd"})
	require.NoError(t, err)
	assert.True(t, conf.OidcSkipLogout)
}

func writeOIDCSecretFiles(t *testing.T) (string, string, string) {
	t.Helper()

	tempDir := t.TempDir()
	idFile := filepath.Join(tempDir, "client-id")
	secretFile := filepath.Join(tempDir, "client-secret")

	require.NoError(t, os.WriteFile(idFile, []byte("  my-file-client-id \n"), 0o600))
	require.NoError(t, os.WriteFile(secretFile, []byte(" my-file-secret\r\n"), 0o600))

	return tempDir, idFile, secretFile
}

func TestOIDCSecretFiles(t *testing.T) {
	_, idFile, secretFile := writeOIDCSecretFiles(t)

	conf, err := config.Parse([]string{
		"go run ./cmd",
		"--in-cluster",
		"--oidc-client-id-file=" + idFile,
		"--oidc-client-secret-file=" + secretFile,
	})
	require.NoError(t, err)
	require.NotNil(t, conf)
	assert.Equal(t, idFile, conf.OidcClientIDFile)
	assert.Equal(t, secretFile, conf.OidcClientSecretFile)
	assert.Equal(t, "my-file-client-id", conf.OidcClientID)
	assert.Equal(t, "my-file-secret", conf.OidcClientSecret)
}

func TestOIDCSecretFilesMissing(t *testing.T) {
	tempDir := t.TempDir()

	tests := []struct {
		name    string
		flag    string
		wantErr string
	}{
		{"client-id-file", "--oidc-client-id-file=", "error reading oidc-client-id-file"},
		{"client-secret-file", "--oidc-client-secret-file=", "error reading oidc-client-secret-file"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conf, err := config.Parse([]string{
				"go run ./cmd",
				"--in-cluster",
				tt.flag + filepath.Join(tempDir, "nonexistent"),
			})
			require.Error(t, err)
			require.Nil(t, conf)
			assert.Contains(t, err.Error(), tt.wantErr)
		})
	}
}

func TestOIDCSecretFilesEmptyClientID(t *testing.T) {
	for _, contents := range []string{"", " \t\r\n"} {
		t.Run("contents="+contents, func(t *testing.T) {
			t.Setenv("HEADLAMP_CONFIG_OIDC_CLIENT_ID", "env-client-id")
			idFile := filepath.Join(t.TempDir(), "client-id")
			require.NoError(t, os.WriteFile(idFile, []byte(contents), 0o600))

			conf, err := config.Parse([]string{
				"go run ./cmd", "--in-cluster", "--oidc-client-id-file=" + idFile,
			})
			require.Error(t, err)
			require.Nil(t, conf)
			assert.Contains(t, err.Error(), "oidc-client-id-file must contain a non-empty client ID")
		})
	}
}

func TestOIDCSecretFilesSymlinkParent(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("creating symlinks requires elevated permissions on Windows")
	}

	targetDir, _, _ := writeOIDCSecretFiles(t)
	childDir := filepath.Join(targetDir, "child")
	require.NoError(t, os.Mkdir(childDir, 0o700))
	linkDir := t.TempDir()
	link := filepath.Join(linkDir, "link")
	require.NoError(t, os.Symlink(childDir, link))
	require.NoError(t, os.WriteFile(filepath.Join(linkDir, "client-id"), []byte("wrong-id"), 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(linkDir, "client-secret"), []byte("wrong-secret"), 0o600))

	conf, err := config.Parse([]string{
		"go run ./cmd", "--in-cluster",
		"--oidc-client-id-file=" + link + "/../client-id",
		"--oidc-client-secret-file=" + link + "/../client-secret",
	})
	require.NoError(t, err)
	require.NotNil(t, conf)
	assert.Equal(t, "my-file-client-id", conf.OidcClientID)
	assert.Equal(t, "my-file-secret", conf.OidcClientSecret)
}

func TestOIDCSecretFilesExplicitFlagsOverride(t *testing.T) {
	tempDir, idFile, secretFile := writeOIDCSecretFiles(t)

	tests := []struct {
		name       string
		idFile     string
		secretFile string
	}{
		{"existing files", idFile, secretFile},
		{"missing files are not read", filepath.Join(tempDir, "missing-id"), filepath.Join(tempDir, "missing-secret")},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conf, err := config.Parse([]string{
				"go run ./cmd",
				"--in-cluster",
				"--oidc-client-id=explicit-id",
				"--oidc-client-secret=explicit-secret",
				"--oidc-client-id-file=" + tt.idFile,
				"--oidc-client-secret-file=" + tt.secretFile,
			})
			require.NoError(t, err)
			require.NotNil(t, conf)
			assert.Equal(t, "explicit-id", conf.OidcClientID)
			assert.Equal(t, "explicit-secret", conf.OidcClientSecret)
		})
	}
}

func TestOIDCSecretFilesCredentialPrecedence(t *testing.T) {
	tempDir, idFile, secretFile := writeOIDCSecretFiles(t)
	tests := []struct {
		name                     string
		envFiles                 bool
		clientID, clientSecret   string
		wantID, wantClientSecret string
	}{
		{"file flags override env", false, "", "", "my-file-client-id", "my-file-secret"},
		{"file env overrides env", true, "", "", "my-file-client-id", "my-file-secret"},
		{"ID flag with file flags", false, "flag-id", "", "flag-id", "my-file-secret"},
		{"ID flag with file env", true, "flag-id", "", "flag-id", "my-file-secret"},
		{"secret flag with file flags", false, "", "flag-secret", "my-file-client-id", "flag-secret"},
		{"secret flag with file env", true, "", "flag-secret", "my-file-client-id", "flag-secret"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("HEADLAMP_CONFIG_OIDC_CLIENT_ID", "env-id")
			t.Setenv("HEADLAMP_CONFIG_OIDC_CLIENT_SECRET", "env-secret")

			args := []string{"go run ./cmd", "--in-cluster"}
			idPath, secretPath := idFile, secretFile

			if tt.clientID != "" {
				args = append(args, "--oidc-client-id="+tt.clientID)
				idPath = filepath.Join(tempDir, "missing-id")
			}

			if tt.clientSecret != "" {
				args = append(args, "--oidc-client-secret="+tt.clientSecret)
				secretPath = filepath.Join(tempDir, "missing-secret")
			}

			if tt.envFiles {
				t.Setenv("HEADLAMP_CONFIG_OIDC_CLIENT_ID_FILE", idPath)
				t.Setenv("HEADLAMP_CONFIG_OIDC_CLIENT_SECRET_FILE", secretPath)
			} else {
				args = append(args, "--oidc-client-id-file="+idPath, "--oidc-client-secret-file="+secretPath)
			}

			conf, err := config.Parse(args)
			require.NoError(t, err)
			require.NotNil(t, conf)
			assert.Equal(t, tt.wantID, conf.OidcClientID)
			assert.Equal(t, tt.wantClientSecret, conf.OidcClientSecret)
		})
	}
}

func TestOIDCSecretFilesEnvironmentVariables(t *testing.T) {
	tempDir := t.TempDir()
	idFile := filepath.Join(tempDir, "env-client-id")
	secretFile := filepath.Join(tempDir, "env-client-secret")

	require.NoError(t, os.WriteFile(idFile, []byte("env-id-value\n"), 0o600))
	require.NoError(t, os.WriteFile(secretFile, []byte("env-secret-value\n"), 0o600))

	env := map[string]string{
		"HEADLAMP_CONFIG_IN_CLUSTER":              "true",
		"HEADLAMP_CONFIG_OIDC_CLIENT_ID_FILE":     idFile,
		"HEADLAMP_CONFIG_OIDC_CLIENT_SECRET_FILE": secretFile,
	}

	for k, v := range env {
		require.NoError(t, os.Setenv(k, v))
	}

	defer func() {
		for k := range env {
			require.NoError(t, os.Unsetenv(k))
		}
	}()

	t.Run("ambient file env variables are loaded", func(t *testing.T) {
		conf, err := config.Parse([]string{"go run ./cmd"})
		require.NoError(t, err)
		require.NotNil(t, conf)
		assert.Equal(t, idFile, conf.OidcClientIDFile)
		assert.Equal(t, secretFile, conf.OidcClientSecretFile)
		assert.Equal(t, "env-id-value", conf.OidcClientID)
		assert.Equal(t, "env-secret-value", conf.OidcClientSecret)
	})

	t.Run("explicit direct flags override ambient file env variables", func(t *testing.T) {
		args := []string{
			"go run ./cmd",
			"--oidc-client-id=flag-id",
			"--oidc-client-secret=flag-secret",
		}

		conf, err := config.Parse(args)
		require.NoError(t, err)
		require.NotNil(t, conf)
		assert.Equal(t, "flag-id", conf.OidcClientID)
		assert.Equal(t, "flag-secret", conf.OidcClientSecret)
	})
}

func TestWatchPluginsChangesInClusterDefaults(t *testing.T) {
	require.NoError(t, os.Unsetenv("HEADLAMP_CONFIG_WATCH_PLUGINS_CHANGES"))

	conf, err := config.Parse([]string{"go run ./cmd", "--in-cluster"})
	require.NoError(t, err)
	require.NotNil(t, conf)
	assert.Equal(t, false, conf.WatchPluginsChanges)
}

func TestWatchPluginsChangesInClusterFlagOverride(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd", "--in-cluster", "--watch-plugins-changes=true"})
	require.NoError(t, err)
	require.NotNil(t, conf)
	assert.Equal(t, true, conf.WatchPluginsChanges)
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

func TestApplyMeDefaults_TrimsWhitespace(t *testing.T) {
	gotUsername, gotEmail, gotGroups, gotUserInfo := config.ApplyMeDefaults(
		"  user.name  ",
		"  user.email  ",
		"  user.groups  ",
		"  /oauth2/userinfo  ",
	)

	assert.Equal(t, "user.name", gotUsername)
	assert.Equal(t, "user.email", gotEmail)
	assert.Equal(t, "user.groups", gotGroups)
	assert.Equal(t, "/oauth2/userinfo", gotUserInfo)
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

func TestValidatePort(t *testing.T) {
	tests := []struct {
		name          string
		args          []string
		expectError   bool
		errorContains string
	}{
		{
			name:          "port_zero",
			args:          []string{"go run ./cmd", "--port=0"},
			expectError:   true,
			errorContains: "port must be between 1 and 65535",
		},
		{
			name:          "port_above_max",
			args:          []string{"go run ./cmd", "--port=65536"},
			expectError:   true,
			errorContains: "port must be between 1 and 65535",
		},
		{
			name:        "port_max",
			args:        []string{"go run ./cmd", "--port=65535"},
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

func TestValidateCacheMaxClientsets(t *testing.T) {
	tests := []struct {
		name          string
		args          []string
		expectError   bool
		errorContains string
	}{
		{
			name:          "cache_max_clientsets_zero",
			args:          []string{"go run ./cmd", "--cache-max-clientsets=0"},
			expectError:   true,
			errorContains: "cache-max-clientsets cannot be negative or equal to zero",
		},
		{
			name:          "cache_max_clientsets_negative",
			args:          []string{"go run ./cmd", "--cache-max-clientsets=-1"},
			expectError:   true,
			errorContains: "cache-max-clientsets cannot be negative or equal to zero",
		},
		{
			name:        "cache_max_clientsets_valid",
			args:        []string{"go run ./cmd", "--cache-max-clientsets=512"},
			expectError: false,
		},
		{
			name:        "cache_max_clientsets_default",
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

func TestCacheMaxClientsetsExplicitTracking(t *testing.T) {
	t.Run("omitted option leaves CacheMaxClientsetsExplicit false", func(t *testing.T) {
		conf, err := config.Parse([]string{"go run ./cmd"})
		require.NoError(t, err)
		assert.Equal(t, config.DefaultCacheMaxClientsets, conf.CacheMaxClientsets)
		assert.False(t, conf.CacheMaxClientsetsExplicit)
	})

	t.Run("explicit default flag sets CacheMaxClientsetsExplicit true", func(t *testing.T) {
		conf, err := config.Parse([]string{"go run ./cmd", "--cache-max-clientsets=256"})
		require.NoError(t, err)
		assert.Equal(t, config.DefaultCacheMaxClientsets, conf.CacheMaxClientsets)
		assert.True(t, conf.CacheMaxClientsetsExplicit)
	})

	t.Run("explicit default env sets CacheMaxClientsetsExplicit true", func(t *testing.T) {
		t.Setenv("HEADLAMP_CONFIG_CACHE_MAX_CLIENTSETS", "256")

		conf, err := config.Parse([]string{"go run ./cmd"})
		require.NoError(t, err)
		assert.Equal(t, config.DefaultCacheMaxClientsets, conf.CacheMaxClientsets)
		assert.True(t, conf.CacheMaxClientsetsExplicit)
	})
}

func TestValidateLogLevel(t *testing.T) {
	tests := []struct {
		name          string
		args          []string
		expectError   bool
		errorContains string
	}{
		{
			name:        "log_level_debug",
			args:        []string{"go run ./cmd", "--log-level=debug"},
			expectError: false,
		},
		{
			name:        "log_level_error",
			args:        []string{"go run ./cmd", "--log-level=error"},
			expectError: false,
		},
		{
			name:        "log_level_empty",
			args:        []string{"go run ./cmd", "--log-level="},
			expectError: false,
		},
		{
			name:        "log_level_whitespace",
			args:        []string{"go run ./cmd", "--log-level= \t"},
			expectError: false,
		},
		{
			name:          "log_level_invalid",
			args:          []string{"go run ./cmd", "--log-level=verbose"},
			expectError:   true,
			errorContains: "log-level must be one of debug, info, warn, or error",
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

func TestValidateTLSPaths(t *testing.T) {
	tlsTestDataPath := filepath.Join("..", "..", "cmd", "headlamp_testdata")
	validCertPath := filepath.Join(tlsTestDataPath, "headlamp.crt")
	validKeyPath := filepath.Join(tlsTestDataPath, "headlamp.key")
	missingPath := filepath.Join(t.TempDir(), "missing.pem")
	tlsArgs := func(certPath, keyPath string) []string {
		return []string{"go run ./cmd", "--tls-cert-path=" + certPath, "--tls-key-path=" + keyPath}
	}

	tests := []struct {
		name          string
		args          []string
		errorContains string
	}{
		{
			name:          "tls_cert_without_key",
			args:          []string{"go run ./cmd", "--tls-cert-path=/tmp/tls.crt"},
			errorContains: "tls-cert-path and tls-key-path must be configured together",
		},
		{
			name:          "tls_key_without_cert",
			args:          []string{"go run ./cmd", "--tls-key-path=/tmp/tls.key"},
			errorContains: "tls-cert-path and tls-key-path must be configured together",
		},
		{
			name: "tls_invalid_pair",
			args: tlsArgs(
				filepath.Join(getTestDataPath(), "valid_ca.pem"),
				filepath.Join(getTestDataPath(), "invalid_ca.pem"),
			),
			errorContains: "invalid tls certificate or key path",
		},
		{
			name: "tls_valid_pair",
			args: tlsArgs(validCertPath, validKeyPath),
		},
		{
			name:          "tls_missing_cert",
			args:          tlsArgs(missingPath, validKeyPath),
			errorContains: "invalid tls certificate or key path",
		},
		{
			name:          "tls_missing_key",
			args:          tlsArgs(validCertPath, missingPath),
			errorContains: "invalid tls certificate or key path",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conf, err := config.Parse(tt.args)
			if tt.errorContains != "" {
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

func TestMakeKubeConfigsDir(t *testing.T) {
	t.Run("creates configured directory", func(t *testing.T) {
		dir := filepath.Join(t.TempDir(), "custom", "kubeconfigs")

		actual, err := config.MakeKubeConfigsDir(dir)
		require.NoError(t, err)
		assert.Equal(t, dir, actual)

		info, err := os.Stat(actual)
		require.NoError(t, err)
		assert.True(t, info.IsDir())
	})

	t.Run("uses Headlamp default when unset", func(t *testing.T) {
		setUserConfigDir(t, t.TempDir())

		dir, err := config.MakeKubeConfigsDir("")
		require.NoError(t, err)
		assert.Contains(t, dir, filepath.Join("Headlamp", "kubeconfigs"))
	})

	t.Run("falls back to the executable directory", func(t *testing.T) {
		if runtime.GOOS == "windows" {
			t.Skip("UserConfigDir uses a Windows API instead of an environment variable")
		}

		setUserConfigDir(t, "")
		t.Setenv("HOME", "")

		dir, err := config.MakeKubeConfigsDir("")
		require.NoError(t, err)

		executable, err := os.Executable()
		require.NoError(t, err)
		assert.Equal(t, filepath.Dir(executable), dir)
	})

	t.Run("reports configured directory creation errors", func(t *testing.T) {
		parentFile := filepath.Join(t.TempDir(), "file")
		require.NoError(t, os.WriteFile(parentFile, []byte("not a directory"), 0o600))

		_, err := config.MakeKubeConfigsDir(filepath.Join(parentFile, "kubeconfigs"))
		require.Error(t, err)
	})
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

func TestDefaultKubeConfigFile(t *testing.T) {
	t.Run("returns the config file in the configured directory", func(t *testing.T) {
		dir := filepath.Join(t.TempDir(), "custom", "kubeconfigs")

		path, err := config.DefaultKubeConfigFile(dir)
		require.NoError(t, err)
		assert.Equal(t, filepath.Join(dir, "config"), path)
	})

	t.Run("reports directory creation errors", func(t *testing.T) {
		parentFile := filepath.Join(t.TempDir(), "file")
		require.NoError(t, os.WriteFile(parentFile, []byte("not a directory"), 0o600))

		_, err := config.DefaultKubeConfigFile(filepath.Join(parentFile, "kubeconfigs"))
		require.Error(t, err)
	})
}

func TestKubeConfigDirParsing(t *testing.T) {
	t.Run("defaults to empty", func(t *testing.T) {
		conf, err := config.Parse([]string{"go run ./cmd"})
		require.NoError(t, err)
		assert.Empty(t, conf.KubeConfigDir)
	})

	t.Run("flag overrides environment", func(t *testing.T) {
		t.Setenv("HEADLAMP_CONFIG_KUBECONFIG_DIR", "/env/kubeconfigs")

		conf, err := config.Parse([]string{"go run ./cmd", "--kubeconfig-dir=/flag/kubeconfigs"})
		require.NoError(t, err)
		assert.Equal(t, "/flag/kubeconfigs", conf.KubeConfigDir)
	})
}

func TestProxyAuthFlagOverridesEnv(t *testing.T) {
	// Single header override.
	t.Run("flag_overrides_env_username_header", func(t *testing.T) {
		t.Setenv("HEADLAMP_CONFIG_PROXY_AUTH_USERNAME_HEADER", "X-Env-User")

		conf, err := config.Parse([]string{"go run ./cmd", "--proxy-auth-username-header=X-Flag-User"})
		require.NoError(t, err)
		assert.Equal(t, "X-Flag-User", conf.ProxyAuthUsernameHeader)
	})

	// All proxy auth flags override corresponding env vars.
	t.Run("flag_overrides_env_all_proxy_auth", func(t *testing.T) {
		for k, v := range map[string]string{
			"HEADLAMP_CONFIG_PROXY_AUTH":                 "false",
			"HEADLAMP_CONFIG_PROXY_AUTH_USERNAME_HEADER": "X-Env-User",
			"HEADLAMP_CONFIG_PROXY_AUTH_GROUP_HEADER":    "X-Env-Group",
			"HEADLAMP_CONFIG_PROXY_AUTH_EMAIL_HEADER":    "X-Env-Email",
			"HEADLAMP_CONFIG_PROXY_AUTH_TOKEN_HEADER":    "X-Env-Token-Header", // #nosec G101
		} {
			t.Setenv(k, v)
		}

		conf, err := config.Parse([]string{
			"go run ./cmd", "--proxy-auth",
			"--proxy-auth-username-header=X-Flag-User",
			"--proxy-auth-group-header=X-Flag-Group",
			"--proxy-auth-email-header=X-Flag-Email",
			"--proxy-auth-token-header=X-Flag-Token",
		})
		require.NoError(t, err)
		assert.Equal(t, true, conf.ProxyAuthEnabled)
		assert.Equal(t, "X-Flag-User", conf.ProxyAuthUsernameHeader)
		assert.Equal(t, "X-Flag-Group", conf.ProxyAuthGroupHeader)
		assert.Equal(t, "X-Flag-Email", conf.ProxyAuthEmailHeader)
		assert.Equal(t, "X-Flag-Token", conf.ProxyAuthTokenHeader)
	})
}

func TestGetDefaultKubeConfigPath(t *testing.T) {
	tmpDir := t.TempDir()
	t.Setenv("HOME", tmpDir)
	t.Setenv("USERPROFILE", tmpDir)

	path, err := config.GetDefaultKubeConfigPath()
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(tmpDir, ".kube", "config"), path)
}

type apiProxyValidateTest struct {
	name          string
	args          []string
	verify        func(t *testing.T, conf *config.Config)
	expectError   bool
	errorContains string
}

func apiProxyValidateTests() []apiProxyValidateTest {
	return append(apiProxyFlagValidateTests(), apiProxyCAValidateTests()...)
}

func apiProxyFlagValidateTests() []apiProxyValidateTest {
	oidcArgs := []string{
		"go run ./cmd", "--in-cluster",
		"--oidc-client-id=cid", "--oidc-idp-issuer-url=https://idp.example.com",
	}
	withOIDC := func(extra ...string) []string {
		return append(append([]string{}, oidcArgs...), extra...)
	}

	return []apiProxyValidateTest{
		{
			name: "api_proxy_url_parsed",
			args: withOIDC("--oidc-api-proxy=https://proxy.example.com/kubernetes"),
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "https://proxy.example.com/kubernetes", conf.OidcAPIProxy)
			},
		},
		{
			name: "api_proxy_skip_tls_verify_parsed",
			args: []string{"go run ./cmd", "--oidc-api-proxy-skip-tls-verify"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.True(t, conf.OidcAPIProxySkipTLSVerify)
			},
		},
		{
			name: "api_proxy_empty_no_error",
			args: []string{"go run ./cmd"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Empty(t, conf.OidcAPIProxy)
				assert.Empty(t, conf.OidcAPIProxyCAFile)
				assert.False(t, conf.OidcAPIProxySkipTLSVerify)
			},
		},
		{
			name:          "api_proxy_invalid_url",
			args:          withOIDC("--oidc-api-proxy=not-a-url"),
			expectError:   true,
			errorContains: "oidc-api-proxy must be a valid http(s) URL",
		},
		{
			name:          "api_proxy_requires_oidc_client",
			args:          []string{"go run ./cmd", "--in-cluster", "--oidc-api-proxy=https://proxy.example.com"},
			expectError:   true,
			errorContains: "oidc-api-proxy requires oidc-client-id and oidc-idp-issuer-url",
		},
		{
			name: "api_proxy_incompatible_with_service_account_token",
			args: withOIDC("--oidc-api-proxy=https://proxy.example.com",
				"--unsafe-use-service-account-token"),
			expectError:   true,
			errorContains: "cannot be used together with unsafe-use-service-account-token",
		},
	}
}

func apiProxyCAValidateTests() []apiProxyValidateTest {
	return []apiProxyValidateTest{
		{
			name: "api_proxy_ca_file_valid",
			args: []string{
				"go run ./cmd",
				"--oidc-api-proxy-ca-file=" + filepath.Join(getTestDataPath(), "valid_ca.pem"),
			},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, filepath.Join(getTestDataPath(), "valid_ca.pem"), conf.OidcAPIProxyCAFile)
			},
		},
		{
			name: "api_proxy_ca_file_invalid_pem",
			args: []string{
				"go run ./cmd",
				"--oidc-api-proxy-ca-file=" + filepath.Join(getTestDataPath(), "invalid_ca.pem"),
			},
			expectError:   true,
			errorContains: "invalid oidc-api-proxy-ca-file",
		},
		{
			name: "api_proxy_ca_file_not_found",
			args: []string{
				"go run ./cmd",
				"--oidc-api-proxy-ca-file=" + filepath.Join(getTestDataPath(), "nonexistent.pem"),
			},
			expectError:   true,
			errorContains: "error reading oidc-api-proxy-ca-file",
		},
	}
}

// TestValidateAPIProxy verifies the oidc-api-proxy-* flag parsing and
// validation logic in Config.Validate().
func TestValidateAPIProxy(t *testing.T) {
	for _, tt := range apiProxyValidateTests() {
		t.Run(tt.name, func(t *testing.T) {
			conf, err := config.Parse(tt.args)

			if tt.expectError {
				require.Error(t, err)
				require.Nil(t, conf)
				assert.Contains(t, err.Error(), tt.errorContains)

				return
			}

			require.NoError(t, err)
			require.NotNil(t, conf)

			if tt.verify != nil {
				tt.verify(t, conf)
			}
		})
	}
}

func TestClusterAPIDiscoveryConfiguration(t *testing.T) {
	for _, args := range [][]string{
		{"headlamp", "--enable-cluster-api"},
		{
			"headlamp",
			"--enable-cluster-api",
			"--oidc-client-id=headlamp",
			"--oidc-idp-issuer-url=https://idp.example.com",
			"--cluster-api-namespaces=team,*",
		},
		{
			"headlamp",
			"--enable-cluster-api",
			"--oidc-client-id=headlamp",
			"--oidc-idp-issuer-url=https://idp.example.com",
			"--cluster-api-label-selector=bad in (",
		},
	} {
		_, err := config.Parse(args)
		require.Error(t, err)
	}

	parsed, err := config.Parse(
		[]string{
			"headlamp",
			"--enable-cluster-api",
			"--oidc-client-id=headlamp",
			"--oidc-idp-issuer-url=https://idp.example.com",
			"--cluster-api-namespaces=workloads",
			"--cluster-api-label-selector=!headlamp.dev/ignore",
		},
	)
	require.NoError(t, err)
	require.True(t, parsed.DiscoverySources["cluster_api"].Enabled)
	require.False(t, parsed.DiscoverySources["cluster_inventory"].Enabled)
	require.Equal(t, "workloads", parsed.DiscoverySources["cluster_api"].Namespaces)
}

func TestParseNamespaceDiscoveryRequiresInCluster(t *testing.T) {
	_, err := config.Parse([]string{"go run ./cmd", "--enable-namespace-discovery"})
	require.ErrorContains(t, err, "--enable-namespace-discovery is only meant to be used with --in-cluster")

	conf, err := config.Parse([]string{"go run ./cmd", "--in-cluster", "--enable-namespace-discovery"})
	require.NoError(t, err)
	assert.True(t, conf.EnableNamespaceDiscovery)
}

func TestParseNamespaceDiscoveryLimits(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd", "--in-cluster", "--enable-namespace-discovery"})
	require.NoError(t, err)
	assert.InDelta(t, config.DefaultNamespaceDiscoveryQPS, conf.NamespaceDiscoveryQPS, 0)
	assert.Equal(t, config.DefaultNamespaceDiscoveryTimeout, conf.NamespaceDiscoveryTimeout)

	conf, err = config.Parse([]string{
		"go run ./cmd", "--in-cluster", "--enable-namespace-discovery",
		"--namespace-discovery-qps=500", "--namespace-discovery-timeout=2m",
	})
	require.NoError(t, err)
	assert.InDelta(t, 500, conf.NamespaceDiscoveryQPS, 0)
	assert.Equal(t, 2*time.Minute, conf.NamespaceDiscoveryTimeout)

	_, err = config.Parse([]string{
		"go run ./cmd", "--in-cluster", "--enable-namespace-discovery", "--namespace-discovery-qps=0",
	})
	require.ErrorContains(t, err, "must be greater than zero")
}
