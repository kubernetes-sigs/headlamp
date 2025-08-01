package serviceproxy

import (
	"fmt"
	"io"
	"net/http"

	"github.com/headlamp-k8s/headlamp/backend/pkg/logger"
)

func HTTPGet(uri string) ([]byte, error) {
	cli := &http.Client{}

	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf("make request to %s", uri))
	//nolint:noctx
	resp, err := cli.Get(uri)
	if err != nil {
		return nil, fmt.Errorf("failed HTTP GET: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed HTTP GET, status code %v", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()

	if err != nil {
		return nil, err
	}

	return body, nil
}
