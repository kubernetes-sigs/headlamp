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
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
)

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

// ParseClusterAndToken extracts the cluster name from the URL path and
// the Bearer token from the Authorization header of the HTTP request.
func ParseClusterAndToken(r *http.Request) (string, string) {
	cluster := ""

	matches := clusterPathRegex.FindStringSubmatch(r.URL.Path)
	if len(matches) > 1 {
		cluster = matches[1]
	}

	token := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.Contains(token, ",") {
		return cluster, ""
	}

	const bearerPrefix = "Bearer "
	if strings.HasPrefix(strings.ToLower(token), strings.ToLower(bearerPrefix)) {
		token = strings.TrimSpace(token[len(bearerPrefix):])
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
