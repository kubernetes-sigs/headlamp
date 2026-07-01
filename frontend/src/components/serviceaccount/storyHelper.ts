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

import type { KubeServiceAccount } from '../../lib/k8s/serviceAccount';

export const BASE_SERVICE_ACCOUNT: KubeServiceAccount = {
  apiVersion: 'v1',
  kind: 'ServiceAccount',
  metadata: {
    creationTimestamp: '2025-06-15T10:00:00Z',
    name: 'my-sa',
    namespace: 'default',
    resourceVersion: '1001',
    uid: 'sa-uid-001',
  },
  secrets: [
    {
      apiVersion: 'v1',
      fieldPath: 'default/service-account-secret',
      kind: 'Secret',
      name: 'my-sa-token-abc',
      namespace: 'default',
      uid: 'secret-uid-001',
    },
  ],
  imagePullSecrets: [{ name: 'docker-registry-cred' }],
  automountServiceAccountToken: true,
};

export const BASE_EMPTY_SERVICE_ACCOUNT: KubeServiceAccount = {
  apiVersion: 'v1',
  kind: 'ServiceAccount',
  metadata: {
    creationTimestamp: '2025-06-15T10:00:00Z',
    name: 'my-sa-empty',
    namespace: 'default',
    resourceVersion: '1002',
    uid: 'sa-uid-002',
  },
  secrets: [],
  imagePullSecrets: [],
  automountServiceAccountToken: false,
};
