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
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// CatalogEntry is a plugin as listed by a catalog.
type CatalogEntry struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName,omitempty"`
	Description string `json:"description,omitempty"`
	Version     string `json:"version"`
	Catalog     string `json:"catalog"`
	Source      string `json:"source,omitempty"`
	LogoURL     string `json:"logoUrl,omitempty"`
	// RepoName is needed to resolve ArtifactHub packages.
	RepoName string `json:"repoName,omitempty"`
	// ArchiveURL and Checksum are set when the catalog lists them directly.
	ArchiveURL string `json:"archiveUrl,omitempty"`
	Checksum   string `json:"checksum,omitempty"`
}

// ResolvedPlugin holds everything needed to install a specific plugin version.
type ResolvedPlugin struct {
	Name       string `json:"name"`
	Version    string `json:"version"`
	ArchiveURL string `json:"archiveUrl"`
	Checksum   string `json:"checksum"`
	Source     string `json:"source,omitempty"`
}

// catalogClient browses a catalog and resolves entries to archives.
type catalogClient interface {
	search(ctx context.Context, query string, limit, offset int) ([]CatalogEntry, error)
	resolve(ctx context.Context, entry CatalogEntry) (*ResolvedPlugin, error)
}

const (
	catalogHTTPTimeout   = 30 * time.Second
	maxCatalogResponse   = 10 << 20
	artifactHubKind      = "21"
	defaultSearchLimit   = 20
	maxSearchLimit       = 60
	artifactHubInCluster = "in-cluster"
)

func newCatalogClient(catalog Catalog, httpClient *http.Client) (catalogClient, error) {
	switch catalog.Type {
	case CatalogTypeArtifactHub:
		return &artifactHubCatalog{catalog: catalog, client: httpClient}, nil
	case CatalogTypeIndex:
		return &indexCatalog{catalog: catalog, client: httpClient}, nil
	default:
		return nil, fmt.Errorf("unsupported catalog type %q", catalog.Type)
	}
}

func fetchJSON(ctx context.Context, client *http.Client, rawURL string, out interface{}) error {
	// Catalog URLs come from the manager ConfigMap, which is only writable by
	// users holding RBAC permissions on it, and are validated to be http(s).
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil) //nolint:gosec // see above
	if err != nil {
		return err
	}

	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req) //nolint:gosec // see above
	if err != nil {
		return err
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: unexpected status %d", rawURL, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxCatalogResponse))
	if err != nil {
		return err
	}

	return json.Unmarshal(body, out)
}

// artifactHubCatalog talks to the ArtifactHub API (kind 21 is Headlamp plugins).
type artifactHubCatalog struct {
	catalog Catalog
	client  *http.Client
}

type artifactHubPackage struct {
	Name           string `json:"name"`
	NormalizedName string `json:"normalized_name"`
	DisplayName    string `json:"display_name"`
	Description    string `json:"description"`
	Version        string `json:"version"`
	LogoImageID    string `json:"logo_image_id"`
	Repository     struct {
		Name string `json:"name"`
	} `json:"repository"`
	Data map[string]interface{} `json:"data"`
}

func (a *artifactHubCatalog) baseURL() string {
	return strings.TrimSuffix(a.catalog.URL, "/")
}

func (a *artifactHubCatalog) search(ctx context.Context, query string, limit, offset int) ([]CatalogEntry, error) {
	searchURL := fmt.Sprintf("%s/api/v1/packages/search?kind=%s&limit=%d&offset=%d&facets=false",
		a.baseURL(), artifactHubKind, limit, offset)
	if query != "" {
		searchURL += "&ts_query_web=" + url.QueryEscape(query)
	}

	var result struct {
		Packages []artifactHubPackage `json:"packages"`
	}

	if err := fetchJSON(ctx, a.client, searchURL, &result); err != nil {
		return nil, err
	}

	entries := make([]CatalogEntry, 0, len(result.Packages))

	for _, pkg := range result.Packages {
		entry := CatalogEntry{
			Name:        pkg.NormalizedName,
			DisplayName: pkg.DisplayName,
			Description: pkg.Description,
			Version:     pkg.Version,
			Catalog:     a.catalog.ID,
			RepoName:    pkg.Repository.Name,
			Source: fmt.Sprintf("%s/packages/headlamp/%s/%s",
				a.baseURL(), pkg.Repository.Name, pkg.NormalizedName),
		}
		if pkg.LogoImageID != "" {
			entry.LogoURL = fmt.Sprintf("%s/image/%s", a.baseURL(), pkg.LogoImageID)
		}

		entries = append(entries, entry)
	}

	return entries, nil
}

