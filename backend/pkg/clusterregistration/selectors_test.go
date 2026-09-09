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

package clusterregistration_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterregistration"
)

func TestParseNamespaces(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		want    []string
		wantErr string
	}{
		{name: "unset"},
		{
			name:  "trimmed, sorted and deduplicated",
			value: " team-b,team-a, team-b ",
			want:  []string{"team-a", "team-b"},
		},
		{
			name:  "all namespaces",
			value: "*",
			want:  []string{metav1.NamespaceAll},
		},
		{name: "invalid namespace", value: "Team-A", wantErr: `"Team-A"`},
		{name: `"*" cannot be combined`, value: "team-a,*", wantErr: `"*" must be used on its own`},
		{name: "empty entries are rejected", value: "team-a,,team-b", wantErr: "namespace must not be empty"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			namespaces, err := clusterregistration.ParseNamespaces(tt.value)
			if tt.wantErr != "" {
				require.ErrorContains(t, err, tt.wantErr)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.want, namespaces)
		})
	}
}
