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
	watcherMu.Lock()

	watches := make([]*resourceWatcher, 0, len(resourceWatchers))
	for scope, w := range resourceWatchers {
		w.cancel()
		delete(resourceWatchers, scope)

		watches = append(watches, w)
	}
	watcherMu.Unlock()

	for _, w := range watches {
		<-w.done
	}
}
