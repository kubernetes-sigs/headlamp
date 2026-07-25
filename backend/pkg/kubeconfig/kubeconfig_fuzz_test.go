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

package kubeconfig_test

import (
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
)

// FuzzUnmarshalKubeconfig tests UnmarshalKubeconfig with various inputs.
func FuzzUnmarshalKubeconfig(f *testing.F) {
	// Seed corpus with representative inputs.
	f.Add([]byte("apiVersion: v1\nkind: Config\n")) // minimal valid
	f.Add([]byte(""))                               // empty
	f.Add([]byte("contexts: [}"))                   // malformed YAML
	f.Add([]byte("not yaml at all: : :"))           // invalid YAML

	f.Fuzz(func(t *testing.T, data []byte) {
		_, _ = kubeconfig.UnmarshalKubeconfig(data)
	})
}
