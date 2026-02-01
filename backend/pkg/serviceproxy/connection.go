package serviceproxy

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// ServiceConnection represents a connection to a service.
type ServiceConnection interface {
	// Get - perform a get request and return the response
	Get(string) ([]byte, error)
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

// validateRequestURI validates the request URI to prevent SSRF attacks.
func validateRequestURI(requestURI string) error { //nolint:funlen
	// Reject empty URI
	if requestURI == "" {
		return fmt.Errorf("empty request URI")
	}

	// Parse the URI to inspect decoded components
	parsedURL, err := url.Parse(requestURI)
	if err != nil {
		return fmt.Errorf("invalid URI format: %w", err)
	}

	// Reject absolute URLs using parsed URL check (handles case-insensitive schemes)
	if parsedURL.IsAbs() {
		return fmt.Errorf("absolute URLs not allowed")
	}

	// Also check raw string for case-insensitive absolute URL patterns
	// This catches URL-encoded schemes like %68%74%74%70 (http)
	lowerURI := strings.ToLower(requestURI)
	if strings.HasPrefix(lowerURI, "http://") || strings.HasPrefix(lowerURI, "https://") {
		return fmt.Errorf("absolute URLs not allowed")
	}

	// URL-decode the path to check for encoded traversal attacks
	decodedPath, err := url.PathUnescape(parsedURL.Path)
	if err != nil {
		return fmt.Errorf("invalid URL encoding in path: %w", err)
	}

	// Also decode query string to check for encoded attacks there
	decodedQuery, err := url.QueryUnescape(parsedURL.RawQuery)
	if err != nil {
		return fmt.Errorf("invalid URL encoding in query: %w", err)
	}

	// Fully decode the entire URI to catch double-encoding attacks
	fullyDecodedURI, err := url.QueryUnescape(requestURI)
	if err != nil {
		// If decoding fails, continue with partial decoding
		fullyDecodedURI = requestURI
	}

	// Second pass decode to catch double-encoding
	doubleDecodedURI, err := url.QueryUnescape(fullyDecodedURI)
	if err != nil {
		doubleDecodedURI = fullyDecodedURI
	}

	// Reject path traversal in raw, decoded, and double-decoded forms
	if strings.Contains(requestURI, "..") ||
		strings.Contains(decodedPath, "..") ||
		strings.Contains(decodedQuery, "..") ||
		strings.Contains(fullyDecodedURI, "..") ||
		strings.Contains(doubleDecodedURI, "..") {
		return fmt.Errorf("path traversal not allowed")
	}

	// Check for absolute URLs in decoded forms (catches encoded schemes)
	lowerDecoded := strings.ToLower(fullyDecodedURI)
	lowerDoubleDecoded := strings.ToLower(doubleDecodedURI)

	if strings.HasPrefix(lowerDecoded, "http://") || strings.HasPrefix(lowerDecoded, "https://") ||
		strings.HasPrefix(lowerDoubleDecoded, "http://") || strings.HasPrefix(lowerDoubleDecoded, "https://") {
		return fmt.Errorf("absolute URLs not allowed")
	}

	// Reject dangerous schemes (check both raw and decoded, case-insensitive)
	dangerousSchemes := []string{"file:", "ftp:", "gopher:", "data:", "javascript:"}

	for _, scheme := range dangerousSchemes {
		if strings.HasPrefix(lowerURI, scheme) ||
			strings.HasPrefix(lowerDecoded, scheme) ||
			strings.HasPrefix(lowerDoubleDecoded, scheme) {
			return fmt.Errorf("dangerous scheme not allowed: %s", scheme)
		}
	}

	// Validate path characters: alphanumeric, slashes, hyphens, underscores,
	// dots, query params, comma for label selectors.
	validChars := regexp.MustCompile(`^[a-zA-Z0-9/_\-\.?=&%:@+,]+$`)
	if !validChars.MatchString(requestURI) {
		return fmt.Errorf("invalid characters in request URI")
	}

	return nil
}

// validateResolvedURL validates the final resolved URL to prevent SSRF attacks
// that could bypass input validation through URL normalization.
func validateResolvedURL(resolved, base *url.URL) error {
	// Ensure the scheme matches the base URL
	if resolved.Scheme != base.Scheme {
		return fmt.Errorf("scheme mismatch: expected %s, got %s", base.Scheme, resolved.Scheme)
	}

	// Ensure the host matches the base URL (prevents host injection)
	if resolved.Host != base.Host {
		return fmt.Errorf("host mismatch: expected %s, got %s", base.Host, resolved.Host)
	}

	// Ensure the resolved path starts with the base path prefix
	// This prevents escaping the intended API scope via path manipulation
	basePath := base.Path
	if basePath != "" && !strings.HasSuffix(basePath, "/") {
		// For base paths like "/api/v1", we need to check the directory prefix
		basePath = basePath[:strings.LastIndex(basePath, "/")+1]
	}

	if basePath != "" && !strings.HasPrefix(resolved.Path, basePath) {
		return fmt.Errorf("path escaped base prefix: base=%s, resolved=%s", base.Path, resolved.Path)
	}

	// Check for path traversal sequences in the final resolved path
	// (should be normalized away, but defense in depth)
	if strings.Contains(resolved.Path, "..") {
		return fmt.Errorf("path traversal detected in resolved URL")
	}

	return nil
}

// Get sends a GET request to the specified URI.
func (c *Connection) Get(requestURI string) ([]byte, error) {
	// Validate request URI first to prevent SSRF
	if err := validateRequestURI(requestURI); err != nil {
		return nil, fmt.Errorf("invalid request URI: %w", err)
	}

	base, err := url.Parse(c.URI)
	if err != nil {
		return nil, fmt.Errorf("invalid host uri: %w", err)
	}

	rel, err := url.Parse(requestURI)
	if err != nil {
		return nil, fmt.Errorf("invalid request uri: %w", err)
	}

	if rel.IsAbs() {
		return nil, fmt.Errorf("request uri must be a relative path")
	}

	fullURL := base.ResolveReference(rel)

	// Validate the final resolved URL to prevent SSRF via URL normalization bypasses
	if err := validateResolvedURL(fullURL, base); err != nil {
		return nil, fmt.Errorf("invalid resolved URL: %w", err)
	}

	body, err := HTTPGet(context.Background(), fullURL.String())
	if err != nil {
		return nil, err
	}

	return body, nil
}
