package k8cache_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
)

// TestInitialize verifies that responseCapture is initialized with
// the original http.ResponseWriter and an empty buffer.
func TestInitialize(t *testing.T) {
	t.Run("initializes responseCapture with defaults", func(t *testing.T) {
		recorder := httptest.NewRecorder()

		rc := k8cache.CreateResponseCapture(recorder)

		assert.NotNil(t, rc)
		assert.Equal(t, http.StatusOK, rc.StatusCode)
		assert.Equal(t, recorder, rc.ResponseWriter)
		assert.NotNil(t, rc.Body)
		assert.Equal(t, 0, rc.Body.Len())
	})
}
