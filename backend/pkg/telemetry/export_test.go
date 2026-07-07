package telemetry

import (
	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"go.opentelemetry.io/otel/metric"
)

func InitRequestMetricsForTest(meter metric.Meter, metrics *Metrics) error {
	return initRequestMetrics(meter, metrics)
}

func InitApplicationMetricsForTest(meter metric.Meter, metrics *Metrics) error {
	return initApplicationMetrics(meter, metrics)
}

func ResolveOTLPEndpointForTest(config cfg.Config) string {
	return resolveOTLPEndpoint(config)
}

func NormalizeOTLPEndpointForTest(endpoint string) string {
	return normalizeOTLPEndpoint(endpoint)
}
