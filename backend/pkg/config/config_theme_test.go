package config_test

import (
	"os"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseThemeConfiguration_DefaultLightTheme(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd", "--default-light-theme=corporate-light"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "corporate-light", conf.DefaultLightTheme)
	assert.Equal(t, "", conf.DefaultDarkTheme)
	assert.Equal(t, "", conf.ForceTheme)
}

func TestParseThemeConfiguration_DefaultDarkTheme(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd", "--default-dark-theme=corporate-dark"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "", conf.DefaultLightTheme)
	assert.Equal(t, "corporate-dark", conf.DefaultDarkTheme)
	assert.Equal(t, "", conf.ForceTheme)
}

func TestParseThemeConfiguration_BothDefaults(t *testing.T) {
	conf, err := config.Parse([]string{
		"go run ./cmd",
		"--default-light-theme=corporate-light",
		"--default-dark-theme=corporate-dark",
	})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "corporate-light", conf.DefaultLightTheme)
	assert.Equal(t, "corporate-dark", conf.DefaultDarkTheme)
	assert.Equal(t, "", conf.ForceTheme)
}

func TestParseThemeConfiguration_ForceTheme(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd", "--force-theme=corporate-branded"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "", conf.DefaultLightTheme)
	assert.Equal(t, "", conf.DefaultDarkTheme)
	assert.Equal(t, "corporate-branded", conf.ForceTheme)
}

func TestParseThemeConfiguration_ForceWithDefaults(t *testing.T) {
	conf, err := config.Parse([]string{
		"go run ./cmd",
		"--default-light-theme=light",
		"--default-dark-theme=dark",
		"--force-theme=corporate",
	})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "light", conf.DefaultLightTheme)
	assert.Equal(t, "dark", conf.DefaultDarkTheme)
	assert.Equal(t, "corporate", conf.ForceTheme)
}

func TestParseThemeConfiguration_FromEnv(t *testing.T) {
	os.Setenv("HEADLAMP_CONFIG_DEFAULT_LIGHT_THEME", "env-light")
	os.Setenv("HEADLAMP_CONFIG_DEFAULT_DARK_THEME", "env-dark")
	defer func() {
		os.Unsetenv("HEADLAMP_CONFIG_DEFAULT_LIGHT_THEME")
		os.Unsetenv("HEADLAMP_CONFIG_DEFAULT_DARK_THEME")
	}()

	conf, err := config.Parse([]string{"go run ./cmd"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "env-light", conf.DefaultLightTheme)
	assert.Equal(t, "env-dark", conf.DefaultDarkTheme)
}

func TestParseThemeConfiguration_ForceFromEnv(t *testing.T) {
	os.Setenv("HEADLAMP_CONFIG_FORCE_THEME", "env-forced")
	defer os.Unsetenv("HEADLAMP_CONFIG_FORCE_THEME")

	conf, err := config.Parse([]string{"go run ./cmd"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "env-forced", conf.ForceTheme)
}

func TestParseThemeConfiguration_ArgsOverrideEnv(t *testing.T) {
	os.Setenv("HEADLAMP_CONFIG_DEFAULT_LIGHT_THEME", "env-theme")
	defer os.Unsetenv("HEADLAMP_CONFIG_DEFAULT_LIGHT_THEME")

	conf, err := config.Parse([]string{"go run ./cmd", "--default-light-theme=arg-theme"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "arg-theme", conf.DefaultLightTheme)
}

func TestParseThemeConfiguration_NoConfig(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.Equal(t, "", conf.DefaultLightTheme)
	assert.Equal(t, "", conf.DefaultDarkTheme)
	assert.Equal(t, "", conf.ForceTheme)
}
