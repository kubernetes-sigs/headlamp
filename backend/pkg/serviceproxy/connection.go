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
	// 1. Reject empty URI
	if requestURI == "" {
		return fmt.Errorf("empty request URI")
	}

	// 2. Parse the URI to safely inspect decoded components
	parsedURL, err := url.Parse(requestURI)
	if err != nil {
		return fmt.Errorf("invalid URI format: %w", err)
	}

	// 3. Reject absolute URLs (any scheme, case-insensitive via url.Parse)
	if parsedURL.IsAbs() {
		return fmt.Errorf("absolute URLs not allowed")
	}

	// 4. Decode path for traversal checks
	decodedPath := parsedURL.Path
	if parsedURL.RawPath != "" {
		decodedPath, err = url.PathUnescape(parsedURL.RawPath)
		if err != nil {
			return fmt.Errorf("invalid encoding in request URI path")
		}
	}

	// 5. Fully decode the entire URI to catch double-encoding attacks
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

	// 6. Reject path traversal on decoded path and all decoded forms
	if strings.Contains(requestURI, "..") ||
		strings.Contains(decodedPath, "..") ||
		strings.Contains(fullyDecodedURI, "..") ||
		strings.Contains(doubleDecodedURI, "..") {
		return fmt.Errorf("path traversal not allowed")
	}

	// 7. Reject dangerous schemes (defense in depth, case-insensitive)
	lowerURI := strings.ToLower(requestURI)
	lowerDecoded := strings.ToLower(fullyDecodedURI)
	lowerDoubleDecoded := strings.ToLower(doubleDecodedURI)

	// Check for absolute URLs in decoded forms (catches encoded schemes like %68%74%74%70)
	if strings.HasPrefix(lowerURI, "http://") || strings.HasPrefix(lowerURI, "https://") ||
		strings.HasPrefix(lowerDecoded, "http://") || strings.HasPrefix(lowerDecoded, "https://") ||
		strings.HasPrefix(lowerDoubleDecoded, "http://") || strings.HasPrefix(lowerDoubleDecoded, "https://") {
		return fmt.Errorf("absolute URLs not allowed")
	}

	dangerousSchemes := []string{"file:", "ftp:", "gopher:", "data:", "javascript:"}

	for _, scheme := range dangerousSchemes {
		if strings.HasPrefix(lowerURI, scheme) ||
			strings.HasPrefix(lowerDecoded, scheme) ||
			strings.HasPrefix(lowerDoubleDecoded, scheme) {
			return fmt.Errorf("dangerous scheme not allowed: %s", scheme)
		}
	}

	// 8. Validate raw URI characters: alphanumeric, slashes, hyphens, underscores,
	// dots, query params, comma for label selectors, plus for URL encoding.
	// Note: Backslash traversal is blocked by this regex (backslash not allowed).
	validChars := regexp.MustCompile(`^[a-zA-Z0-9/_\-\.?=&%:@+,]+$`)
	if !validChars.MatchString(requestURI) {
		return fmt.Errorf("invalid characters in request URI")
	}

	// 9. Validate decoded characters (catch double-encoding attacks)
	// After decoding, % should not appear (would indicate double-encoding)
	decodedForValidation := decodedPath

	if parsedURL.RawQuery != "" {
		decodedQuery, err := url.QueryUnescape(parsedURL.RawQuery)
		if err != nil {
			return fmt.Errorf("invalid encoding in request URI query")
		}

		decodedForValidation = decodedForValidation + "?" + decodedQuery
	}

	// No % allowed in decoded form (catches double-encoding)
	validDecodedChars := regexp.MustCompile(`^[a-zA-Z0-9/_\-\.?=&:@+,]+$`)
	if !validDecodedChars.MatchString(decodedForValidation) {
		return fmt.Errorf("invalid characters in decoded request URI")
	}

	// 10. Reject userinfo patterns (user:pass@host)
	// Only block if @ appears before the first / (indicating userinfo in authority)
	atIndex := strings.Index(requestURI, "@")
	slashIndex := strings.Index(requestURI, "/")

	if atIndex != -1 && (slashIndex == -1 || atIndex < slashIndex) {
		return fmt.Errorf("userinfo pattern not allowed")
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

	// Ensure resolved URL stays within base path
	// Use stricter logic: trim trailing slash and check for exact match OR subpath
	// This prevents bypasses like /api/v1 allowing access to /api/v2/
	basePath := strings.TrimRight(base.Path, "/")
	if basePath != "" {
		// Allow either exact match or subpath with trailing slash
		if resolved.Path != basePath && !strings.HasPrefix(resolved.Path, basePath+"/") {
			return fmt.Errorf("path escaped base prefix: base=%s, resolved=%s", base.Path, resolved.Path)
		}
	}

	// Re-check for path traversal after resolution (defense in depth)
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
