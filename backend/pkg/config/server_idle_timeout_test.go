package config_test

import (
	"os"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/require"
)

func TestParseServerIdleTimeoutFlag(t *testing.T) {
	tests := []struct {
		name      string
		args      []string
		env       string
		want      time.Duration
		wantError string
	}{
		{name: "default", want: 120 * time.Second},
		{name: "flag", args: []string{"--server-idle-timeout=650s"}, want: 650 * time.Second},
		{name: "environment", env: "11m", want: 11 * time.Minute},
		{name: "flag overrides environment", args: []string{"--server-idle-timeout=15m"}, env: "11m", want: 15 * time.Minute},
		{name: "zero disables timeout", args: []string{"--server-idle-timeout=0"}},
		{name: "negative flag", args: []string{"--server-idle-timeout=-1s"}, wantError: "server-idle-timeout cannot be negative"},
		{name: "negative environment", env: "-1s", wantError: "server-idle-timeout cannot be negative"},
		{name: "invalid flag", args: []string{"--server-idle-timeout=invalid"}, wantError: "invalid"},
		{name: "invalid environment", env: "invalid", wantError: "invalid"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("HEADLAMP_CONFIG_SERVER_IDLE_TIMEOUT", tt.env)
			if tt.env == "" {
				require.NoError(t, os.Unsetenv("HEADLAMP_CONFIG_SERVER_IDLE_TIMEOUT"))
			}

			conf, err := config.Parse(append([]string{"headlamp-server"}, tt.args...))
			if tt.wantError != "" {
				require.ErrorContains(t, err, tt.wantError)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, conf.ServerIdleTimeout)
		})
	}
}
