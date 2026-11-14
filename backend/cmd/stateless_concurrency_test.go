/*
Copyright 2026 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package main

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

// A single burst of concurrent requests only sometimes hits the race, so run many independent
// rounds, each with a fresh store and config, to reliably catch a removed lock.
func TestSetKeyInCacheAddsContextOnceUnderConcurrentRequests(t *testing.T) {
	const (
		rounds   = 50
		requests = 20
	)

	for round := 0; round < rounds; round++ {
		store := kubeconfig.NewContextStore()

		// The store notifies its listeners once for every context added to it.
		var adds atomic.Int32

		store.AddListener(func() { adds.Add(1) })

		cfg := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{KubeConfigStore: store},
			},
		}

		key := fmt.Sprintf("stateless-key-%d", round)
		start := make(chan struct{})

		var wg sync.WaitGroup

		for i := 0; i < requests; i++ {
			wg.Add(1)

			go func() {
				defer wg.Done()

				<-start

				ctx := kubeconfig.Context{
					Name:        "stateless",
					KubeContext: &api.Context{},
					Cluster:     &api.Cluster{Server: "http://127.0.0.1:1"},
				}

				assert.NoError(t, cfg.setKeyInCache(key, ctx))
			}()
		}

		close(start)
		wg.Wait()

		require.EqualValues(t, 1, adds.Load(), "round %d: the context should be added once for one key", round)

		stored, err := store.GetContext(key)
		require.NoError(t, err)
		assert.True(t, stored.Internal)
	}
}
