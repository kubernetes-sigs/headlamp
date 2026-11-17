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

package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/helm"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/helmpath"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

func newTestExternalProxyServer() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/gzip":
			w.Header().Set("Content-Encoding", "gzip")
			w.Header().Set("Content-Type", "application/json")

			var buf bytes.Buffer

			gz := gzip.NewWriter(&buf)
			_, _ = gz.Write([]byte(`{"ok":true}`))
			_ = gz.Close()

			_, _ = w.Write(buf.Bytes())
		case "/bad-gzip":
			w.Header().Set("Content-Encoding", "gzip")
			_, _ = w.Write([]byte("not-gzip"))
		case "/redirect-disallowed":
			http.Redirect(w, r, "http://127.0.0.1:1/forbidden", http.StatusFound)
		default:
			w.Header().Set("Content-Type", "text/plain")
			_, _ = w.Write([]byte("plain"))
		}
	}))
}

func newRemainingTestHandler(t *testing.T, c *HeadlampConfig) http.Handler {
	t.Helper()
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "")

	if c != nil && c.HeadlampConfig != nil && c.HeadlampCFG != nil && c.KubeConfigDir == "" {
		c.KubeConfigDir = t.TempDir()
	}

	return createHeadlampHandler(newTestHandlerCtx(t), c)
}

func TestExternalProxyHandlerValidation(t *testing.T) {
	store := kubeconfig.NewContextStore()
	c := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: store,
				ProxyURLs:       []string{"https://allowed.example.com/*"},
			},
			Cache: cache.New[interface{}](),
		},
	}

	handler := newRemainingTestHandler(t, c)

	tests := []struct {
		name     string
		proxyTo  string
		wantCode int
	}{
		{name: "empty proxy URL", proxyTo: "", wantCode: http.StatusBadRequest},
		{name: "invalid proxy URL", proxyTo: "://bad-url", wantCode: http.StatusBadRequest},
		{name: "disallowed proxy URL", proxyTo: "https://example.invalid/test", wantCode: http.StatusBadRequest},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/externalproxy", nil)
			if tc.proxyTo != "" {
				req.Header.Set("proxy-to", tc.proxyTo)
			}

			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)
			assert.Equal(t, tc.wantCode, rec.Code)
		})
	}
}

func TestExternalProxyHandlerResponses(t *testing.T) {
	upstream := newTestExternalProxyServer()
	defer upstream.Close()

	store := kubeconfig.NewContextStore()
	c := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: store,
				ProxyURLs:       []string{upstream.URL + "/*"},
			},
			Cache: cache.New[interface{}](),
		},
	}

	handler := newRemainingTestHandler(t, c)

	t.Run("gzip response is decompressed", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/externalproxy", nil)
		req.Header.Set("proxy-to", upstream.URL+"/gzip")
		req.Header.Set("Accept-Encoding", "gzip")

		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.JSONEq(t, `{"ok":true}`, rec.Body.String())
	})

	t.Run("invalid gzip response returns 500", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/externalproxy", nil)
		req.Header.Set("proxy-to", upstream.URL+"/bad-gzip")
		req.Header.Set("Accept-Encoding", "gzip")

		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
	})

	t.Run("redirect to disallowed target returns 502", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/externalproxy", nil)
		req.Header.Set("proxy-to", upstream.URL+"/redirect-disallowed")

		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusBadGateway, rec.Code)
	})
}

func TestSetupGracefulShutdownAndFileHelpers(t *testing.T) {
	t.Run("serverDone cancels context", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		serverDone := make(chan struct{})
		srv := &http.Server{ReadHeaderTimeout: time.Second}

		setupGracefulShutdown(srv, cancel, serverDone)
		close(serverDone)

		<-ctx.Done()
		assert.ErrorIs(t, ctx.Err(), context.Canceled)
	})

	t.Run("copyStaticFiles copies directory tree", func(t *testing.T) {
		src := t.TempDir()
		require.NoError(t, os.WriteFile(filepath.Join(src, "index.html"), []byte("<html></html>"), 0o600))

		c := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					StaticDir: src,
				},
			},
		}

		err := copyStaticFiles(c)
		require.NoError(t, err)

		defer func() { _ = os.RemoveAll(c.StaticDir) }()

		got, err := os.ReadFile(filepath.Join(c.StaticDir, "index.html"))
		require.NoError(t, err)
		assert.Equal(t, "<html></html>", string(got))
	})

	t.Run("mustWriteFile and mustReadFile roundtrip", func(t *testing.T) {
		p := filepath.Join(t.TempDir(), "data.txt")
		mustWriteFile(p, []byte("hello"))
		assert.Equal(t, "hello", string(mustReadFile(p)))
	})
}

func TestInitTelemetryAndStaticDirHandler(t *testing.T) {
	t.Run("initTelemetry handles nil config", func(t *testing.T) {
		c := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{},
			},
		}
		_, err := initTelemetry(c)
		require.Error(t, err)
	})

	t.Run("createHeadlampHandler with StaticDir", func(t *testing.T) {
		staticDir := t.TempDir()
		require.NoError(t, os.WriteFile(filepath.Join(staticDir, "index.html"), []byte("ok"), 0o600))

		c := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore: kubeconfig.NewContextStore(),
					StaticDir:       staticDir,
				},
				Cache: cache.New[interface{}](),
			},
		}
		h := newRemainingTestHandler(t, c)
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestStatelessClusterRenameRemaining(t *testing.T) {
	t.Run("missing user id returns 400", func(t *testing.T) {
		c := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore: kubeconfig.NewContextStore(),
				},
				Cache: cache.New[interface{}](),
			},
		}
		r := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/cluster/c1", nil)
		w := httptest.NewRecorder()
		c.handleStatelessClusterRename(w, r, "c1")
		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("existing stateless context is removed and returns 201", func(t *testing.T) {
		store := kubeconfig.NewContextStore()
		key := statelessContextKey("c1", "u1")
		require.NoError(t, store.AddContextWithKeyAndTTL(&kubeconfig.Context{
			Name: "c1",
			KubeContext: &api.Context{
				Cluster: "c1",
			},
			Cluster: &api.Cluster{
				Server: "https://example.com",
			},
		}, key, ContextCacheTTL))

		c := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore: store,
				},
				Cache: cache.New[interface{}](),
			},
		}
		r := httptest.NewRequestWithContext(context.Background(), http.MethodPut, "/cluster/c1", nil)
		r.Header.Set("X-HEADLAMP-USER-ID", "u1")

		w := httptest.NewRecorder()

		c.handleStatelessClusterRename(w, r, "c1")
		assert.Equal(t, http.StatusCreated, w.Code)

		_, err := store.GetContext(key)
		assert.Error(t, err)
	})
}

