package headlampconfig

import (
	"context"
	"net/http"
	"regexp"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type HeadlampCFG struct {
	UseInCluster          bool
	ListenAddr            string
	DevMode               bool
	Insecure              bool
	EnableHelm            bool
	EnableDynamicClusters bool
	WatchPluginsChanges   bool
	Port                  uint
	KubeConfigPath        string
	SkippedKubeContexts   string
	StaticDir             string
	PluginDir             string
	StaticPluginDir       string
	KubeConfigStore       kubeconfig.ContextStore
	Telemetry             *telemetry.Telemetry
	Metrics               *telemetry.Metrics
	BaseURL               string
	ProxyURLs             []string
	TelemetryHandler      *telemetry.RequestHandler
	TelemetryConfig       config.Config
}

// websocketConnContextKey handles websocket requests. It returns context key
// which is used to store the context in the cache. The context key is
// unique for each user. It is found in the "base64url.headlamp.authorization.k8s.io" protocol
// of the websocket.
func WebsocketConnContextKey(r *http.Request, clusterName string) string {
	// Expected number of submatches in the regular expression
	const expectedSubmatches = 2

	var contextKey string
	// Define a regular expression pattern for base64url.headlamp.authorization.k8s.io
	pattern := `base64url\.headlamp\.authorization\.k8s\.io\.([a-zA-Z0-9_-]+)`

	// Compile the regular expression
	re := regexp.MustCompile(pattern)

	// Find the match in the header value
	matches := re.FindStringSubmatch(r.Header.Get("Sec-Websocket-Protocol"))

	// Check if a match is found
	if len(matches) >= expectedSubmatches {
		// Extract the value after the specified prefix
		contextKey = clusterName + matches[1]
	} else {
		contextKey = clusterName
	}

	// Remove the base64url.headlamp.authorization.k8s.io subprotocol from the list
	// because it is unrecognized by the k8s server.
	protocols := strings.Split(r.Header.Get("Sec-Websocket-Protocol"), ", ")

	var updatedProtocols []string

	for _, protocol := range protocols {
		if !strings.HasPrefix(protocol, "base64url.headlamp.authorization.k8s.io.") {
			updatedProtocols = append(updatedProtocols, protocol)
		}
	}

	updatedProtocol := strings.Join(updatedProtocols, ", ")

	// Remove the existing Sec-Websocket-Protocol header
	r.Header.Del("Sec-Websocket-Protocol")

	// Add the updated Sec-Websocket-Protocol header
	r.Header.Add("Sec-Websocket-Protocol", updatedProtocol)

	return contextKey
}

func (c *HeadlampCFG) HandleError(w http.ResponseWriter, ctx context.Context,
	span trace.Span, err error, msg string, status int,
) {
	logger.Log(logger.LevelError, nil, err, msg)
	c.TelemetryHandler.RecordError(span, err, msg)
	c.TelemetryHandler.RecordErrorCount(ctx, attribute.String("error.type", msg))
	http.Error(w, err.Error(), status)
}
