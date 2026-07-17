package kubeconfig_test

import (
	"sync"
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

func TestAddContextRejectsDuplicateEffectiveName(t *testing.T) {
	store := kubeconfig.NewContextStore()

	customName := "shared-custom-name"
	firstInfo := kubeconfig.CustomObject{CustomName: customName}
	secondInfo := kubeconfig.CustomObject{CustomName: customName}

	firstContext := &kubeconfig.Context{
		Name:      "cluster-a",
		ClusterID: "/tmp/config-a+cluster-a",
		KubeContext: &api.Context{
			Cluster:  "cluster-a",
			AuthInfo: "user-a",
			Extensions: map[string]runtime.Object{
				"headlamp_info": &firstInfo,
			},
		},
		Cluster: &api.Cluster{Server: "https://cluster-a.example"},
	}

	secondContext := &kubeconfig.Context{
		Name:      "cluster-b",
		ClusterID: "/tmp/config-b+cluster-b",
		KubeContext: &api.Context{
			Cluster:  "cluster-b",
			AuthInfo: "user-b",
			Extensions: map[string]runtime.Object{
				"headlamp_info": &secondInfo,
			},
		},
		Cluster: &api.Cluster{Server: "https://cluster-b.example"},
	}

	require.NoError(t, store.AddContext(firstContext))

	err := store.AddContext(secondContext)
	require.Error(t, err)
	require.ErrorContains(t, err, "duplicate effective context name")

	storedContext, err := store.GetContext(customName)
	require.NoError(t, err)
	require.Equal(t, firstContext.ClusterID, storedContext.ClusterID)

	contexts, err := store.GetContexts()
	require.NoError(t, err)
	require.Len(t, contexts, 1)
}

func TestAddContextAllowsUpdatingSameLogicalContext(t *testing.T) {
	store := kubeconfig.NewContextStore()

	customName := "shared-custom-name"
	customInfo := kubeconfig.CustomObject{CustomName: customName}

	originalContext := &kubeconfig.Context{
		Name:      "cluster-a",
		ClusterID: "/tmp/config-a+cluster-a",
		KubeContext: &api.Context{
			Cluster:  "cluster-a",
			AuthInfo: "user-a",
			Extensions: map[string]runtime.Object{
				"headlamp_info": &customInfo,
			},
		},
		Cluster: &api.Cluster{Server: "https://cluster-a.example"},
	}

	updatedContext := &kubeconfig.Context{
		Name:      "cluster-a",
		ClusterID: originalContext.ClusterID,
		KubeContext: &api.Context{
			Cluster:  "cluster-a",
			AuthInfo: "user-a",
			Extensions: map[string]runtime.Object{
				"headlamp_info": &customInfo,
			},
		},
		Cluster: &api.Cluster{Server: "https://updated-cluster-a.example"},
	}

	require.NoError(t, store.AddContext(originalContext))
	require.NoError(t, store.AddContext(updatedContext))

	storedContext, err := store.GetContext(customName)
	require.NoError(t, err)
	require.Equal(t, "https://updated-cluster-a.example", storedContext.Cluster.Server)
}

func TestAddContextRejectsNilContext(t *testing.T) {
	store := kubeconfig.NewContextStore()

	err := store.AddContext(nil)
	require.EqualError(t, err, "context cannot be nil")
}

func TestAddContextWithKeyAndTTLRejectsNilContext(t *testing.T) {
	store := kubeconfig.NewContextStore()

	err := store.AddContextWithKeyAndTTL(nil, "nil-context", time.Second)
	require.EqualError(t, err, "context cannot be nil")
}

func TestAddContextRejectsConcurrentDuplicateEffectiveName(t *testing.T) {
	store := kubeconfig.NewContextStore()

	customName := "shared-custom-name"
	firstContext, secondContext := newConcurrentCollisionContexts(customName)

	errs := addContextsConcurrently(store, firstContext, secondContext)

	successCount := 0
	duplicateErrCount := 0

	for _, err := range errs {
		if err == nil {
			successCount++

			continue
		}

		require.ErrorContains(t, err, "duplicate effective context name")

		duplicateErrCount++
	}

	require.Equal(t, 1, successCount)
	require.Equal(t, 1, duplicateErrCount)

	contexts, err := store.GetContexts()
	require.NoError(t, err)
	require.Len(t, contexts, 1)

	storedContext, err := store.GetContext(customName)
	require.NoError(t, err)
	require.Contains(t, []string{firstContext.ClusterID, secondContext.ClusterID}, storedContext.ClusterID)
}

func newConcurrentCollisionContexts(customName string) (*kubeconfig.Context, *kubeconfig.Context) {
	firstContext := newCustomNamedContext(
		"cluster-a",
		"/tmp/config-a+cluster-a",
		customName,
		"https://cluster-a.example",
		"user-a",
	)
	secondContext := newCustomNamedContext(
		"cluster-b",
		"/tmp/config-b+cluster-b",
		customName,
		"https://cluster-b.example",
		"user-b",
	)

	return firstContext, secondContext
}

func addContextsConcurrently(
	store kubeconfig.ContextStore, firstContext *kubeconfig.Context, secondContext *kubeconfig.Context,
) []error {
	var wg sync.WaitGroup

	errs := make(chan error, 2)

	wg.Add(2)

	go func() {
		defer wg.Done()

		errs <- store.AddContext(firstContext)
	}()

	go func() {
		defer wg.Done()

		errs <- store.AddContext(secondContext)
	}()

	wg.Wait()
	close(errs)

	results := make([]error, 0, 2)

	for err := range errs {
		results = append(results, err)
	}

	return results
}

func newCustomNamedContext(
	name string, clusterID string, customName string, server string, authInfo string,
) *kubeconfig.Context {
	customInfo := kubeconfig.CustomObject{CustomName: customName}

	return &kubeconfig.Context{
		Name:      name,
		ClusterID: clusterID,
		KubeContext: &api.Context{
			Cluster:  name,
			AuthInfo: authInfo,
			Extensions: map[string]runtime.Object{
				"headlamp_info": &customInfo,
			},
		},
		Cluster: &api.Cluster{Server: server},
	}
}
