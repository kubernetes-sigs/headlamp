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

export const jobSets: KubeObjectInterface[] = [
  {
    apiVersion: 'jobset.x-k8s.io/v1alpha2',
    kind: 'JobSet',
    metadata: {
      name: '',
      creationTimestamp: '2023-07-28T08:00:00Z',
      generation: 1,
      labels: {
        app: 'my-jobset',
      },
      namespace: 'default',
      resourceVersion: '123456',
      uid: 'abc123',
    },
    spec: {
      replicatedJobs: [
        {
          name: 'workers',
          replicas: 2,
          template: {
            spec: {
              parallelism: 1,
              completions: 1,
              template: {
                spec: {
                  containers: [
                    {
                      name: 'worker',
                      image: 'busybox:1.28',
                      command: ['/bin/sh', '-c', 'echo Hello'],
                    },
                  ],
                  restartPolicy: 'Never',
                },
              },
            },
          },
        },
      ],
    },
    status: {
      conditions: [
        {
          type: 'Completed',
          status: 'True',
          lastTransitionTime: '2023-07-28T08:01:00Z',
        },
      ],
    },
  },
];
