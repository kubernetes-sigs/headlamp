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
import { KubeDeployment } from '../../lib/k8s/deployment';
import { TestContext } from '../../test';
import List from './List';

const items: KubeDeployment[] = [
  {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'headlamp-deployment',
      namespace: 'default',
      creationTimestamp: '2025-02-01T10:00:00Z',
      generation: 2,
      labels: {
        'k8s-app': 'headlamp',
        'pod-template-hash': 'a123456',
      },
      annotations: {
        'deployment.kubernetes.io/desired-replicas': '2',
        'deployment.kubernetes.io/max-replicas': '3',
        'deployment.kubernetes.io/revision': '1',
      },
      uid: '4678c301-2d01-434d-914c-5488941d6e50',
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
          name: 'headlamp-pod',
          creationTimestamp: '2025-02-01T10:00:00Z',
          uid: '4678c301-2d01-434d-914c-5488941d6e50',
          labels: {
            'k8s-app': 'headlamp',
            'pod-template-hash': 'a123456',
          },
        },
        spec: {
          nodeName: 'worker-node-1',
          serviceAccountName: 'headlamp-sa',
          containers: [
            {
              name: 'headlamp',
              image: 'ghcr.io/headlamp-k8s/headlamp:latest',
              imagePullPolicy: 'Always',
              args: ['-in-cluster', '-plugins-dir=/headlamp/plugins'],
              ports: [{ containerPort: 4466, protocol: 'TCP' }],
              livenessProbe: {
                httpGet: { path: '/', port: 4466, scheme: 'HTTP' },
                initialDelaySeconds: 30,
                periodSeconds: 10,
                timeoutSeconds: 30,
              },
              readinessProbe: {
                httpGet: { path: '/', port: 4466, scheme: 'HTTP' },
                periodSeconds: 10,
                timeoutSeconds: 30,
              },
            },
          ],
          nodeSelector: { 'kubernetes.io/os': 'linux' },
        },
      },
    },
    status: {
      replicas: 2,
      availableReplicas: 2,
      conditions: [
        {
          type: 'Available',
          status: 'True',
        },
      ],
    },
  },
  {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'headlamp-release-deployment',
      namespace: 'default',
      creationTimestamp: '2025-02-03T09:00:00Z',
      generation: 1,
      labels: {
        'app.kubernetes.io/instance': 'headlamp-release',
        'app.kubernetes.io/name': 'headlamp',
        'pod-template-hash': 'b123456',
      },
      annotations: {
        'deployment.kubernetes.io/desired-replicas': '1',
        'deployment.kubernetes.io/max-replicas': '2',
        'deployment.kubernetes.io/revision': '1',
        'meta.helm.sh/release-name': 'headlamp-release',
        'meta.helm.sh/release-namespace': 'default',
      },
      uid: '123e4567-e89b-12d3-a456-426614174002',
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
          name: 'headlamp-release-pod',
          uid: '123e4567-e89b-12d3-a456-426614174002',
          creationTimestamp: '2025-02-03T09:00:00Z',
          labels: {
            'app.kubernetes.io/instance': 'headlamp-release',
            'app.kubernetes.io/name': 'headlamp',
            'pod-template-hash': 'b123456',
          },
        },
        spec: {
          nodeName: 'worker-node-2',
          serviceAccountName: 'headlamp-release',
          containers: [
            {
              name: 'headlamp-release',
              image: 'ghcr.io/headlamp-k8s/headlamp:v0.18.0',
              imagePullPolicy: 'IfNotPresent',
              args: ['-in-cluster', '-plugins-dir=/headlamp/plugins'],
              ports: [{ containerPort: 4466, name: 'http', protocol: 'TCP' }],
              livenessProbe: {
                httpGet: { path: '/', port: 4466, scheme: 'HTTP' },
                periodSeconds: 10,
                timeoutSeconds: 1,
              },
              readinessProbe: {
                httpGet: { path: '/', port: 4466, scheme: 'HTTP' },
                periodSeconds: 10,
                timeoutSeconds: 1,
              },
            },
          ],
        },
      },
    },
    status: {
      replicas: 1,
      availableReplicas: 0,
      conditions: [
        {
          type: 'Progressing',
          status: 'True',
        },
      ],
    },
  },
];

export default {
  title: 'Deployment/List',
  component: List,
  argTypes: {},
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn = () => (
  <Container maxWidth="xl">
    <List />
  </Container>
);

export const Deployments = Template.bind({});
Deployments.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/apps/v1/deployments', () =>
          HttpResponse.json({
            kind: 'DeploymentList',
            items,
            metadata: {},
          })
        ),
      ],
    },
  },
};
