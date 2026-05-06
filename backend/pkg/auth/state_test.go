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
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func newTestKey(b byte) []byte {
	k := make([]byte, MinStateKeyBytes)
	for i := range k {
		k[i] = b
	}

	return k
}

func samplePayload() StatePayload {
	return StatePayload{
		V:            StateSchemaVersion,
		Cluster:      "main",
		Mode:         "popup",
		ReturnTo:     "/c/main/pods",
		CodeVerifier: "abcDEF1234567890abcDEF1234567890abcdef0123",
		ExpUnixMs:    time.Now().Add(5 * time.Minute).UnixMilli(),
		CSRF:         "deadbeefcafef00d0011223344556677",
	}
}

func TestStateSigner_RoundTrip(t *testing.T) {
	t.Parallel()

	s := NewStateSigner(newTestKey(0xAB), 5*time.Minute, 16)

	want := samplePayload()

	tok, err := s.Encode(want)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	if !strings.Contains(tok, ".") {
		t.Fatalf("token missing separator: %q", tok)
	}

	got, err := s.Decode(tok)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if got != want {
		t.Fatalf("round-trip mismatch:\n got=%+v\nwant=%+v", got, want)
	}
}

func TestStateSigner_TamperedSignature(t *testing.T) {
	t.Parallel()

	s := NewStateSigner(newTestKey(0xAB), 5*time.Minute, 16)

	tok, err := s.Encode(samplePayload())
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	// Flip the last byte of the signature segment.
	tampered := tok[:len(tok)-1]
	if tok[len(tok)-1] == 'A' {
		tampered += "B"
	} else {
		tampered += "A"
	}

	_, err = s.Decode(tampered)
	if !errors.Is(err, ErrStateBadSignature) {
		t.Fatalf("expected ErrStateBadSignature, got %v", err)
	}
}

func TestStateSigner_DifferentKey(t *testing.T) {
	t.Parallel()

	a := NewStateSigner(newTestKey(0x01), 5*time.Minute, 16)
	b := NewStateSigner(newTestKey(0x02), 5*time.Minute, 16)

	tok, err := a.Encode(samplePayload())
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	_, err = b.Decode(tok)
	if !errors.Is(err, ErrStateBadSignature) {
		t.Fatalf("expected ErrStateBadSignature across signers, got %v", err)
	}
}

func TestStateSigner_Expired(t *testing.T) {
	t.Parallel()

	s := NewStateSigner(newTestKey(0xCC), 5*time.Minute, 16)

	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	s.SetClock(func() time.Time { return now })

	p := samplePayload()
	p.ExpUnixMs = now.Add(time.Minute).UnixMilli()

	tok, err := s.Encode(p)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	// Advance past expiry.
	s.SetClock(func() time.Time { return now.Add(2 * time.Minute) })

	_, err = s.Decode(tok)
	if !errors.Is(err, ErrStateExpired) {
		t.Fatalf("expected ErrStateExpired, got %v", err)
	}
}

func TestStateSigner_BadVersion(t *testing.T) {
	t.Parallel()

	s := NewStateSigner(newTestKey(0xDD), 5*time.Minute, 16)

	p := samplePayload()
	p.V = 999

	tok, err := s.Encode(p)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	_, err = s.Decode(tok)
	if !errors.Is(err, ErrStateBadVersion) {
		t.Fatalf("expected ErrStateBadVersion, got %v", err)
	}
}

func TestStateSigner_PayloadTooBig(t *testing.T) {
	t.Parallel()

	s := NewStateSigner(newTestKey(0xEE), 5*time.Minute, 16)

	p := samplePayload()
	p.CodeVerifier = strings.Repeat("a", MaxStatePayloadBytes+1)

	_, err := s.Encode(p)
	if !errors.Is(err, ErrStatePayloadTooBig) {
		t.Fatalf("expected ErrStatePayloadTooBig on encode, got %v", err)
	}
}

func TestStateSigner_Malformed(t *testing.T) {
	t.Parallel()

	s := NewStateSigner(newTestKey(0xFF), 5*time.Minute, 16)

	cases := []string{
		"",
		"no-dot-here",
		".onlydot",
		"onlydot.",
		"$$$.$$$",
	}

	for _, tc := range cases {
		_, err := s.Decode(tc)
		if err == nil {
			t.Fatalf("expected error decoding %q", tc)
		}
	}
}

func TestStateSigner_MarkConsumed(t *testing.T) {
	t.Parallel()

	s := NewStateSigner(newTestKey(0x11), 5*time.Minute, 4)

	if !s.MarkConsumed("a") {
		t.Fatalf("first MarkConsumed should return true")
	}

	if s.MarkConsumed("a") {
		t.Fatalf("second MarkConsumed should return false")
	}

	// Fill the LRU past its capacity to evict "a".
	for i := 0; i < 8; i++ {
		s.MarkConsumed(fmt.Sprintf("k%d", i))
	}

	// "a" was evicted; it can re-pass once. This documents the LRU
	// semantics: capacity should dwarf concurrent in-flight logins.
	if !s.MarkConsumed("a") {
		t.Fatalf("after eviction, MarkConsumed(\"a\") should return true again")
	}
}

func TestStateSigner_NewStateSigner_RejectsShortKey(t *testing.T) {
	t.Parallel()

	defer func() {
		if r := recover(); r == nil {
			t.Fatalf("expected panic on short key")
		}
	}()

	_ = NewStateSigner(make([]byte, MinStateKeyBytes-1), time.Minute, 4)
}
