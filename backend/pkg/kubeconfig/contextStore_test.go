package kubeconfig_test

import (
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/clientcmd/api"
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

	// Add context with key and ttl (passing a mismatched Name to verify it gets updated)
	err = store.AddContextWithKeyAndTTL(&kubeconfig.Context{Name: "mismatched-name"}, "testwithttl", 2*time.Second)
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

func TestContextStoreListeners(t *testing.T) {
	store := kubeconfig.NewContextStore()

	var count int

	store.AddListener(func() {
		count++
	})

	// Registering nil listener should not cause panic
	store.AddListener(nil)

	// Test notification on AddContext
	err := store.AddContext(&kubeconfig.Context{Name: "test-listener-1"})
	require.NoError(t, err)
	require.Equal(t, 1, count)

	// Test notification on RemoveContext
	err = store.RemoveContext("test-listener-1")
	require.NoError(t, err)
	require.Equal(t, 2, count)

	// Test notification on AddContextWithKeyAndTTL
	err = store.AddContextWithKeyAndTTL(&kubeconfig.Context{Name: "test-listener-2"}, "test-listener-2", 10*time.Second)
	require.NoError(t, err)
	require.Equal(t, 3, count)

	// Add a listener that panics
	store.AddListener(func() {
		panic("simulated listener panic")
	})

	// Add another listener after the panicking one to verify it still gets called
	var afterPanicCalled bool

	store.AddListener(func() {
		afterPanicCalled = true
	})

	// Trigger listener notifications, it should not crash the test and the subsequent listener should still be called
	err = store.AddContext(&kubeconfig.Context{Name: "test-listener-panic-recovery"})
	require.NoError(t, err)
	require.Equal(t, 4, count)
	require.True(t, afterPanicCalled)
}

func TestContextStoreGetContextKeys(t *testing.T) {
	store := kubeconfig.NewContextStore()

	keys, err := store.GetContextKeys()
	require.NoError(t, err)
	require.Empty(t, keys)

	err = store.AddContext(&kubeconfig.Context{Name: "test-key-1"})
	require.NoError(t, err)

	err = store.AddContext(&kubeconfig.Context{Name: "test-key-2"})
	require.NoError(t, err)

	keys, err = store.GetContextKeys()
	require.NoError(t, err)
	require.Len(t, keys, 2)
	require.Contains(t, keys, "test-key-1")
	require.Contains(t, keys, "test-key-2")
}

func TestAddContextWithHeadlampInfo(t *testing.T) {
	store := kubeconfig.NewContextStore()

	customInfo := kubeconfig.CustomObject{
		CustomName: "my-custom-cluster-name",
	}

	// Create context with headlamp_info extension
	ctx := &kubeconfig.Context{
		Name: "original-name",
		KubeContext: &api.Context{
			Extensions: map[string]runtime.Object{
				"headlamp_info": &customInfo,
			},
		},
	}

	err := store.AddContext(ctx)
	require.NoError(t, err)

	// Verify the context was saved under the custom name
	savedCtx, err := store.GetContext("my-custom-cluster-name")
	require.NoError(t, err)
	require.Equal(t, "my-custom-cluster-name", savedCtx.Name)

	// Verify original name is NOT in store
	_, err = store.GetContext("original-name")
	require.Error(t, err)
	require.Equal(t, cache.ErrNotFound, err)
}
