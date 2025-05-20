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

import Container from '@mui/material/Container';
import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { TestContext } from '../../test';
import List from './List';

const items = [
  {
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      annotations: {
        'deployment.kubernetes.io/desired-replicas': '2',
        'deployment.kubernetes.io/max-replicas': '3',
        'deployment.kubernetes.io/revision': '1',
      },
      creationTimestamp: '2023-05-25T05:15:05Z',
      generation: 2,
      labels: {
        'k8s-app': 'headlamp',
        'pod-template-hash': 'a123456',
      },
      name: 'headlamp-a123456',
      namespace: 'default',
      ownerReferences: [
        {
          apiVersion: 'apps/v1',
          blockOwnerDeletion: true,
          controller: true,
          kind: 'Deployment',
          name: 'headlamp',
          uid: '4678c301-2d01-434d-914c-5488941d6e5e',
        },
      ],
      resourceVersion: '43998520',
      uid: 'f62e3592-d9b9-4046-a8e6-b4837492c932',
    },
    spec: {
      replicas: 2,
      selector: {
        matchLabels: {
          'k8s-app': 'headlamp',
          'pod-template-hash': 'a123456',
        },
      },
      template: {
        metadata: {
          creationTimestamp: null,
          labels: {
            'k8s-app': 'headlamp',
            'pod-template-hash': 'a123456',
          },
        },
        spec: {
          containers: [
            {
              args: ['-in-cluster', '-plugins-dir=/headlamp/plugins'],
              image: 'ghcr.io/headlamp-k8s/headlamp:latest',
              imagePullPolicy: 'Always',
              livenessProbe: {
                failureThreshold: 3,
                httpGet: {
                  path: '/',
                  port: 4466,
                  scheme: 'HTTP',
                },
                initialDelaySeconds: 30,
                periodSeconds: 10,
                successThreshold: 1,
                timeoutSeconds: 30,
              },
              name: 'headlamp',
              ports: [
                {
                  containerPort: 4466,
                  protocol: 'TCP',
                },
              ],
              resources: {},
              terminationMessagePath: '/dev/termination-log',
              terminationMessagePolicy: 'File',
            },
          ],
          dnsPolicy: 'ClusterFirst',
          nodeSelector: {
            'kubernetes.io/os': 'linux',
          },
          restartPolicy: 'Always',
          schedulerName: 'default-scheduler',
          securityContext: {},
          terminationGracePeriodSeconds: 30,
        },
      },
      status: {
        availableReplicas: 2,
        fullyLabeledReplicas: 2,
        observedGeneration: 2,
        readyReplicas: 2,
        replicas: 2,
      },
    },
  },
  {
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      annotations: {
        'deployment.kubernetes.io/desired-replicas': '1',
        'deployment.kubernetes.io/max-replicas': '2',
        'deployment.kubernetes.io/revision': '1',
        'meta.helm.sh/release-name': 'headlamp-release',
        'meta.helm.sh/release-namespace': 'default',
      },
      creationTimestamp: '2023-07-07T05:36:02Z',
      generation: 1,
      labels: {
        'app.kubernetes.io/instance': 'headlamp-release',
        'app.kubernetes.io/name': 'headlamp',
        'pod-template-hash': 'b123456',
      },
      name: 'headlamp-release-b123456',
      namespace: 'default',
      ownerReferences: [
        {
          apiVersion: 'apps/v1',
          blockOwnerDeletion: true,
          controller: true,
          kind: 'Deployment',
          name: 'headlamp-release',
          uid: '01f6b75d-958c-46f5-a28f-a792f5fada65',
        },
      ],
      resourceVersion: '43998525',
      uid: '5453966d-d9b3-4bd1-ba1f-1bf5a8bf349b',
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'app.kubernetes.io/instance': 'headlamp-release',
          'app.kubernetes.io/name': 'headlamp',
          'pod-template-hash': 'b123456',
        },
      },
      template: {
        metadata: {
          creationTimestamp: null,
          labels: {
            'app.kubernetes.io/instance': 'headlamp-release',
            'app.kubernetes.io/name': 'headlamp',
            'pod-template-hash': 'b123456',
          },
        },
        spec: {
          containers: [
            {
              args: ['-in-cluster', '-plugins-dir=/headlamp/plugins'],
              image: 'ghcr.io/headlamp-k8s/headlamp:v0.18.0',
              imagePullPolicy: 'IfNotPresent',
              livenessProbe: {
                failureThreshold: 3,
                httpGet: {
                  path: '/',
                  port: 'http',
                  scheme: 'HTTP',
                },
                periodSeconds: 10,
                successThreshold: 1,
                timeoutSeconds: 1,
              },
              name: 'headlamp',
              ports: [
                {
                  containerPort: 4466,
                  name: 'http',
                  protocol: 'TCP',
                },
              ],
              readinessProbe: {
                failureThreshold: 3,
                httpGet: {
                  path: '/',
                  port: 'http',
                  scheme: 'HTTP',
                },
                periodSeconds: 10,
                successThreshold: 1,
                timeoutSeconds: 1,
              },
              resources: {},
              securityContext: {
                privileged: false,
                runAsGroup: 101,
                runAsNonRoot: true,
                runAsUser: 100,
              },
              terminationMessagePath: '/dev/termination-log',
              terminationMessagePolicy: 'File',
            },
          ],
          dnsPolicy: 'ClusterFirst',
          restartPolicy: 'Always',
          schedulerName: 'default-scheduler',
          securityContext: {},
          serviceAccount: 'headlamp-release',
          serviceAccountName: 'headlamp-release',
          terminationGracePeriodSeconds: 30,
        },
      },
      status: {
        availableReplicas: 1,
        fullyLabeledReplicas: 1,
        observedGeneration: 1,
        readyReplicas: 1,
        replicas: 1,
      },
    },
  },
];

export default {
  title: 'ReplicaSet/List',
  component: List,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn = () => {
  return (
    <Container maxWidth="xl">
      <List />
    </Container>
  );
};

export const ReplicaSets = Template.bind({});
ReplicaSets.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/apps/v1/replicasets', () =>
          HttpResponse.json({
            kind: 'ReplicaSetList',
            items,
            metadata: {},
          })
        ),
      ],
    },
  },
};
