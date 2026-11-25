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

package metadata_test

import (
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterinventory/metadata"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestMetadataDeepCopy(t *testing.T) {
	var nilMeta *metadata.Metadata
	assert.Nil(t, nilMeta.DeepCopy())

	orig := &metadata.Metadata{
		Profile: metadata.Profile{Namespace: "ns", Name: "p1", Key: "ns/p1"},
		Conditions: []metav1.Condition{
			{Type: "Ready", Status: metav1.ConditionTrue},
		},
		Version: &metadata.Version{Kubernetes: "v1.31.0"},
		Properties: []metadata.Property{
			{Name: "region", Value: "us-east-1"},
		},
	}

	cp := orig.DeepCopy()
	require.NotNil(t, cp)
	assert.Equal(t, orig, cp)

	// Mutate copy and verify original is unaffected.
	cp.Version.Kubernetes = "v1.32.0"
	cp.Conditions[0].Type = "Changed"
	cp.Properties[0].Value = "eu-west-1"

	assert.Equal(t, "v1.31.0", orig.Version.Kubernetes)
	assert.Equal(t, "Ready", orig.Conditions[0].Type)
	assert.Equal(t, "us-east-1", orig.Properties[0].Value)
}
