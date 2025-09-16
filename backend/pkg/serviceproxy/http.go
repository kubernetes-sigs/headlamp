package serviceproxy

import (
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

func HTTPGet(uri string) ([]byte, error) {
	cli := &http.Client{Timeout: 10 * time.Second}

	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("make request to %s", uri))
	//nolint:noctx
	resp, err := cli.Get(uri)
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
