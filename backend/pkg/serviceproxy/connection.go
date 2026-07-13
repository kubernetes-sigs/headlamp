package serviceproxy

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"path"
	"strings"
)

// ServiceConnection represents a connection to a service.
type ServiceConnection interface {
	// Get performs a GET request and streams the response body into w.
	Get(ctx context.Context, requestURI string, w io.Writer) error
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

// Get sends a GET request to the specified URI and streams the response body
// into w.
func (c *Connection) Get(ctx context.Context, requestURI string, w io.Writer) error {
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
		if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
			return fmt.Errorf("request uri must not traverse above base path")
		}

		rel.Path = cleaned
	}

	fullURL := base.ResolveReference(rel)

	return HTTPGetStream(ctx, fullURL.String(), w)
}