func TestStatelessResolutionAndCacheHelpers(t *testing.T) {
	t.Run("resolveStatelessRequestContext errors and customName", func(t *testing.T) {
		emptyKC := base64.StdEncoding.EncodeToString([]byte("apiVersion: v1\nkind: Config\ncontexts: []\n"))
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/missing/api/v1/pods", nil)
		req = mux.SetURLVars(req, map[string]string{"clusterName": "missing"})
		_, _, err := resolveStatelessRequestContext(req, emptyKC)
		require.ErrorContains(t, err, "no contexts found")

		_, _, err = resolveStatelessRequestContext(req, "not-valid-base64!!!")
		require.Error(t, err)

		kcWithCustomName := `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://example.com
  name: raw-cluster
contexts:
- context:
    cluster: raw-cluster
    user: raw-user
    extensions:
    - extension:
        customName: custom-alias
      name: headlamp_info
  name: raw-ctx
users:
- name: raw-user
  user:
    token: tok
`
		encoded := base64.StdEncoding.EncodeToString([]byte(kcWithCustomName))
		req2 := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodGet,
			"/clusters/custom-alias/api/v1/pods",
			nil,
		)
		req2 = mux.SetURLVars(req2, map[string]string{"clusterName": "custom-alias"})
		req2.Header.Set("X-HEADLAMP-USER-ID", "user-42")
		key, kCtx, err := resolveStatelessRequestContext(req2, encoded)
		require.NoError(t, err)
		assert.Equal(t, statelessContextKey("custom-alias", "user-42"), key)
		assert.Equal(t, "raw-ctx", kCtx.Name)

		req3 := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil),
			map[string]string{"clusterName": "other"},
		)
		_, _, err = resolveStatelessRequestContext(req3, encoded)
		require.ErrorContains(t, err, "not found in supplied kubeconfig")
	})
}

func TestMarshalCustomObjectAndSetKeyInCache(t *testing.T) {
	t.Run("MarshalCustomObject and setKeyInCache", func(t *testing.T) {
		obj := &runtime.Unknown{Raw: []byte(`{"customName":"renamed"}`)}
		custom, err := MarshalCustomObject(obj, "ctx")
		require.NoError(t, err)
		assert.Equal(t, "renamed", custom.CustomName)

		bad := &runtime.Unknown{Raw: []byte(`{"customName":123}`)}
		_, err = MarshalCustomObject(bad, "ctx")
		require.Error(t, err)

		store := kubeconfig.NewContextStore()
		c := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore: store,
				},
			},
		}
		kCtx := kubeconfig.Context{
			Name:        "c1",
			KubeContext: &api.Context{Cluster: "c1"},
			Cluster:     &api.Cluster{Server: "https://example.com"},
		}
		require.NoError(t, c.setKeyInCache("k1", kCtx))
		require.NoError(t, c.setKeyInCache("k1", kCtx))
	})
}

func TestServerConfigAndHelmHandler(t *testing.T) {
	t.Run("loadOidcCACert empty and valid file", func(t *testing.T) {
		assert.Equal(t, "", loadOidcCACert(""))
		p := filepath.Join(t.TempDir(), "ca.crt")
		require.NoError(t, os.WriteFile(p, []byte("CERTDATA"), 0o600))
		assert.Equal(t, "CERTDATA", loadOidcCACert(p))
	})

	t.Run("createHeadlampConfig builds config", func(t *testing.T) {
		conf := &config.Config{
			Port:       4466,
			OidcScopes: "openid, profile , , email",
			ProxyURLs:  "https://example.com/*",
		}
		hc := createHeadlampConfig(conf)
		require.NotNil(t, hc)
		assert.Equal(t, []string{"openid", "profile", "email"}, hc.OidcScopes)
	})

	t.Run("getHelmHandler returns handler", func(t *testing.T) {
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore: kubeconfig.NewContextStore(),
				},
				Cache: cache.New[interface{}](),
			},
		}
		req := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil),
			map[string]string{"clusterName": "c1"},
		)
		rec := httptest.NewRecorder()
		h, err := getHelmHandler(hc, rec, req)
		require.NoError(t, err)
		require.NotNil(t, h)
	})
}

func TestCacheMiddleWarePaths(t *testing.T) {
	t.Run("CacheMiddleWare disabled passes through", func(t *testing.T) {
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					CacheEnabled:    false,
					KubeConfigStore: kubeconfig.NewContextStore(),
				},
			},
		}
		called := false
		mw := CacheMiddleWare(hc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true

			w.WriteHeader(http.StatusOK)
		}))
		rec := httptest.NewRecorder()
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/api/v1/pods", nil)
		mw.ServeHTTP(rec, req)
		assert.True(t, called)
	})

	t.Run("CacheMiddleWare enabled handles non-k8s and missing context", func(t *testing.T) {
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					CacheEnabled:    true,
					KubeConfigStore: kubeconfig.NewContextStore(),
				},
			},
		}
		called := false
		mw := CacheMiddleWare(hc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true

			w.WriteHeader(http.StatusOK)
		}))

		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/config", nil))
		assert.True(t, called)

		called = false
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/unknown/api/v1/pods", nil)
		req = mux.SetURLVars(req, map[string]string{"clusterName": "unknown"})
		rec2 := httptest.NewRecorder()
		mw.ServeHTTP(rec2, req)
		assert.False(t, called)
		assert.Equal(t, http.StatusNotFound, rec2.Code)
	})
}

