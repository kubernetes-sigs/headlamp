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

package terminal

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

const sessionTokenPrefix = "hlterm_"

type sessionTokenEntry struct {
	userToken   string
	clusterName string
	username    string
	expiresAt   time.Time
}

// SessionTokenStore maps short-lived, revocable Headlamp terminal session tokens
// to the originating user's cluster bearer token.
type SessionTokenStore struct {
	mu      sync.RWMutex
	entries map[string]sessionTokenEntry
}

// NewSessionTokenStore creates an empty SessionTokenStore.
func NewSessionTokenStore() *SessionTokenStore {
	return &SessionTokenStore{
		entries: make(map[string]sessionTokenEntry),
	}
}

// Issue creates a new revocable session token scoped to clusterName and username.
func (s *SessionTokenStore) Issue(userToken, clusterName, username string, ttl time.Duration) (string, error) {
	if ttl <= 0 {
		ttl = DefaultMaxDuration
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}

	token := sessionTokenPrefix + hex.EncodeToString(raw)

	s.mu.Lock()
	s.entries[token] = sessionTokenEntry{
		userToken:   userToken,
		clusterName: clusterName,
		username:    username,
		expiresAt:   time.Now().Add(ttl),
	}
	s.mu.Unlock()

	return token, nil
}

// Resolve returns the underlying user token if sessionToken is valid, unexpired,
// and matches clusterName.
func (s *SessionTokenStore) Resolve(sessionToken, clusterName string) (string, bool) {
	if s == nil || sessionToken == "" {
		return "", false
	}

	s.mu.RLock()
	entry, ok := s.entries[sessionToken]
	s.mu.RUnlock()

	if !ok || entry.clusterName != clusterName {
		return "", false
	}

	if time.Now().After(entry.expiresAt) {
		s.Revoke(sessionToken)
		return "", false
	}

	return entry.userToken, true
}

// Revoke deletes sessionToken so it can no longer be used.
func (s *SessionTokenStore) Revoke(sessionToken string) {
	if s == nil || sessionToken == "" {
		return
	}

	s.mu.Lock()
	delete(s.entries, sessionToken)
	s.mu.Unlock()
}
