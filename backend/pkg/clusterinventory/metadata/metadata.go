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

// Package metadata contains Cluster Inventory metadata shapes exposed by Headlamp.
package metadata

import metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

// Profile identifies the ClusterProfile that produced a context.
type Profile struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Key       string `json:"key"`
}

// Version contains version details reported by Cluster Inventory.
type Version struct {
	Kubernetes string `json:"kubernetes,omitempty"`
}

// Property describes a property reported by Cluster Inventory.
type Property struct {
	Name             string      `json:"name"`
	Value            string      `json:"value"`
	LastObservedTime metav1.Time `json:"lastObservedTime,omitempty"`
}

// Metadata contains non-sensitive ClusterProfile status metadata.
//
// The fields mirror the non-access-provider parts of the upstream
// [ClusterProfileStatus] shape.
//
// [ClusterProfileStatus]: https://pkg.go.dev/sigs.k8s.io/cluster-inventory-api/apis/v1alpha1#ClusterProfileStatus
type Metadata struct {
	Profile    Profile            `json:"profile"`
	Conditions []metav1.Condition `json:"conditions,omitempty"`
	Version    *Version           `json:"version,omitempty"`
	Properties []Property         `json:"properties,omitempty"`
}

// DeepCopy returns an independent copy of Metadata.
func (m *Metadata) DeepCopy() *Metadata {
	if m == nil {
		return nil
	}

	copied := &Metadata{
		Profile:    m.Profile,
		Conditions: append([]metav1.Condition(nil), m.Conditions...),
		Properties: append([]Property(nil), m.Properties...),
	}

	if m.Version != nil {
		version := *m.Version
		copied.Version = &version
	}

	return copied
}
