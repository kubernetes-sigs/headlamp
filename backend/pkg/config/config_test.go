package config_test

import (
	"os"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseNoArgsNoEnv(t *testing.T) {
	conf, err := config.Parse(nil)
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, false, conf.DevMode)
	assert.Equal(t, "", conf.ListenAddr)
	assert.Equal(t, uint(4466), conf.Port)
	assert.Equal(t, "profile,email", conf.OidcScopes)
}

func TestParseWithArgs(t *testing.T) {
	args := []string{"go run ./cmd", "--port=3456"}
	conf, err := config.Parse(args)
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, uint(3456), conf.Port)
}

func TestParseFromEnv(t *testing.T) {
	os.Setenv("HEADLAMP_CONFIG_OIDC_CLIENT_SECRET", "superSecretBotsStayAwayPlease")
	defer os.Unsetenv("HEADLAMP_CONFIG_OIDC_CLIENT_SECRET")

	args := []string{"go run ./cmd", "-in-cluster"}
	conf, err := config.Parse(args)
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "superSecretBotsStayAwayPlease", conf.OidcClientSecret)
}

func TestParseBothArgsAndEnv(t *testing.T) {
	os.Setenv("HEADLAMP_CONFIG_PORT", "1234")
	defer os.Unsetenv("HEADLAMP_CONFIG_PORT")

	args := []string{"go run ./cmd", "--port=9876"}
	conf, err := config.Parse(args)
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.NotEqual(t, uint(1234), conf.Port)
	assert.Equal(t, uint(9876), conf.Port)
}

func TestParseOidcSettingsWithoutInCluster(t *testing.T) {
	args := []string{"go run ./cmd", "-oidc-client-id=noClient"}
	conf, err := config.Parse(args)

	require.Error(t, err)
	require.Nil(t, conf)
	assert.Contains(t, err.Error(), "are only meant to be used in inCluster mode")
}

func TestParseInvalidBaseURL(t *testing.T) {
	args := []string{"go run ./cmd", "--base-url=testingthis"}
	conf, err := config.Parse(args)

	require.Error(t, err)
	require.Nil(t, conf)
	assert.Contains(t, err.Error(), "base-url")
}

func TestParseKubeconfigFromDefaultEnv(t *testing.T) {
	os.Setenv("KUBECONFIG", "~/.kube/test_config.yaml")
	defer os.Unsetenv("KUBECONFIG")

	args := []string{"go run ./cmd"}
	conf, err := config.Parse(args)

	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "~/.kube/test_config.yaml", conf.KubeConfigPath)
}

func TestParseEnableDynamicClusters(t *testing.T) {
	args := []string{"go run ./cmd", "--enable-dynamic-clusters"}
	conf, err := config.Parse(args)

	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, true, conf.EnableDynamicClusters)
}
