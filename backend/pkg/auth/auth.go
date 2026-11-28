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
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"reflect"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gorilla/mux"
	"github.com/jmespath/go-jmespath"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/oauth2"
	"golang.org/x/sync/singleflight"
)

const (
	oldTokenTTL             = time.Second * 10 // seconds
	oidcKeyPrefix           = "oidc-token-"
	oidcIDTokenKeyPrefix    = "oidc-id-token-"        // #nosec G101 -- cache key prefix, not a credential
	refreshedTokenKeyPrefix = "oidc-refreshed-token-" //nolint:gosec // cache key prefix, not a credential
	recoveryTokenKeyPrefix  = "oidc-recovery-token-"  //nolint:gosec // cache key prefix, not a credential
	refreshChainKeyPrefix   = "oidc-refresh-chain-"   // #nosec G101 -- cache key prefix, not a credential
	defaultIDTokenTTL       = 24 * time.Hour
	clusterLogField         = "cluster"
	// refreshTimeout bounds the detached context used for the shared IdP
	// exchange in GetNewToken, so a hung IdP can't block waiting callers
	// indefinitely.
	refreshTimeout = 30 * time.Second
)

// refreshGroup deduplicates concurrent OIDC refreshes for the same token.
//
// The OIDC refresh middleware runs independently for every incoming request, and
// Headlamp's frontend commonly fires many concurrent requests against a cluster.
// Without this, every request that observes the same soon-to-expire token would
// race to exchange the same cached refresh token with the IdP: only the first
// exchange succeeds, and the rest fail (or, on providers with refresh-token
// rotation and reuse detection, can revoke the whole token family and force the
// user to fully re-authenticate). Keying on the old token string is sufficient
// since it uniquely identifies the in-flight refresh for a given session.
//
// This only dedupes calls that overlap in time. A request can still observe the
// old, about-to-expire token via RefreshTokenIfNeeded's IsTokenAboutToExpire
// check, then reach GetNewToken after some other request already completed a
// refresh for that same token (the singleflight.Group forgets a key as soon as
// its Do call returns). refreshedTokenKeyPrefix below covers that non-overlapping
// case.
var refreshGroup singleflight.Group

var (
	latestCookieDelivery sync.Map
	latestRefreshByChain sync.Map
)

type latestRefreshState struct {
	gate            chan struct{}
	result          *tokenRefreshResult
	pendingCookies  *sync.Map
	retiredKeys     *sync.Map
	recoveryAliases *sync.Map
	recoveryGate    *sync.Mutex
	cacheScope      any
	lastActivity    atomic.Int64
	cleanupTimer    atomic.Pointer[time.Timer]
}

type refreshStateKey struct {
	chainID    string
	cacheScope any
}

type pendingCookieIntentKey struct {
	destination string
	ownerToken  string
}

type pendingCookieIntent struct {
	generation uint64
	references uint64
}

type cookieDeliveryState struct {
	gate                chan struct{}
	committedGeneration atomic.Uint64
	references          atomic.Int64
	lastActivity        atomic.Int64
}

func stageLatestRefreshCookies(
	params RefreshAndSetTokenParams,
	delivery *cookieDelivery,
) func(*tokenRefreshResult) error {
	return func(result *tokenRefreshResult) error {
		newTokenString, err := refreshedTokenString(result.token, params.OIDCUseAccessToken)
		if err != nil {
			return err
		}

		params.Request.Header.Set("Authorization", "Bearer "+newTokenString)

		return stageRefreshCookies(params, result.token, newTokenString, delivery)()
	}
}

var refreshGeneration atomic.Uint64

var cookieDeliveryWriteTimeout = 5 * time.Second

const JWTExpirationTTL = 10 * time.Second // seconds

// errFieldMessage is the JSON field name used by writeMeJSON for error messages.
const errFieldMessage = "message"

// DecodeBase64JSON decodes a base64 URL-encoded JSON string into a map.
func DecodeBase64JSON(base64JSON string) (map[string]interface{}, error) {
	payloadBytes, err := base64.RawURLEncoding.DecodeString(base64JSON)
	if err != nil {
		return nil, err
	}

	var payloadMap map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &payloadMap); err != nil {
		return nil, err
	}

	return payloadMap, nil
}

// clusterPathRegex matches /clusters/<cluster>/...
var clusterPathRegex = regexp.MustCompile(`^/clusters/([^/]+)/.*`)

// bearerTokenRegex matches valid bearer tokens as specified by RFC 6750:
// https://datatracker.ietf.org/doc/html/rfc6750#section-2.1
var bearerTokenRegex = regexp.MustCompile(`^[\x21-\x7E]+$`)

// BearerTokenValue returns the raw token from an Authorization header value.
func BearerTokenValue(token string) string {
	trimmedToken := strings.TrimLeft(token, " \t")

	const bearerScheme = "Bearer"
	if len(trimmedToken) > len(bearerScheme) && strings.EqualFold(trimmedToken[:len(bearerScheme)], bearerScheme) {
		credentials := trimmedToken[len(bearerScheme):]
		if credentials[0] == ' ' || credentials[0] == '\t' {
			return strings.TrimSpace(credentials)
		}
	}

	return strings.TrimSpace(token)
}

// StripBaseURL removes baseURL from the start of path so that a request made
// under a path-based base URL can be matched against the /clusters/... routes.
// The base URL only matches up to a "/" boundary, so "/foo" doesn't strip
// "/foobar". The path is returned unchanged when it doesn't start with baseURL.
func StripBaseURL(path, baseURL string) string {
	baseURL = strings.TrimSuffix(baseURL, "/")
	if baseURL == "" {
		return path
	}

	if path == baseURL {
		return "/"
	}

	if strings.HasPrefix(path, baseURL+"/") {
		return path[len(baseURL):]
	}

	return path
}

// ParseClusterAndToken extracts the cluster name from the URL path and
// the Bearer token from the Authorization header of the HTTP request, falling
// back to the cluster cookie when the header is missing.
func ParseClusterAndToken(r *http.Request) (string, string) {
	return ParseClusterAndTokenWithBaseURL(r, "")
}

// ParseClusterAndTokenWithBaseURL is like ParseClusterAndToken, but first
// strips baseURL from the request path, for when Headlamp is served under a
// path-based base URL.
func ParseClusterAndTokenWithBaseURL(r *http.Request, baseURL string) (string, string) {
	cluster := ""

	matches := clusterPathRegex.FindStringSubmatch(StripBaseURL(r.URL.Path, baseURL))
	if len(matches) > 1 {
		cluster = matches[1]
	}

	// Try Authorization header first (for backward compatibility)
	token := BearerTokenValue(r.Header.Get("Authorization"))
	if strings.Contains(token, ",") {
		return cluster, ""
	}

	// If no auth header, try cookie
	if token == "" && cluster != "" {
		if cookieToken, err := GetTokenFromCookie(r, cluster); err == nil && cookieToken != "" {
			token = cookieToken
		}
	}

	if token != "" && !bearerTokenRegex.MatchString(token) {
		return cluster, ""
	}

	return cluster, token
}

// GetExpiryUnixTimeUTC expiration unix time UTC from a token payload map exp field.
//
// The exp field is UTC unix time in seconds.
// See https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
// See exp field: https://www.rfc-editor.org/rfc/rfc7519#section-4.1.4
func GetExpiryUnixTimeUTC(tokenPayload map[string]interface{}) (time.Time, error) {
	// Numbers in JSON are floats (54-bit)
	exp, ok := tokenPayload["exp"].(float64)
	if !ok {
		return time.Time{}, errors.New("expiry time not found or invalid")
	}

	return time.Unix(int64(exp), 0).UTC(), nil
}

// IsTokenAboutToExpire reports whether the given token is within JWTExpirationTTL
// of its expiry time.
func IsTokenAboutToExpire(token string) bool {
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 || parts[1] == "" {
		return false
	}

	payload, err := DecodeBase64JSON(parts[1])
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to decode payload")
		return false
	}

	expiryUnixTimeUTC, err := GetExpiryUnixTimeUTC(payload)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get expiry time")
		return false
	}

	// This time comparison is timezone aware, so it works correctly
	return time.Until(expiryUnixTimeUTC) <= JWTExpirationTTL
}

// CacheIDToken retains the ID token associated with the authentication token.
func CacheIDToken(
	ctx context.Context,
	tokenCache cache.Cache[interface{}],
	authToken, idToken string,
	ttl time.Duration,
) error {
	if authToken == "" || idToken == "" {
		return nil
	}

	if ttl <= 0 {
		ttl = defaultIDTokenTTL
	}

	if err := tokenCache.SetWithTTL(ctx, oidcIDTokenKeyPrefix+authToken, idToken, ttl); err != nil {
		return fmt.Errorf("caching ID token: %w", err)
	}

	return nil
}

func oauthTokenValue(token *oauth2.Token, tokenType string) string {
	if tokenType == "access_token" {
		return token.AccessToken
	}

	value, _ := token.Extra(tokenType).(string)

	return value
}

func retainIDTokenForRefreshedToken(
	ctx context.Context,
	token *oauth2.Token,
	oldAuthToken, newAuthToken string,
	tokenCache cache.Cache[interface{}],
	sessionTTL time.Duration,
) (*oauth2.Token, error) {
	idToken, _ := token.Extra("id_token").(string)
	if idToken == "" {
		cachedIDToken, err := tokenCache.Get(ctx, oidcIDTokenKeyPrefix+oldAuthToken)
		if err != nil && !errors.Is(err, cache.ErrNotFound) {
			return nil, fmt.Errorf("getting cached ID token: %w", err)
		}

		idToken, _ = cachedIDToken.(string)
	}

	if idToken == "" {
		return token, nil
	}

	if err := CacheIDToken(ctx, tokenCache, newAuthToken, idToken, sessionTTL); err != nil {
		return nil, err
	}

	return token.WithExtra(map[string]interface{}{"id_token": idToken}), nil
}

