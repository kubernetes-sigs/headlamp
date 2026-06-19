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

package main

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClusterReq(t *testing.T) {
	name := "test-cluster"
	server := "https://test.server"
	req := ClusterReq{
		Name:                     &name,
		Server:                   &server,
		InsecureSkipTLSVerify:    true,
		CertificateAuthorityData: []byte("dummy-cert-data"),
		Metadata:                 map[string]interface{}{"key": "value"},
	}

	b, err := json.Marshal(req)
	require.NoError(t, err)

	//nolint:lll
	assert.JSONEq(t, `{"name":"test-cluster","server":"https://test.server","insecure-skip-tls-verify":true,"certificate-authority-data":"ZHVtbXktY2VydC1kYXRh","meta_data":{"key":"value"}}`, string(b))

	var req2 ClusterReq

	err = json.Unmarshal(b, &req2)
	require.NoError(t, err)

	require.NotNil(t, req2.Name)
	require.NotNil(t, req2.Server)
	assert.Equal(t, name, *req2.Name)
	assert.Equal(t, server, *req2.Server)
	assert.Equal(t, req.InsecureSkipTLSVerify, req2.InsecureSkipTLSVerify)
	assert.Equal(t, req.CertificateAuthorityData, req2.CertificateAuthorityData)
	assert.Equal(t, req.Metadata, req2.Metadata)
}

func TestClusterReq_KubeConfig(t *testing.T) {
	name := "test-cluster"
	server := "https://test.server"
	kubeconfig := "dummy-kubeconfig"

	req := ClusterReq{
		Name:       &name,
		Server:     &server,
		Metadata:   map[string]interface{}{"key": "value"},
		KubeConfig: &kubeconfig,
	}

	b, err := json.Marshal(req)
	require.NoError(t, err)

	var wire map[string]interface{}

	err = json.Unmarshal(b, &wire)
	require.NoError(t, err)
	require.Contains(t, wire, "kubeconfig")
	assert.Equal(t, kubeconfig, wire["kubeconfig"])

	var req2 ClusterReq

	err = json.Unmarshal(b, &req2)
	require.NoError(t, err)

	require.NotNil(t, req2.KubeConfig)
	assert.Equal(t, kubeconfig, *req2.KubeConfig)
}
