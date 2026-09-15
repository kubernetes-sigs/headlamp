package serviceproxy

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

// HTTPGetStream sends an HTTP GET request to the specified URI and forwards the
// upstream status code, Content-Type, and response body into w. The body is
// never fully buffered, so an upstream that returns an arbitrarily large
// response cannot exhaust server memory.
func HTTPGetStream(ctx context.Context, uri string, w http.ResponseWriter) error {
	cli := &http.Client{Timeout: 10 * time.Second}

	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("make request to %s", uri))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, uri, nil) //nolint:gosec
	if err != nil {
		return fmt.Errorf("creating request: %w", err)
	}

	resp, err := cli.Do(req) //nolint:gosec
	if err != nil {
		return fmt.Errorf("failed HTTP GET: %w", err)
	}

	defer func() { _ = resp.Body.Close() }()

	if err := streamResponseBody(resp.Body, w, resp.StatusCode, resp.Header.Get("Content-Type")); err != nil {
		return fmt.Errorf("streaming response: %w", err)
	}

	return nil
}

func streamResponseBody(body io.Reader, w http.ResponseWriter, statusCode int, contentType string) error {
	buf := make([]byte, 32*1024)

	for {
		n, readErr := body.Read(buf)
		if n > 0 {
			writeResponseHeader(w, statusCode, contentType)

			if _, err := w.Write(buf[:n]); err != nil {
				return err
			}

			if readErr != nil {
				if readErr == io.EOF {
					return nil
				}

				return readErr
			}

			_, err := io.CopyBuffer(w, body, buf)

			return err
		}

		if readErr != nil {
			if readErr == io.EOF {
				writeResponseHeader(w, statusCode, contentType)

				return nil
			}

			return readErr
		}
	}
}

func writeResponseHeader(w http.ResponseWriter, statusCode int, contentType string) {
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}

	w.WriteHeader(statusCode)
}
