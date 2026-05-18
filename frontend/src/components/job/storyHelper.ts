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

export const jobs: KubeObjectInterface[] = [
  {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: '',
      creationTimestamp: '2023-07-28T08:00:00Z',
      generation: 1,
      labels: {
        'controller-uid': 'c1234',
      },
      namespace: 'default',
      ownerReferences: [
        {
          apiVersion: 'batch/v1',
          blockOwnerDeletion: true,
          controller: true,
          kind: 'CronJob',
          name: 'hello',
          uid: 'c1234',
        },
      ],
      resourceVersion: '123456',
      uid: 'abc123',
    },
    spec: {
      backoffLimit: 6,
      completionMode: 'NonIndexed',
      completions: 1,
      parallelism: 1,
      selector: {
        matchLabels: {
          'controller-uid': 'c1234',
        },
      },
      suspend: false,
      template: {
        metadata: {
          creationTimestamp: null,
          labels: {
            'controller-uid': 'c1234',
          },
        },
        spec: {
          containers: [
            {
              command: ['/bin/sh', '-c', 'date; echo Hello from the Kubernetes cluster'],
              image: 'busybox:1.28',
              imagePullPolicy: 'IfNotPresent',
              name: 'hello',
              resources: {},
              terminationMessagePath: '/dev/termination-log',
              terminationMessagePolicy: 'File',
            },
          ],
          dnsPolicy: 'ClusterFirst',
          restartPolicy: 'OnFailure',
          schedulerName: 'default-scheduler',
          securityContext: {},
          terminationGracePeriodSeconds: 30,
        },
      },
    },
    status: {
      completionTime: '2023-07-28T08:01:00Z',
      conditions: [
        {
          lastProbeTime: '2023-07-28T08:01:00Z',
          lastTransitionTime: '2023-07-28T08:01:00Z',
          status: 'True',
          type: 'Complete',
        },
      ],
      startTime: '2023-07-28T00:00:00Z',
      succeeded: 1,
    },
  },
];
