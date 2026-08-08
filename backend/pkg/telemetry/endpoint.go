package telemetry

import (
	"net/url"
	"strings"

	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
)

func stringValue(value *string) string {
	if value == nil {
		return ""
	}

	return *value
}

// resolveOTLPEndpoint returns the OTLP export target host:port.
// OTLPEndpoint takes precedence when non-empty; otherwise JaegerEndpoint is used.
func resolveOTLPEndpoint(config cfg.Config) string {
	otlpEndpoint := strings.TrimSpace(stringValue(config.OTLPEndpoint))
	if otlpEndpoint != "" {
		return normalizeOTLPEndpoint(otlpEndpoint)
	}

	jaegerEndpoint := strings.TrimSpace(stringValue(config.JaegerEndpoint))
	if jaegerEndpoint != "" {
		return normalizeOTLPEndpoint(jaegerEndpoint)
	}

	return ""
}

// normalizeOTLPEndpoint strips URL schemes and paths so the value is host:port.
func normalizeOTLPEndpoint(endpoint string) string {
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" {
		return ""
	}

	if strings.Contains(endpoint, "://") {
		parsed, err := url.Parse(endpoint)
		if err != nil {
			return endpoint
		}

		if parsed.Host != "" {
			return parsed.Host
		}
	}

	if idx := strings.Index(endpoint, "/"); idx != -1 {
		return endpoint[:idx]
	}

	return endpoint
}