// CacheRefreshedToken updates the refresh token in the cache.
func CacheRefreshedToken(token *oauth2.Token, tokenType string, oldToken string,
	oldRefreshToken string, cache cache.Cache[interface{}],
) error {
	newToken := oauthTokenValue(token, tokenType)
	if newToken == "" {
		return nil
	}

	ctx := context.Background()

	if err := cache.Set(ctx, oidcKeyPrefix+newToken, token.RefreshToken); err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to cache refreshed token")
		return err
	}

	if newToken == oldToken {
		return nil
	}

	if err := cache.SetWithTTL(ctx, oidcKeyPrefix+oldToken, oldRefreshToken, oldTokenTTL); err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to cache refreshed token")
		return err
	}

	return nil
}

// GetNewToken uses the provided credentials and fetches the old refresh
// token from the cache to obtain a new OAuth2 token
// from the specified token URL endpoint.
func GetNewToken(clientID, clientSecret string, tokenCache cache.Cache[interface{}],
	tokenType string, token string, tokenURL string, ctx context.Context, sessionTTL time.Duration,
) (*oauth2.Token, error) {
	result, err := getNewToken(
		clientID,
		clientSecret,
		tokenCache,
		tokenType,
		token,
		tokenURL,
		ctx,
		sessionTTL,
	)
	if err != nil {
		return nil, err
	}

	return result.token, nil
}

type tokenRefreshResult struct {
	token                 *oauth2.Token
	cookieClaims          *sync.Map
	chainID               string
	generation            uint64
	sourceToken           string
	pendingCookies        sync.Map
	sharedPendingCookies  *sync.Map
	retiredKeys           sync.Map
	sharedRetiredKeys     *sync.Map
	recoveryAliases       sync.Map
	sharedRecoveryAliases *sync.Map
	recoveryGate          sync.Mutex
	sharedRecoveryGate    *sync.Mutex
	cacheScope            any
}

func (r *tokenRefreshResult) claimCookieWrite(
	ctx context.Context,
	destination string,
	cookieCapability ...bool,
) (*cookieDelivery, bool) {
	cookieCapable := len(cookieCapability) == 0 || cookieCapability[0]
	if r.cookieClaims == nil || ctx.Err() != nil || !cookieCapable {
		return nil, false
	}

	key := cookieDeliveryKey(r.chainID, destination, r.cacheScope)

	var state *cookieDeliveryState

	for {
		stateValue, loaded := latestCookieDelivery.LoadOrStore(
			key,
			&cookieDeliveryState{gate: make(chan struct{}, 1)},
		)

		state = stateValue.(*cookieDeliveryState)
		if !tryLockDeliveryState(ctx, state) {
			if !loaded {
				scheduleCookieDeliveryCleanup(key, state)
			}

			return nil, false
		}

		current, ok := latestCookieDelivery.Load(key)
		if ok && current == state {
			state.references.Add(1)
			state.lastActivity.Store(time.Now().UnixNano())
			<-state.gate

			if !loaded {
				scheduleCookieDeliveryCleanup(key, state)
			}

			break
		}

		<-state.gate
	}

	return &cookieDelivery{
		result:      r,
		destination: destination,
		state:       state,
	}, true
}

func (r *tokenRefreshResult) releaseCookieWrite(destination string) {
	r.cookieClaims.Delete(fmt.Sprintf("%d\x00%s", r.generation, destination))
}

func (r *tokenRefreshResult) retireRecovery(tokenCache cache.Cache[interface{}], incomingKey string) {
	gate := r.cookieRecoveryGate()
	gate.Lock()
	defer gate.Unlock()

	r.retireRecoveryLocked(tokenCache, incomingKey)
}

func (r *tokenRefreshResult) retireRecoveryIfIdle(
	tokenCache cache.Cache[interface{}],
	incomingKey string,
) {
	gate := r.cookieRecoveryGate()
	gate.Lock()
	defer gate.Unlock()

	if !r.hasPendingCookieDeliveryLocked() {
		r.retireRecoveryLocked(tokenCache, incomingKey)
	}
}

func (r *tokenRefreshResult) retireRecoveryLocked(tokenCache cache.Cache[interface{}], incomingKey string) {
	aliases := map[string]struct{}{
		incomingKey:                            {},
		recoveryTokenKeyPrefix + r.sourceToken: {},
	}
	r.sharedRecoveryAliasKeys().Range(func(key, _ any) bool {
		alias, ok := key.(string)
		if ok {
			aliases[alias] = struct{}{}
		}

		return true
	})

	for key := range aliases {
		if key == recoveryTokenKeyPrefix {
			continue
		}

		marker := new(byte)

		retirements := r.recoveryRetirementKeys()
		if _, loaded := retirements.LoadOrStore(key, marker); loaded {
			continue
		}

		err := tokenCache.UpdateTTL(context.Background(), key, oldTokenTTL)
		if err != nil {
			retirements.CompareAndDelete(key, marker)

			if errors.Is(err, cache.ErrNotFound) {
				r.sharedRecoveryAliasKeys().Delete(key)
			}

			continue
		}

		time.AfterFunc(oldTokenTTL, func() {
			gate := r.cookieRecoveryGate()
			gate.Lock()
			defer gate.Unlock()

			if !retirements.CompareAndDelete(key, marker) {
				return
			}

			if _, err := tokenCache.Get(context.Background(), key); errors.Is(err, cache.ErrNotFound) {
				r.sharedRecoveryAliasKeys().Delete(key)
			}
		})
	}
}

func cacheScopeOf(tokenCache cache.Cache[interface{}]) any {
	valueType := reflect.TypeOf(tokenCache)
	if valueType != nil && valueType.Comparable() {
		return tokenCache
	}

	return nil
}

func (r *tokenRefreshResult) hasPendingCookieDelivery() bool {
	gate := r.cookieRecoveryGate()
	gate.Lock()
	defer gate.Unlock()

	return r.hasPendingCookieDeliveryLocked()
}

func (r *tokenRefreshResult) hasPendingCookieDeliveryLocked() bool {
	if latest := latestRefreshResult(r.chainID, r.cacheScope); latest != nil &&
		latest.generation > r.generation {
		return latest.hasPendingCookieDeliveryLocked()
	}

	pending := false

	r.pendingCookieDestinations().Range(func(key, value any) bool {
		intentKey, ok := key.(pendingCookieIntentKey)
		if !ok {
			return true
		}

		intent, ok := value.(pendingCookieIntent)
		if !ok {
			return true
		}

		generation := intent.generation
		if generation == 0 {
			pending = true

			return false
		}

		state, loaded := latestCookieDelivery.Load(
			cookieDeliveryKey(r.chainID, intentKey.destination, r.cacheScope),
		)
		if loaded && state.(*cookieDeliveryState).committedGeneration.Load() >= generation {
			r.pendingCookieDestinations().CompareAndDelete(key, value)

			return true
		}

		pending = true

		return false
	})

	return pending
}

func (r *tokenRefreshResult) markPendingCookieDelivery(destination string) {
	gate := r.cookieRecoveryGate()
	gate.Lock()
	defer gate.Unlock()

	r.markPendingCookieDeliveryLocked(destination, r.sourceToken)
}

func (r *tokenRefreshResult) markPendingCookieDeliveryLocked(destination, ownerToken string) {
	if destination == "" {
		return
	}

	key := pendingCookieIntentKey{destination: destination, ownerToken: ownerToken}
	for {
		current, loaded := r.pendingCookieDestinations().LoadOrStore(
			key,
			pendingCookieIntent{generation: r.generation, references: 1},
		)
		if !loaded {
			return
		}

		intent, ok := current.(pendingCookieIntent)
		if !ok || intent.generation >= r.generation {
			return
		}

		if r.pendingCookieDestinations().CompareAndSwap(
			key,
			current,
			pendingCookieIntent{generation: r.generation, references: intent.references},
		) {
			return
		}
	}
}

func (r *tokenRefreshResult) bindPendingCookieIntentsLocked() {
	r.pendingCookieDestinations().Range(func(key, value any) bool {
		intentKey, keyOK := key.(pendingCookieIntentKey)

		intent, valueOK := value.(pendingCookieIntent)
		if keyOK && valueOK &&
			intentKey.ownerToken == r.sourceToken &&
			intent.generation == 0 {
			r.pendingCookieDestinations().CompareAndSwap(
				key,
				value,
				pendingCookieIntent{generation: r.generation, references: intent.references},
			)
		}

		return true
	})
}

func (r *tokenRefreshResult) completeCookieDelivery(destination string) {
	gate := r.cookieRecoveryGate()
	gate.Lock()
	defer gate.Unlock()

	r.completeCookieDeliveryLocked(destination)
}

func (r *tokenRefreshResult) completeCookieDeliveryLocked(destination string) {
	if latest := latestRefreshResult(r.chainID, r.cacheScope); latest != nil &&
		latest.generation > r.generation {
		return
	}

	r.pendingCookieDestinations().Range(func(key, value any) bool {
		intentKey, keyOK := key.(pendingCookieIntentKey)

		intent, valueOK := value.(pendingCookieIntent)
		if keyOK && valueOK &&
			intentKey.destination == destination &&
			intent.generation != 0 &&
			intent.generation <= r.generation {
			r.pendingCookieDestinations().CompareAndDelete(key, value)
		}

		return true
	})
}

func (r *tokenRefreshResult) completeCookieDeliveryAndRetire(
	tokenCache cache.Cache[interface{}],
	recoveryKey, destination string,
) {
	gate := r.cookieRecoveryGate()
	gate.Lock()
	defer gate.Unlock()

	r.completeCookieDeliveryLocked(destination)

	if !r.hasPendingCookieDeliveryLocked() {
		r.retireRecoveryLocked(tokenCache, recoveryKey)
	}
}

func (r *tokenRefreshResult) pendingCookieDestinations() *sync.Map {
	if r.sharedPendingCookies != nil {
		return r.sharedPendingCookies
	}

	return &r.pendingCookies
}

func (r *tokenRefreshResult) recoveryRetirementKeys() *sync.Map {
	if r.sharedRetiredKeys != nil {
		return r.sharedRetiredKeys
	}

	return &r.retiredKeys
}

func (r *tokenRefreshResult) sharedRecoveryAliasKeys() *sync.Map {
	if r.sharedRecoveryAliases != nil {
		return r.sharedRecoveryAliases
	}

	return &r.recoveryAliases
}

