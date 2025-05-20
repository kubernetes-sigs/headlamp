package config_test

import (
	"os"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

//nolint:funlen
func TestParse(t *testing.T) {
	t.Run("no_args_no_env", func(t *testing.T) {
		conf, err := config.Parse(nil)
		require.NoError(t, err)
		require.NotNil(t, conf)

		assert.Equal(t, false, conf.DevMode)
		assert.Equal(t, "", conf.ListenAddr)
		assert.Equal(t, uint(4466), conf.Port)
		assert.Equal(t, "profile,email", conf.OidcScopes)
	})

	t.Run("with_args", func(t *testing.T) {
		args := []string{
			"go run ./cmd", "--port=3456",
		}
		conf, err := config.Parse(args)
		require.NoError(t, err)
		require.NotNil(t, conf)

		assert.Equal(t, uint(3456), conf.Port)
	})

	t.Run("from_env", func(t *testing.T) {
		os.Setenv("HEADLAMP_CONFIG_OIDC_CLIENT_SECRET", "superSecretBotsStayAwayPlease")
		defer os.Unsetenv("HEADLAMP_CONFIG_OIDC_CLIENT_SECRET")

		args := []string{
			"go run ./cmd", "-in-cluster",
		}
		conf, err := config.Parse(args)

		require.NoError(t, err)
		require.NotNil(t, conf)

		assert.Equal(t, "superSecretBotsStayAwayPlease", conf.OidcClientSecret)
	})

	t.Run("both_args_and_env", func(t *testing.T) {
		os.Setenv("HEADLAMP_CONFIG_PORT", "1234")
		defer os.Unsetenv("HEADLAMP_CONFIG_PORT")

		args := []string{
			"go run ./cmd", "--port=9876",
		}
		conf, err := config.Parse(args)

		require.NoError(t, err)
		require.NotNil(t, conf)

		assert.NotEqual(t, uint(1234), conf.Port)
		assert.Equal(t, uint(9876), conf.Port)
	})

	t.Run("oidc_settings_without_incluster", func(t *testing.T) {
		args := []string{
			"go run ./cmd", "-oidc-client-id=noClient",
		}
		conf, err := config.Parse(args)

		require.Error(t, err)
		require.Nil(t, conf)

		assert.Contains(t, err.Error(), "are only meant to be used in inCluster mode")
	})

	t.Run("invalid_base_url", func(t *testing.T) {
		args := []string{
			"go run ./cmd", "--base-url=testingthis",
		}
		conf, err := config.Parse(args)

		require.Error(t, err)
		require.Nil(t, conf)

		assert.Contains(t, err.Error(), "base-url")
	})

	t.Run("kubeconfig_from_default_env", func(t *testing.T) {
		os.Setenv("KUBECONFIG", "~/.kube/test_config.yaml")
		defer os.Unsetenv("KUBECONFIG")

		args := []string{
			"go run ./cmd",
		}
		conf, err := config.Parse(args)

		require.NoError(t, err)
		require.NotNil(t, conf)

		assert.Equal(t, conf.KubeConfigPath, "~/.kube/test_config.yaml")
	})

	t.Run("enable_dynamic_clusters", func(t *testing.T) {
		args := []string{
			"go run ./cmd", "--enable-dynamic-clusters",
		}
		conf, err := config.Parse(args)

		require.NoError(t, err)
		require.NotNil(t, conf)

		assert.Equal(t, true, conf.EnableDynamicClusters)
	})
}
