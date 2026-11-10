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

package helm //nolint:testpackage // Tests cover unexported helm release handlers.

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/cli"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
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

// TestRestConfigGetter_EnforcesImpersonationDeadline locks in a fix for a gap where
// impersonationExpired() was checked only once, right before Helm's single, synchronous Run()
// call: an action already past that check when Run() starts could still keep issuing Kubernetes
// mutations under Headlamp's own ServiceAccount for as long as that one call took, with nothing
// to stop it once the user's verified session had actually expired. ToRESTConfig now wraps the
// transport so every underlying HTTP call -- not just the check before the first one -- is
// bounded by the same absolute deadline. This test makes the server hang indefinitely, so the
// request can only return via that deadline, never via the server responding on its own.
func TestRestConfigGetter_EnforcesImpersonationDeadline(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()

	cfg := clientcmdapi.NewConfig()
	cfg.Clusters["test"] = &clientcmdapi.Cluster{Server: srv.URL}
	cfg.AuthInfos["test"] = &clientcmdapi.AuthInfo{}
	cfg.Contexts["test"] = &clientcmdapi.Context{Cluster: "test", AuthInfo: "test"}
	cfg.CurrentContext = "test"
	clientConfig := clientcmd.NewDefaultClientConfig(*cfg, &clientcmd.ConfigOverrides{})

	getter := &restConfigGetter{
		clientConfig:        clientConfig,
		namespace:           "default",
		impersonationExpiry: time.Now().Add(50 * time.Millisecond),
	}

	restConfig, err := getter.ToRESTConfig()
	require.NoError(t, err)
	require.NotNil(t, restConfig.WrapTransport)

	httpClient, err := rest.HTTPClientFor(restConfig)
	require.NoError(t, err)

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, srv.URL, nil)
	require.NoError(t, err)

	start := time.Now()
	_, err = httpClient.Do(req) //nolint:bodyclose // The deadline aborts the request; there is no body to close.
	elapsed := time.Since(start)

	require.Error(t, err, "the request must fail once the deadline passes, not hang forever against a server "+
		"that never responds")
	assert.Less(t, elapsed, 5*time.Second,
		"the request must be aborted at the deadline, not run for however long the caller's "+
			"own context would otherwise allow")
}

// TestRestConfigGetter_NoDeadlineWhenImpersonationExpiryIsZero confirms read-only actions
// (list/get/history), which pass the zero Time, are unaffected: ToRESTConfig must not install
// any transport wrapping for them at all.
func TestRestConfigGetter_NoDeadlineWhenImpersonationExpiryIsZero(t *testing.T) {
	getter := &restConfigGetter{clientConfig: fakeClientConfig(), namespace: "default"}

	restConfig, err := getter.ToRESTConfig()
	require.NoError(t, err)
	assert.Nil(t, restConfig.WrapTransport)
}

func TestNewActionConfig(t *testing.T) {
	cfg, err := NewActionConfig(fakeClientConfig(), "default", time.Time{})
	require.NoError(t, err)
	assert.NotNil(t, cfg)
}

func TestNewActionConfigLogger(t *testing.T) {
	var (
		loggedMsg    string
		loggedFields map[string]string
	)

	oldLogger := logger.SetLogFunc(func(level uint, fields map[string]string, err interface{}, msg string) {
		loggedMsg = msg
		loggedFields = fields
	})
	defer logger.SetLogFunc(oldLogger)

	cfg, err := NewActionConfig(fakeClientConfig(), "test-namespace", time.Time{})
	require.NoError(t, err)
	require.NotNil(t, cfg)
	require.NotNil(t, cfg.Log)

	cfg.Log("release %s created with %d revisions", "my-app", 2)
	assert.Equal(t, "release my-app created with 2 revisions", loggedMsg)
	assert.Equal(t, "test-namespace", loggedFields["namespace"])

	cfg.Log("clearing release cache")
	assert.Equal(t, "clearing release cache", loggedMsg)
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
	cfg, err := NewActionConfig(badCC, "default", time.Time{})
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