func (r *tokenRefreshResult) cookieRecoveryGate() *sync.Mutex {
	if r.sharedRecoveryGate != nil {
		return r.sharedRecoveryGate
	}

	return &r.recoveryGate
}

type cookieDelivery struct {
	result       *tokenRefreshResult
	destination  string
	setCookies   []string
	stage        func() error
	stageLatest  func(*tokenRefreshResult) error
	commitHeader http.Header
	state        *cookieDeliveryState
	finished     atomic.Bool
	acquired     bool
	locked       bool
	recovery     cache.Cache[interface{}]
	recoveryKey  string
}

func (d *cookieDelivery) finish(committed bool) {
	if d == nil || !d.finished.CompareAndSwap(false, true) {
		return
	}

	if !committed && d.acquired {
		d.result.releaseCookieWrite(d.destination)
	} else if committed && d.result.generation > d.state.committedGeneration.Load() {
		d.state.committedGeneration.Store(d.result.generation)
	}

	if committed {
		if d.recovery != nil {
			d.result.completeCookieDeliveryAndRetire(
				d.recovery,
				d.recoveryKey,
				d.destination,
			)
		} else {
			d.result.completeCookieDelivery(d.destination)
		}
	}

	d.state.references.Add(-1)
	d.state.lastActivity.Store(time.Now().UnixNano())

	if d.locked {
		<-d.state.gate
	}
}

func scheduleCookieDeliveryCleanup(key string, state *cookieDeliveryState) {
	scheduleCookieDeliveryCleanupAfter(key, state, defaultIDTokenTTL)
}

func scheduleCookieDeliveryCleanupAfter(key string, state *cookieDeliveryState, idleTTL time.Duration) {
	time.AfterFunc(idleTTL, func() {
		runCookieDeliveryCleanup(key, state, idleTTL)
	})
}

func recordLatestRefreshResult(chainID string, result *tokenRefreshResult) {
	stateKey := refreshStateKey{chainID: chainID, cacheScope: result.cacheScope}

	for {
		value, loaded := latestRefreshByChain.LoadOrStore(
			stateKey,
			newLatestRefreshState(),
		)

		state := value.(*latestRefreshState)
		if state.recoveryGate == nil {
			state.recoveryGate = &sync.Mutex{}
		}

		state.recoveryGate.Lock()
		state.gate <- struct{}{}

		current, ok := latestRefreshByChain.Load(stateKey)
		if !ok || current != state {
			<-state.gate
			state.recoveryGate.Unlock()

			continue
		}

		prepareLatestRefreshState(state, result.cacheScope)
		result.sharedPendingCookies = state.pendingCookies
		result.sharedRetiredKeys = state.retiredKeys
		result.sharedRecoveryAliases = state.recoveryAliases
		result.sharedRecoveryGate = state.recoveryGate
		result.bindPendingCookieIntentsLocked()

		if state.result == nil || state.result.generation < result.generation {
			state.result = result
		}

		state.lastActivity.Store(time.Now().UnixNano())

		if !loaded {
			scheduleLatestRefreshCleanup(stateKey, state)
		}

		<-state.gate
		state.recoveryGate.Unlock()

		return
	}
}

func newLatestRefreshState() *latestRefreshState {
	return &latestRefreshState{
		gate:            make(chan struct{}, 1),
		pendingCookies:  &sync.Map{},
		retiredKeys:     &sync.Map{},
		recoveryAliases: &sync.Map{},
		recoveryGate:    &sync.Mutex{},
	}
}

func prepareLatestRefreshState(state *latestRefreshState, cacheScope any) {
	state.pendingCookies = orSyncMap(state.pendingCookies)
	state.retiredKeys = orSyncMap(state.retiredKeys)
	state.recoveryAliases = orSyncMap(state.recoveryAliases)

	if state.recoveryGate == nil {
		state.recoveryGate = &sync.Mutex{}
	}

	if state.cacheScope != nil && cacheScope != nil && state.cacheScope != cacheScope {
		state.pendingCookies = &sync.Map{}
		state.retiredKeys = &sync.Map{}
		state.recoveryAliases = &sync.Map{}
		state.result = nil
	}

	if cacheScope != nil {
		state.cacheScope = cacheScope
	}
}

func orSyncMap(value *sync.Map) *sync.Map {
	if value == nil {
		return &sync.Map{}
	}

	return value
}

func recordPendingCookieDelivery(
	chainID, destination, ownerToken string,
	cacheScopes ...any,
) {
	var cacheScope any
	if len(cacheScopes) > 0 {
		cacheScope = cacheScopes[0]
	}

	stateKey := refreshStateKey{chainID: chainID, cacheScope: cacheScope}

	for {
		value, loaded := latestRefreshByChain.LoadOrStore(
			stateKey,
			newLatestRefreshState(),
		)

		state := value.(*latestRefreshState)
		if state.recoveryGate == nil {
			state.recoveryGate = &sync.Mutex{}
		}

		state.recoveryGate.Lock()
		state.gate <- struct{}{}

		current, ok := latestRefreshByChain.Load(stateKey)
		if !ok || current != state {
			<-state.gate
			state.recoveryGate.Unlock()

			continue
		}

		prepareLatestRefreshState(state, cacheScope)

		key := pendingCookieIntentKey{destination: destination, ownerToken: ownerToken}
		incrementPendingCookieIntent(state.pendingCookies, key)
		state.lastActivity.Store(time.Now().UnixNano())

		if !loaded {
			scheduleLatestRefreshCleanup(stateKey, state)
		}

		<-state.gate
		state.recoveryGate.Unlock()

		return
	}
}

func incrementPendingCookieIntent(
	destinations *sync.Map,
	key pendingCookieIntentKey,
) {
	pendingValue, loaded := destinations.LoadOrStore(key, pendingCookieIntent{references: 1})
	for loaded {
		intent, ok := pendingValue.(pendingCookieIntent)
		if !ok {
			return
		}

		updated := intent
		updated.references++

		if destinations.CompareAndSwap(key, pendingValue, updated) {
			return
		}

		pendingValue, loaded = destinations.Load(key)
	}
}

func abandonFailedPendingCookieDelivery(chainID string, cacheScope any) {
	stateKey := refreshStateKey{chainID: chainID, cacheScope: cacheScope}

	value, ok := latestRefreshByChain.Load(stateKey)
	if !ok {
		return
	}

	state := value.(*latestRefreshState)
	state.recoveryGate.Lock()
	state.gate <- struct{}{}

	current, loaded := latestRefreshByChain.Load(stateKey)
	if loaded && current == state && state.result == nil &&
		(state.cacheScope == nil || cacheScope == nil || state.cacheScope == cacheScope) {
		latestRefreshByChain.CompareAndDelete(stateKey, state)

		if timer := state.cleanupTimer.Swap(nil); timer != nil {
			timer.Stop()
		}
	}

	<-state.gate
	state.recoveryGate.Unlock()
}

func abandonPendingCookieIntent(
	chainID, destination, ownerToken string,
	cacheScope any,
) {
	stateKey := refreshStateKey{chainID: chainID, cacheScope: cacheScope}

	value, ok := latestRefreshByChain.Load(stateKey)
	if !ok {
		return
	}

	state := value.(*latestRefreshState)
	state.recoveryGate.Lock()
	defer state.recoveryGate.Unlock()

	stateGateValue, stateLoaded := latestRefreshByChain.Load(stateKey)
	if !stateLoaded || stateGateValue != state {
		return
	}

	if state.result == nil || state.result.sourceToken == ownerToken {
		return
	}

	key := pendingCookieIntentKey{destination: destination, ownerToken: ownerToken}

	current, loaded := state.pendingCookies.Load(key)
	if !loaded {
		return
	}

	intent, ok := current.(pendingCookieIntent)
	if !ok {
		return
	}

	if intent.references <= 1 {
		state.pendingCookies.CompareAndDelete(key, current)

		return
	}

	intent.references--
	state.pendingCookies.CompareAndSwap(key, current, intent)
}

func latestRefreshResult(chainID string, cacheScopes ...any) *tokenRefreshResult {
	var cacheScope any
	if len(cacheScopes) > 0 {
		cacheScope = cacheScopes[0]
	}

	stateKey := refreshStateKey{chainID: chainID, cacheScope: cacheScope}

	for {
		value, ok := latestRefreshByChain.Load(stateKey)
		if !ok {
			return nil
		}

		state := value.(*latestRefreshState)
		state.gate <- struct{}{}

		current, ok := latestRefreshByChain.Load(stateKey)
		if !ok || current != state {
			<-state.gate

			continue
		}

		result := state.result
		state.lastActivity.Store(time.Now().UnixNano())
		<-state.gate

		return result
	}
}

func scheduleLatestRefreshCleanup(stateKey refreshStateKey, state *latestRefreshState) {
	scheduleLatestRefreshCleanupAfter(stateKey, state, defaultIDTokenTTL)
}

func scheduleLatestRefreshCleanupAfter(
	stateKey refreshStateKey,
	state *latestRefreshState,
	idleTTL time.Duration,
) {
	timer := time.AfterFunc(idleTTL, func() {
		runLatestRefreshCleanup(stateKey, state, idleTTL)
	})
	state.cleanupTimer.Store(timer)
}

func runLatestRefreshCleanup(stateKey refreshStateKey, state *latestRefreshState, idleTTL time.Duration) {
	state.gate <- struct{}{}

	lastActivity := time.Unix(0, state.lastActivity.Load())

	remaining := idleTTL - time.Since(lastActivity)
	if remaining > 0 {
		<-state.gate

		timer := time.AfterFunc(remaining, func() {
			runLatestRefreshCleanup(stateKey, state, idleTTL)
		})
		state.cleanupTimer.Store(timer)

		return
	}

	latestRefreshByChain.CompareAndDelete(stateKey, state)
	<-state.gate
}