func TestMultiplexerHelpersRemaining(t *testing.T) {
	t.Run("singleJoiningSlash", func(t *testing.T) {
		assert.Equal(t, "/a/b", singleJoiningSlash("/a/", "/b"))
		assert.Equal(t, "/a/b", singleJoiningSlash("/a", "b"))
		assert.Equal(t, "/a/b", singleJoiningSlash("/a/", "b"))
	})

	t.Run("createWebSocketURL", func(t *testing.T) {
		u := createWebSocketURL("https://k8s.example.com:6443", "pods", "watch=1")
		assert.Equal(t, "wss://k8s.example.com:6443/pods?watch=1", u)

		u2 := createWebSocketURL("http://localhost:8080/prefix/", "/pods", "")
		assert.Equal(t, "ws://localhost:8080/prefix/pods", u2)

		u3 := createWebSocketURL("://bad-url", "pods", "")
		assert.Equal(t, "wss://invalid-urlpods", u3)
	})

	t.Run("getClusterConfigWithFallback errors on missing cluster", func(t *testing.T) {
		m := NewMultiplexer(kubeconfig.NewContextStore(), false)
		_, err := m.getClusterConfigWithFallback("missing", "u1")
		require.Error(t, err)
	})

	t.Run("portForwardRequestHandler missing cluster returns 404", func(t *testing.T) {
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore: kubeconfig.NewContextStore(),
				},
				Cache: cache.New[interface{}](),
			},
		}
		h := newRemainingTestHandler(t, hc)
		req := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPost,
			"/clusters/c1/portforward",
			bytes.NewBufferString("{bad"),
		)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("json marshal sanity for clientConfig", func(t *testing.T) {
		var cc clientConfig
		require.NoError(t, json.Unmarshal([]byte(`{"clusters":[]}`), &cc))
		assert.Empty(t, cc.Clusters)
	})
}

