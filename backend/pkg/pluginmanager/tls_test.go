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

package pluginmanager_test

import (
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/pluginmanager"
)

// serverCAPEM returns the httptest server's certificate as PEM, so it can be
// used as a catalog's caCert (it is self-signed, so it is its own CA).
func serverCAPEM(t *testing.T, server *httptest.Server) string {
	t.Helper()

	block := &pem.Block{Type: "CERTIFICATE", Bytes: server.Certificate().Raw}

	return string(pem.EncodeToMemory(block))
}

func TestTLSCatalogSearch(t *testing.T) {
	index := `{"plugins": [{"name": "p", "version": "1.0.0",
		"archiveUrl": "https://example.com/p.tar.gz", "checksum": "` + validChecksum + `"}]}`
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(index))
	}))

	defer server.Close()

	indexURL := server.URL + "/index.json"

	t.Run("untrusted cert fails", func(t *testing.T) {
		router := startCatalogRouter(t, `{"id": "nexus", "name": "N", "type": "index", "url": "`+indexURL+`"}`)
		assert.Equal(t, http.StatusBadGateway, doGet(t, router, "/plugin-manager/catalogs/nexus/search").Code)
	})

	t.Run("insecure skip works", func(t *testing.T) {
		router := startCatalogRouter(t, `{"id": "nexus", "name": "N", "type": "index",
			"url": "`+indexURL+`", "insecureSkipTlsVerify": true}`)
		assert.Equal(t, http.StatusOK, doGet(t, router, "/plugin-manager/catalogs/nexus/search").Code)
	})

	t.Run("trusted CA works", func(t *testing.T) {
		ca := serverCAPEM(t, server)
		state := `{"catalogs": [{"id": "nexus", "name": "N", "type": "index",
			"url": "` + indexURL + `", "caCert": ` + quoteJSON(ca) + `}]}`
		_, manager := startManager(t, state, t.TempDir())
		waitFor(t, "state loaded", func() bool {
			loaded, _ := manager.CurrentState()

			return len(loaded.Catalogs) == 1
		})

		router := routerFor(manager)
		assert.Equal(t, http.StatusOK, doGet(t, router, "/plugin-manager/catalogs/nexus/search").Code)
	})
}

func TestReconcileDownloadsOverTLSWithCatalogCA(t *testing.T) {
	archive, checksum := makeArchive(t, map[string]string{
		"p/main.js":      "x",
		"p/package.json": "{}",
	})
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(archive)
	}))

	defer server.Close()

	ca := serverCAPEM(t, server)
	state := `{"catalogs": [{"id": "nexus", "name": "N", "type": "index",
		"url": "` + server.URL + `/index.json", "caCert": ` + quoteJSON(ca) + `}],
		"plugins": [{"name": "p", "version": "1.0.0", "catalog": "nexus",
		"archiveUrl": "` + server.URL + `/p.tar.gz", "checksum": "` + checksum + `"}]}`

	pluginsDir := t.TempDir()
	_, manager := startManager(t, state, pluginsDir)

	waitFor(t, "plugin installed over TLS", func() bool {
		_, err := os.Stat(filepath.Join(pluginsDir, "p", "main.js"))

		return err == nil
	})

	_, status := manager.CurrentState()
	assert.Equal(t, pluginmanager.PhaseSynced, status.Plugins["p"].Phase)
}

func TestParseStateRejectsInvalidCACert(t *testing.T) {
	_, err := pluginmanager.ParseState(`{"catalogs": [{"id": "x", "type": "index",
		"url": "https://x.example", "caCert": "not a pem cert"}]}`)
	assert.Error(t, err)
}

func TestValidCACertIsAccepted(t *testing.T) {
	// A syntactically valid (if useless) self-signed cert PEM must pass.
	server := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer server.Close()

	ca := serverCAPEM(t, server)

	block, _ := pem.Decode([]byte(ca))
	require.NotNil(t, block)
	_, err := x509.ParseCertificate(block.Bytes)
	require.NoError(t, err)

	_, err = pluginmanager.ParseState(`{"catalogs": [{"id": "x", "type": "index",
		"url": "https://x.example", "caCert": ` + quoteJSON(ca) + `}]}`)
	assert.NoError(t, err)
}
