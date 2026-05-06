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
	"container/list"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// StatePayload is the JSON payload that round-trips between the /oidc and
// /oidc-callback handlers via the OAuth2 `state` query parameter. It carries
// everything the callback needs to reconstruct the OIDC config and verify
// the request without per-process server state.
type StatePayload struct {
	V            int    `json:"v"`       // schema version, currently 1
	Cluster      string `json:"cluster"` // cluster name from /oidc query
	Mode         string `json:"mode"`    // "popup" | "fullPage" | "desktop"
	ReturnTo     string `json:"returnTo,omitempty"`
	CodeVerifier string `json:"codeVerifier"` // PKCE
	ExpUnixMs    int64  `json:"exp"`          // unix milliseconds
	CSRF         string `json:"csrf"`         // 16 random bytes hex
}

// StateSchemaVersion is the only schema version the StateSigner accepts.
const StateSchemaVersion = 1

// MaxStatePayloadBytes bounds the decoded JSON payload size to keep
// attacker-supplied tokens from forcing large allocations.
const MaxStatePayloadBytes = 4 * 1024

// MinStateKeyBytes is the smallest acceptable HMAC key length.
const MinStateKeyBytes = 32

// Errors returned by StateSigner.Decode. Callers should not echo error
// details to end users; treat any error as "invalid request".
var (
	ErrStateMalformed     = errors.New("state malformed")
	ErrStateBadSignature  = errors.New("state bad signature")
	ErrStateBadVersion    = errors.New("state bad schema version")
	ErrStateExpired       = errors.New("state expired")
	ErrStatePayloadTooBig = errors.New("state payload too large")
)

// Clock is the time source used by StateSigner. Production uses time.Now;
// tests inject a fake clock to drive expiry deterministically.
type Clock func() time.Time

// StateSigner encodes and decodes signed state tokens for the OIDC handlers,
// and tracks consumed CSRF identifiers to enforce single-use semantics.
//
// A StateSigner is safe for concurrent use by multiple goroutines.
type StateSigner struct {
	key   []byte
	ttl   time.Duration
	clock Clock

	mu       sync.Mutex
	lru      *list.List
	consumed map[string]*list.Element
	lruSize  int
}

// NewStateSigner constructs a StateSigner.
//
// key must be at least MinStateKeyBytes long; shorter keys panic so that
// misconfiguration is loud rather than silent. ttl is the maximum age a
// token may have before Decode rejects it. lruSize bounds the consumed-CSRF
// cache; a typical value is 1024.
func NewStateSigner(key []byte, ttl time.Duration, lruSize int) *StateSigner {
	if len(key) < MinStateKeyBytes {
		panic(fmt.Sprintf("auth.NewStateSigner: key must be >= %d bytes, got %d", MinStateKeyBytes, len(key)))
	}

	if lruSize <= 0 {
		lruSize = 1024
	}

	return &StateSigner{
		key:      append([]byte(nil), key...),
		ttl:      ttl,
		clock:    time.Now,
		lru:      list.New(),
		consumed: make(map[string]*list.Element, lruSize),
		lruSize:  lruSize,
	}
}

// SetClock overrides the time source. Intended for tests.
func (s *StateSigner) SetClock(c Clock) {
	s.clock = c
}

// Encode serializes p as base64url(json) + "." + base64url(HMAC-SHA256).
// The encoding is URL-safe and fits comfortably inside a query parameter.
func (s *StateSigner) Encode(p StatePayload) (string, error) {
	if p.V == 0 {
		p.V = StateSchemaVersion
	}

	body, err := json.Marshal(p)
	if err != nil {
		return "", fmt.Errorf("encode state: %w", err)
	}

	if len(body) > MaxStatePayloadBytes {
		return "", fmt.Errorf("%w: %d bytes", ErrStatePayloadTooBig, len(body))
	}

	bodyB64 := base64.RawURLEncoding.EncodeToString(body)

	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte(bodyB64))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return bodyB64 + "." + sig, nil
}

// Decode verifies the signature, schema version, payload size, and expiry,
// returning the parsed payload on success.
//
// Decode does NOT mark the payload's CSRF as consumed; callers invoke
// MarkConsumed separately so that the consume step happens after any other
// validations that might reject the request.
func (s *StateSigner) Decode(token string) (StatePayload, error) {
	dot := strings.IndexByte(token, '.')
	if dot < 0 {
		return StatePayload{}, ErrStateMalformed
	}

	bodyB64, sigB64 := token[:dot], token[dot+1:]
	if bodyB64 == "" || sigB64 == "" {
		return StatePayload{}, ErrStateMalformed
	}

	gotSig, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return StatePayload{}, fmt.Errorf("%w: signature encoding", ErrStateMalformed)
	}

	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte(bodyB64))
	wantSig := mac.Sum(nil)

	if !hmac.Equal(gotSig, wantSig) {
		return StatePayload{}, ErrStateBadSignature
	}

	body, err := base64.RawURLEncoding.DecodeString(bodyB64)
	if err != nil {
		return StatePayload{}, fmt.Errorf("%w: body encoding", ErrStateMalformed)
	}

	if len(body) > MaxStatePayloadBytes {
		return StatePayload{}, ErrStatePayloadTooBig
	}

	var p StatePayload
	if err := json.Unmarshal(body, &p); err != nil {
		return StatePayload{}, fmt.Errorf("%w: %v", ErrStateMalformed, err)
	}

	if p.V != StateSchemaVersion {
		return StatePayload{}, ErrStateBadVersion
	}

	if p.ExpUnixMs > 0 {
		nowMs := s.clock().UnixMilli()
		if nowMs > p.ExpUnixMs {
			return StatePayload{}, ErrStateExpired
		}
	}

	return p, nil
}

// MarkConsumed records csrf as consumed and reports whether this is the
// first call for that csrf. Subsequent calls within the LRU window return
// false. Eviction of the LRU's oldest entry can let a previously-consumed
// csrf re-pass; with lruSize tuned to dwarf concurrent in-flight logins
// this is acceptable.
func (s *StateSigner) MarkConsumed(csrf string) (firstUse bool) {
	if csrf == "" {
		return false
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if elem, ok := s.consumed[csrf]; ok {
		s.lru.MoveToFront(elem)
		return false
	}

	elem := s.lru.PushFront(csrf)
	s.consumed[csrf] = elem

	for s.lru.Len() > s.lruSize {
		oldest := s.lru.Back()
		if oldest == nil {
			break
		}

		s.lru.Remove(oldest)
		if k, ok := oldest.Value.(string); ok {
			delete(s.consumed, k)
		}
	}

	return true
}

// TTL returns the configured token lifetime. Useful for callers that want
// to set ExpUnixMs to clock+TTL when constructing a payload.
func (s *StateSigner) TTL() time.Duration {
	return s.ttl
}

// Now returns the signer's current clock time.
func (s *StateSigner) Now() time.Time {
	return s.clock()
}
