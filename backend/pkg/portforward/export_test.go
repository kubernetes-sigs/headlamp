/*
Copyright 2025 The Kubernetes Authors.

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

package portforward

import "github.com/kubernetes-sigs/headlamp/backend/pkg/cache"

// StorePortForwardForTest inserts a portForward entry into the cache as
// StartPortForward would for a dynamic cluster, allowing unit tests to
// exercise GetPortForwards without a real Kubernetes cluster.
func StorePortForwardForTest(c cache.Cache[interface{}], clusterName, userID string) error {
	pf := portForward{
		ID:         "test-id-001",
		Pod:        "test-pod",
		Namespace:  "default",
		Cluster:    clusterName,
		cacheKey:   portforwardClusterKey(clusterName, userID),
		Port:       "8080",
		TargetPort: "80",
		Status:     RUNNING,
	}
	portforwardstore(c, pf)

	return nil
}
