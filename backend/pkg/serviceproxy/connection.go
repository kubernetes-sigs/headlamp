package serviceproxy

import (
	"context"
	"fmt"
	"net/url"
)

// ServiceConnection represents a connection to a service.
type ServiceConnection interface {
	// Get - perform a get request and return the response
	Get(string) ([]byte, error)
}
type Connection struct {
	URI string
}

// NewConnection creates a connection for a service.
func NewConnection(ps *proxyService) ServiceConnection {
	return &Connection{
		URI: ps.URIPrefix,
	}
}

// Get - perform the get request.
func (c *Connection) Get(requestURI string) ([]byte, error) {
	base, err := url.Parse(c.URI)
	if err != nil {
		return nil, fmt.Errorf("invalid host uri: %w", err)
	}

	rel, err := url.Parse(requestURI)
	if err != nil {
		return nil, fmt.Errorf("invalid request uri: %w", err)
	}

	fullURL := base.ResolveReference(rel)

	body, err := HTTPGet(context.Background(), fullURL.String())
	if err != nil {
		return nil, err
	}

	return body, nil
}
