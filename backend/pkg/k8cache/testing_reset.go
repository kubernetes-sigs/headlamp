// Copyright 2025 The Kubernetes Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package k8cache

import "context"

// ResetForTesting clears package-global k8cache state between integration tests.
func ResetForTesting() {
	mu.Lock()

	clientsetCache = make(map[string]*CachedClientSet)
	blockedClientsetPrefixes = make(map[string]blockedPrefixEntry)
	inFlight = make(map[string]*inFlightEntry)

	mu.Unlock()

	clearWatcherRegistriesForTesting()
}

func clearWatcherRegistriesForTesting() {
	contextCancel.Range(func(key, value interface{}) bool {
		if cancel, ok := value.(context.CancelFunc); ok {
			cancel()
		}

		contextCancel.Delete(key)

		return true
	})
	watcherRegistry.Range(func(key, _ interface{}) bool {
		watcherRegistry.Delete(key)

		return true
	})
}