func TestCacheMiddleWareWithValidContext(t *testing.T) {
	k8sSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":{"allowed":true}}`))
	}))
	defer k8sSrv.Close()

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:        "c1",
		KubeContext: &api.Context{Cluster: "c1"},
		Cluster:     &api.Cluster{Server: k8sSrv.URL},
	}))

	hc := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				CacheEnabled:    true,
				KubeConfigStore: store,
			},
			Cache: cache.New[interface{}](),
		},
	}

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"items":[]}`))
	})
	mw := CacheMiddleWare(hc)(next)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/api/v1/pods", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "c1"})
	rec := httptest.NewRecorder()
	mw.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	reqPost := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/clusters/c1/api/v1/pods", nil)
	reqPost = mux.SetURLVars(reqPost, map[string]string{"clusterName": "c1"})
	recPost := httptest.NewRecorder()
	mw.ServeHTTP(recPost, reqPost)
	assert.Equal(t, http.StatusOK, recPost.Code)
}

func TestMiscCmdHelpers(t *testing.T) {
	t.Run("getUrlScheme detects http vs https", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "http://example.com/", nil)
		assert.Equal(t, "http", getUrlScheme(req))

		reqHTTPS := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "https://example.com/", nil)
		assert.Equal(t, "https", getUrlScheme(reqHTTPS))
	})

	t.Run("serverHandler wraps loopback with hostValidationMiddleware", func(t *testing.T) {
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					ListenAddr:      "127.0.0.1",
					Port:            4466,
					KubeConfigStore: kubeconfig.NewContextStore(),
					KubeConfigDir:   t.TempDir(),
				},
				Cache: cache.New[interface{}](),
			},
		}
		h, err := serverHandler(newTestHandlerCtx(t), hc)
		require.NoError(t, err)
		require.NotNil(t, h)
	})

	t.Run("runServer exits cleanly on invalid listen address", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					ListenAddr: "invalid::listen::addr",
					Port:       4466,
				},
			},
		}
		runServer(hc, cancel, http.NotFoundHandler())
		<-ctx.Done()
	})
}

func TestEvictPodAndDrainNodePodsEdgeCases(t *testing.T) {
	t.Run("evictPod handles NotFound and Conflict with replaced UID", func(t *testing.T) {
		csNotFound := fake.NewClientset()
		csNotFound.PrependReactor("create", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, apierrors.NewNotFound(schema.GroupResource{Resource: "pods"}, "p1")
		})
		gone, err := evictPod(context.Background(), csNotFound, &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default", UID: "uid-1"},
		})
		require.NoError(t, err)
		assert.True(t, gone)

		csConflict := fake.NewClientset(&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default", UID: "uid-2"},
		})
		csConflict.PrependReactor("create", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, apierrors.NewConflict(schema.GroupResource{Resource: "pods"}, "p1", assert.AnError)
		})
		gone2, err2 := evictPod(context.Background(), csConflict, &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default", UID: "uid-1"},
		})
		require.NoError(t, err2)
		assert.True(t, gone2)
	})

	t.Run("drainNodePods reports empty status on cancelled context", func(t *testing.T) {
		hc := &HeadlampConfig{HeadlampConfig: &headlampconfig.HeadlampConfig{HeadlampCFG: &headlampconfig.HeadlampCFG{}}}
		ctx, cancel := context.WithCancel(context.Background())
		cancel()

		var gotStatus string

		hc.drainNodePods(ctx, fake.NewClientset(), []corev1.Pod{
			{ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default"}},
		}, func(status string) {
			gotStatus = status
		})
		assert.Equal(t, "", gotStatus)
	})
}

func TestUpdateCustomContextAndLoadKubeconfig(t *testing.T) {
	t.Run("updateCustomContextToCache errors on empty config and updates valid context", func(t *testing.T) {
		store := kubeconfig.NewContextStore()
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore: store,
				},
			},
		}

		errs := hc.updateCustomContextToCache(&api.Config{}, "old-ctx", "old-ctx", kubeConfigSource)
		require.NotEmpty(t, errs)

		cfg := &api.Config{
			Clusters:  map[string]*api.Cluster{"c1": {Server: "https://example.com"}},
			AuthInfos: map[string]*api.AuthInfo{"u1": {Token: "tok"}},
			Contexts:  map[string]*api.Context{"new-ctx": {Cluster: "c1", AuthInfo: "u1"}},
		}
		assert.Empty(t, hc.updateCustomContextToCache(cfg, "new-ctx", "new-ctx", kubeConfigSource))

		_, err := store.GetContext("new-ctx")
		assert.NoError(t, err)
	})

	t.Run("getPathAndLoadKubeconfig errors on missing file", func(t *testing.T) {
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigDir:   t.TempDir(),
					KubeConfigStore: kubeconfig.NewContextStore(),
				},
			},
		}
		_, _, err := hc.getPathAndLoadKubeconfig("dynamic_cluster", "c1")
		require.Error(t, err)
	})

	t.Run("readServiceAccountToken caches and errors on missing", func(t *testing.T) {
		m := NewMultiplexer(kubeconfig.NewContextStore(), false)
		_, err := m.readServiceAccountToken(filepath.Join(t.TempDir(), "missing"))
		require.Error(t, err)

		tokPath := filepath.Join(t.TempDir(), "token")
		require.NoError(t, os.WriteFile(tokPath, []byte("tok-1"), 0o600))
		got1, err := m.readServiceAccountToken(tokPath)
		require.NoError(t, err)
		assert.Equal(t, "tok-1", got1)

		got2, err := m.readServiceAccountToken(tokPath)
		require.NoError(t, err)
		assert.Equal(t, "tok-1", got2)
	})
}

func TestPluginRoutesAndCheckUniqueName(t *testing.T) {
	t.Run("plugin list and delete routes", func(t *testing.T) {
		c := cache.New[interface{}]()
		require.NoError(t, c.Set(context.Background(), "plugins-list", []string{"/plugins/p1"}))

		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore: kubeconfig.NewContextStore(),
					UserPluginDir:   t.TempDir(),
				},
				Cache: c,
			},
		}
		h := newRemainingTestHandler(t, hc)

		reqList := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/plugins", nil)
		recList := httptest.NewRecorder()
		h.ServeHTTP(recList, reqList)
		assert.Equal(t, http.StatusOK, recList.Code)

		reqDel := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/plugins/missing", nil)
		recDel := httptest.NewRecorder()
		h.ServeHTTP(recDel, reqDel)
		assert.Equal(t, http.StatusInternalServerError, recDel.Code)
	})

	t.Run("CheckUniqueName returns true when unique", func(t *testing.T) {
		contexts := map[string]*api.Context{"c1": {Cluster: "c1"}}
		assert.True(t, CheckUniqueName(contexts, "c2", ""))
	})

	t.Run("helmRouteRepositoryHandler requires token in-cluster", func(t *testing.T) {
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore: kubeconfig.NewContextStore(),
					UseInCluster:    true,
					EnableHelm:      true,
				},
				Cache: cache.New[interface{}](),
			},
		}
		h := newRemainingTestHandler(t, hc)
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/helm/repositories", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}

func TestAddClusterAndHelmDispatch(t *testing.T) {
	t.Run("addCluster validation and manual add", func(t *testing.T) {
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore:       kubeconfig.NewContextStore(),
					EnableDynamicClusters: true,
					KubeConfigDir:         t.TempDir(),
				},
				Cache: cache.New[interface{}](),
			},
		}
		h := newRemainingTestHandler(t, hc)

		reqBad := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPost,
			"/cluster",
			bytes.NewBufferString("{"),
		)
		recBad := httptest.NewRecorder()
		h.ServeHTTP(recBad, reqBad)
		assert.Equal(t, http.StatusBadRequest, recBad.Code)

		reqMissing := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPost,
			"/cluster",
			bytes.NewBufferString(`{}`),
		)
		recMissing := httptest.NewRecorder()
		h.ServeHTTP(recMissing, reqMissing)
		assert.Equal(t, http.StatusBadRequest, recMissing.Code)

		reqOK := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPost,
			"/cluster",
			bytes.NewBufferString(`{"name":"manual-c","server":"https://manual.example.com"}`),
		)
		recOK := httptest.NewRecorder()
		h.ServeHTTP(recOK, reqOK)
		assert.Equal(t, http.StatusCreated, recOK.Code)
	})

	t.Run("evictPending and waitForPodsGone succeed when pod disappears", func(t *testing.T) {
		cs := fake.NewClientset()
		pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default", UID: "u1"}}

		accepted, errs, done := evictPending(context.Background(), cs, []*corev1.Pod{pod})
		assert.True(t, done)
		assert.Empty(t, errs)
		assert.Empty(t, accepted)

		stuck, doneWait := waitForPodsGone(context.Background(), cs, []*corev1.Pod{pod})
		assert.True(t, doneWait)
		assert.Empty(t, stuck)
	})
}

func newTestHelmHandlerAndServer(t *testing.T) http.Handler {
	t.Helper()

	rawRelease, err := json.Marshal(map[string]any{
		"name":      "my-rel",
		"namespace": "default",
		"version":   1,
		"info":      map[string]any{"status": "deployed"},
	})
	require.NoError(t, err)

	var gzBuf bytes.Buffer

	gz := gzip.NewWriter(&gzBuf)
	_, err = gz.Write(rawRelease)
	require.NoError(t, err)
	require.NoError(t, gz.Close())

	inner := base64.StdEncoding.EncodeToString(gzBuf.Bytes())
	encodedRelease := base64.StdEncoding.EncodeToString([]byte(inner))

	secretJSON := `{"kind":"Secret","apiVersion":"v1","metadata":{"name":"sh.helm.release.v1.my-rel.v1",` +
		`"namespace":"default","labels":{"owner":"helm","name":"my-rel","status":"deployed","version":"1"}},` +
		`"type":"helm.sh/release.v1","data":{"release":"` + encodedRelease + `"}}`

	k8sSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method == http.MethodDelete {
			_, _ = w.Write([]byte(`{"kind":"Status","apiVersion":"v1","status":"Success"}`))
			return
		}

		if r.URL.Path == "/api/v1/namespaces/default/secrets/sh.helm.release.v1.my-rel.v1" {
			_, _ = w.Write([]byte(secretJSON))
			return
		}

		_, _ = w.Write([]byte(`{"kind":"SecretList","apiVersion":"v1","items":[` + secretJSON + `]}`))
	}))
	t.Cleanup(k8sSrv.Close)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:        "c1",
		KubeContext: &api.Context{Cluster: "c1", AuthInfo: "u1"},
		Cluster:     &api.Cluster{Server: k8sSrv.URL},
		AuthInfo:    &api.AuthInfo{Token: "tok"},
	}))

	hc := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: store,
				EnableHelm:      true,
			},
			Cache: cache.New[interface{}](),
		},
	}

	return newRemainingTestHandler(t, hc)
}

type helmRouteTestCase struct {
	name     string
	method   string
	path     string
	body     string
	wants    []int
	contains string
}

var helmRouteCases = []helmRouteTestCase{
	{
		name:     "list releases",
		method:   http.MethodGet,
		path:     "/clusters/c1/helm/releases/list",
		wants:    []int{http.StatusOK},
		contains: `"my-rel"`,
	},
	{
		name:     "get release",
		method:   http.MethodGet,
		path:     "/clusters/c1/helm/releases?name=my-rel&namespace=default",
		wants:    []int{http.StatusOK},
		contains: `"my-rel"`,
	},
	{
		name:     "release history",
		method:   http.MethodGet,
		path:     "/clusters/c1/helm/release/history?name=my-rel&namespace=default",
		wants:    []int{http.StatusOK},
		contains: `"releases"`,
	},
	{
		name:     "install release validation",
		method:   http.MethodPost,
		path:     "/clusters/c1/helm/release/install",
		body:     `{"name":"rel","namespace":"default","description":"d","chart":"../bad","version":"1.0.0"}`,
		wants:    []int{http.StatusBadRequest},
		contains: "chart",
	},
	{
		name:     "upgrade release validation",
		method:   http.MethodPut,
		path:     "/clusters/c1/helm/releases/upgrade",
		body:     `{"name":"rel","namespace":"default","description":"d","chart":"../bad","version":"1.0.0"}`,
		wants:    []int{http.StatusBadRequest},
		contains: "chart",
	},
	{
		name:     "rollback release validation",
		method:   http.MethodPut,
		path:     "/clusters/c1/helm/releases/rollback",
		body:     `{}`,
		wants:    []int{http.StatusBadRequest},
		contains: "Name",
	},
	{
		name:     "uninstall release",
		method:   http.MethodDelete,
		path:     "/clusters/c1/helm/releases/uninstall?name=my-rel&namespace=default",
		wants:    []int{http.StatusAccepted},
		contains: "uninstall",
	},
	{
		name:   "action status validation",
		method: http.MethodGet,
		path:   "/clusters/c1/helm/action/status",
		wants:  []int{http.StatusBadRequest},
	},
	{
		name:   "unknown route",
		method: http.MethodGet,
		path:   "/clusters/c1/helm/unknown-route",
		wants:  []int{http.StatusNotFound},
	},
}

func TestDispatchHelmRoutes(t *testing.T) {
	h := newTestHelmHandlerAndServer(t)

	t.Run("missing context returns 404", func(t *testing.T) {
		req := httptest.NewRequestWithContext(
			context.Background(), http.MethodGet, "/clusters/missing/helm/releases/list", nil,
		)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	for _, tc := range helmRouteCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(
				context.Background(), tc.method, tc.path, bytes.NewReader([]byte(tc.body)),
			)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			assert.Contains(t, tc.wants, rec.Code, tc.path)

			if tc.contains != "" {
				assert.Contains(t, rec.Body.String(), tc.contains)
			}
		})
	}

	t.Run("list charts with isolated settings", testDispatchHelmListCharts)

	require.Eventually(t, func() bool {
		req := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodGet,
			"/clusters/c1/helm/action/status?action=uninstall&name=my-rel",
			nil,
		)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		return rec.Code == http.StatusAccepted && strings.Contains(rec.Body.String(), `"status":"success"`)
	}, 2*time.Second, 20*time.Millisecond)
}

func testDispatchHelmListCharts(t *testing.T) {
	t.Helper()

	cfg := newCmdTestConfig(t)
	helmDir := t.TempDir()
	helmSettings := cli.New()
	helmSettings.RepositoryConfig = filepath.Join(helmDir, "repositories.yaml")
	helmSettings.RepositoryCache = filepath.Join(helmDir, "cache")
	require.NoError(t, os.MkdirAll(helmSettings.RepositoryCache, 0o750))
	require.NoError(t, os.WriteFile(
		helmSettings.RepositoryConfig,
		[]byte("repositories:\n- name: test-repo\n  url: https://example.com/charts\n"),
		0o600,
	))

	indexYAML := "apiVersion: v1\nentries:\n  demo:\n    - name: demo\n" +
		"      version: 1.0.0\n      appVersion: 1.0.0\n      description: demo chart\n"
	require.NoError(t, os.WriteFile(
		filepath.Join(helmSettings.RepositoryCache, helmpath.CacheIndexFile("test-repo")),
		[]byte(indexYAML),
		0o600,
	))

	helmHandler, err := helm.NewHandlerWithSettings(cfg.Cache, helmSettings)
	require.NoError(t, err)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/helm/charts", nil)
	ctx, span := telemetry.CreateSpan(context.Background(), req, "helm", "test")
	rec := httptest.NewRecorder()
	cfg.dispatchHelmRoute(ctx, span, rec, req, "/clusters/c1/helm/charts", "c1", helmHandler)
	span.End()

	wantJSON := `{"charts":[{"name":"test-repo/demo","description":"demo chart",` +
		`"version":"1.0.0","appVersion":"1.0.0","repository":"test-repo"}]}`

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t, wantJSON, rec.Body.String())
}

func TestAddClusterWithKubeConfig(t *testing.T) {
	kc := `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://example.com
  name: c1
