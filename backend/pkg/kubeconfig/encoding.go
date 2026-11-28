/*
Copyright 2025 The Kubernetes Authors

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

package kubeconfig

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"os"
	"unicode/utf16"

	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

var (
	utf8BOM    = []byte{0xEF, 0xBB, 0xBF}
	utf16LEBOM = []byte{0xFF, 0xFE}
	utf16BEBOM = []byte{0xFE, 0xFF}
)

// DecodeKubeConfigData normalizes kubeconfig bytes to UTF-8.
// It strips a UTF-8 BOM and decodes UTF-16 LE/BE payloads (with BOM, or
// BOM-less payloads whose leading bytes are NUL-interleaved ASCII) so YAML
// parsers and clientcmd.Load can parse files generated on Windows (for
// example via PowerShell redirection or Out-File).
func DecodeKubeConfigData(data []byte) ([]byte, error) {
	if bytes.HasPrefix(data, utf8BOM) {
		return data[len(utf8BOM):], nil
	}

	if bytes.HasPrefix(data, utf16LEBOM) {
		return decodeUTF16(data[len(utf16LEBOM):], binary.LittleEndian)
	}

	if bytes.HasPrefix(data, utf16BEBOM) {
		return decodeUTF16(data[len(utf16BEBOM):], binary.BigEndian)
	}

	// Support BOM-less UTF-16 payloads starting with ASCII characters (e.g.
	// "apiVersion:", "clusters:", comments, or whitespace), where NUL bytes
	// appear at consistent positions that are invalid in UTF-8 YAML.
	if len(data) >= 4 && len(data)%2 == 0 {
		if data[0] != 0x00 && data[1] == 0x00 && data[2] != 0x00 && data[3] == 0x00 {
			return decodeUTF16(data, binary.LittleEndian)
		}

		if data[0] == 0x00 && data[1] != 0x00 && data[2] == 0x00 && data[3] != 0x00 {
			return decodeUTF16(data, binary.BigEndian)
		}
	}

	return data, nil
}

func decodeUTF16(payload []byte, order binary.ByteOrder) ([]byte, error) {
	if len(payload)%2 != 0 {
		return nil, fmt.Errorf("invalid UTF-16 kubeconfig: odd byte count (%d)", len(payload))
	}

	words := make([]uint16, len(payload)/2)
	for i := range words {
		words[i] = order.Uint16(payload[i*2 : i*2+2])
	}

	return []byte(string(utf16.Decode(words))), nil
}

// LoadFromFile loads a kubeconfig file from disk, decoding UTF-16 or BOM-prefixed
// files to UTF-8 before parsing with clientcmd.Load.
func LoadFromFile(path string) (*api.Config, error) {
	data, err := os.ReadFile(path) //nolint:gosec // Kubeconfig file path is provided via configuration.
	if err != nil {
		return nil, err
	}

	decoded, err := DecodeKubeConfigData(data)
	if err != nil {
		return nil, err
	}

	config, err := clientcmd.Load(decoded)
	if err != nil {
		return nil, err
	}

	for key, obj := range config.AuthInfos {
		obj.LocationOfOrigin = path
		config.AuthInfos[key] = obj
	}

	for key, obj := range config.Clusters {
		obj.LocationOfOrigin = path
		config.Clusters[key] = obj
	}

	for key, obj := range config.Contexts {
		obj.LocationOfOrigin = path
		config.Contexts[key] = obj
	}

	if config.AuthInfos == nil {
		config.AuthInfos = map[string]*api.AuthInfo{}
	}

	if config.Clusters == nil {
		config.Clusters = map[string]*api.Cluster{}
	}

	if config.Contexts == nil {
		config.Contexts = map[string]*api.Context{}
	}

	return config, nil
}
