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

package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
	"k8s.io/client-go/tools/clientcmd/api"
)

type testStringer struct{ val string }

func (s testStringer) String() string { return s.val }

func TestJMESPathHelpers(t *testing.T) {
	t.Run("compileJMESPaths handles empty, invalid, and valid expressions", func(t *testing.T) {
		assert.Empty(t, compileJMESPaths("   "))

		paths := compileJMESPaths("user.name, , invalid[expr, email")
		assert.Len(t, paths, 2)
	})

	t.Run("stringValueFromJMESPaths handles all value types", func(t *testing.T) {
		paths := compileJMESPaths("missing, str, stringer, flt, i64, obj")

		assert.Equal(t, "alice", stringValueFromJMESPaths(map[string]interface{}{"str": "alice"}, paths))
		assert.Equal(t, "bob", stringValueFromJMESPaths(map[string]interface{}{"stringer": testStringer{"bob"}}, paths))
		assert.Equal(t, "42", stringValueFromJMESPaths(map[string]interface{}{"flt": float64(42)}, paths))
		assert.Equal(t, "7", stringValueFromJMESPaths(map[string]interface{}{"i64": int64(7)}, paths))
		assert.Equal(t, `{"k":"v"}`, stringValueFromJMESPaths(
			map[string]interface{}{"obj": map[string]interface{}{"k": "v"}},
			paths,
		))
		assert.Equal(t, "", stringValueFromJMESPaths(map[string]interface{}{}, paths))
	})

	t.Run("stringSliceFromJMESPaths handles all slice types", func(t *testing.T) {
		paths := compileJMESPaths("missing, iface, strs, single")

		res1 := stringSliceFromJMESPaths(map[string]interface{}{
			"iface": []interface{}{"a", float64(1), int64(2), map[string]string{"x": "y"}},
		}, paths)
		assert.Equal(t, []string{"a", "1", "2", `{"x":"y"}`}, res1)

		res2 := stringSliceFromJMESPaths(map[string]interface{}{"strs": []string{"g1", "g2"}}, paths)
		assert.Equal(t, []string{"g1", "g2"}, res2)

		res3 := stringSliceFromJMESPaths(map[string]interface{}{"single": "solo-group"}, paths)
		assert.Equal(t, []string{"solo-group"}, res3)

		assert.Empty(t, stringSliceFromJMESPaths(map[string]interface{}{}, paths))
	})
}

func TestRefreshedTokenHelpers(t *testing.T) {
	t.Run("refreshedTokenString extracts access_token or id_token", func(t *testing.T) {
		tok := (&oauth2.Token{AccessToken: "acc-1"}).WithExtra(map[string]interface{}{"id_token": "id-1"})

		gotAcc, err := refreshedTokenString(tok, true)
		require.NoError(t, err)
		assert.Equal(t, "acc-1", gotAcc)

		gotID, err := refreshedTokenString(tok, false)
		require.NoError(t, err)
		assert.Equal(t, "id-1", gotID)

		_, err = refreshedTokenString(&oauth2.Token{}, true)
		require.Error(t, err)

		_, err = refreshedTokenString(&oauth2.Token{}, false)
		require.Error(t, err)
	})

	t.Run("setRefreshedIDTokenCookie sets cookie when id_token present or fallback", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()

		setRefreshedIDTokenCookie(RefreshAndSetTokenParams{
			Writer:     rec,
			Request:    req,
			Cluster:    "c1",
			BaseURL:    "/headlamp",
			SessionTTL: 600,
		}, &oauth2.Token{}, "fallback-id-token")

		cookies := rec.Result().Cookies()
		require.NotEmpty(t, cookies)
	})
}

func TestCookieAndCacheEdgeCases(t *testing.T) {
	t.Run("DecodeClusterFromURL validates base64, non-empty, and utf8", func(t *testing.T) {
		got, err := DecodeClusterFromURL(EncodeClusterForURL("my-cluster"))
		require.NoError(t, err)
		assert.Equal(t, "my-cluster", got)

		_, err = DecodeClusterFromURL("!!!not-base64!!!")
		require.Error(t, err)

		_, err = DecodeClusterFromURL("")
		require.ErrorContains(t, err, "empty")

		badUTF8 := base64.RawURLEncoding.EncodeToString([]byte{0xff, 0xfe})
		_, err = DecodeClusterFromURL(badUTF8)
		require.ErrorContains(t, err, "UTF-8")
	})

	t.Run("CacheIDToken handles empty inputs and valid storage", func(t *testing.T) {
		c := cache.New[interface{}]()
		require.NoError(t, CacheIDToken(context.Background(), c, "", "id", time.Minute))
		require.NoError(t, CacheIDToken(context.Background(), c, "u", "", time.Minute))

		require.NoError(t, CacheIDToken(context.Background(), c, "user-tok", "id-tok", 0))
		got, err := c.Get(context.Background(), oidcIDTokenKeyPrefix+"user-tok")
		require.NoError(t, err)
		assert.Equal(t, "id-tok", got)
	})

	t.Run("SetTokenCookie and SetIDTokenCookie reject oversized tokens", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		oversized := strings.Repeat("a", 200000)

		err := SetTokenCookie(rec, req, "c1", oversized, "", 600)
		require.Error(t, err)

		err = SetIDTokenCookie(rec, req, "c1", oversized, "", 600)
		require.Error(t, err)
	})
}

