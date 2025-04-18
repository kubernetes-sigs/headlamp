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

import { KubeRuntimeClass } from '../../lib/k8s/runtime';
const creationTimestamp = new Date('2022-01-01').toISOString();

export const BASE_RC: KubeRuntimeClass = {
  apiVersion: 'node.k8s.io/v1',
  kind: 'RuntimeClass',
  metadata: {
    name: 'runtime-class',
    namespace: 'default',
    creationTimestamp,
    uid: '123',
  },
  handler: 'handler',
  overhead: {
    cpu: '100m',
    memory: '128Mi',
  },
  scheduling: {
    nodeSelector: {
      key: 'value',
    },
    tolerations: [
      {
        key: 'key',
        operator: 'Equal',
        value: 'value',
        effect: 'NoSchedule',
        tolerationSeconds: 10,
      },
    ],
  },
};

export const RUNTIME_CLASS_DUMMY_DATA: KubeRuntimeClass[] = [
  {
    apiVersion: 'node.k8s.io/v1',
    kind: 'RuntimeClass',
    metadata: {
      name: 'runtime-class',
      namespace: 'default',
      creationTimestamp,
      uid: '123',
    },
    handler: 'handler',
    overhead: {
      cpu: '100m',
      memory: '128Mi',
    },
    scheduling: {
      nodeSelector: {
        key: 'value',
      },
      tolerations: [
        {
          key: 'key',
          operator: 'Equal',
          value: 'value',
          effect: 'NoSchedule',
          tolerationSeconds: 10,
        },
      ],
    },
  },
];
