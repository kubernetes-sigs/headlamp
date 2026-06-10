package config_test

import (
	"os"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseFaviconConfiguration_File(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd", "--favicon=/branding/favicon.ico"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "/branding/favicon.ico", conf.Favicon)
	assert.Equal(t, "", conf.FaviconBase64)
}

func TestParseFaviconConfiguration_Base64(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd", "--favicon-base64=aGVsbG8="})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "", conf.Favicon)
	assert.Equal(t, "aGVsbG8=", conf.FaviconBase64)
}

func TestParseFaviconConfiguration_Both(t *testing.T) {
	conf, err := config.Parse([]string{
		"go run ./cmd",
		"--favicon=/branding/favicon.png",
		"--favicon-base64=aGVsbG8=",
	})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "/branding/favicon.png", conf.Favicon)
	assert.Equal(t, "aGVsbG8=", conf.FaviconBase64)
}

func TestParseFaviconConfiguration_FromEnv(t *testing.T) {
	require.NoError(t, os.Setenv("HEADLAMP_CONFIG_FAVICON", "/env/favicon.ico"))
	require.NoError(t, os.Setenv("HEADLAMP_CONFIG_FAVICON_BASE64", "ZW52"))

	defer func() {
		require.NoError(t, os.Unsetenv("HEADLAMP_CONFIG_FAVICON"))
		require.NoError(t, os.Unsetenv("HEADLAMP_CONFIG_FAVICON_BASE64"))
	}()

	conf, err := config.Parse([]string{"go run ./cmd"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "/env/favicon.ico", conf.Favicon)
	assert.Equal(t, "ZW52", conf.FaviconBase64)
}

func TestParseFaviconConfiguration_ArgsOverrideEnv(t *testing.T) {
	require.NoError(t, os.Setenv("HEADLAMP_CONFIG_FAVICON", "/env/favicon.ico"))

	defer func() { require.NoError(t, os.Unsetenv("HEADLAMP_CONFIG_FAVICON")) }()

	conf, err := config.Parse([]string{"go run ./cmd", "--favicon=/cli/favicon.ico"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "/cli/favicon.ico", conf.Favicon)
}

func TestParseFaviconConfiguration_NoConfig(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "", conf.Favicon)
	assert.Equal(t, "", conf.FaviconBase64)
}
