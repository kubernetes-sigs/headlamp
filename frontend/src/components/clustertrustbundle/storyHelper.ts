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

import type { KubeClusterTrustBundle } from '../../lib/k8s/clusterTrustBundle';

const creationTimestamp = new Date('2022-01-01').toISOString();

/** Shortened stand-ins; the views show this text as it is, they do not parse it. */
const certificate = (body: string) =>
  ['-----BEGIN CERTIFICATE-----', body, '-----END CERTIFICATE-----'].join('\n');

const ROOT_A = certificate(
  'MIIDATCCAemgAwIBAgIUX2V4YW1wbGUgcm9vdCBhMA0GCSqGSIb3DQEBCwUAMBQx\nEjAQBgNVBAMMCWV4YW1wbGVDQTAeFw0yNjAxMDEwMDAwMDBaFw0zNjAxMDEwMDAw'
);
const ROOT_B = certificate(
  'MIIDBTCCAe2gAwIBAgIUX2V4YW1wbGUgcm9vdCBiMA0GCSqGSIb3DQEBCwUAMBYx\nFDASBgNVBAMMC2V4YW1wbGVDQTIwHhcNMjYwMTAxMDAwMDAwWhcNMzYwMTAxMDAw'
);

/** A signer bundle with two roots, and an unsigned bundle with one. */
export const CTB_DUMMY_DATA: KubeClusterTrustBundle[] = [
  {
    apiVersion: 'certificates.k8s.io/v1beta1',
    kind: 'ClusterTrustBundle',
    metadata: {
      name: 'example.com:my-signer:roots',
      creationTimestamp,
      uid: 'ctb-uid-1',
    },
    spec: {
      signerName: 'example.com/my-signer',
      trustBundle: `${ROOT_A}\n${ROOT_B}\n`,
    },
  },
  {
    apiVersion: 'certificates.k8s.io/v1beta1',
    kind: 'ClusterTrustBundle',
    metadata: {
      name: 'internal-roots',
      creationTimestamp,
      uid: 'ctb-uid-2',
    },
    spec: {
      trustBundle: `${ROOT_A}\n`,
    },
  },
];