contexts:
- context:
    cluster: c1
    user: u1
  name: ctx-kc
users:
- name: u1
  user:
    token: tok
`
	encoded := base64.StdEncoding.EncodeToString([]byte(kc))

	hc := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore:       kubeconfig.NewContextStore(),
				EnableDynamicClusters: true,
				KubeConfigDir:         t.TempDir(),
			},
			Cache: cache.New[interface{}](),
		},
	}
	h := newRemainingTestHandler(t, hc)

	req := httptest.NewRequestWithContext(
		context.Background(),
		http.MethodPost,
		"/cluster",
		bytes.NewBufferString(`{"kubeconfig":"`+encoded+`"}`),
	)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusCreated, rec.Code)

	_, err := hc.KubeConfigStore.GetContext("ctx-kc")
	assert.NoError(t, err)
}

func TestPortForwardRequestHandlerKubeconfigAndProxyAuth(t *testing.T) {
	hc := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{ //nolint:gosec // Header name, not a credential.
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore:       kubeconfig.NewContextStore(),
				EnableDynamicClusters: true,
			},
			ProxyAuthEnabled:     true,
			ProxyAuthTokenHeader: "X-Custom-Header",
			Cache:                cache.New[interface{}](),
		},
	}
	h := newRemainingTestHandler(t, hc)

	reqBadKC := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/clusters/c1/portforward", nil)
	reqBadKC.Header.Set("KUBECONFIG", "!!!bad!!!")
	reqBadKC.Header.Set("X-Custom-Header", "tok-1")

	recBadKC := httptest.NewRecorder()
	h.ServeHTTP(recBadKC, reqBadKC)
	assert.Equal(t, http.StatusBadRequest, recBadKC.Code)
}

func TestParseCustomNameAndDeleteClusterErrors(t *testing.T) {
	t.Run("parseCustomNameClusters handles valid and invalid extensions", func(t *testing.T) {
		ctxs := []kubeconfig.Context{
			{
				Name:    "orig",
				Cluster: &api.Cluster{Server: "https://example.com"},
				KubeContext: &api.Context{
					Extensions: map[string]runtime.Object{
						"headlamp_info": &runtime.Unknown{Raw: []byte(`{"customName":"alias-1"}`)},
					},
				},
			},
			{
				Name:    "bad-ext",
				Cluster: &api.Cluster{Server: "https://example.com"},
				KubeContext: &api.Context{
					Extensions: map[string]runtime.Object{
						"headlamp_info": &runtime.Unknown{Raw: []byte(`{"customName":123}`)},
					},
				},
			},
		}

		clusters, errs := parseCustomNameClusters(ctxs)
		assert.Len(t, clusters, 1)
		assert.Equal(t, "alias-1", clusters[0].Name)
		assert.Len(t, errs, 1)
	})

	t.Run("parseClusterFromKubeConfig mixes valid and invalid entries", func(t *testing.T) {
		kc := base64.StdEncoding.EncodeToString([]byte(`apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://example.com
  name: c1
