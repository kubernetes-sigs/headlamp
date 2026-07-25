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

import { KubeServiceAccount } from '../../lib/k8s/serviceAccount';

const creationTimestamp = new Date('2022-01-01').toISOString();

export const SERVICE_ACCOUNT_DUMMY_DATA: KubeServiceAccount[] = [
  {
    kind: 'ServiceAccount',
    apiVersion: 'v1',
    metadata: {
      name: 'my-service-account',
      namespace: 'default',
      creationTimestamp,
      uid: 'abc-123',
      labels: {},
    },
    secrets: [
      {
        apiVersion: 'v1',
        fieldPath: '',
        kind: 'Secret',
        name: 'my-service-account-token',
        namespace: 'default',
        uid: 'secret-uid-123',
      },
    ],
    imagePullSecrets: [{ name: 'my-pull-secret' }],
    automountServiceAccountToken: true,
  },
  {
    kind: 'ServiceAccount',
    apiVersion: 'v1',
    metadata: {
      name: 'automount-disabled-account',
      namespace: 'default',
      creationTimestamp,
      uid: 'abc-456',
      labels: {},
    },
    secrets: [],
    imagePullSecrets: [],
    automountServiceAccountToken: false,
  },
  {
    kind: 'ServiceAccount',
    apiVersion: 'v1',
    metadata: {
      name: 'no-secrets-account',
      namespace: 'default',
      creationTimestamp,
      uid: 'abc-789',
      labels: {},
    },
    secrets: [],
    imagePullSecrets: [],
    automountServiceAccountToken: true,
  },
];
