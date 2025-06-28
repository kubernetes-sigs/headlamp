package auth

import (
	"errors"
	"strings"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

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

	expiryTime, err := GetExpiryTime(payload)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get expiry time")
		return false
	}

	return time.Until(expiryTime) <= JWTExpirationTTL
}

func GetExpiryTime(payload map[string]interface{}) (time.Time, error) {
	exp, ok := payload["exp"].(float64)
	if !ok {
		return time.Time{}, errors.New("expiry time not found or invalid")
	}

	return time.Unix(int64(exp), 0), nil
}
