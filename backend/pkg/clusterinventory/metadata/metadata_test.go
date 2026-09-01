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

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterinventory/metadata"
)

func TestMetadataDeepCopyLabels(t *testing.T) {
	original := &metadata.Metadata{
		Profile: metadata.Profile{Namespace: "default", Name: "spoke-a", Key: "in-cluster/default/spoke-a"},
		Labels: map[string]string{
			"tenant": "a",
		},
	}

	copied := original.DeepCopy()

	require.NotNil(t, copied)
	assert.Equal(t, original.Labels, copied.Labels)

	// Mutating the copy must not affect the original, proving the map itself was copied
	// rather than shared by reference.
	copied.Labels["tenant"] = "b"
	assert.Equal(t, "a", original.Labels["tenant"])

	// And vice versa.
	original.Labels["region"] = "us-west1"
	_, hasRegion := copied.Labels["region"]
	assert.False(t, hasRegion)
}

func TestMetadataDeepCopyNilLabels(t *testing.T) {
	original := &metadata.Metadata{
		Profile: metadata.Profile{Namespace: "default", Name: "spoke-a", Key: "in-cluster/default/spoke-a"},
	}

	copied := original.DeepCopy()

	require.NotNil(t, copied)
	assert.Nil(t, copied.Labels)
}

func TestMetadataDeepCopyNilMetadata(t *testing.T) {
	var original *metadata.Metadata

	assert.Nil(t, original.DeepCopy())
}