func (a *artifactHubCatalog) resolve(ctx context.Context, entry CatalogEntry) (*ResolvedPlugin, error) {
	if entry.RepoName == "" || entry.Name == "" {
		return nil, fmt.Errorf("artifacthub resolve needs repoName and name")
	}

	pkgURL := fmt.Sprintf("%s/api/v1/packages/headlamp/%s/%s",
		a.baseURL(), url.PathEscape(entry.RepoName), url.PathEscape(entry.Name))
	if entry.Version != "" {
		pkgURL += "/" + url.PathEscape(entry.Version)
	}

	var pkg artifactHubPackage
	if err := fetchJSON(ctx, a.client, pkgURL, &pkg); err != nil {
		return nil, err
	}

	archiveURL, _ := pkg.Data["headlamp/plugin/archive-url"].(string)
	checksum, _ := pkg.Data["headlamp/plugin/archive-checksum"].(string)

	if archiveURL == "" || checksum == "" {
		return nil, fmt.Errorf("package %q has no archive-url or archive-checksum metadata", entry.Name)
	}

	normalized, err := normalizeChecksum(checksum)
	if err != nil {
		return nil, err
	}

	return &ResolvedPlugin{
		Name:       pkg.NormalizedName,
		Version:    pkg.Version,
		ArchiveURL: archiveURL,
		Checksum:   "sha256:" + normalized,
		Source:     entry.Source,
	}, nil
}

// indexCatalog reads a static JSON index, e.g. a file hosted on a Nexus OSS
// raw/hosted repository or any web server.
type indexCatalog struct {
	catalog Catalog
	client  *http.Client
}

type indexFile struct {
	Plugins []struct {
		Name        string `json:"name"`
		DisplayName string `json:"displayName"`
		Description string `json:"description"`
		Version     string `json:"version"`
		ArchiveURL  string `json:"archiveUrl"`
		Checksum    string `json:"checksum"`
		Homepage    string `json:"homepage"`
		LogoURL     string `json:"logoUrl"`
	} `json:"plugins"`
}

// entries fetches the index and returns every plugin as a catalog entry.
func (c *indexCatalog) entries(ctx context.Context) ([]CatalogEntry, error) {
	var index indexFile
	if err := fetchJSON(ctx, c.client, c.catalog.URL, &index); err != nil {
		return nil, err
	}

	all := make([]CatalogEntry, 0, len(index.Plugins))

	for _, plugin := range index.Plugins {
		all = append(all, CatalogEntry{
			Name:        plugin.Name,
			DisplayName: plugin.DisplayName,
			Description: plugin.Description,
			Version:     plugin.Version,
			Catalog:     c.catalog.ID,
			Source:      plugin.Homepage,
			LogoURL:     plugin.LogoURL,
			ArchiveURL:  plugin.ArchiveURL,
			Checksum:    plugin.Checksum,
		})
	}

	return all, nil
}

func (c *indexCatalog) search(ctx context.Context, query string, limit, offset int) ([]CatalogEntry, error) {
	all, err := c.entries(ctx)
	if err != nil {
		return nil, err
	}

	matches := make([]CatalogEntry, 0, len(all))

	for _, entry := range all {
		if matchesQuery(query, entry.Name, entry.DisplayName, entry.Description) {
			matches = append(matches, entry)
		}
	}

	return paginate(matches, limit, offset), nil
}

// resolve looks the plugin up in the full index, so entries beyond the search
// page limit stay installable.
func (c *indexCatalog) resolve(ctx context.Context, entry CatalogEntry) (*ResolvedPlugin, error) {
	entries, err := c.entries(ctx)
	if err != nil {
		return nil, err
	}

	for _, candidate := range entries {
		if candidate.Name != entry.Name {
			continue
		}

		normalized, err := normalizeChecksum(candidate.Checksum)
		if err != nil {
			return nil, err
		}

		return &ResolvedPlugin{
			Name:       candidate.Name,
			Version:    candidate.Version,
			ArchiveURL: candidate.ArchiveURL,
			Checksum:   "sha256:" + normalized,
			Source:     candidate.Source,
		}, nil
	}

	return nil, fmt.Errorf("plugin %q not found in catalog %q", entry.Name, c.catalog.ID)
}

func matchesQuery(query string, fields ...string) bool {
	if query == "" {
		return true
	}

	q := strings.ToLower(query)

	for _, field := range fields {
		if strings.Contains(strings.ToLower(field), q) {
			return true
		}
	}

	return false
}

func paginate(entries []CatalogEntry, limit, offset int) []CatalogEntry {
	if offset >= len(entries) {
		return []CatalogEntry{}
	}

	end := offset + limit
	if end > len(entries) {
		end = len(entries)
	}

	return entries[offset:end]
}
