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

package auth

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestClusterFromPathHonoursBaseURLAtPathBoundary(t *testing.T) {
	tests := []struct {
		path, baseURL, want string
	}{
		{"/clusters/c1/api", "", "c1"},
		{"/headlamp/clusters/c1/api", "/headlamp", "c1"},
		{"/headlamp/clusters/c1/api", "headlamp/", "c1"},
		{"/headlamp/clusters/c1/api", "", ""},
		{"/headlamp/clusters/c1/api", "/head", ""}, // "/head" is not a path boundary of "/headlamp"
		{"/head", "/head", ""},
		{"/clusters/c1", "", ""},
	}

	for _, tc := range tests {
		t.Run(tc.path+" base="+tc.baseURL, func(t *testing.T) {
			assert.Equal(t, tc.want, clusterFromPath(tc.path, tc.baseURL))
		})
	}

	assert.Equal(t, "", trimBaseURL("/headlamp/clusters/x", "/head"))
	assert.Equal(t, "", trimBaseURL("/clusters/x", "/headlamp"))
	assert.Equal(t, "/clusters/x", trimBaseURL("/headlamp/clusters/x", "/headlamp"))
	assert.Equal(t, "", trimBaseURL("/headlamp", "/headlamp"))
}
