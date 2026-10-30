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

package auth

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestSplitTopLevelCommas_EscapedQuoteDoesNotCloseString covers a quoted identifier containing
// an escaped quote, e.g. "team\"name". A naive scanner that closes a quote on the first matching
// quote rune -- not accounting for the preceding backslash -- treats that escaped quote as the
// end of the string, so the rest of the identifier and the comma after it are read as if still
// outside any string. That misreads the following top-level comma as if it were still inside a
// string too (since the scanner is now one quote toggle out of phase), merging two configured
// expressions into one invalid fragment and silently dropping both from the compiled result.
func TestSplitTopLevelCommas_EscapedQuoteDoesNotCloseString(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  []string
	}{
		{
			name:  "escaped double quote inside quoted identifier",
			input: `"team\"name",preferred_username`,
			want:  []string{`"team\"name"`, "preferred_username"},
		},
		{
			name:  "escaped single quote inside raw string literal",
			input: `'it\'s a trap',sub`,
			want:  []string{`'it\'s a trap'`, "sub"},
		},
		{
			name:  "no escapes, unaffected",
			input: `iss,sub`,
			want:  []string{"iss", "sub"},
		},
		{
			name:  "escaped quote at the very end of the expression",
			input: `"name\""`,
			want:  []string{`"name\""`},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, splitTopLevelCommas(tt.input))
		})
	}
}
