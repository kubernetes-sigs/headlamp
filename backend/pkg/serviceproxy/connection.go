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

	if escapesParent(rel.Path) {
		return fmt.Errorf("request uri must not traverse above base path")
	}

	baseClean := cleanBase(base.Path)
	combinedPath := path.Clean(baseClean + cleanRel(rel.Path))

	if !withinBase(combinedPath, baseClean) {
		return fmt.Errorf("request uri must not traverse above base path")
	}

	if combinedPath == "" || combinedPath == "." {
		combinedPath = "/"
	}

	// Preserve trailing slash if requested or if base path has trailing slash and relative path is empty.
	trailingSlash := strings.HasSuffix(rel.Path, "/") || (rel.Path == "" && strings.HasSuffix(base.Path, "/"))
	if trailingSlash && !strings.HasSuffix(combinedPath, "/") {
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
		combinedRaw := joinRawPath(base, rel, trailingSlash)

		// url.URL only serializes RawPath when it unescapes to Path, so derive
		// Path from the same escaped value to keep the pair consistent.
		unescaped, err := url.PathUnescape(combinedRaw)
		if err != nil {
			return fmt.Errorf("invalid request uri: %w", err)
		}

		// Encoded dot segments (%2e%2e) are only visible after unescaping.
		if !withinBase(path.Clean(unescaped), baseClean) {
			return fmt.Errorf("request uri must not traverse above base path")
		}

		fullURL.Path = unescaped
		fullURL.RawPath = combinedRaw
	}

	return HTTPGetStream(ctx, fullURL.String(), w)
}

// escapesParent reports whether a relative path starts by climbing out of the base.
func escapesParent(p string) bool {
	if p == "" {
		return false
	}

	cleaned := path.Clean(p)

	return cleaned == ".." || strings.HasPrefix(cleaned, "../") || p == ".." || strings.HasPrefix(p, "../")
}

func cleanRel(p string) string {
	if p == "" {
		return ""
	}

	return path.Clean("/" + strings.TrimPrefix(p, "/"))
}

func cleanBase(p string) string {
	cleaned := path.Clean("/" + strings.TrimPrefix(p, "/"))
	if cleaned == "/" {
		return ""
	}

	return cleaned
}

func withinBase(p, base string) bool {
	return base == "" || p == base || strings.HasPrefix(p, base+"/")
}

// joinRawPath joins the escaped base and relative paths.
func joinRawPath(base, rel *url.URL, trailingSlash bool) string {
	baseRaw := base.RawPath
	if baseRaw == "" {
		baseRaw = base.EscapedPath()
	}

	relRaw := rel.RawPath
	if relRaw == "" {
		relRaw = rel.EscapedPath()
	}

	combined := path.Clean(cleanBase(baseRaw) + cleanRel(relRaw))
	if combined == "" || combined == "." {
		combined = "/"
	}

	if trailingSlash && !strings.HasSuffix(combined, "/") {
		combined += "/"
	}

	return combined
}
