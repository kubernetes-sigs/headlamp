package headlampconfig_test

import (
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/stretchr/testify/assert"
)

func TestWebsocketConnContextKey(t *testing.T) {
	testCases := []struct {
		name           string
		protocols      string
		clusterName    string
		expectedKey    string
		expectedHeader string
	}{
		{
			name:           "With authorization protocol",
			protocols:      "base64url.headlamp.authorization.k8s.io.user123, v4.channel.k8s.io",
			clusterName:    "test-cluster",
			expectedKey:    "test-clusteruser123",
			expectedHeader: "v4.channel.k8s.io",
		},
		{
			name:           "Without authorization protocol",
			protocols:      "v4.channel.k8s.io",
			clusterName:    "test-cluster",
			expectedKey:    "test-cluster",
			expectedHeader: "v4.channel.k8s.io",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.Header.Set("Sec-Websocket-Protocol", tc.protocols)

			key := headlampconfig.WebsocketConnContextKey(req, tc.clusterName)
			assert.Equal(t, tc.expectedKey, key)
			assert.Equal(t, tc.expectedHeader, req.Header.Get("Sec-Websocket-Protocol"))
		})
	}
}