func runCookieDeliveryCleanup(key string, state *cookieDeliveryState, idleTTL time.Duration) {
	select {
	case state.gate <- struct{}{}:
	default:
		scheduleCookieDeliveryCleanupAfter(key, state, idleTTL)

		return
	}

	defer func() { <-state.gate }()

	lastActivity := time.Unix(0, state.lastActivity.Load())

	remaining := idleTTL - time.Since(lastActivity)
	if state.references.Load() > 0 || remaining > 0 {
		if remaining <= 0 {
			remaining = idleTTL
		}

		time.AfterFunc(remaining, func() {
			runCookieDeliveryCleanup(key, state, idleTTL)
		})

		return
	}

	latestCookieDelivery.CompareAndDelete(key, state)
}

type refreshResponseWriter struct {
	http.ResponseWriter
	delivery      *cookieDelivery
	ctx           context.Context
	pendingStatus int
	pendingHeader http.Header
	headerWritten bool
}

func (w *refreshResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *refreshResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("response writer does not support hijacking")
	}

	if w.headerWritten {
		setWriteDeadline(w.ResponseWriter, time.Time{})

		return hijacker.Hijack()
	}

	valid := w.prepareCookies()
	if !valid {
		w.delivery.finish(false)
	}

	if w.pendingStatus != 0 {
		return w.hijackAfterStatusCommit(hijacker)
	}

	setWriteDeadline(w.ResponseWriter, time.Now().Add(cookieDeliveryWriteTimeout))

	conn, readWriter, err := hijacker.Hijack()
	if err != nil {
		if !w.delivery.finished.Load() {
			w.delivery.removeStagedCookies(w.Header())
			w.delivery.setCookies = nil
		}

		w.delivery.finish(false)
		setWriteDeadline(w.ResponseWriter, time.Time{})

		return conn, readWriter, err
	}

	_ = conn.SetWriteDeadline(time.Now().Add(cookieDeliveryWriteTimeout))
	commit := &hijackedCommitState{
		delivery: w.delivery,
		conn:     conn,
	}
	wrappedConn := &hijackedResponseConn{
		Conn:   conn,
		commit: commit,
	}
	writer := bufio.NewWriter(&hijackedCommitWriter{
		writer: readWriter.Writer,
		commit: commit,
	})

	return wrappedConn, bufio.NewReadWriter(readWriter.Reader, writer), nil
}

func (w *refreshResponseWriter) hijackAfterStatusCommit(
	hijacker http.Hijacker,
) (net.Conn, *bufio.ReadWriter, error) {
	prepareResponseDeliveryIO(w.ResponseWriter)
	w.commitStatus()

	if err := flushOptional(w.ResponseWriter); err != nil {
		w.delivery.finish(false)
		setWriteDeadline(w.ResponseWriter, time.Time{})

		return nil, nil, err
	}

	w.delivery.finish(true)
	setWriteDeadline(w.ResponseWriter, time.Time{})

	return hijacker.Hijack()
}

func (w *refreshResponseWriter) WriteHeader(statusCode int) {
	if statusCode >= 100 && statusCode < 200 && statusCode != http.StatusSwitchingProtocols {
		w.ResponseWriter.WriteHeader(statusCode)

		return
	}

	if w.headerWritten {
		return
	}

	if w.delivery.finished.Load() {
		if w.pendingStatus == 0 {
			w.pendingStatus = statusCode
		}

		w.commitStatus()

		return
	}

	if w.pendingStatus == 0 {
		w.pendingStatus = statusCode
		w.pendingHeader = w.Header().Clone()
	}
}

func (w *refreshResponseWriter) Flush() {
	_ = w.FlushError()
}

func (w *refreshResponseWriter) FlushError() error {
	valid := w.prepareCookies()
	if !valid {
		w.commitStatus()

		return flushOptional(w.ResponseWriter)
	}

	w.commitStatus()
	prepareResponseDeliveryIO(w.ResponseWriter)
	err := flushOptional(w.ResponseWriter)
	w.delivery.finish(err == nil)
	setWriteDeadline(w.ResponseWriter, time.Time{})

	return err
}

func (w *refreshResponseWriter) Write(payload []byte) (int, error) {
	valid := w.prepareCookies()
	if !valid {
		w.prepareContentType(payload)
		w.commitStatus()

		return w.ResponseWriter.Write(payload)
	}

	prepareResponseDeliveryIO(w.ResponseWriter)

	w.prepareContentType(payload)
	w.commitStatus()
	flushErr := flushOptional(w.ResponseWriter)
	w.delivery.finish(flushErr == nil && valid)
	setWriteDeadline(w.ResponseWriter, time.Time{})

	if flushErr != nil {
		return 0, flushErr
	}

	return w.ResponseWriter.Write(payload)
}

func (w *refreshResponseWriter) prepareContentType(payload []byte) {
	header := w.Header()
	if w.pendingHeader != nil {
		header = w.pendingHeader
	}

	if _, exists := header["Content-Type"]; exists {
		return
	}

	if header.Get("Content-Encoding") != "" {
		return
	}

	header.Set("Content-Type", http.DetectContentType(payload))
}

func (w *refreshResponseWriter) commitStatus() {
	if w.headerWritten {
		return
	}

	status := w.pendingStatus
	if status == 0 {
		status = http.StatusOK
	}

	header := w.Header()

	snapshot := w.pendingHeader
	if snapshot == nil {
		snapshot = header.Clone()
	}

	trailers := pendingTrailerValues(header, snapshot)
	resetHeader(header, snapshot)

	for _, staged := range w.delivery.setCookies {
		if !hasSetCookieName(header["Set-Cookie"], staged) {
			header.Add("Set-Cookie", staged)
		}
	}

	w.ResponseWriter.WriteHeader(status)
	w.headerWritten = true
	w.pendingStatus = 0
	w.pendingHeader = nil

	for name, values := range trailers {
		header.Del(name)

		for _, value := range values {
			header.Add(name, value)
		}
	}
}

func resetHeader(header, snapshot http.Header) {
	clear(header)

	for name, values := range snapshot {
		header[name] = append([]string(nil), values...)
	}
}

func pendingTrailerValues(current, snapshot http.Header) http.Header {
	trailers := make(http.Header)

	for name, values := range current {
		if strings.HasPrefix(name, http.TrailerPrefix) {
			trailers[name] = append([]string(nil), values...)
		}
	}

	for _, trailerLine := range snapshot.Values("Trailer") {
		for _, name := range strings.Split(trailerLine, ",") {
			name = http.CanonicalHeaderKey(strings.TrimSpace(name))
			if name == "" {
				continue
			}

			trailers[name] = append([]string(nil), current.Values(name)...)
		}
	}

	return trailers
}

func (w *refreshResponseWriter) prepareCookies() bool {
	if w.delivery.finished.Load() {
		return false
	}

	w.delivery.commitHeader = w.pendingHeader
	if w.delivery.commitHeader == nil {
		w.delivery.commitHeader = w.Header()
	}

	if w.ctx.Err() != nil {
		w.delivery.removeStagedCookies(w.Header())
		w.delivery.finish(false)

		return false
	}

	if w.delivery.locked {
		w.ensureStagedCookies()

		return true
	}

	if !tryLockDeliveryState(w.ctx, w.delivery.state) {
		w.delivery.removeStagedCookies(w.Header())

		return false
	}

	w.delivery.locked = true

	return w.claimLatestCookie()
}

func (w *refreshResponseWriter) claimLatestCookie() bool {
	latestResult := latestRefreshResult(
		w.delivery.result.chainID,
		w.delivery.result.cacheScope,
	)
	if latestResult != nil && latestResult.generation > w.delivery.result.generation {
		w.delivery.result = latestResult
	}

	claimKey := fmt.Sprintf(
		"%d\x00%s",
		w.delivery.result.generation,
		w.delivery.destination,
	)
	_, claimed := w.delivery.result.cookieClaims.LoadOrStore(claimKey, struct{}{})

	if !claimed && w.delivery.result.generation >= w.delivery.state.committedGeneration.Load() {
		w.delivery.acquired = true
		if err := w.stageLatestCookie(); err != nil {
			w.delivery.removeStagedCookies(w.Header())
			w.delivery.finish(false)

			return false
		}

		return true
	}

	w.delivery.removeStagedCookies(w.Header())
	w.delivery.finish(false)

	return false
}

func (w *refreshResponseWriter) stageLatestCookie() error {
	if w.delivery.stageLatest != nil {
		return w.delivery.stageLatest(w.delivery.result)
	}

	if w.delivery.stage != nil {
		return w.delivery.stage()
	}

	return nil
}

func tryLockDeliveryState(ctx context.Context, state *cookieDeliveryState) bool {
	select {
	case state.gate <- struct{}{}:
		return true
	case <-ctx.Done():
		return false
	}
}

func (d *cookieDelivery) removeStagedCookies(header http.Header) {
	values := header["Set-Cookie"]
	for _, staged := range d.setCookies {
		values = removeString(values, staged)
	}

	header["Set-Cookie"] = values
}

func containsString(values []string, candidate string) bool {
	for _, value := range values {
		if value == candidate {
			return true
		}
	}

	return false
}

func setCookieName(value string) string {
	name, _, _ := strings.Cut(value, "=")

	return strings.TrimSpace(name)
}

func hasSetCookieName(values []string, candidate string) bool {
	name := setCookieName(candidate)
	for _, value := range values {
		if setCookieName(value) == name {
			return true
		}
	}

	return false
}

type cookieHeaderWriter struct {
	header http.Header
}

func (w *cookieHeaderWriter) Header() http.Header {
	return w.header
}

func (w *cookieHeaderWriter) Write(payload []byte) (int, error) {
	return len(payload), nil
}

func (w *cookieHeaderWriter) WriteHeader(_ int) {}

func (w *refreshResponseWriter) ensureStagedCookies() {
	values := w.Header()["Set-Cookie"]
	for _, staged := range w.delivery.setCookies {
		if !containsString(values, staged) && !hasSetCookieName(values, staged) {
			w.Header().Add("Set-Cookie", staged)
			values = append(values, staged)
		}
	}
}

type hijackedCommitWriter struct {
	writer *bufio.Writer
	commit *hijackedCommitState
}

type hijackedCommitState struct {
	mu         sync.Mutex
	delivery   *cookieDelivery
	conn       net.Conn
	headers    []byte
	headerDone bool
}

