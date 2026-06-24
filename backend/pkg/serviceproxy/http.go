package serviceproxy

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

// HTTPGetStream sends an HTTP GET request to the specified URI and streams the
// response body into w. The body is never fully buffered, so an upstream that
// returns an arbitrarily large response cannot exhaust server memory.
func HTTPGetStream(ctx context.Context, uri string, w io.Writer) error {
	cli := &http.Client{Timeout: 10 * time.Second}

	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("make request to %s", uri))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, uri, nil) //nolint:gosec
	if err != nil {
		return fmt.Errorf("creating request: %v", err)
	}

	resp, err := cli.Do(req) //nolint:gosec
	if err != nil {
		return fmt.Errorf("failed HTTP GET: %v", err)
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed HTTP GET, status code %v", resp.StatusCode)
	}

	if _, err := io.Copy(w, resp.Body); err != nil {
		return fmt.Errorf("streaming response: %v", err)
	}

	return nil
}
