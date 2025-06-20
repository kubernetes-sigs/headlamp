package cache

import (
	"crypto/sha256"
	"encoding/base32"
	"encoding/json"
)

type ResourceKind string

type Key struct {
	Kind        string
	Namespace   string
	Cluster     string
	ListOptions string
}

func HashObject(any interface{}) (string, error) {
	out, err := json.Marshal(any)
	if err != nil {
		return "", err
	}

	sha := sha256.Sum256(out)

	return base32.StdEncoding.EncodeToString(sha[:]), nil
}

func (k *Key) SHA() (string, error) {
	return HashObject(k)
}
