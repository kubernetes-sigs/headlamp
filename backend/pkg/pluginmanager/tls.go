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

package pluginmanager

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"time"
)

// httpClientFor builds an HTTP client honoring a catalog's TLS settings (an
// optional additional CA certificate and an opt-in to skip verification) and,
// when username is set, HTTP Basic auth. The same client is used for browsing
// the catalog and downloading its plugins so that a private and/or self-signed
// Nexus works consistently for both.
func httpClientFor(catalog Catalog, username, password string, timeout time.Duration) (*http.Client, error) {
	tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12}

	if catalog.InsecureSkipTLSVerify {
		tlsConfig.InsecureSkipVerify = true
	}

	if catalog.CACert != "" {
		pool, err := x509.SystemCertPool()
		if err != nil || pool == nil {
			pool = x509.NewCertPool()
		}

		if !pool.AppendCertsFromPEM([]byte(catalog.CACert)) {
			return nil, fmt.Errorf("catalog %q: caCert is not a valid PEM certificate", catalog.ID)
		}

		tlsConfig.RootCAs = pool
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = tlsConfig

	var roundTripper http.RoundTripper = transport
	if username != "" {
		roundTripper = &basicAuthTransport{base: transport, username: username, password: password}
	}

	return &http.Client{Timeout: timeout, Transport: roundTripper}, nil
}

// basicAuthTransport adds HTTP Basic auth to every request.
type basicAuthTransport struct {
	base     http.RoundTripper
	username string
	password string
}

func (t *basicAuthTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	cloned := req.Clone(req.Context())
	cloned.SetBasicAuth(t.username, t.password)

	return t.base.RoundTrip(cloned)
}
