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
	"strings"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
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

const JWTExpirationTTL = 10 * time.Second // seconds

func IsTokenAboutToExpire(token string) bool {
	const tokenParts = 3

	parts := strings.Split(token, ".")
	if len(parts) != tokenParts {
		return false
	}

	payload, err := DecodeBase64JSON(parts[1])
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to decode payload")
		return false
	}

	exp, ok := payload["exp"].(float64)
	if !ok {
		logger.Log(logger.LevelError, nil, errors.New("expiry time not found or invalid"), "failed to get expiry time")
		return false
	}

	expiryTime := time.Unix(int64(exp), 0)

	return time.Until(expiryTime) <= JWTExpirationTTL
}