func (w *hijackedCommitWriter) Write(payload []byte) (int, error) {
	written, err := w.writer.Write(payload)
	if err != nil {
		w.commit.delivery.finish(false)

		return written, err
	}

	if err := w.writer.Flush(); err != nil {
		w.commit.delivery.finish(false)

		return written, err
	}

	w.commit.observe(payload)

	return written, nil
}

type hijackedResponseConn struct {
	net.Conn
	commit *hijackedCommitState
}

func (c *hijackedResponseConn) Write(payload []byte) (int, error) {
	written, err := c.Conn.Write(payload)
	if err != nil {
		c.commit.delivery.finish(false)

		return written, err
	}

	c.commit.observe(payload[:written])

	return written, nil
}

func (s *hijackedCommitState) observe(payload []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.headerDone {
		return
	}

	s.headers = append(s.headers, payload...)
	if bytes.Contains(s.headers, []byte("\r\n\r\n")) {
		s.headerDone = true
		s.headers = nil
		s.delivery.finish(true)
		_ = s.conn.SetWriteDeadline(time.Time{})
	}
}

func setWriteDeadline(writer http.ResponseWriter, deadline time.Time) {
	_ = http.NewResponseController(writer).SetWriteDeadline(deadline)
}

func prepareResponseDeliveryIO(writer http.ResponseWriter) {
	controller := http.NewResponseController(writer)
	_ = controller.EnableFullDuplex()
	_ = controller.SetWriteDeadline(time.Now().Add(cookieDeliveryWriteTimeout))
}

func flushOptional(writer http.ResponseWriter) error {
	err := http.NewResponseController(writer).Flush()
	if errors.Is(err, http.ErrNotSupported) {
		return nil
	}

	return err
}

func cookieDeliveryKey(chainID, destination string, cacheScopes ...any) string {
	if len(cacheScopes) > 0 && cacheScopes[0] != nil {
		return fmt.Sprintf("%T:%p\x00%s\x00%s", cacheScopes[0], cacheScopes[0], chainID, destination)
	}

	return chainID + "\x00" + destination
}

func removeString(values []string, remove string) []string {
	for i, value := range values {
		if value == remove {
			return append(values[:i], values[i+1:]...)
		}
	}

	return values
}

func getNewToken(clientID, clientSecret string, tokenCache cache.Cache[interface{}],
	tokenType string, token string, tokenURL string, ctx context.Context, sessionTTL time.Duration,
) (*tokenRefreshResult, error) {
	key := refreshFlightKey(tokenCache, clientID, clientSecret, tokenType, token, tokenURL)

	return awaitSharedRefresh(ctx, key, func(refreshCtx context.Context) (*tokenRefreshResult, error) {
		return refreshTokenFromIDP(
			refreshCtx,
			clientID,
			clientSecret,
			tokenCache,
			tokenType,
			token,
			tokenURL,
			sessionTTL,
			refreshChainID(refreshCtx, tokenCache, token),
		)
	})
}

func awaitSharedRefresh(
	ctx context.Context,
	key string,
	refresh func(context.Context) (*tokenRefreshResult, error),
) (*tokenRefreshResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	resultCh := refreshGroup.DoChan(key, func() (interface{}, error) {
		// Detach from the caller's context so that one request's cancellation (e.g.
		// the client disconnecting) doesn't abort the shared refresh that other
		// concurrent requests for the same token are waiting on. Bound it with its
		// own timeout so a hung IdP can't block waiting callers indefinitely.
		//
		// Created here, inside the singleflight closure, so it's allocated exactly
		// once per in-flight refresh rather than once per waiting caller.
		refreshCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), refreshTimeout)
		defer cancel()

		return refresh(refreshCtx)
	})

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case result := <-resultCh:
		if result.Err != nil {
			return nil, result.Err
		}

		refreshed, ok := result.Val.(*tokenRefreshResult)
		if !ok {
			return nil, fmt.Errorf("unexpected refresh result type %T", result.Val)
		}

		return refreshed, nil
	}
}

func refreshChainID(ctx context.Context, tokenCache cache.Cache[interface{}], token string) string {
	cachedChain, err := tokenCache.Get(ctx, refreshChainKeyPrefix+token)
	if err != nil {
		return token
	}

	chainID, ok := cachedChain.(string)
	if !ok || chainID == "" {
		return token
	}

	return chainID
}

// refreshTokenFromIDP performs the actual refresh-token exchange with the IdP
// and updates the token cache. It is only ever invoked once per in-flight
// token, via refreshGroup in GetNewToken, even when multiple goroutines call
// GetNewToken concurrently for the same token.
//
// The very first thing it does is check whether this old token was already
// refreshed by an earlier, now-completed singleflight call for the same key.
// That check has to live here, inside the singleflight execution, rather than
// in GetNewToken before calling refreshGroup.Do: checking there would leave a
// window between the check and the Do call where a concurrent refresh could
// complete, so a late caller could still retry the exchange with a refresh
// token the IdP already rotated out.
func refreshTokenFromIDP(ctx context.Context, clientID, clientSecret string, tokenCache cache.Cache[interface{}],
	tokenType, token, tokenURL string, sessionTTL time.Duration, chainID string,
	flightScopes ...string,
) (*tokenRefreshResult, error) {
	cachedResult, successor, err := recentRefreshResult(ctx, tokenCache, tokenType, token)
	if err != nil {
		return nil, err
	}

	if cachedResult != nil {
		return cachedResult, nil
	}

	if successor != "" {
		return refreshSuccessorToken(
			ctx,
			clientID,
			clientSecret,
			tokenCache,
			tokenType,
			successor,
			tokenURL,
			sessionTTL,
			chainID,
			flightScopes...,
		)
	}

	// get refresh token
	refreshToken, err := tokenCache.Get(ctx, oidcKeyPrefix+token)
	if err != nil {
		return nil, fmt.Errorf("getting refresh token: %w", err)
	}

	rToken, ok := refreshToken.(string)
	if !ok {
		return nil, fmt.Errorf("failed to get refresh token")
	}

	newToken, err := exchangeRefreshToken(ctx, clientID, clientSecret, tokenURL, rToken)
	if err != nil {
		return nil, err
	}

	return retainAndCacheRefreshedToken(
		ctx,
		newToken,
		tokenCache,
		tokenType,
		token,
		rToken,
		sessionTTL,
		chainID,
	)
}

func retainAndCacheRefreshedToken(
	ctx context.Context,
	newToken *oauth2.Token,
	tokenCache cache.Cache[interface{}],
	tokenType, token, refreshToken string,
	sessionTTL time.Duration, chainID string,
) (*tokenRefreshResult, error) {
	newAuthToken := oauthTokenValue(newToken, tokenType)
	if newAuthToken == "" && tokenType == "id_token" {
		newAuthToken = token
	}

	retainedToken, err := retainIDTokenForRefreshedToken(
		ctx,
		newToken,
		token,
		newAuthToken,
		tokenCache,
		sessionTTL,
	)
	if err != nil {
		return nil, fmt.Errorf("retaining refreshed ID token: %w", err)
	}

	// Update the refresh token cache after determining the effective authentication
	// token, since providers may omit id_token in refresh responses.
	if err := CacheRefreshedToken(retainedToken, tokenType, token, refreshToken, tokenCache); err != nil {
		return nil, fmt.Errorf("caching refreshed token: %w", err)
	}

	if newAuthToken != token {
		if err := tokenCache.UpdateTTL(ctx, oidcIDTokenKeyPrefix+token, oldTokenTTL); err != nil &&
			!errors.Is(err, cache.ErrNotFound) {
			return nil, fmt.Errorf("retaining previous cached ID token: %w", err)
		}
	}

	// Remember the outcome of this refresh under the old token for a short
	// grace period, so a request that checked the old token before this
	// refresh happened but only reaches GetNewToken afterwards reuses this
	// result instead of retrying the exchange with a now-stale refresh token.
	result := &tokenRefreshResult{
		token:        retainedToken,
		cookieClaims: &sync.Map{},
		chainID:      chainID,
		generation:   refreshGeneration.Add(1),
		sourceToken:  token,
		cacheScope:   cacheScopeOf(tokenCache),
	}
	recordLatestRefreshResult(chainID, result)

	if err := cacheRefreshChain(
		ctx,
		tokenCache,
		token,
		newAuthToken,
		chainID,
		sessionTTL,
	); err != nil {
		return nil, err
	}

	cacheRefreshOutcome(ctx, tokenCache, token, result)
	cacheRecoveryOutcome(ctx, tokenCache, token, result, sessionTTL)

	return result, nil
}

func cacheRecoveryOutcome(
	ctx context.Context,
	tokenCache cache.Cache[interface{}],
	token string,
	result *tokenRefreshResult,
	ttl time.Duration,
) {
	if ttl <= 0 {
		ttl = defaultIDTokenTTL
	}

	gate := result.cookieRecoveryGate()
	gate.Lock()
	defer gate.Unlock()

	if err := tokenCache.SetWithTTL(ctx, recoveryTokenKeyPrefix+token, result, ttl); err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to cache refresh recovery outcome")
	}

	recoveryKey := recoveryTokenKeyPrefix + token
	result.recoveryRetirementKeys().Delete(recoveryKey)
	result.sharedRecoveryAliasKeys().Store(recoveryKey, struct{}{})

	if destination, ok := ctx.Value(refreshCookieIntentKey{}).(string); ok {
		result.markPendingCookieDeliveryLocked(destination, result.sourceToken)
	}

	if !result.hasPendingCookieDeliveryLocked() {
		result.retireRecoveryLocked(tokenCache, recoveryKey)
	}
}

type refreshCookieIntentKey struct{}

func cacheRefreshChain(
	ctx context.Context,
	tokenCache cache.Cache[interface{}],
	oldToken, newToken, chainID string,
	sessionTTL time.Duration,
) error {
	chainTTL := sessionTTL
	if chainTTL <= 0 {
		chainTTL = defaultIDTokenTTL
	}

	if err := tokenCache.SetWithTTL(
		ctx,
		refreshChainKeyPrefix+newToken,
		chainID,
		chainTTL,
	); err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to cache refresh chain")
	}

	if newToken == oldToken {
		return nil
	}

	if err := tokenCache.UpdateTTL(ctx, refreshChainKeyPrefix+oldToken, oldTokenTTL); err != nil &&
		!errors.Is(err, cache.ErrNotFound) {
		return fmt.Errorf("retiring previous refresh chain: %w", err)
	}

	return nil
}

