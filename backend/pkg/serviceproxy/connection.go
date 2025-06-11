package serviceproxy

import "fmt"

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
	uri := fmt.Sprintf("%s/%s", c.URI, requestURI)

	body, err := HTTPGet(uri)
	if err != nil {
		return nil, err
	}

	return body, nil
}
