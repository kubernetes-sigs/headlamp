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

package clusterregistration

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// Resource identifies the Kubernetes object that produced a registration.
type Resource struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Namespace  string `json:"namespace,omitempty"`
	Name       string `json:"name"`
	UID        string `json:"uid"`
}

// Origin identifies the management cluster and resource that produced a registration.
type Origin struct {
	Cluster  string   `json:"cluster"`
	Resource Resource `json:"resource"`
}

// OriginFor builds the origin of a registration discovered from obj on cluster.
func OriginFor(cluster string, gvk schema.GroupVersionKind, obj metav1.Object) Origin {
	return Origin{
		Cluster: cluster,
		Resource: Resource{
			APIVersion: gvk.GroupVersion().String(),
			Kind:       gvk.Kind,
			Namespace:  obj.GetNamespace(),
			Name:       obj.GetName(),
			UID:        string(obj.GetUID()),
		},
	}
}

// Metadata is the public, non-sensitive description of a registered cluster.
type Metadata struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Source      string `json:"source"`
	Origin      Origin `json:"origin"`
}
