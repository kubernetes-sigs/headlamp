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

// StateMode is the redirect-flow shape carried in StatePayload.Mode.
// Centralizing the valid set here lets callers (the /oidc and
// /oidc-callback handlers) compare against typed constants instead of
// stringly-typed values, and lets the desktop reservation be enforced
// in one place.
type StateMode string

const (
	// ModePopup is the default; AuthChooser opens /oidc in a popup window
	// and the callback redirects through /auth so the popup can hand the
	// auth-success signal to its opener.
	ModePopup StateMode = "popup"
	// ModeFullPage is for direct navigation entries; the callback
	// redirects straight to ReturnTo, skipping /auth.
	ModeFullPage StateMode = "fullPage"
	// ModeDesktop is reserved for the PR-2 desktop OIDC code-handoff
	// flow. /oidc rejects it with 400 today.
	ModeDesktop StateMode = "desktop"
)

// Valid reports whether m is one of the recognized StateModes.
func (m StateMode) Valid() bool {
	switch m {
	case ModePopup, ModeFullPage, ModeDesktop:
		return true
	default:
		return false
	}
}

// StatePayload is the JSON payload that round-trips between the /oidc and
// /oidc-callback handlers via the OAuth2 `state` query parameter. It carries
// everything the callback needs to reconstruct the OIDC config and verify
// the request without per-process server state.
type StatePayload struct {
	V            int       `json:"v"`       // schema version, currently 1
	Cluster      string    `json:"cluster"` // cluster name from /oidc query
	Mode         StateMode `json:"mode"`
	ReturnTo     string    `json:"returnTo,omitempty"`
	CodeVerifier string    `json:"codeVerifier,omitempty"` // PKCE; absent when PKCE is off
	// ExpUnixMs is the absolute expiry time in unix milliseconds.
	// The wire-format key is "expMs" (not the JWT-conventional "exp",
	// which is unix seconds) so debuggers and log aggregators don't
	// misread the unit by a factor of 1000. Encode populates this
	// automatically from the signer's clock + TTL; Decode requires it.
	ExpUnixMs int64  `json:"expMs"`
	CSRF      string `json:"csrf"` // 16 random bytes hex
}

// StateSchemaVersion is the only schema version the StateSigner accepts.
const StateSchemaVersion = 1

// MaxStatePayloadBytes bounds the decoded JSON payload size to keep
// attacker-supplied tokens from forcing large allocations.
const MaxStatePayloadBytes = 4 * 1024

// MinStateKeyBytes is the smallest acceptable HMAC key length.
const MinStateKeyBytes = 32

// defaultLRUSize is the consumed-CSRF cache size used when the caller
// doesn't supply WithLRUSize.
const defaultLRUSize = 1024

// Errors returned by StateSigner.Decode. Callers should not echo error
// details to end users; treat any error as "invalid request".
var (
	ErrStateMalformed     = errors.New("state malformed")
	ErrStateBadSignature  = errors.New("state bad signature")
	ErrStateBadVersion    = errors.New("state bad schema version")
	ErrStateExpired       = errors.New("state expired")
	ErrStatePayloadTooBig = errors.New("state payload too large")
	ErrStateMissingCSRF   = errors.New("state missing CSRF")
	ErrStateMissingExpiry = errors.New("state missing expiry")
)

// clockFn is the time source used by StateSigner. Production uses
// time.Now; tests inject a fake clock to drive expiry deterministically.
// Unexported so the type's API surface stays minimal.
type clockFn func() time.Time

// SignerOption configures a StateSigner at construction time.
type SignerOption func(*StateSigner)

// WithClock replaces the time source. Intended for tests so expiry can
// be driven without sleeping. Has no effect on existing in-flight calls.
func WithClock(c func() time.Time) SignerOption {
	return func(s *StateSigner) { s.clock = c }
}

// WithLRUSize overrides the consumed-CSRF cache capacity.
func WithLRUSize(n int) SignerOption {
	return func(s *StateSigner) {
		if n > 0 {
			s.lruSize = n
		}
	}
}

