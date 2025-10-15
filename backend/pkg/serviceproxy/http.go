package serviceproxy

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

// HTTPGet sends an HTTP GET request to the specified URI.
func HTTPGet(ctx context.Context, uri string) ([]byte, error) {
	cli := &http.Client{Timeout: 10 * time.Second}

	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("make request to %s", uri))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, uri, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %v", err)
	}

	resp, err := cli.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed HTTP GET: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed HTTP GET, status code %v", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	return body, nil
}
