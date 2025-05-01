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

const creationTimestamp = new Date('2022-01-01').toISOString();

export const LIMIT_RANGE_DUMMY_DATA = [
  {
    apiVersion: 'v1',
    kind: 'LimitRange',
    metadata: {
      name: 'limit-range',
      namespace: 'default',
      creationTimestamp,
      uid: '123',
    },
    spec: {
      limits: [
        {
          default: {
            cpu: '100m',
            memory: '128Mi',
          },
          defaultRequest: {
            cpu: '50m',
            memory: '64Mi',
          },
          max: {
            cpu: '500m',
            memory: '1Gi',
          },
          min: {
            cpu: '10m',
            memory: '4Mi',
          },
          type: 'Container',
        },
      ],
    },
  },
];
