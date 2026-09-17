package telemetry

import "go.opentelemetry.io/otel/metric"

func InitRequestMetricsForTest(meter metric.Meter, metrics *Metrics) error {
	return initRequestMetrics(meter, metrics)
}

func InitApplicationMetricsForTest(meter metric.Meter, metrics *Metrics) error {
	return initApplicationMetrics(meter, metrics)
}

func InitCacheMetricsForTest(meter metric.Meter, metrics *Metrics) error {
	return initCacheMetrics(meter, metrics)
}
