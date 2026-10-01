package serviceproxy

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
)

// ServiceConnection represents a connection to a service.
type ServiceConnection interface {
	// Get performs a GET request and forwards the upstream status code,
	// Content-Type, and response body into w.
	Get(ctx context.Context, requestURI string, w http.ResponseWriter) error
}
type Connection struct {
	URI string
}

// NewConnection creates a new connection to a service based on the provided proxyService.
func NewConnection(ps *proxyService) ServiceConnection {
	return &Connection{
		URI: ps.URIPrefix,
	}
}

// Get sends a GET request to the specified URI and forwards the upstream
// status code, Content-Type, and response body into w.
func (c *Connection) Get(ctx context.Context, requestURI string, w http.ResponseWriter) error {
	base, err := url.Parse(c.URI)
	if err != nil {
		return fmt.Errorf("invalid host uri: %w", err)
	}

	rel, err := url.Parse(requestURI)
	if err != nil {
		return fmt.Errorf("invalid request uri: %w", err)
	}

	if rel.IsAbs() || rel.Host != "" || rel.User != nil {
		return fmt.Errorf("request uri must be a relative path")
	}

	if rel.Path != "" {
		cleaned := path.Clean(rel.Path)
		if cleaned == ".." || strings.HasPrefix(cleaned, "../") || rel.Path == ".." || strings.HasPrefix(rel.Path, "../") {
			return fmt.Errorf("request uri must not traverse above base path")
		}
	}

	baseClean := path.Clean("/" + strings.TrimPrefix(base.Path, "/"))
	if baseClean == "/" {
		baseClean = ""
	}

	var relClean string
	if rel.Path != "" {
		relClean = path.Clean("/" + strings.TrimPrefix(rel.Path, "/"))
	}

	combinedPath := path.Clean(baseClean + relClean)
	if baseClean != "" && combinedPath != baseClean && !strings.HasPrefix(combinedPath, baseClean+"/") {
		return fmt.Errorf("request uri must not traverse above base path")
	}

	if combinedPath == "" || combinedPath == "." {
		combinedPath = "/"
	}

	// Preserve trailing slash if requested or if base path has trailing slash and relative path is empty.
	if (strings.HasSuffix(rel.Path, "/") || (rel.Path == "" && strings.HasSuffix(base.Path, "/"))) && !strings.HasSuffix(combinedPath, "/") {
		combinedPath += "/"
	}

	fullURL := &url.URL{
		Scheme:   base.Scheme,
		Host:     base.Host,
		Path:     combinedPath,
		RawQuery: rel.RawQuery,
	}

	// Preserve RawPath if relative request or base had encoded segments (e.g. %2F).
	if rel.RawPath != "" || base.RawPath != "" {
		baseRaw := base.RawPath
		if baseRaw == "" {
			baseRaw = base.EscapedPath()
		}
		baseRawClean := path.Clean("/" + strings.TrimPrefix(baseRaw, "/"))
		if baseRawClean == "/" {
			baseRawClean = ""
		}

		var relRawClean string
		if rel.RawPath != "" {
			relRawClean = path.Clean("/" + strings.TrimPrefix(rel.RawPath, "/"))
		} else if rel.Path != "" {
			relRawClean = path.Clean("/" + strings.TrimPrefix(rel.EscapedPath(), "/"))
		}

		combinedRaw := path.Clean(baseRawClean + relRawClean)
		if combinedRaw == "" || combinedRaw == "." {
			combinedRaw = "/"
		}
		if strings.HasSuffix(combinedPath, "/") && !strings.HasSuffix(combinedRaw, "/") {
			combinedRaw += "/"
		}
		fullURL.RawPath = combinedRaw
	}

	return HTTPGetStream(ctx, fullURL.String(), w)
}