contexts:
- context:
    cluster: c1
    user: u1
  name: ctx1
users:
- name: u1
  user:
    token: tok
`))
		clusters, errs := parseClusterFromKubeConfig([]string{kc, "!!!bad!!!"})
		assert.Len(t, clusters, 1)
		assert.NotEmpty(t, errs)
	})
}

func TestDeleteClusterRemoveKubeConfigErrors(t *testing.T) {
	t.Run("deleteCluster removeKubeConfig forbidden and not found", func(t *testing.T) {
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore:        kubeconfig.NewContextStore(),
					EnableDynamicClusters:  true,
					AllowKubeconfigChanges: false,
				},
				Cache: cache.New[interface{}](),
			},
		}
		h := newRemainingTestHandler(t, hc)

		req403 := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodDelete,
			"/cluster/c1?removeKubeConfig=true",
			nil,
		)
		rec403 := httptest.NewRecorder()
		h.ServeHTTP(rec403, req403)
		assert.Equal(t, http.StatusForbidden, rec403.Code)

		hc.AllowKubeconfigChanges = true
		req404 := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodDelete,
			"/cluster/missing?removeKubeConfig=true",
			nil,
		)
		rec404 := httptest.NewRecorder()
		h.ServeHTTP(rec404, req404)
		assert.Equal(t, http.StatusNotFound, rec404.Code)
	})
}

func TestDrainNodeAndRenameClusterErrors(t *testing.T) {
	hc := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore:       kubeconfig.NewContextStore(),
				EnableDynamicClusters: true,
			},
			Cache: cache.New[interface{}](),
		},
	}
	h := newRemainingTestHandler(t, hc)

	t.Run("handleNodeDrain validation errors", func(t *testing.T) {
		reqCT := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/clusters/c1/drain-node", nil)
		recCT := httptest.NewRecorder()
		h.ServeHTTP(recCT, reqCT)
		assert.Equal(t, http.StatusUnsupportedMediaType, recCT.Code)

		for _, body := range []string{"{bad", `{"cluster":"c1"}`, `{"nodeName":"n1"}`} {
			req := httptest.NewRequestWithContext(
				context.Background(),
				http.MethodPost,
				"/clusters/c1/drain-node",
				bytes.NewBufferString(body),
			)
			req.Header.Set("Content-Type", "application/json")

			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			assert.Equal(t, http.StatusBadRequest, rec.Code)
		}
	})

	t.Run("renameCluster validation and stateless path", func(t *testing.T) {
		reqBad := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPut,
			"/cluster/c1",
			bytes.NewBufferString("{bad"),
		)
		recBad := httptest.NewRecorder()
		h.ServeHTTP(recBad, reqBad)
		assert.Equal(t, http.StatusBadRequest, recBad.Code)

		reqStateless := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPut,
			"/cluster/c1",
			bytes.NewBufferString(`{"newClusterName":"c2","stateless":true}`),
		)
		reqStateless.Header.Set("X-HEADLAMP-USER-ID", "u1")

		recStateless := httptest.NewRecorder()
		h.ServeHTTP(recStateless, reqStateless)
		assert.Equal(t, http.StatusCreated, recStateless.Code)
	})
}

func TestMultiplexerUpgradeAndLogoutRedirect(t *testing.T) {
	t.Run("HandleClientWebSocket non-ws request fails upgrade", func(t *testing.T) {
		m := NewMultiplexer(kubeconfig.NewContextStore(), false)
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/wsMultiplexer", nil)
		rec := httptest.NewRecorder()
		m.HandleClientWebSocket(rec, req)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("sendOIDCLogoutRedirect writes redirect", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/logout", nil)
		rec := httptest.NewRecorder()
		sendOIDCLogoutRedirect(rec, req, "https://idp.example.com/logout?reason=done")
		assert.Equal(t, http.StatusFound, rec.Code)
	})
}

func TestNodeDrainStatusAndPluginDeleteSuccess(t *testing.T) {
	userPluginDir := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(userPluginDir, "my-plugin"), 0o750))

	hc := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: kubeconfig.NewContextStore(),
				UserPluginDir:   userPluginDir,
			},
			Cache: cache.New[interface{}](),
		},
	}
	h := newRemainingTestHandler(t, hc)

	t.Run("handleNodeDrainStatus validation and unknown node", func(t *testing.T) {
		reqNoNode := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodGet,
			"/clusters/c1/drain-node-status?cluster=c1",
			nil,
		)
		recNoNode := httptest.NewRecorder()
		h.ServeHTTP(recNoNode, reqNoNode)
		assert.Equal(t, http.StatusBadRequest, recNoNode.Code)

		reqNoCluster := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodGet,
			"/clusters/c1/drain-node-status?nodeName=n1",
			nil,
		)
		recNoCluster := httptest.NewRecorder()
		h.ServeHTTP(recNoCluster, reqNoCluster)
		assert.Equal(t, http.StatusNotFound, recNoCluster.Code)
	})

	t.Run("DELETE /plugins/my-plugin deletes existing user plugin", func(t *testing.T) {
		reqDel := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/plugins/my-plugin", nil)
		recDel := httptest.NewRecorder()
		h.ServeHTTP(recDel, reqDel)
		assert.Equal(t, http.StatusOK, recDel.Code)
	})

	t.Run("customNameToExtensions updates existing context and errors on missing", func(t *testing.T) {
		cfg := &api.Config{
			Contexts: map[string]*api.Context{"ctx1": {Cluster: "c1"}},
		}
		path := filepath.Join(t.TempDir(), "cfg")
		require.NoError(t, clientcmd.WriteToFile(*cfg, path))
		require.NoError(t, customNameToExtensions(cfg, "ctx1", "alias-1", path))
		require.Error(t, customNameToExtensions(cfg, "missing", "alias-1", path))
	})
}

func TestHandleClusterRenameInKubeconfig(t *testing.T) {
	t.Run("handleClusterRename renames context in kubeconfig file", func(t *testing.T) {
		kcDir := t.TempDir()
		kcPath := filepath.Join(kcDir, "config")
		kcYAML := `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://example.com
  name: c1
