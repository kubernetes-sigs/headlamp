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
	"sync"
	"sync/atomic"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestSetKeyInCacheAddsContextOnceUnderConcurrentRequests(t *testing.T) {
	store := kubeconfig.NewContextStore()

	// The store notifies its listeners once for every context added to it.
	var adds atomic.Int32

	store.AddListener(func() { adds.Add(1) })

	cfg := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{KubeConfigStore: store},
		},
	}

	const requests = 20

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

			assert.NoError(t, cfg.setKeyInCache("stateless-key", ctx))
		}()
	}

	close(start)
	wg.Wait()

	assert.EqualValues(t, 1, adds.Load(), "the context should be added once for one key")

	stored, err := store.GetContext("stateless-key")
	require.NoError(t, err)
	assert.True(t, stored.Internal)
}