func TestConfigureTLSContext(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "test-ca"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		IsCA:         true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)

	caPEM := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))

	skipTrue := true
	skipFalse := false
	emptyStr := ""

	ctx := ConfigureTLSContext(context.Background(), &skipFalse, &caPEM)
	assert.NotNil(t, ctx)

	ctxSkip := ConfigureTLSContext(context.Background(), &skipTrue, &emptyStr)
	assert.NotNil(t, ctxSkip)

	badPEM := "not-a-pem"
	ctxBad := ConfigureTLSContext(context.Background(), nil, &badPEM)
	assert.NotNil(t, ctxBad)
	_ = fmt.Sprintf("%v", ctxBad)
}

func TestOIDCTokenRefreshMiddlewareEdgeCases(t *testing.T) {
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:        "incluster-ctx",
		Source:      kubeconfig.InCluster,
		KubeContext: &api.Context{Cluster: "incluster-ctx"},
		Cluster:     &api.Cluster{Server: "https://10.0.0.1"},
		AuthInfo:    &api.AuthInfo{TokenFile: "/tmp/sa-token"}, //nolint:gosec // Test fixture path, not a credential.
	}))
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:        "oidc-ctx",
		KubeContext: &api.Context{Cluster: "oidc-ctx", AuthInfo: "u1"},
		Cluster:     &api.Cluster{Server: "https://example.com"},
		AuthInfo: &api.AuthInfo{
			AuthProvider: &api.AuthProviderConfig{
				Name:   "oidc",
				Config: map[string]string{"idp-issuer-url": "https://idp.example.com", "client-id": "cid"},
			},
		},
	}))

	cfg := OIDCTokenRefreshConfig{
		KubeConfigStore:              store,
		Cache:                        cache.New[interface{}](),
		UseInCluster:                 true,
		UnsafeUseServiceAccountToken: true,
	}

	mw := NewOIDCTokenRefreshMiddleware(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	t.Run("invalid Authorization header returns 401", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/oidc-ctx/api/v1/pods", nil)
		req.Header.Set("Authorization", "Bearer ")

		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("unsafe service account token skips refresh", func(t *testing.T) {
		req := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodGet,
			"/clusters/incluster-ctx/api/v1/pods",
			nil,
		)
		req.Header.Set("Authorization", "Bearer some.jwt.token")

		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
	})
}

func TestOIDCTokenRefreshMiddlewareNonExpiring(t *testing.T) {
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:        "oidc-ctx",
		KubeContext: &api.Context{Cluster: "oidc-ctx", AuthInfo: "u1"},
		Cluster:     &api.Cluster{Server: "https://example.com"},
		AuthInfo: &api.AuthInfo{
			AuthProvider: &api.AuthProviderConfig{
				Name:   "oidc",
				Config: map[string]string{"idp-issuer-url": "https://idp.example.com", "client-id": "cid"},
			},
		},
	}))

	mw := NewOIDCTokenRefreshMiddleware(OIDCTokenRefreshConfig{
		KubeConfigStore: store,
		Cache:           cache.New[interface{}](),
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	jwtTok := "hdr." + base64.RawURLEncoding.EncodeToString(
		[]byte(fmt.Sprintf(`{"exp":%d}`, time.Now().Add(time.Hour).Unix())),
	) + ".sig"
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/oidc-ctx/api/v1/pods", nil)
	req.Header.Set("Authorization", "Bearer "+jwtTok)

	rec := httptest.NewRecorder()
	mw.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestHandleMeErrorPaths(t *testing.T) {
	h := HandleMe(MeHandlerOptions{})

	t.Run("missing clusterName returns 400", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/me", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("cluster mismatch returns 400", func(t *testing.T) {
		req := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/other/pods", nil),
			map[string]string{"clusterName": "c1"},
		)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("missing token returns 401", func(t *testing.T) {
		req := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/me", nil),
			map[string]string{"clusterName": "c1"},
		)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("invalid and expired tokens return 401", func(t *testing.T) {
		req := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/me", nil),
			map[string]string{"clusterName": "c1"},
		)
		req.Header.Set("Authorization", "Bearer not-a-jwt")

		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)

		expiredClaims := fmt.Sprintf(`{"exp":%d}`, time.Now().Add(-time.Hour).Unix())
		expiredJWT := "hdr." + base64.RawURLEncoding.EncodeToString([]byte(expiredClaims)) + ".sig"
		req2 := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/me", nil),
			map[string]string{"clusterName": "c1"},
		)
		req2.Header.Set("Authorization", "Bearer "+expiredJWT)

		rec2 := httptest.NewRecorder()
		h.ServeHTTP(rec2, req2)
		assert.Equal(t, http.StatusUnauthorized, rec2.Code)
	})
}

func TestHandleMeValidJWT(t *testing.T) {
	h := HandleMe(MeHandlerOptions{})
	claims := fmt.Sprintf(
		`{"exp":%d,"preferred_username":"alice","email":"alice@example.com","groups":["devs"]}`,
		time.Now().Add(time.Hour).Unix(),
	)
	jwtTok := "hdr." + base64.RawURLEncoding.EncodeToString([]byte(claims)) + ".sig"
	req := mux.SetURLVars(
		httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/me", nil),
		map[string]string{"clusterName": "c1"},
	)
	req.Header.Set("Authorization", "Bearer "+jwtTok)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), "alice")
}
