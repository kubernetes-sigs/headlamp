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
	"crypto/sha256"
	"encoding/base32"
	"encoding/json"
)

// type ResourceKind string

// Key struct used to store different values to make Key unique
// for different requests.
type CacheKey struct {
	Kind      string // Kind is the string object which is the user is requesting
	Namespace string // Namespace is string object which tells what Namespace is the user trying to access
	Context   string // Context is the unique Id which helps to differentiate multi-context
	Token     string
}

// It returns a computed key string which is unique.
func HashObject(any interface{}) (string, error) {
	out, err := json.Marshal(any)
	if err != nil {
		return "", err
	}

	sha := sha256.Sum256(out)

	return base32.StdEncoding.EncodeToString(sha[:]), nil
}

// Returns Key when called.
func (k *CacheKey) SHA() (string, error) {
	return HashObject(k)
}
