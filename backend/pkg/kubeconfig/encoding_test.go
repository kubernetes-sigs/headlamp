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

package kubeconfig_test

import (
	"encoding/base64"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
	"unicode/utf16"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
)

func encodeUTF16(text string, order binary.ByteOrder, withBOM bool) []byte {
	words := utf16.Encode([]rune(text))

	offset := 0
	if withBOM {
		offset = 2
	}

	buf := make([]byte, offset+len(words)*2)

	if withBOM {
		if order == binary.LittleEndian {
			buf[0], buf[1] = 0xFF, 0xFE
		} else {
			buf[0], buf[1] = 0xFE, 0xFF
		}
	}

	for i, w := range words {
		order.PutUint16(buf[offset+i*2:offset+i*2+2], w)
	}

	return buf
}

func sampleUTF16KubeconfigYAML(clusterName string) string {
	return "apiVersion: v1\nkind: Config\nclusters:\n- cluster:\n    server: https://" +
		clusterName + ".example.com\n  name: " + clusterName +
		"\ncontexts:\n- context:\n    cluster: " + clusterName + "\n    user: " + clusterName +
		"\n  name: " + clusterName +
		"\nusers:\n- name: " + clusterName + "\n  user:\n    token: test-token\n"
}

func TestDecodeKubeConfigData(t *testing.T) {
	t.Parallel()

	sample := sampleUTF16KubeconfigYAML("win-日本語")

	tests := []struct {
		name  string
		input []byte
		want  string
	}{
		{
			name:  "plain utf8",
			input: []byte(sample),
			want:  sample,
		},
		{
			name:  "utf8 with BOM",
			input: append([]byte{0xEF, 0xBB, 0xBF}, []byte(sample)...),
			want:  sample,
		},
		{
			name:  "utf16le with BOM",
			input: encodeUTF16(sample, binary.LittleEndian, true),
			want:  sample,
		},
		{
			name:  "utf16be with BOM",
			input: encodeUTF16(sample, binary.BigEndian, true),
			want:  sample,
		},
		{
			name:  "utf16le without BOM",
			input: encodeUTF16(sample, binary.LittleEndian, false),
			want:  sample,
		},
		{
			name:  "utf16be without BOM",
			input: encodeUTF16(sample, binary.BigEndian, false),
			want:  sample,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := kubeconfig.DecodeKubeConfigData(tc.input)
			require.NoError(t, err)
			assert.Equal(t, tc.want, string(got))
		})
	}
}

func TestDecodeKubeConfigDataOddLengthError(t *testing.T) {
	t.Parallel()

	_, err := kubeconfig.DecodeKubeConfigData([]byte{0xFF, 0xFE, 0x61, 0x00, 0x70})
	require.Error(t, err)
}

func TestLoadContextsFromUTF16FilesAndBase64(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name  string
		order binary.ByteOrder
		bom   bool
	}{
		{name: "utf16le with BOM", order: binary.LittleEndian, bom: true},
		{name: "utf16be with BOM", order: binary.BigEndian, bom: true},
		{name: "utf16le without BOM", order: binary.LittleEndian, bom: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			dir := t.TempDir()
			path := filepath.Join(dir, "config")
			yamlText := sampleUTF16KubeconfigYAML("ps-cluster")
			encoded := encodeUTF16(yamlText, tc.order, tc.bom)

			require.NoError(t, os.WriteFile(path, encoded, 0o600))

			contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(path, kubeconfig.KubeConfig)
			require.NoError(t, err)
			require.Empty(t, contextErrors)
			require.Len(t, contexts, 1)
			assert.Equal(t, "ps-cluster", contexts[0].Name)
			assert.Equal(t, path, contexts[0].KubeConfigPath)

			store := kubeconfig.NewContextStore()
			require.NoError(t, kubeconfig.LoadAndStoreKubeConfigs(store, path, kubeconfig.KubeConfig, nil))

			stored, err := store.GetContext("ps-cluster")
			require.NoError(t, err)
			assert.Equal(t, "https://ps-cluster.example.com", stored.Cluster.Server)

			b64 := base64.StdEncoding.EncodeToString(encoded)
			b64Contexts, b64Errs, err := kubeconfig.LoadContextsFromBase64String(b64, kubeconfig.DynamicCluster)
			require.NoError(t, err)
			require.Empty(t, b64Errs)
			require.Len(t, b64Contexts, 1)
			assert.Equal(t, "ps-cluster", b64Contexts[0].Name)
		})
	}
}

func TestModifyMergeAndRemoveUTF16KubeconfigFile(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	encoded := encodeUTF16(sampleUTF16KubeconfigYAML("existing-utf16"), binary.LittleEndian, true)
	require.NoError(t, os.WriteFile(path, encoded, 0o600))

	// LoadFromFile should parse the UTF-16 file and set LocationOfOrigin.
	loaded, err := kubeconfig.LoadFromFile(path)
	require.NoError(t, err)
	require.Contains(t, loaded.Contexts, "existing-utf16")
	assert.Equal(t, path, loaded.Contexts["existing-utf16"].LocationOfOrigin)

	// WriteToFile should merge a new cluster into the existing UTF-16 file.
	extra, err := clientcmd.Load([]byte(sampleUTF16KubeconfigYAML("added-cluster")))
	require.NoError(t, err)
	require.NoError(t, kubeconfig.WriteToFile(*extra, dir))

	merged, err := clientcmd.LoadFromFile(path)
	require.NoError(t, err)
	assert.Contains(t, merged.Contexts, "existing-utf16")
	assert.Contains(t, merged.Contexts, "added-cluster")

	// ModifyConfigFile and RemoveContextFromFile should also work on UTF-16 files.
	utf16Path := filepath.Join(dir, "utf16-only")
	require.NoError(t, os.WriteFile(utf16Path, encoded, 0o600))

	require.NoError(t, kubeconfig.ModifyConfigFile(utf16Path, func(cfg *clientcmdapi.Config) error {
		cfg.CurrentContext = "existing-utf16"
		return nil
	}))

	require.NoError(t, kubeconfig.RemoveContextFromFile("existing-utf16", utf16Path))

	afterRemove, err := clientcmd.LoadFromFile(utf16Path)
	require.NoError(t, err)
	assert.Empty(t, afterRemove.Contexts)
}