// StateSigner encodes and decodes signed state tokens for the OIDC handlers,
// and tracks consumed CSRF identifiers to enforce single-use semantics.
//
// A StateSigner is safe for concurrent use by multiple goroutines; all
// fields are either immutable after construction or guarded by mu.
type StateSigner struct {
	key   []byte
	ttl   time.Duration
	clock clockFn

	mu       sync.Mutex
	lru      *list.List
	consumed map[string]*list.Element
	lruSize  int
}

// NewStateSigner constructs a StateSigner.
//
// key must be at least MinStateKeyBytes long; shorter keys panic so that
// misconfiguration is loud rather than silent. ttl is the expiry stamped
// on every Encode call (now + ttl).
//
// Optional behaviors are configured via SignerOptions: WithClock for tests,
// WithLRUSize to override the consumed-CSRF cache capacity (default 1024).
func NewStateSigner(key []byte, ttl time.Duration, opts ...SignerOption) *StateSigner {
	if len(key) < MinStateKeyBytes {
		panic(fmt.Sprintf("auth.NewStateSigner: key must be >= %d bytes, got %d", MinStateKeyBytes, len(key)))
	}

	s := &StateSigner{
		key:      append([]byte(nil), key...),
		ttl:      ttl,
		clock:    time.Now,
		lru:      list.New(),
		consumed: make(map[string]*list.Element, defaultLRUSize),
		lruSize:  defaultLRUSize,
	}

	for _, opt := range opts {
		opt(s)
	}

	return s
}

// Encode serializes p as base64url(json) + "." + base64url(HMAC-SHA256).
// The encoding is URL-safe and fits comfortably inside a query parameter.
//
// Encode stamps the schema version and expiry automatically; callers don't
// need to set p.V or p.ExpUnixMs (and any value they pass is overwritten).
// Encode does not validate Mode — the handler is responsible for refusing
// callers that ask for unsupported modes (it knows which modes the deploy
// supports; the package-level constants only describe what's representable).
func (s *StateSigner) Encode(p StatePayload) (string, error) {
	p.V = StateSchemaVersion
	p.ExpUnixMs = s.clock().Add(s.ttl).UnixMilli()

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

// Decode verifies the signature, schema version, payload size, expiry,
// and CSRF presence, returning the parsed payload on success.
//
// Decode does NOT mark the payload's CSRF as consumed; callers invoke
// MarkConsumed separately so that the consume step happens after any other
// validations that might reject the request.
//
// A token whose ExpUnixMs is zero is rejected with ErrStateMissingExpiry
// — there is no "never expires" mode. A token whose CSRF is empty is
// rejected with ErrStateMissingCSRF, since the single-use guarantee is
// keyed on CSRF and an empty key would silently degrade to "every replay
// passes".
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

	if p.ExpUnixMs <= 0 {
		return StatePayload{}, ErrStateMissingExpiry
	}

	if s.clock().UnixMilli() > p.ExpUnixMs {
		return StatePayload{}, ErrStateExpired
	}

	if p.CSRF == "" {
		return StatePayload{}, ErrStateMissingCSRF
	}

	return p, nil
}

// MarkConsumed records csrf as consumed and reports whether this is the
// first call for that csrf. Subsequent calls within the LRU window return
// false. Eviction of the LRU's oldest entry can let a previously-consumed
// csrf re-pass; with lruSize tuned to dwarf concurrent in-flight logins
// this is acceptable.
//
// MarkConsumed panics if csrf is empty. Callers are expected to validate
// the payload via Decode (which rejects empty CSRF) before reaching this
// point; the panic exists so a programmer error stays loud rather than
// silently degrading the single-use guarantee to "every replay passes".
func (s *StateSigner) MarkConsumed(csrf string) (firstUse bool) {
	if csrf == "" {
		panic("auth.StateSigner.MarkConsumed: empty CSRF (Decode should have rejected this)")
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