func recentRefreshResult(
	ctx context.Context,
	tokenCache cache.Cache[interface{}],
	tokenType, token string,
) (*tokenRefreshResult, string, error) {
	cached, err := tokenCache.Get(ctx, refreshedTokenKeyPrefix+token)
	if err != nil {
		return nil, "", nil
	}

	var cachedResult *tokenRefreshResult

	switch cachedValue := cached.(type) {
	case *tokenRefreshResult:
		cachedResult = cachedValue
	case *oauth2.Token:
		cachedResult = &tokenRefreshResult{
			token:        cachedValue,
			cookieClaims: &sync.Map{},
			chainID:      token,
			generation:   refreshGeneration.Add(1),
		}
	default:
		return nil, "", nil
	}

	if refreshedTokenIsValid(cachedResult.token, tokenType) {
		return cachedResult, "", nil
	}

	successor := oauthTokenValue(cachedResult.token, tokenType)
	if successor != "" && successor != token {
		return nil, successor, nil
	}

	if err := tokenCache.Delete(ctx, refreshedTokenKeyPrefix+token); err != nil &&
		!errors.Is(err, cache.ErrNotFound) {
		return nil, "", fmt.Errorf("deleting expired refreshed token: %w", err)
	}

	return nil, "", nil
}

func refreshSuccessorToken(ctx context.Context, clientID, clientSecret string, tokenCache cache.Cache[interface{}],
	tokenType, token, tokenURL string, sessionTTL time.Duration, chainID string,
	flightScopes ...string,
) (*tokenRefreshResult, error) {
	flightScope := tokenURL
	if len(flightScopes) > 0 {
		flightScope = flightScopes[0]
	}

	key := refreshFlightKey(tokenCache, clientID, clientSecret, tokenType, token, flightScope)

	return awaitSharedRefresh(ctx, key, func(refreshCtx context.Context) (*tokenRefreshResult, error) {
		return refreshTokenFromIDP(
			refreshCtx,
			clientID,
			clientSecret,
			tokenCache,
			tokenType,
			token,
			tokenURL,
			sessionTTL,
			chainID,
			flightScope,
		)
	})
}

func refreshedTokenIsValid(token *oauth2.Token, tokenType string) bool {
	if tokenType == "id_token" {
		idToken := oauthTokenValue(token, tokenType)

		parts := strings.SplitN(idToken, ".", 3)
		if len(parts) == 3 {
			payload, err := DecodeBase64JSON(parts[1])
			if err == nil {
				expiry, err := GetExpiryUnixTimeUTC(payload)
				return err == nil && time.Now().Before(expiry)
			}
		}
	}

	return token.Valid()
}

func cacheRefreshOutcome(
	ctx context.Context,
	tokenCache cache.Cache[interface{}],
	token string,
	refreshedResult *tokenRefreshResult,
) {
	if err := tokenCache.SetWithTTL(
		ctx,
		refreshedTokenKeyPrefix+token,
		refreshedResult,
		oldTokenTTL,
	); err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to cache refresh outcome")
	}
}

func exchangeRefreshToken(
	ctx context.Context,
	clientID, clientSecret, tokenURL, refreshToken string,
) (*oauth2.Token, error) {
	conf := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint: oauth2.Endpoint{
			TokenURL: tokenURL,
		},
	}

	return conf.TokenSource(ctx, &oauth2.Token{RefreshToken: refreshToken}).Token()
}

// ConfigureTLSContext configures TLS settings for the HTTP client in the context.
// When skipTLSVerify is true, a client that skips verification is installed.
// When caCert is provided, a client with that CA pool is installed and takes precedence,
// re-enabling verification while trusting the supplied certificate bundle.
func ConfigureTLSContext(ctx context.Context, skipTLSVerify *bool, caCert *string) context.Context {
	if skipTLSVerify != nil && *skipTLSVerify {
		ctx = configureTLSClientContext(ctx, func(config *tls.Config) {
			config.InsecureSkipVerify = true
		})
	}

	if caCert != nil && *caCert != "" {
		caCertPool := x509.NewCertPool()
		if !caCertPool.AppendCertsFromPEM([]byte(*caCert)) {
			logger.Log(logger.LevelError, nil,
				errors.New("failed to append ca cert to pool"), "couldn't add custom cert to context")

			return ctx
		}

		ctx = configureTLSClientContext(ctx, func(config *tls.Config) {
			config.RootCAs = caCertPool
			config.InsecureSkipVerify = false
		})
	}

	return ctx
}

func configureTLSClientContext(
	ctx context.Context, configure func(*tls.Config),
) context.Context {
	base, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		logger.Log(logger.LevelError, nil,
			errors.New("http.DefaultTransport is not *http.Transport"),
			"failed to configure TLS transport")

		return ctx
	}

	transport := base.Clone()

	config := &tls.Config{MinVersion: tls.VersionTLS12}
	if base.TLSClientConfig != nil {
		config = base.TLSClientConfig.Clone()
	}

	configure(config)
	transport.TLSClientConfig = config

	return oidc.ClientContext(ctx, &http.Client{Transport: transport})
}

// WithClientTimeout returns a context whose HTTP client, the one oidc.ClientContext stores,
// has the given timeout. It copies the client already in ctx (for example the one
// ConfigureTLSContext installed) or http.DefaultClient, keeps its Transport and leaves the
// original untouched. The timeout is on the client and not on the context because the
// context can outlive the request that created it. Call it after the client is configured.
func WithClientTimeout(ctx context.Context, timeout time.Duration) context.Context {
	client := http.DefaultClient
	if existing, ok := ctx.Value(oauth2.HTTPClient).(*http.Client); ok && existing != nil {
		client = existing
	}

	clientWithTimeout := *client
	clientWithTimeout.Timeout = timeout

	return oidc.ClientContext(ctx, &clientWithTimeout)
}

// RefreshAndCacheNewToken obtains a fresh OIDC token using the cached refresh token
// and re-populates the cache so subsequent requests can reuse it. The provided ctx
// controls cancellation and deadlines for all outbound requests during the refresh.
// validatorIssuerURL overrides the issuer expected by provider discovery when the
// discovery URL and returned issuer differ.
func RefreshAndCacheNewToken(ctx context.Context, oidcAuthConfig *kubeconfig.OidcConfig,
	cache cache.Cache[interface{}],
	tokenType, token, issuerURL, validatorIssuerURL string,
	sessionTTL time.Duration,
) (*oauth2.Token, error) {
	result, err := refreshAndCacheNewToken(
		ctx,
		oidcAuthConfig,
		cache,
		tokenType,
		token,
		issuerURL,
		validatorIssuerURL,
		sessionTTL,
	)
	if err != nil {
		return nil, err
	}

	return result.token, nil
}

func refreshAndCacheNewToken(ctx context.Context, oidcAuthConfig *kubeconfig.OidcConfig,
	cache cache.Cache[interface{}],
	tokenType, token, issuerURL, validatorIssuerURL string,
	sessionTTL time.Duration,
) (*tokenRefreshResult, error) {
	ctx = ConfigureTLSContext(ctx, oidcAuthConfig.SkipTLSVerify, oidcAuthConfig.CACert)

	if validatorIssuerURL != "" {
		ctx = oidc.InsecureIssuerURLContext(ctx, validatorIssuerURL)
	}

	key := refreshFlightKey(
		cache,
		oidcAuthConfig.ClientID,
		oidcAuthConfig.ClientSecret,
		tokenType,
		token,
		issuerURL,
	)

	return awaitSharedRefresh(ctx, key, func(refreshCtx context.Context) (*tokenRefreshResult, error) {
		result, err := refreshTokenAfterCache(
			refreshCtx,
			oidcAuthConfig,
			cache,
			tokenType,
			token,
			issuerURL,
			sessionTTL,
		)
		if err != nil {
			chainID, _ := pendingCookieRefreshChain(refreshCtx, cache, tokenType, token)
			abandonFailedPendingCookieDelivery(chainID, cacheScopeOf(cache))
		}

		return result, err
	})
}

func refreshFlightKey(
	tokenCache cache.Cache[interface{}],
	clientID, clientSecret, tokenType, token, endpoint string,
) string {
	key := fmt.Sprintf(
		"%T:%p\x00%s\x00%s\x00%s\x00%s\x00%s",
		tokenCache,
		tokenCache,
		clientID,
		clientSecret,
		tokenType,
		token,
		endpoint,
	)

	return fmt.Sprintf("%x", sha256.Sum256([]byte(key)))
}

func refreshTokenAfterCache(
	ctx context.Context,
	oidcAuthConfig *kubeconfig.OidcConfig,
	tokenCache cache.Cache[interface{}],
	tokenType, token, issuerURL string,
	sessionTTL time.Duration,
) (*tokenRefreshResult, error) {
	cachedResult, _, err := recentRefreshResult(ctx, tokenCache, tokenType, token)
	if err != nil {
		return nil, fmt.Errorf("getting recent refresh: %w", err)
	}

	if cachedResult != nil {
		return cachedResult, nil
	}

	recoveryResult, recoverySuccessor := recoveryRefreshResult(ctx, tokenCache, tokenType, token)
	if recoveryResult != nil && recoverySuccessor == "" {
		return recoveryResult, nil
	}

	chainID := refreshChainID(ctx, tokenCache, token)
	if recoveryResult != nil {
		chainID = recoveryResult.chainID
	}

	provider, err := oidc.NewProvider(ctx, issuerURL)
	if err != nil {
		return nil, fmt.Errorf("getting provider: %w", err)
	}

	refreshToken := recoverySuccessor
	if refreshToken == "" {
		refreshToken = token
	}

	return refreshProviderToken(
		ctx,
		oidcAuthConfig,
		tokenCache,
		tokenType,
		token,
		refreshToken,
		provider.Endpoint().TokenURL,
		sessionTTL,
		chainID,
		issuerURL,
	)
}

