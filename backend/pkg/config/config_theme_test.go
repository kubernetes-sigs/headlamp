package config_test

import (
	"os"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseThemeConfiguration(t *testing.T) {
	tests := []struct {
		name   string
		args   []string
		env    map[string]string
		verify func(*testing.T, *config.Config)
	}{
		{
			name: "default_light_theme_from_args",
			args: []string{"go run ./cmd", "--default-light-theme=corporate-light"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "corporate-light", conf.DefaultLightTheme)
				assert.Equal(t, "", conf.DefaultDarkTheme)
				assert.Equal(t, "", conf.ForceTheme)
			},
		},
		{
			name: "default_dark_theme_from_args",
			args: []string{"go run ./cmd", "--default-dark-theme=corporate-dark"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "", conf.DefaultLightTheme)
				assert.Equal(t, "corporate-dark", conf.DefaultDarkTheme)
				assert.Equal(t, "", conf.ForceTheme)
			},
		},
		{
			name: "both_default_themes_from_args",
			args: []string{"go run ./cmd", "--default-light-theme=corporate-light", "--default-dark-theme=corporate-dark"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "corporate-light", conf.DefaultLightTheme)
				assert.Equal(t, "corporate-dark", conf.DefaultDarkTheme)
				assert.Equal(t, "", conf.ForceTheme)
			},
		},
		{
			name: "force_theme_from_args",
			args: []string{"go run ./cmd", "--force-theme=corporate-branded"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "", conf.DefaultLightTheme)
				assert.Equal(t, "", conf.DefaultDarkTheme)
				assert.Equal(t, "corporate-branded", conf.ForceTheme)
			},
		},
		{
			name: "force_theme_with_defaults",
			args: []string{"go run ./cmd", "--default-light-theme=light", "--default-dark-theme=dark", "--force-theme=corporate"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "light", conf.DefaultLightTheme)
				assert.Equal(t, "dark", conf.DefaultDarkTheme)
				assert.Equal(t, "corporate", conf.ForceTheme)
			},
		},
		{
			name: "theme_from_env",
			args: []string{"go run ./cmd"},
			env: map[string]string{
				"HEADLAMP_CONFIG_DEFAULT_LIGHT_THEME": "env-light",
				"HEADLAMP_CONFIG_DEFAULT_DARK_THEME":  "env-dark",
			},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "env-light", conf.DefaultLightTheme)
				assert.Equal(t, "env-dark", conf.DefaultDarkTheme)
			},
		},
		{
			name: "force_theme_from_env",
			args: []string{"go run ./cmd"},
			env: map[string]string{
				"HEADLAMP_CONFIG_FORCE_THEME": "env-forced",
			},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "env-forced", conf.ForceTheme)
			},
		},
		{
			name: "args_override_env",
			args: []string{"go run ./cmd", "--default-light-theme=arg-theme"},
			env: map[string]string{
				"HEADLAMP_CONFIG_DEFAULT_LIGHT_THEME": "env-theme",
			},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "arg-theme", conf.DefaultLightTheme)
			},
		},
		{
			name: "no_theme_config",
			args: []string{"go run ./cmd"},
			verify: func(t *testing.T, conf *config.Config) {
				assert.Equal(t, "", conf.DefaultLightTheme)
				assert.Equal(t, "", conf.DefaultDarkTheme)
				assert.Equal(t, "", conf.ForceTheme)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.env != nil {
				for key, value := range tt.env {
					os.Setenv(key, value)
				}
				defer func(env map[string]string) {
					for key := range env {
						os.Unsetenv(key)
					}
				}(tt.env)
			}

			conf, err := config.Parse(tt.args)
			require.NoError(t, err)
			require.NotNil(t, conf)

			tt.verify(t, conf)
		})
	}
}
