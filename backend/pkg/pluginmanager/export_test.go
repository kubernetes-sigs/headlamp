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

package pluginmanager

import "k8s.io/client-go/kubernetes"

// NewForTest builds a Manager around an arbitrary clientset, e.g. a fake one.
func NewForTest(clientset kubernetes.Interface, namespace, configMapName, pluginsDir string) *Manager {
	return newWithClient(clientset, namespace, configMapName, pluginsDir)
}

// ValidatePluginsDir exposes the plugins directory check.
var ValidatePluginsDir = validatePluginsDir
