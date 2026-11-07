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

import { KubeObjectInterface } from '../../lib/k8s/KubeObject';

export const disaggregatedSets: KubeObjectInterface[] = [
  {
    apiVersion: 'disaggregatedset.x-k8s.io/v1',
    kind: 'DisaggregatedSet',
    metadata: {
      name: '',
      creationTimestamp: '2023-07-28T08:00:00Z',
      generation: 1,
      labels: {
        app: 'my-disaggregatedset',
      },
      namespace: 'default',
      resourceVersion: '123456',
      uid: 'abc123-disagg',
    },
    spec: {
      slices: 2,
      roles: [
        {
          name: 'prefill',
          spec: {
            replicas: 1,
            leaderWorkerTemplate: {
              size: 2,
              restartPolicy: 'RecreateGroupOnPodRestart',
              leaderTemplate: {
                spec: {
                  containers: [
                    {
                      name: 'prefill-leader',
                      image: 'nginx:1.27',
                    },
                  ],
                },
              },
              workerTemplate: {
                spec: {
                  containers: [
                    {
                      name: 'prefill-worker',
                      image: 'nginx:1.27',
                    },
                  ],
                },
              },
            },
          },
        },
        {
          name: 'decode',
          spec: {
            replicas: 1,
            leaderWorkerTemplate: {
              size: 2,
              restartPolicy: 'RecreateGroupOnPodRestart',
              leaderTemplate: {
                spec: {
                  containers: [
                    {
                      name: 'decode-leader',
                      image: 'nginx:1.27',
                    },
                  ],
                },
              },
              workerTemplate: {
                spec: {
                  containers: [
                    {
                      name: 'decode-worker',
                      image: 'nginx:1.27',
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    },
    status: {
      slices: 2,
      readySlices: 2,
      updatedReplicas: 2,
      conditions: [
        {
          type: 'Available',
          status: 'True',
          reason: 'AllSlicesReady',
          message: 'All slices are ready',
          lastTransitionTime: '2023-07-28T08:01:00Z',
        },
      ],
    },
  },
];
