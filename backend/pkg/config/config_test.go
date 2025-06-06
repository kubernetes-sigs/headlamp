package config_test

import (
    "os"
    "testing"

    "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

type testCase struct {
    name     string
    args     []string
    envVars  map[string]string
    validate func(t *testing.T, conf *config.Config, err error)
}

func setEnvVars(envVars map[string]string) func() {
    originals := make(map[string]string, len(envVars))
    for k := range envVars {
        originals[k] = os.Getenv(k)
        os.Setenv(k, envVars[k])
    }
    return func() {
        for k, v := range originals {
            if v == "" {
                os.Unsetenv(k)
            } else {
                os.Setenv(k, v)
            }
        }
    }
}

func validateNoArgsNoEnv(t *testing.T, conf *config.Config, err error) {
    require.NoError(t, err)
    require.NotNil(t, conf)
    assert.Equal(t, false, conf.DevMode)
    assert.Equal(t, "", conf.ListenAddr)
    assert.Equal(t, uint(4466), conf.Port)
    assert.Equal(t, "profile,email", conf.OidcScopes)
}

func validateWithArgs(t *testing.T, conf *config.Config, err error) {
    require.NoError(t, err)
    require.NotNil(t, conf)
    assert.Equal(t, uint(3456), conf.Port)
}

func validateFromEnv(t *testing.T, conf *config.Config, err error) {
    require.NoError(t, err)
    require.NotNil(t, conf)
    assert.Equal(t, "superSecretBotsStayAwayPlease", conf.OidcClientSecret)
}

func validateBothArgsAndEnv(t *testing.T, conf *config.Config, err error) {
    require.NoError(t, err)
    require.NotNil(t, conf)
    assert.NotEqual(t, uint(1234), conf.Port)
    assert.Equal(t, uint(9876), conf.Port)
}

func validateOidcSettingsWithoutIncluster(t *testing.T, conf *config.Config, err error) {
    require.Error(t, err)
    require.Nil(t, conf)
    assert.Contains(t, err.Error(), "are only meant to be used in inCluster mode")
}

func validateInvalidBaseURL(t *testing.T, conf *config.Config, err error) {
    require.Error(t, err)
    require.Nil(t, conf)
    assert.Contains(t, err.Error(), "base-url")
}

func validateKubeconfigFromDefaultEnv(t *testing.T, conf *config.Config, err error) {
    require.NoError(t, err)
    require.NotNil(t, conf)
    assert.Equal(t, "~/.kube/test_config.yaml", conf.KubeConfigPath)
}

func validateEnableDynamicClusters(t *testing.T, conf *config.Config, err error) {
    require.NoError(t, err)
    require.NotNil(t, conf)
    assert.Equal(t, true, conf.EnableDynamicClusters)
}

func getTestCases() []testCase {
    return []testCase{
        {
            name:     "no_args_no_env",
            validate: validateNoArgsNoEnv,
        },
        {
            name: "with_args",
            args: []string{
                "go run ./cmd", "--port=3456",
            },
            validate: validateWithArgs,
        },
        {
            name: "from_env",
            args: []string{
                "go run ./cmd", "-in-cluster",
            },
            envVars: map[string]string{
                "HEADLAMP_CONFIG_OIDC_CLIENT_SECRET": "superSecretBotsStayAwayPlease",
            },
            validate: validateFromEnv,
        },
        {
            name: "both_args_and_env",
            args: []string{
                "go run ./cmd", "--port=9876",
            },
            envVars: map[string]string{
                "HEADLAMP_CONFIG_PORT": "1234",
            },
            validate: validateBothArgsAndEnv,
        },
        {
            name: "oidc_settings_without_incluster",
            args: []string{
                "go run ./cmd", "-oidc-client-id=noClient",
            },
            validate: validateOidcSettingsWithoutIncluster,
        },
        {
            name: "invalid_base_url",
            args: []string{
                "go run ./cmd", "--base-url=testingthis",
            },
            validate: validateInvalidBaseURL,
        },
        {
            name: "kubeconfig_from_default_env",
            args: []string{
                "go run ./cmd",
            },
            envVars: map[string]string{
                "KUBECONFIG": "~/.kube/test_config.yaml",
            },
            validate: validateKubeconfigFromDefaultEnv,
        },
        {
            name: "enable_dynamic_clusters",
            args: []string{
                "go run ./cmd", "--enable-dynamic-clusters",
            },
            validate: validateEnableDynamicClusters,
        },
    }
}

func TestParse(t *testing.T) {
    tests := getTestCases()

    for _, tc := range tests {
        tc := tc
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()
            var cleanup func()
            if len(tc.envVars) > 0 {
                cleanup = setEnvVars(tc.envVars)
            }
            if cleanup != nil {
                defer cleanup()
            }
            conf, err := config.Parse(tc.args)
            tc.validate(t, conf, err)
        })
    }
}
