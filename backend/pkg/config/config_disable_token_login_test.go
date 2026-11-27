/*
Copyright 2026 The Kubernetes Authors.

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
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseDisableTokenLogin_DefaultsToFalse(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.False(t, conf.DisableTokenLogin)
}

func TestParseDisableTokenLogin_Flag(t *testing.T) {
	conf, err := config.Parse([]string{"go run ./cmd", "--disable-token-login"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.True(t, conf.DisableTokenLogin)
}

func TestParseDisableTokenLogin_EnvVar(t *testing.T) {
	t.Setenv("HEADLAMP_CONFIG_DISABLE_TOKEN_LOGIN", "true")

	conf, err := config.Parse([]string{"go run ./cmd"})
	require.NoError(t, err)
	require.NotNil(t, conf)

	assert.True(t, conf.DisableTokenLogin)
}
