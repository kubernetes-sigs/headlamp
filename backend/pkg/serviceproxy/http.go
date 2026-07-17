package serviceproxy

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

// ValidateURL validates that the URI is safe to use for HTTP requests.
// It ensures the URL has a valid scheme (http or https only) and is properly formatted.
func ValidateURL(uri string) error {
	parsedURL, err := url.Parse(uri)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	// Only allow http and https schemes to prevent SSRF attacks
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return fmt.Errorf("invalid URL scheme: %s (only http/https allowed)", parsedURL.Scheme)
	}

	// Ensure the URL has a host
	if parsedURL.Host == "" {
		return fmt.Errorf("URL must have a host")
	}

	return nil
}

// HTTPGetStream sends an HTTP GET request to the specified URI and streams the
// response body into w. The body is never fully buffered, so an upstream that
// returns an arbitrarily large response cannot exhaust server memory.
func HTTPGetStream(ctx context.Context, uri string, w io.Writer) error {
	// Validate the URL before making the request
	if err := ValidateURL(uri); err != nil {
		return fmt.Errorf("URL validation failed: %w", err)
	}

	cli := &http.Client{Timeout: 10 * time.Second}

	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("make request to %s", uri))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, uri, nil)
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}

	resp, err := cli.Do(req)
	if err != nil {
		return fmt.Errorf("failed HTTP GET: %w", err)
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed HTTP GET, status code %v", resp.StatusCode)
	}

	if _, err := io.Copy(w, resp.Body); err != nil {
		return fmt.Errorf("streaming response: %w", err)
	}

	return nil
}
