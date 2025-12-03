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

import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { TestContext } from '../../test';
import HPADetails from './Details';

const mockPDB = {
  kind: 'PodDisruptionBudget',
  metadata: {
    annotations: {
      'kubectl.kubernetes.io/last-applied-configuration':
        '{"apiVersion":"policy/v1beta1","kind":"PodDisruptionBudget","metadata":{"annotations":{},"labels":{"addonmanager.kubernetes.io/mode":"Reconcile"},"name":"coredns-pdb","namespace":"kube-system"},"spec":{"minAvailable":1,"selector":{"matchLabels":{"k8s-app":"kube-dns"}}}}\n',
    },
    selfLink: '',
    creationTimestamp: '2022-10-06T05:17:14Z',
    generation: 1,
    labels: {
      'addonmanager.kubernetes.io/mode': 'Reconcile',
    },
    name: 'coredns-pdb',
    namespace: 'kube-system',
    resourceVersion: '3679611',
    uid: '80728de7-5d4f-42a2-bc4a-a8eb2a0ddabd',
  },
  spec: {
    minAvailable: 1,
    selector: {
      matchLabels: {
        'k8s-app': 'kube-dns',
      },
    },
  },
  status: {
    conditions: [
      {
        lastTransitionTime: '2022-10-17T21:56:52Z',
        message: '',
        observedGeneration: 1,
        reason: 'SufficientPods',
        status: 'True',
        type: 'DisruptionAllowed',
      },
    ],
    currentHealthy: 2,
    desiredHealthy: 1,
    disruptionsAllowed: 1,
    expectedPods: 2,
    observedGeneration: 1,
  },
};

export default {
  title: 'pdb/PDBDetailsView',
  component: HPADetails,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ namespace: 'my-namespace', name: 'my-endpoint' }}>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get(
            'http://localhost:4466/apis/policy/v1/namespaces/my-namespace/poddisruptionbudgets',
            () => HttpResponse.error()
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <HPADetails />;
};

export const Default = Template.bind({});
Default.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/policy/v1/namespaces/my-namespace/poddisruptionbudgets/my-endpoint',
          () => HttpResponse.json(mockPDB)
        ),
      ],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/policy/v1/namespaces/my-namespace/poddisruptionbudgets/my-endpoint',
          () => HttpResponse.error()
        ),
      ],
    },
  },
};
