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

package helm //nolint:testpackage

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/cli"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
)

// newTestCache returns an in-memory cache usable in tests.
func newTestCache() cache.Cache[interface{}] {
	return cache.New[interface{}]()
}

// fakeClientConfig builds a minimal in-memory kubeconfig.
func fakeClientConfig() clientcmd.ClientConfig {
	cfg := clientcmdapi.NewConfig()
	cfg.Clusters["test"] = &clientcmdapi.Cluster{
		Server: "https://127.0.0.1:6443",
	}
	cfg.AuthInfos["test"] = &clientcmdapi.AuthInfo{}
	cfg.Contexts["test"] = &clientcmdapi.Context{
		Cluster:  "test",
		AuthInfo: "test",
	}
	cfg.CurrentContext = "test"

	return clientcmd.NewDefaultClientConfig(*cfg, &clientcmd.ConfigOverrides{})
}

func TestNewHandler(t *testing.T) {
	c := newTestCache()
	h, err := NewHandler(c)
	require.NoError(t, err)
	assert.NotNil(t, h)
	assert.Equal(t, c, h.Cache)
}

func TestNewHandlerWithSettings(t *testing.T) {
	c := newTestCache()
	s := cli.New()
	h, err := NewHandlerWithSettings(c, s)
	require.NoError(t, err)
	assert.NotNil(t, h)
	assert.Equal(t, s, h.EnvSettings)
	assert.Equal(t, c, h.Cache)
}

func TestSetAndGetReleaseStatusNoError(t *testing.T) {
	h, err := NewHandler(newTestCache())
	require.NoError(t, err)

	err = h.setReleaseStatus("install", "myrelease", "processing", nil)
	require.NoError(t, err)

	s, err := h.getReleaseStatus("install", "myrelease")
	require.NoError(t, err)
	assert.Equal(t, "processing", s.Status)
	assert.Nil(t, s.Err)
}

func TestSetAndGetReleaseStatusWithError(t *testing.T) {
	h, err := NewHandler(newTestCache())
	require.NoError(t, err)

	releaseErr := errors.New("something went wrong")
	err = h.setReleaseStatus("upgrade", "myrelease", "failed", releaseErr)
	require.NoError(t, err)

	s, err := h.getReleaseStatus("upgrade", "myrelease")
	require.NoError(t, err)
	assert.Equal(t, "failed", s.Status)
	require.NotNil(t, s.Err)
	assert.Equal(t, "something went wrong", *s.Err)
}

func TestGetReleaseStatusCacheMiss(t *testing.T) {
	h, err := NewHandler(newTestCache())
	require.NoError(t, err)

	s, err := h.getReleaseStatus("install", "nonexistent")
	// cache miss must return an error and no status
	assert.Error(t, err)
	assert.Nil(t, s)
}

func TestSetReleaseStatusOverwritesPreviousValue(t *testing.T) {
	h, err := NewHandler(newTestCache())
	require.NoError(t, err)

	require.NoError(t, h.setReleaseStatus("install", "myrelease", "processing", nil))
	require.NoError(t, h.setReleaseStatus("install", "myrelease", "success", nil))

	s, err := h.getReleaseStatus("install", "myrelease")
	require.NoError(t, err)
	assert.Equal(t, "success", s.Status)
}

func TestSetReleaseStatusSilentDoesNotPanic(t *testing.T) {
	h, err := NewHandler(newTestCache())
	require.NoError(t, err)
	// should not panic even when called with an error value
	h.setReleaseStatusSilent("delete", "myrelease", "failed", errors.New("oops"))

	s, err := h.getReleaseStatus("delete", "myrelease")
	require.NoError(t, err)
	assert.Equal(t, "failed", s.Status)
}

func TestRestConfigGetterToRESTConfig(t *testing.T) {
	g := &restConfigGetter{
		clientConfig: fakeClientConfig(),
		namespace:    "default",
	}

	cfg, err := g.ToRESTConfig()
	require.NoError(t, err)
	assert.Equal(t, "https://127.0.0.1:6443", cfg.Host)
}

func TestRestConfigGetterToRawKubeConfigLoader(t *testing.T) {
	cc := fakeClientConfig()
	g := &restConfigGetter{clientConfig: cc, namespace: "default"}
	assert.Equal(t, cc, g.ToRawKubeConfigLoader())
}

func TestRestConfigGetterToDiscoveryClient(t *testing.T) {
	g := &restConfigGetter{
		clientConfig: fakeClientConfig(),
		namespace:    "default",
	}

	dc, err := g.ToDiscoveryClient()
	require.NoError(t, err)
	assert.NotNil(t, dc)
}

func TestRestConfigGetterToRESTMapper(t *testing.T) {
	g := &restConfigGetter{
		clientConfig: fakeClientConfig(),
		namespace:    "default",
	}

	rm, err := g.ToRESTMapper()
	require.NoError(t, err)
	assert.NotNil(t, rm)
}

func TestNewActionConfig(t *testing.T) {
	cfg, err := NewActionConfig(fakeClientConfig(), "default")
	require.NoError(t, err)
	assert.NotNil(t, cfg)
}

func TestSetReleaseStatusKeyIsolation(t *testing.T) {
	h, err := NewHandler(newTestCache())
	require.NoError(t, err)

	require.NoError(t, h.setReleaseStatus("install", "rel", "processing", nil))
	require.NoError(t, h.setReleaseStatus("upgrade", "rel", "success", nil))

	install, err := h.getReleaseStatus("install", "rel")
	require.NoError(t, err)
	assert.Equal(t, "processing", install.Status)

	upgrade, err := h.getReleaseStatus("upgrade", "rel")
	require.NoError(t, err)
	assert.Equal(t, "success", upgrade.Status)
}

func TestNewActionConfigDeferredKubeError(t *testing.T) {
	badCC := clientcmd.NewDefaultClientConfig(clientcmdapi.Config{}, &clientcmd.ConfigOverrides{})
	// Helm defers kubeconfig errors to actual API calls, not Init
	// so this returns a valid config even with empty kubeconfig
	cfg, err := NewActionConfig(badCC, "default")
	require.NoError(t, err)
	assert.NotNil(t, cfg)
}

func TestRestConfigGetterToDiscoveryClientBadConfig(t *testing.T) {
	g := &restConfigGetter{
		clientConfig: clientcmd.NewDefaultClientConfig(clientcmdapi.Config{}, &clientcmd.ConfigOverrides{}),
		namespace:    "default",
	}
	_, err := g.ToDiscoveryClient()
	assert.Error(t, err)
}

func TestRestConfigGetterToRESTMapperBadConfig(t *testing.T) {
	g := &restConfigGetter{
		clientConfig: clientcmd.NewDefaultClientConfig(clientcmdapi.Config{}, &clientcmd.ConfigOverrides{}),
		namespace:    "default",
	}
	_, err := g.ToRESTMapper()
	assert.Error(t, err)
}

func TestGetReleaseStatusUnmarshalError(t *testing.T) {
	c := newTestCache()
	h, err := NewHandler(c)
	require.NoError(t, err)

	key := "helm_install_badrelease"
	err = c.SetWithTTL(context.Background(), key, "this-is-not-a-stat-struct", statusCacheTimeout)
	require.NoError(t, err)

	_, err = h.getReleaseStatus("install", "badrelease")
	assert.Error(t, err)
}