contexts:
- context:
    cluster: c1
    user: u1
  name: ctx1
users:
- name: u1
  user:
    token: tok
`
		require.NoError(t, os.WriteFile(kcPath, []byte(kcYAML), 0o600))

		store := kubeconfig.NewContextStore()
		require.NoError(t, store.AddContext(&kubeconfig.Context{
			Name:           "ctx1",
			Source:         kubeconfig.DynamicCluster,
			KubeConfigPath: kcPath,
			KubeContext:    &api.Context{Cluster: "c1", AuthInfo: "u1"},
			Cluster:        &api.Cluster{Server: "https://example.com"},
		}))

		hc2 := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore:        store,
					KubeConfigDir:          kcDir,
					EnableDynamicClusters:  true,
					AllowKubeconfigChanges: true,
				},
				Cache: cache.New[interface{}](),
			},
		}
		h2 := newRemainingTestHandler(t, hc2)
		req := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPut,
			"/cluster/ctx1",
			bytes.NewBufferString(`{"newClusterName":"renamed-1","source":"dynamic_cluster"}`),
		)
		rec := httptest.NewRecorder()
		h2.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusCreated, rec.Code)
	})
}

func TestMultiplexerWebSocketErrorHelpers(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	clientConn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)

	if resp != nil {
		_ = resp.Body.Close()
	}

	defer func() { _ = clientConn.Close() }()

	lock := &WSConnLock{conn: clientConn}
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	m.sendClientError(lock, "c1", "/pods", "watch=1", "u1", assert.AnError)
	m.handleConnectionError(lock, Message{ClusterID: "c1", Path: "/pods"}, errWatchExpired)
	m.handleConnectionError(lock, Message{ClusterID: "c1", Path: "/pods"}, assert.AnError)

	conn := &Connection{
		ClusterID: "c1",
		UserID:    "u1",
		Client:    lock,
		WSConn:    clientConn,
		Status:    ConnectionStatus{State: StateError, Error: "failed"},
		Done:      make(chan struct{}),
	}
	_ = conn.writeStatusLocked()
	m.endExpiredWatch(conn)
}

func TestMultiplexerMonitorAndReconnect(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	connMonitor := &Connection{
		ClusterID: "c1",
		UserID:    "u1",
		Done:      make(chan struct{}),
	}
	close(connMonitor.Done)
	m.monitorConnection(connMonitor)

	conn2 := &Connection{
		ClusterID: "missing-cluster",
		UserID:    "u1",
		Done:      make(chan struct{}),
	}
	_, recErr := m.reconnect(conn2)
	require.Error(t, recErr)
}

func TestHandleServerStartErrorAndClusterDiscovery(t *testing.T) {
	errPerm := os.ErrPermission
	HandleServerStartError(&errPerm)

	hc := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore:       kubeconfig.NewContextStore(),
				EnableDynamicClusters: true,
			},
			OidcClientID:     "cid",
			OidcIdpIssuerURL: "https://idp.example.com",
			OidcScopes:       []string{"openid"},
			AdminSettings:    json.RawMessage(`{"k":"v"}`),
			Cache:            cache.New[interface{}](),
		},
	}
	h := newRemainingTestHandler(t, hc)
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/config", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	hc.TelemetryConfig = createHeadlampConfig(&config.Config{}).TelemetryConfig

	tel, err := initTelemetry(hc)
	if err == nil && tel != nil {
		_ = tel.Shutdown(context.Background())
	}

	// Exercise drainNode against a fake clientset with a cordonable node and no pods.
	cs := fake.NewClientset(&corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-1"}})
	hc.drainNode(context.Background(), cs, "node-1", "c1")

	cacheKey := drainCacheKey("node-1", "c1")

	require.Eventually(t, func() bool {
		val, err := hc.Cache.Get(context.Background(), cacheKey)
		return err == nil && val == "success"
	}, 2*time.Second, 10*time.Millisecond)

	node, err := cs.CoreV1().Nodes().Get(context.Background(), "node-1", metav1.GetOptions{})
	require.NoError(t, err)
	assert.True(t, node.Spec.Unschedulable)
}

func TestRunListPlugins(t *testing.T) {
	origArgs := os.Args
	defer func() { os.Args = origArgs }()

	tmpDir := t.TempDir()
	t.Setenv("HOME", tmpDir)
	t.Setenv("USERPROFILE", tmpDir)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(tmpDir, ".config"))
	t.Setenv("APPDATA", filepath.Join(tmpDir, "AppData", "Roaming"))

	for _, env := range os.Environ() {
		key, val, ok := strings.Cut(env, "=")
		if ok && strings.HasPrefix(key, "HEADLAMP_CONFIG_") {
			origKey, origVal := key, val
			require.NoError(t, os.Unsetenv(origKey))
			t.Cleanup(func() { _ = os.Setenv(origKey, origVal) })
		}
	}

	pluginsDir := filepath.Join(tmpDir, "plugins")
	userPluginsDir := filepath.Join(tmpDir, "user-plugins")
	staticDir := filepath.Join(tmpDir, "static")

	// runListPlugins passes os.Args[2:] to config.Parse, which strips args[0] via normalizeArgs.
	os.Args = []string{
		"headlamp",
		"list-plugins",
		"list-plugins",
		"-plugins-dir=" + pluginsDir,
		"-user-plugins-dir=" + userPluginsDir,
		"-html-static-dir=" + staticDir,
	}

	runListPlugins()
}

func TestOidcCallbackAndLogoutProviderURLHelpers(t *testing.T) {
	hc := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				BaseURL:         "/headlamp",
				KubeConfigStore: kubeconfig.NewContextStore(),
			},
		},
	}

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "https://app.example.com/oidc", nil)
	cbURL := getOidcCallbackURL(req, hc)
	assert.Contains(t, cbURL, "/headlamp/oidc-callback")

	_, err := getOIDCLogoutProviderURL(hc, req, "missing")
	require.Error(t, err)

	var idpURL string

	idpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"issuer":"` + idpURL + `","end_session_endpoint":"https://idp.example.com/logout"}`))
	}))
	defer idpSrv.Close()

	idpURL = idpSrv.URL

	require.NoError(t, hc.KubeConfigStore.AddContext(&kubeconfig.Context{
		Name:        "c-oidc",
		KubeContext: &api.Context{Cluster: "c-oidc"},
		Cluster:     &api.Cluster{Server: "https://example.com"},
		OidcConf: &kubeconfig.OidcConfig{
			IdpIssuerURL: idpSrv.URL,
			ClientID:     "cid",
		},
	}))

	logoutURL, err := getOIDCLogoutProviderURL(hc, req, "c-oidc")
	require.NoError(t, err)
	assert.Contains(t, logoutURL.String(), "https://idp.example.com/logout")

	_, err = parseOIDCEndSessionEndpoint("ftp://idp.example.com/logout")
	require.Error(t, err)

	loadErrs := hc.handleLoadErrors(assert.AnError, []kubeconfig.ContextLoadError{{Error: assert.AnError}})
	assert.Len(t, loadErrs, 2)

	clusters := hc.getClusters()
	assert.Len(t, clusters, 1)

	_, err = hc.proxyURLAllowed("https://example.com")
	require.NoError(t, err)

	hc.ProxyURLs = []string{"["}
	_, err = hc.proxyURLAllowed("https://example.com")
	require.Error(t, err)
}

func TestOIDCLogoutAndTokenHelpers(t *testing.T) {
	t.Run("validateOIDCLogoutState rejects missing and mismatched state", func(t *testing.T) {
		assert.False(t, validateOIDCLogoutState("s1", "s2", "c1", time.Now()))
	})

	t.Run("applyRequestTokenToContext copies bearer token", func(t *testing.T) {
		kCtx := &kubeconfig.Context{Name: "c1", AuthInfo: &api.AuthInfo{}}
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
		req.Header.Set("Authorization", "Bearer my-tok")
		applyRequestTokenToContext(req, "c1", kCtx)
		assert.Equal(t, "my-tok", kCtx.AuthInfo.Token)
	})

	t.Run("parseOIDCEndSessionEndpoint handles invalid URL", func(t *testing.T) {
		_, err := parseOIDCEndSessionEndpoint("://bad-url")
		require.Error(t, err)
	})
}