func refreshProviderToken(
	ctx context.Context,
	oidcAuthConfig *kubeconfig.OidcConfig,
	tokenCache cache.Cache[interface{}],
	tokenType, token, refreshToken, tokenURL string,
	sessionTTL time.Duration,
	chainID string,
	flightScopes ...string,
) (*tokenRefreshResult, error) {
	var result *tokenRefreshResult

	var err error

	if refreshToken != token {
		result, err = refreshSuccessorToken(
			ctx,
			oidcAuthConfig.ClientID,
			oidcAuthConfig.ClientSecret,
			tokenCache,
			tokenType,
			refreshToken,
			tokenURL,
			sessionTTL,
			chainID,
			flightScopes...,
		)
	} else {
		result, err = refreshTokenFromIDP(
			ctx,
			oidcAuthConfig.ClientID,
			oidcAuthConfig.ClientSecret,
			tokenCache,
			tokenType,
			token,
			tokenURL,
			sessionTTL,
			chainID,
			flightScopes...,
		)
	}

	if err != nil {
		return nil, fmt.Errorf("refreshing token: %w", err)
	}

	return result, nil
}

func recoveryRefreshResult(
	ctx context.Context,
	tokenCache cache.Cache[interface{}],
	tokenType, token string,
) (*tokenRefreshResult, string) {
	cached, err := tokenCache.Get(ctx, recoveryTokenKeyPrefix+token)
	if err != nil {
		return nil, ""
	}

	result, ok := cached.(*tokenRefreshResult)
	if !ok || result == nil {
		return nil, ""
	}

	if latest := latestRefreshResult(result.chainID, cacheScopeOf(tokenCache)); latest != nil &&
		latest.generation > result.generation {
		result = latest
	}

	if refreshedTokenIsValid(result.token, tokenType) {
		return result, ""
	}

	return result, oauthTokenValue(result.token, tokenType)
}

func pendingCookieRefreshChain(
	ctx context.Context,
	tokenCache cache.Cache[interface{}],
	tokenType, token string,
) (string, bool) {
	lookupCtx := context.WithoutCancel(ctx)
	chainID := refreshChainID(lookupCtx, tokenCache, token)
	trusted := false

	if recovery, _ := recoveryRefreshResult(lookupCtx, tokenCache, tokenType, token); recovery != nil {
		chainID = recovery.chainID
		trusted = true
	}

	if _, err := tokenCache.Get(lookupCtx, oidcKeyPrefix+token); err == nil {
		trusted = true
	}

	if _, err := tokenCache.Get(lookupCtx, refreshedTokenKeyPrefix+token); err == nil {
		trusted = true
	}

	return chainID, trusted
}

type MeHandlerOptions struct {
	// UsernamePaths is a list of JMESPath expressions to resolve the username claim.
	UsernamePaths string
	// EmailPaths is a list of JMESPath expressions to resolve the email claim.
	EmailPaths string
	// GroupsPaths is a list of JMESPath expressions to resolve group memberships.
	GroupsPaths string
	// UserInfoURL is the URL to fetch additional user info for the /me endpoint.
	UserInfoURL string
	// BaseURL is the path Headlamp is served under, if any.
	BaseURL string
	// ProxyAuthEnabled indicates if the identity proxy bypass is enabled
	ProxyAuthEnabled        bool
	ProxyAuthUsernameHeader string
	ProxyAuthGroupHeader    string
	ProxyAuthEmailHeader    string
}

// HandleMe returns a handler that reads the per-cluster auth cookie and responds with user info.
func HandleMe(opts MeHandlerOptions) http.HandlerFunc {
	usernamePaths, emailPaths, groupsPaths, userInfoURL := cfg.ApplyMeDefaults(
		opts.UsernamePaths,
		opts.EmailPaths,
		opts.GroupsPaths,
		opts.UserInfoURL,
	)
	compiledUsernamePaths := compileJMESPaths(usernamePaths)
	compiledEmailPaths := compileJMESPaths(emailPaths)
	compiledGroupsPaths := compileJMESPaths(groupsPaths)

	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := mux.Vars(r)["clusterName"]
		if clusterName == "" {
			writeMeJSON(w, http.StatusBadRequest, map[string]interface{}{errFieldMessage: "cluster not specified"})
			return
		}

		if tryProxyAuth(w, r, opts, userInfoURL) {
			return
		}

		requestCluster, token := ParseClusterAndTokenWithBaseURL(r, opts.BaseURL)

		if requestCluster == "" {
			requestCluster = clusterName
		}

		if requestCluster != clusterName {
			writeMeJSON(w, http.StatusBadRequest, map[string]interface{}{errFieldMessage: "cluster mismatch"})
			return
		}

		if token == "" {
			writeMeJSON(w, http.StatusUnauthorized, map[string]interface{}{errFieldMessage: "unauthorized"})
			return
		}

		claims, status, errMsg := parseClaimsFromToken(token)
		if status != 0 {
			writeMeJSON(w, status, map[string]interface{}{errFieldMessage: errMsg})
			return
		}

		if expiry, err := GetExpiryUnixTimeUTC(claims); err != nil || time.Now().After(expiry) {
			writeMeJSON(w, http.StatusUnauthorized, map[string]interface{}{errFieldMessage: "token expired"})
			return
		}

		username := stringValueFromJMESPaths(claims, compiledUsernamePaths)
		email := stringValueFromJMESPaths(claims, compiledEmailPaths)
		groups := stringSliceFromJMESPaths(claims, compiledGroupsPaths)

		writeMeResponse(w, username, email, groups, userInfoURL)
	}
}

// parseClaimsFromToken extracts the JWT claims from a token.
func parseClaimsFromToken(token string) (map[string]interface{}, int, string) {
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 || parts[1] == "" {
		return nil, http.StatusUnauthorized, "invalid token"
	}

	claims, err := DecodeBase64JSON(parts[1])
	if err != nil {
		return nil, http.StatusUnauthorized, "invalid token claims"
	}

	return claims, 0, ""
}

// tryProxyAuth checks if proxy auth is enabled and a proxy user header exists.
// If valid, it writes the response and returns true, allowing the caller to return early.
// Otherwise, it returns false.
func tryProxyAuth(w http.ResponseWriter, r *http.Request, opts MeHandlerOptions, userInfoURL string) bool {
	if !opts.ProxyAuthEnabled {
		return false
	}

	username := r.Header.Get(opts.ProxyAuthUsernameHeader)
	if username == "" {
		return false
	}

	email := r.Header.Get(opts.ProxyAuthEmailHeader)
	groupsRaw := r.Header.Get(opts.ProxyAuthGroupHeader)

	var groups []string

	if groupsRaw != "" {
		for _, group := range strings.Split(groupsRaw, ",") {
			group = strings.TrimSpace(group)
			if group != "" {
				groups = append(groups, group)
			}
		}
	}

	writeMeResponse(w, username, email, groups, userInfoURL)

	return true
}

// writeMeResponse writes the successful response for HandleMe with the standard cache-busting headers.
func writeMeResponse(w http.ResponseWriter, username, email string, groups []string, userInfoURL string) {
	writeMeJSON(w, http.StatusOK, map[string]interface{}{
		"username":    username,
		"email":       email,
		"groups":      groups,
		"userInfoURL": userInfoURL,
	})
}

// writeMeJSON sets the standard cache-control headers used by /me responses and writes the JSON payload.
func writeMeJSON(w http.ResponseWriter, status int, payload map[string]interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, private")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Vary", "Cookie")
	w.Header().Del("ETag")

	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to encode me response")
	}
}

// stringValueFromJMESPaths iterates pre-compiled JMESPath expressions and returns the first string result.
func stringValueFromJMESPaths(payload map[string]interface{}, paths []*jmespath.JMESPath) string {
	for _, expr := range paths {
		res, err := expr.Search(payload)
		if err != nil || res == nil {
			continue
		}

		switch v := res.(type) {
		case string:
			if v != "" {
				return v
			}
		case fmt.Stringer:
			vs := v.String()
			if vs != "" {
				return vs
			}
		case float64:
			return fmt.Sprintf("%v", v)
		case int64:
			return fmt.Sprintf("%v", v)
		case map[string]interface{}:
			if encoded, ok := marshalToString(v); ok && encoded != "" {
				return encoded
			}
		}
	}

	return ""
}

// stringSliceFromJMESPaths iterates pre-compiled JMESPath expressions and returns the first []string result.
func stringSliceFromJMESPaths(payload map[string]interface{}, paths []*jmespath.JMESPath) []string {
	for _, expr := range paths {
		res, err := expr.Search(payload)
		if err != nil || res == nil {
			continue
		}

		switch v := res.(type) {
		case []interface{}:
			out := make([]string, 0, len(v))

			for _, it := range v {
				switch s := it.(type) {
				case string:
					out = append(out, s)
				case float64:
					out = append(out, fmt.Sprintf("%v", s))
				case int64:
					out = append(out, fmt.Sprintf("%v", s))
				default:
					if encoded, ok := marshalToString(it); ok && encoded != "" {
						out = append(out, encoded)
					}
				}
			}

			return out
		case []string:
			return v
		case string:
			// The API server accepts a groups claim that is a single string,
			// so treat it as one group rather than dropping it.
			if v != "" {
				return []string{v}
			}
		}
	}

	return []string{}
}

// compileJMESPaths parses and compiles a list of JMESPath expressions once.
func compileJMESPaths(pathCSV string) []*jmespath.JMESPath {
	if strings.TrimSpace(pathCSV) == "" {
		return []*jmespath.JMESPath{}
	}

	rawPaths := strings.Split(pathCSV, ",")
	compiled := make([]*jmespath.JMESPath, 0, len(rawPaths))

	for _, raw := range rawPaths {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}

		expr, err := jmespath.Compile(raw)
		if err != nil {
			logger.Log(logger.LevelWarn, map[string]string{"jmespath": raw}, err,
				"failed to compile JMESPath expression, skipping")

			continue
		}

		compiled = append(compiled, expr)
	}

	return compiled
}

// marshalToString encodes the provided value as JSON and logs failures.
func marshalToString(val interface{}) (string, bool) {
	b, err := json.Marshal(val)
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "failed to marshal value to JSON string")
		return "", false
	}

	return string(b), true
}

