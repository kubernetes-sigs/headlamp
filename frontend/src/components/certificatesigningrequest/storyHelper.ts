/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Base64 } from 'js-base64';
import type { KubeCertificateSigningRequest } from '../../lib/k8s/certificateSigningRequest';

const creationTimestamp = new Date('2022-01-01').toISOString();

/** Shortened stand-ins; the views only ever show this text, they do not parse it. */
const REQUEST_PEM = [
  '-----BEGIN CERTIFICATE REQUEST-----',
  'MIIBXjCCAQQCAQAwdjELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAkNBMRYwFAYDVQQH',
  'DA1TYW4gRnJhbmNpc2NvMQ8wDQYDVQQKDAZzeXN0ZW0xDzANBgNVBAsMBm5vZGVz',
  '-----END CERTIFICATE REQUEST-----',
].join('\n');

const CERTIFICATE_PEM = [
  '-----BEGIN CERTIFICATE-----',
  'MIIDATCCAemgAwIBAgIUX2hlYWRsYW1wIGV4YW1wbGUgY2VydDANBgkqhkiG9w0B',
  'AQsFADAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwHhcNMjYwMTAxMDAwMDAwWhcNMjcw',
  '-----END CERTIFICATE-----',
].join('\n');

/** The three states an operator actually looks for: pending, issued and denied. */
export const CSR_DUMMY_DATA: KubeCertificateSigningRequest[] = [
  {
    apiVersion: 'certificates.k8s.io/v1',
    kind: 'CertificateSigningRequest',
    metadata: {
      name: 'csr-kubelet-serving-node-1',
      creationTimestamp,
      uid: 'csr-uid-1',
    },
    spec: {
      request: Base64.encode(REQUEST_PEM),
      signerName: 'kubernetes.io/kubelet-serving',
      username: 'system:node:node-1',
      groups: ['system:nodes', 'system:authenticated'],
      usages: ['digital signature', 'key encipherment', 'server auth'],
      expirationSeconds: 86400,
    },
    status: {},
  },
  {
    apiVersion: 'certificates.k8s.io/v1',
    kind: 'CertificateSigningRequest',
    metadata: {
      name: 'csr-node-client-node-2',
      creationTimestamp,
      uid: 'csr-uid-2',
    },
    spec: {
      request: Base64.encode(REQUEST_PEM),
      signerName: 'kubernetes.io/kube-apiserver-client-kubelet',
      username: 'system:bootstrap:abcdef',
      groups: ['system:bootstrappers', 'system:authenticated'],
      usages: ['digital signature', 'client auth'],
    },
    status: {
      conditions: [
        {
          type: 'Approved',
          status: 'True',
          reason: 'AutoApproved',
          message: 'Auto approved by the kubelet client approver',
          lastUpdateTime: '2022-01-01T00:01:00Z',
        },
      ],
      certificate: Base64.encode(CERTIFICATE_PEM),
    },
  },
  {
    apiVersion: 'certificates.k8s.io/v1',
    kind: 'CertificateSigningRequest',
    metadata: {
      name: 'csr-user-alice',
      creationTimestamp,
      uid: 'csr-uid-3',
    },
    spec: {
      request: Base64.encode(REQUEST_PEM),
      signerName: 'kubernetes.io/kube-apiserver-client',
      username: 'alice',
      groups: ['developers', 'system:authenticated'],
      usages: ['digital signature', 'client auth'],
    },
    status: {
      conditions: [
        {
          type: 'Denied',
          status: 'True',
          reason: 'NotAuthorized',
          message: 'User may not request a client certificate for this signer',
          lastUpdateTime: '2022-01-01T00:02:00Z',
        },
      ],
    },
  },
];
