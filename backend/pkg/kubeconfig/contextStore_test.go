package kubeconfig_test

import (
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
)

func TestContextStore(t *testing.T) {
	store := kubeconfig.NewContextStore()

	// Test AddContext

	err := store.AddContext(&kubeconfig.Context{Name: "test"})
	require.NoError(t, err)

	// Add another context
	err = store.AddContext(&kubeconfig.Context{Name: "test2"})
	require.NoError(t, err)

	// Test GetContexts
	contexts, err := store.GetContexts()
	require.NoError(t, err)
	require.Equal(t, 2, len(contexts))

	// Test GetContext
	_, err = store.GetContext("non-existent-context")
	require.Error(t, err)

	context, err := store.GetContext("test")
	require.NoError(t, err)
	require.Equal(t, "test", context.Name)

	// Test RemoveContext
	err = store.RemoveContext("test")
	require.NoError(t, err)

	_, err = store.GetContext("test")
	require.Error(t, err)
	require.Equal(t, cache.ErrNotFound, err)

	// Add context with key and ttl
	err = store.AddContextWithKeyAndTTL(&kubeconfig.Context{Name: "testwithttl"}, "testwithttl", 2*time.Second)
	require.NoError(t, err)

	// Test GetContext
	value, err := store.GetContext("testwithttl")
	require.NoError(t, err)
	require.Equal(t, "testwithttl", value.Name)

	// Update ttl
	err = store.UpdateTTL("testwithttl", 2*time.Second)
	require.NoError(t, err)

	// Test GetContext after updating ttl
	value, err = store.GetContext("testwithttl")
	require.NoError(t, err)
	require.Equal(t, "testwithttl", value.Name)

	// sleep for 5 seconds and check ttlkey is present or not
	time.Sleep(5 * time.Second)

	// Test GetContext
	_, err = store.GetContext("testwithttl")
	require.Error(t, err)
	require.Equal(t, cache.ErrNotFound, err)
}