// RefreshAndSetTokenParams groups the inputs required to refresh a token and
// update the Headlamp auth cookie.
type RefreshAndSetTokenParams struct {
	Ctx                       context.Context
	OIDCAuthConfig            *kubeconfig.OidcConfig
	Cache                     cache.Cache[interface{}]
	Token                     string
	Cluster                   string
	Span                      trace.Span
	Writer                    http.ResponseWriter
	Request                   *http.Request
	TelemetryHandler          *telemetry.RequestHandler
	OIDCUseAccessToken        bool
	OIDCIdpIssuerURL          string
	OIDCValidatorIdpIssuerURL string
	BaseURL                   string
	SessionTTL                int
}

func setRefreshedIDTokenCookie(
	params RefreshAndSetTokenParams,
	newToken *oauth2.Token,
	authToken string,
) {
	refreshedIDToken, _ := newToken.Extra("id_token").(string)
	if refreshedIDToken == "" && !params.OIDCUseAccessToken {
		refreshedIDToken = authToken
	}

	if refreshedIDToken == "" {
		return
	}

	if err := SetIDTokenCookie(
		params.Writer,
		params.Request,
		params.Cluster,
		refreshedIDToken,
		params.BaseURL,
		params.SessionTTL,
	); err != nil {
		logger.Log(logger.LevelWarn, map[string]string{clusterLogField: params.Cluster},
			err, "failed to retain refreshed ID token for provider logout")
	}
}

func refreshedTokenString(newToken *oauth2.Token, useAccessToken bool) (string, error) {
	if useAccessToken {
		if newToken.AccessToken != "" {
			return newToken.AccessToken, nil
		}
	} else if idToken, ok := newToken.Extra("id_token").(string); ok && idToken != "" {
		return idToken, nil
	}

	return "", errors.New("refreshed token missing expected field")
}

func stageRefreshCookies(
	params RefreshAndSetTokenParams,
	newToken *oauth2.Token,
	newTokenString string,
	delivery *cookieDelivery,
) func() error {
	return func() error {
		stagedWriter := &cookieHeaderWriter{header: make(http.Header)}
		stagedParams := params
		stagedParams.Writer = stagedWriter

		if err := SetTokenCookie(
			stagedWriter,
			params.Request,
			params.Cluster,
			newTokenString,
			params.BaseURL,
			params.SessionTTL,
		); err != nil {
			logger.Log(logger.LevelError, map[string]string{clusterLogField: params.Cluster},
				err, "failed to retain refreshed authentication token")
			params.TelemetryHandler.RecordError(params.Span, err, "Refreshed token cookie storage failed")

			return err
		}

		setRefreshedIDTokenCookie(stagedParams, newToken, newTokenString)

		commitHeader := responseCommitHeader(params.Writer)
		if delivery.commitHeader != nil {
			commitHeader = delivery.commitHeader
		}

		currentCookies := commitHeader["Set-Cookie"]
		for _, staged := range stagedWriter.Header()["Set-Cookie"] {
			if !hasSetCookieName(currentCookies, staged) {
				params.Writer.Header().Add("Set-Cookie", staged)
				currentCookies = append(currentCookies, staged)
				delivery.setCookies = append(delivery.setCookies, staged)
			}
		}

		return nil
	}
}

func responseCommitHeader(writer http.ResponseWriter) http.Header {
	if refreshWriter, ok := writer.(*refreshResponseWriter); ok && refreshWriter.pendingHeader != nil {
		return refreshWriter.pendingHeader
	}

	return writer.Header()
}

func deliverRefreshCookiesNow(params RefreshAndSetTokenParams, delivery *cookieDelivery) bool {
	writer := &refreshResponseWriter{
		ResponseWriter: params.Writer,
		delivery:       delivery,
		ctx:            params.Ctx,
	}
	if !writer.prepareCookies() {
		delivery.finish(false)

		return false
	}

	delivery.finish(true)

	return true
}

func canDeliverRefreshCookie(params RefreshAndSetTokenParams) bool {
	if params.Request.Header.Get("Authorization") == "" {
		return true
	}

	tokenCookie, err := GetTokenFromCookie(params.Request, params.Cluster)

	return err == nil && tokenCookie != ""
}

func restorePendingCookieRecovery(
	params RefreshAndSetTokenParams,
	result *tokenRefreshResult,
	recoveryKey, destination string,
) {
	gate := result.cookieRecoveryGate()
	gate.Lock()
	defer gate.Unlock()

	result.markPendingCookieDeliveryLocked(destination, params.Token)

	if !result.hasPendingCookieDeliveryLocked() {
		return
	}

	ttl := time.Duration(params.SessionTTL) * time.Second
	if ttl <= 0 {
		ttl = defaultIDTokenTTL
	}

	ctx := context.WithoutCancel(params.Ctx)
	if err := params.Cache.SetWithTTL(ctx, recoveryKey, result, ttl); err == nil {
		result.recoveryRetirementKeys().Delete(recoveryKey)
	}
}

// RefreshAndSetToken refreshes an expiring token, updates the auth cookie,
// and records telemetry based on the provided parameters.
func RefreshAndSetToken(params RefreshAndSetTokenParams) {
	_ = refreshAndSetToken(params, false)
}

//nolint:funlen // Coordinates refresh, request identity, and deferred cookie delivery.
func refreshAndSetToken(params RefreshAndSetTokenParams, deferDelivery bool) *cookieDelivery {
	// The token type to use
	tokenType := "id_token"
	if params.OIDCUseAccessToken {
		tokenType = "access_token"
	}

	idpIssuerURL := params.OIDCIdpIssuerURL
	if idpIssuerURL == "" {
		idpIssuerURL = params.OIDCAuthConfig.IdpIssuerURL
	}

	cookieDestination := params.Cluster + "\x00" + params.BaseURL

	claimCookie := canDeliverRefreshCookie(params)
	pendingChainID := ""
	pendingRegistered := false

	if claimCookie {
		chainID, trusted := pendingCookieRefreshChain(params.Ctx, params.Cache, tokenType, params.Token)
		if trusted {
			recordPendingCookieDelivery(
				chainID,
				cookieDestination,
				params.Token,
				cacheScopeOf(params.Cache),
			)
			pendingChainID = chainID
			pendingRegistered = true

			if result := latestRefreshResult(chainID, cacheScopeOf(params.Cache)); result != nil &&
				result.sourceToken == params.Token {
				restorePendingCookieRecovery(
					params,
					result,
					recoveryTokenKeyPrefix+params.Token,
					cookieDestination,
				)
			}
		}

		params.Ctx = context.WithValue(params.Ctx, refreshCookieIntentKey{}, cookieDestination)
	}

	refreshResult, err := refreshAndCacheNewToken(
		params.Ctx,
		params.OIDCAuthConfig,
		params.Cache,
		tokenType,
		params.Token,
		idpIssuerURL,
		params.OIDCValidatorIdpIssuerURL,
		time.Duration(params.SessionTTL)*time.Second,
	)
	if err != nil {
		if pendingRegistered {
			abandonPendingCookieIntent(
				pendingChainID,
				cookieDestination,
				params.Token,
				cacheScopeOf(params.Cache),
			)
		}

		logger.Log(logger.LevelError, map[string]string{clusterLogField: params.Cluster},
			err, "failed to refresh token")
		params.TelemetryHandler.RecordError(params.Span, err, "Token refresh failed")
		params.TelemetryHandler.RecordErrorCount(params.Ctx, attribute.String("error", "token_refresh_failure"))

		return nil
	}

	if refreshResult == nil || refreshResult.token == nil {
		return nil
	}

	newToken := refreshResult.token

	newTokenString, err := refreshedTokenString(newToken, params.OIDCUseAccessToken)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{clusterLogField: params.Cluster},
			err, "failed to extract token string")
		params.TelemetryHandler.RecordError(params.Span, err, "Token extraction failed")

		return nil
	}

	// Every caller uses the refreshed credential even if another response owns
	// cookie delivery.
	params.Request.Header.Set("Authorization", "Bearer "+newTokenString)

	var delivery *cookieDelivery

	claimedDelivery, claimed := refreshResult.claimCookieWrite(
		params.Ctx,
		cookieDestination,
		claimCookie,
	)
	delivery = claimedDelivery

	recoveryKey := recoveryTokenKeyPrefix + params.Token
	if delivery != nil {
		delivery.recovery = params.Cache
		delivery.recoveryKey = recoveryKey
	}

	if !claimCookie {
		refreshResult.retireRecoveryIfIdle(params.Cache, recoveryKey)
	} else {
		restorePendingCookieRecovery(
			params,
			refreshResult,
			recoveryKey,
			cookieDestination,
		)
	}

	if claimed {
		delivery.stage = stageRefreshCookies(params, newToken, newTokenString, delivery)

		delivery.stageLatest = stageLatestRefreshCookies(params, delivery)
		if !deferDelivery && !deliverRefreshCookiesNow(params, delivery) {
			return nil
		}
	}

	params.TelemetryHandler.RecordEvent(params.Span, "Token refreshed successfully")

	return delivery
}

// RefreshTokenIfNeeded checks whether params.Token is close to expiring and, if
// so, refreshes it via RefreshAndSetToken. It reports whether a refresh was
// attempted, so callers can tell "token still valid, nothing to do" apart from
// "token was expiring, refresh was attempted" without checking expiry themselves.
//
// This keeps the expiry decision next to the refresh machinery it gates,
// instead of split out into the caller (e.g. the middleware): the caller no
// longer needs its own IsTokenAboutToExpire check before deciding whether to
// invoke a refresh.
func RefreshTokenIfNeeded(params RefreshAndSetTokenParams) bool {
	refreshed, _ := refreshTokenIfNeeded(params, false)

	return refreshed
}

func refreshTokenIfNeeded(params RefreshAndSetTokenParams, deferDelivery bool) (bool, *cookieDelivery) {
	if !IsTokenAboutToExpire(params.Token) {
		return false, nil
	}

	delivery := refreshAndSetToken(params, deferDelivery)

	return true, delivery
}
