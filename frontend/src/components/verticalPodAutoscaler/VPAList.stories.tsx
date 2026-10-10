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
import { API_BASE, TestContext } from '../../test';
import VpaList from './List';

const items = [
  {
    apiVersion: 'autoscaling.k8s.io/v1',
    kind: 'VerticalPodAutoscaler',
    metadata: {
      annotations: {
        'kubectl.kubernetes.io/last-applied-configuration':
          '{"apiVersion":"autoscaling.k8s.io/v1","kind":"VerticalPodAutoscaler","metadata":{"annotations":{},"name":"multi-container-vpa","namespace":"default"},"spec":{"resourcePolicy":{"containerPolicies":[{"containerName":"web-container","controlledResources":["cpu","memory"],"controlledValues":"RequestsAndLimits","minAllowed":{"cpu":"80m","memory":"512Mi"}},{"containerName":"db-container","controlledResources":["cpu","memory"],"controlledValues":"RequestsAndLimits","minAllowed":{"cpu":"1000m","memory":"2Gi"}}]},"targetRef":{"apiVersion":"apps/v1","kind":"Deployment","name":"multi-container-deployment"},"updatePolicy":{"updateMode":"Auto"}}}\n',
      },
      creationTimestamp: '2023-11-23T07:18:45Z',
      name: 'multi-container-vpa',
      namespace: 'default',
      resourceVersion: '111487',
      uid: '79cf71ba-81f4-4e7b-957d-8625c3afb0c1',
    },
    spec: {
      resourcePolicy: {
        containerPolicies: [
          {
            containerName: 'web-container',
            controlledResources: ['cpu', 'memory'],
            controlledValues: 'RequestsAndLimits',
            minAllowed: {
              cpu: '80m',
              memory: '512Mi',
            },
          },
          {
            containerName: 'db-container',
            controlledResources: ['cpu', 'memory'],
            controlledValues: 'RequestsAndLimits',
            minAllowed: {
              cpu: '1000m',
              memory: '2Gi',
            },
          },
        ],
      },
      targetRef: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        name: 'multi-container-deployment',
      },
      updatePolicy: {
        updateMode: 'Auto',
      },
    },
    status: {
      conditions: [
        {
          lastTransitionTime: '2023-11-23T07:18:48Z',
          status: 'True',
          type: 'RecommendationProvided',
        },
      ],
      recommendation: {
        containerRecommendations: [
          {
            containerName: 'db-container',
            lowerBound: {
              cpu: '1',
              memory: '2Gi',
            },
            target: {
              cpu: '1',
              memory: '2Gi',
            },
            uncappedTarget: {
              cpu: '12m',
              memory: '131072k',
            },
            upperBound: {
              cpu: '1',
              memory: '2Gi',
            },
          },
          {
            containerName: 'web-container',
            lowerBound: {
              cpu: '80m',
              memory: '512Mi',
            },
            target: {
              cpu: '80m',
              memory: '512Mi',
            },
            uncappedTarget: {
              cpu: '12m',
              memory: '131072k',
            },
            upperBound: {
              cpu: '80m',
              memory: '512Mi',
            },
          },
        ],
      },
    },
  },
];

export default {
  title: 'VPA/VPAListView',
  component: VpaList,
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
  return <VpaList />;
};

const vpaApiGroupUrl = `${API_BASE}/apis/autoscaling.k8s.io/v1`;
const vpaListUrl = `${API_BASE}/apis/autoscaling.k8s.io/v1/verticalpodautoscalers`;

export const List = Template.bind({});
List.parameters = {
  msw: {
    handlers: {
      story: [
        // VPA.isEnabled() looks for this resource name on the API group.
        http.get(vpaApiGroupUrl, () =>
          HttpResponse.json({ resources: [{ name: 'verticalpodautoscalers' }] })
        ),
        http.get(vpaListUrl, () =>
          HttpResponse.json({
            kind: 'VPAList',
            metadata: {},
            items,
          })
        ),
      ],
    },
  },
};

/**
 * Keeps VPA.isEnabled() pending so List.tsx stays on vpaEnabled === null
 * ("Checking if Vertical Pod Autoscaler is enabled…").
 * Storyshots disabled: a never-resolving handler never fires request:end.
 */
export const Checking = Template.bind({});
Checking.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [http.get(vpaApiGroupUrl, () => new Promise(() => {}))],
    },
  },
};

/**
 * API group responds without verticalpodautoscalers, so VPA.isEnabled()
 * resolves false and List.tsx shows the not-enabled empty state.
 */
export const NotEnabled = Template.bind({});
NotEnabled.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(vpaApiGroupUrl, () =>
          HttpResponse.json({
            kind: 'APIResourceList',
            groupVersion: 'autoscaling.k8s.io/v1',
            resources: [
              {
                name: 'horizontalpodautoscalers',
                singularName: 'horizontalpodautoscaler',
                namespaced: true,
                kind: 'HorizontalPodAutoscaler',
                verbs: ['get', 'list', 'watch'],
              },
            ],
          })
        ),
      ],
    },
  },
};
