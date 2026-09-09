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

import (
	"testing"

	"github.com/stretchr/testify/assert"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestReturnGVRList(t *testing.T) {
	apiResourceLists := []*metav1.APIResourceList{
		{
			GroupVersion: "v1",
			APIResources: []metav1.APIResource{
				{
					Name:  "pods",
					Kind:  "Pod",
					Verbs: metav1.Verbs{"create", "delete", "get", "list", "patch", "update", "watch"},
				},
				{
					Name:  "events",
					Kind:  "Event", // skipped: Kind in skipKinds
					Verbs: metav1.Verbs{"create", "delete", "get", "list", "patch", "update", "watch"},
				},
				{
					Name:  "pods/status", // skipped: name contains "/"
					Kind:  "Pod",
					Verbs: metav1.Verbs{"get", "patch", "update"},
				},
			},
		},
		{
			GroupVersion: "apps/v1",
			APIResources: []metav1.APIResource{
				{
					Name:  "deployments",
					Kind:  "Deployment",
					Verbs: metav1.Verbs{"create", "delete", "get", "list", "patch", "update", "watch"},
				},
				{
					Name:  "replicasets",
					Kind:  "ReplicaSet",
					Verbs: metav1.Verbs{"create", "delete", "get", "patch", "update"}, // skipped: missing list and watch
				},
			},
		},
		{
			GroupVersion: "coordination.k8s.io/v1",
			APIResources: []metav1.APIResource{
				{
					Name:  "leases",
					Kind:  "Lease", // skipped: Kind in skipKinds
					Verbs: metav1.Verbs{"create", "delete", "get", "list", "patch", "update", "watch"},
				},
			},
		},
		{
			GroupVersion: "invalid/group/version", // skipped: ParseGroupVersion fails
			APIResources: []metav1.APIResource{
				{
					Name:  "foos",
					Kind:  "Foo",
					Verbs: metav1.Verbs{"list", "watch"},
				},
			},
		},
	}

	expected := []schema.GroupVersionResource{
		{Group: "", Version: "v1", Resource: "pods"},
		{Group: "apps", Version: "v1", Resource: "deployments"},
	}

	result := returnGVRList(apiResourceLists)
	assert.ElementsMatch(t, expected, result)
}
