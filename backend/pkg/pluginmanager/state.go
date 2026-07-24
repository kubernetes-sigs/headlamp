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

// Package pluginmanager reconciles the local user plugins directory against a
// desired state stored in a ConfigMap, so that every replica of an in-cluster
// Headlamp deployment converges to the same set of installed plugins.
package pluginmanager

import (
	"crypto/x509"
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// StateKey is the ConfigMap data key that holds the desired state JSON.
const StateKey = "state.json"

// Catalog types supported by the browse and resolve endpoints.
const (
	CatalogTypeArtifactHub = "artifacthub"
	CatalogTypeIndex       = "index"
)

// Catalog describes a source of installable plugins.
type Catalog struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	URL  string `json:"url"`
	// InsecureSkipTLSVerify disables TLS certificate verification for this
	// catalog and the plugins downloaded from it. Off by default.
	InsecureSkipTLSVerify bool `json:"insecureSkipTlsVerify,omitempty"`
	// CACert is an optional PEM-encoded certificate (or bundle) that is
	// trusted in addition to the system roots, e.g. a self-signed Nexus CA.
	CACert string `json:"caCert,omitempty"`
	// Username is the HTTP Basic auth user for a private catalog. The password
	// lives in the Secret named by PasswordSecret, never in this ConfigMap.
	Username string `json:"username,omitempty"`
	// PasswordSecret names a Secret in Headlamp's namespace whose "password"
	// key holds the Basic auth password for this catalog.
	PasswordSecret string `json:"passwordSecret,omitempty"`
}

// DesiredPlugin describes one plugin that should be installed on every replica.
type DesiredPlugin struct {
	Name       string `json:"name"`
	Version    string `json:"version"`
	ArchiveURL string `json:"archiveUrl"`
	Checksum   string `json:"checksum"`
	Catalog    string `json:"catalog,omitempty"`
	Source     string `json:"source,omitempty"`
}

// State is the desired state stored in the manager ConfigMap.
type State struct {
	Catalogs []Catalog       `json:"catalogs"`
	Plugins  []DesiredPlugin `json:"plugins"`
}

var nameRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`)

// Catalog ids and Secret names end up as Kubernetes resource names, so they
// must be valid DNS-1123 labels / subdomains to fail fast on misconfiguration.
var (
	dns1123LabelRe     = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$`)
	dns1123SubdomainRe = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$`)
)

// ParseState decodes and validates the desired state JSON.
func ParseState(data string) (*State, error) {
	state := &State{}

	if strings.TrimSpace(data) == "" {
		return state, nil
	}

	if err := json.Unmarshal([]byte(data), state); err != nil {
		return nil, fmt.Errorf("parsing state: %w", err)
	}

	if err := state.Validate(); err != nil {
		return nil, err
	}

	return state, nil
}

// Validate checks IDs, names and URLs so that reconciliation and file system
// operations only ever see safe values.
func (s *State) Validate() error {
	seenCatalogs := map[string]bool{}

	for i := range s.Catalogs {
		if err := s.Catalogs[i].validate(); err != nil {
			return err
		}

		if seenCatalogs[s.Catalogs[i].ID] {
			return fmt.Errorf("duplicate catalog id %q", s.Catalogs[i].ID)
		}

		seenCatalogs[s.Catalogs[i].ID] = true
	}

	seenPlugins := map[string]bool{}

	for i := range s.Plugins {
		if err := s.Plugins[i].validate(); err != nil {
			return err
		}

		if seenPlugins[s.Plugins[i].Name] {
			return fmt.Errorf("duplicate plugin %q", s.Plugins[i].Name)
		}

		seenPlugins[s.Plugins[i].Name] = true
	}

	return nil
}

func (c *Catalog) validate() error {
	if !dns1123LabelRe.MatchString(c.ID) {
		return fmt.Errorf("invalid catalog id %q (must be a DNS-1123 label)", c.ID)
	}

	if c.Type != CatalogTypeArtifactHub && c.Type != CatalogTypeIndex {
		return fmt.Errorf("catalog %q: unsupported type %q", c.ID, c.Type)
	}

	if c.CACert != "" {
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM([]byte(c.CACert)) {
			return fmt.Errorf("catalog %q: caCert is not a valid PEM certificate", c.ID)
		}
	}

	if c.PasswordSecret != "" &&
		(len(c.PasswordSecret) > 253 || !dns1123SubdomainRe.MatchString(c.PasswordSecret)) {
		return fmt.Errorf("catalog %q: invalid passwordSecret name %q", c.ID, c.PasswordSecret)
	}

	return validateHTTPURL(c.URL)
}

func (p *DesiredPlugin) validate() error {
	if !nameRe.MatchString(p.Name) {
		return fmt.Errorf("invalid plugin name %q", p.Name)
	}

	if _, err := normalizeChecksum(p.Checksum); err != nil {
		return fmt.Errorf("plugin %q: %w", p.Name, err)
	}

	return validateHTTPURL(p.ArchiveURL)
}

func validateHTTPURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return fmt.Errorf("invalid URL %q", raw)
	}

	return nil
}

var checksumRe = regexp.MustCompile(`^[0-9a-f]{64}$`)

// normalizeChecksum accepts "sha256:<hex>", "SHA256:<hex>" or a bare hex
// digest and returns the lower-case hex digest.
func normalizeChecksum(checksum string) (string, error) {
	c := strings.ToLower(strings.TrimSpace(checksum))
	c = strings.TrimPrefix(c, "sha256:")

	if !checksumRe.MatchString(c) {
		return "", fmt.Errorf("invalid sha256 checksum %q", checksum)
	}

	return c, nil
}
