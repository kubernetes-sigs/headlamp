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
import { MemoryRouter } from 'react-router-dom';
import { TestContext } from '../../test';
import StatefulSetDetails from './Details';

const mockStatefulSet = {
  apiVersion: 'apps/v1',
  kind: 'StatefulSet',
  metadata: {
    name: 'mock-statefulset',
    namespace: 'default',
    uid: '12345678-1234-1256-1234-123456789012',
    creationTimestamp: '2025-05-31T17:15:53.298Z',
  },
  spec: {
    replicas: 3,
    selector: {
      matchLabels: {
        app: 'mock-app',
      },
    },
    updateStrategy: {
      type: 'RollingUpdate',
    },
    serviceName: 'mock-service',
    template: {
      metadata: {
        labels: {
          app: 'mock-app',
        },
      },
      spec: {
        containers: [
          {
            name: 'main',
            image: 'mock-image:latest',
            ports: [
              {
                containerPort: 8080,
              },
            ],
          },
        ],
      },
    },
    volumeClaimTemplates: [
      {
        metadata: {
          name: 'data',
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          resources: {
            requests: {
              storage: '1Gi',
            },
          },
        },
      },
    ],
  },
  status: {
    replicas: 3,
    readyReplicas: 3,
    currentReplicas: 3,
    updatedReplicas: 3,
  },
};

export default {
  title: 'StatefulSet/Details',
  component: StatefulSetDetails,
  decorators: [
    Story => (
      <MemoryRouter>
        <TestContext>
          <Story />
        </TestContext>
      </MemoryRouter>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get('http://localhost:4466/apis/apps/v1/namespaces/default/statefulsets', () => {
            return HttpResponse.json({
              kind: 'StatefulSetList',
              items: [],
            });
          }),
          http.get('http://localhost:4466/api/v1/namespaces/default/pods', () => {
            return HttpResponse.json({
              kind: 'PodList',
              items: [],
            });
          }),
          http.get(
            'http://localhost:4466/apis/metrics.k8s.io/v1beta1/namespaces/default/pods',
            () =>
              HttpResponse.json({
                kind: 'List',
                items: [],
              })
          ),
          http.get('http://localhost:4466/api/v1/namespaces/default/events', () => {
            return HttpResponse.json({
              kind: 'EventList',
              items: [],
            });
          }),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn<typeof StatefulSetDetails> = args => <StatefulSetDetails {...args} />;

export const Default = Template.bind({});
Default.args = {
  name: 'mock-statefulset',
  namespace: 'default',
};
Default.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/apps/v1/namespaces/default/statefulsets/mock-statefulset',
          () => HttpResponse.json(mockStatefulSet)
        ),
      ],
    },
  },
};

export const WithOnDeleteStrategy = Template.bind({});
WithOnDeleteStrategy.args = {
  name: 'mock-statefulset',
  namespace: 'default',
};
WithOnDeleteStrategy.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/apps/v1/namespaces/default/statefulsets/mock-statefulset',
          () => {
            return HttpResponse.json({
              ...mockStatefulSet,
              spec: {
                ...mockStatefulSet.spec,
                updateStrategy: {
                  type: 'OnDelete',
                },
              },
            });
          }
        ),
      ],
    },
  },
};

export const WithComplexSelector = Template.bind({});
WithComplexSelector.args = {
  name: 'mock-statefulset',
  namespace: 'default',
};
WithComplexSelector.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/apps/v1/namespaces/default/statefulsets/mock-statefulset',
          () => {
            return HttpResponse.json({
              ...mockStatefulSet,
              spec: {
                ...mockStatefulSet.spec,
                selector: {
                  matchLabels: {
                    app: 'mock-app',
                    tier: 'backend',
                    environment: 'production',
                  },
                },
              },
            });
          }
        ),
      ],
    },
  },
};

export const WithMultipleContainers = Template.bind({});
WithMultipleContainers.args = {
  name: 'mock-statefulset',
  namespace: 'default',
};
WithMultipleContainers.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/apps/v1/namespaces/default/statefulsets/mock-statefulset',
          () => {
            return HttpResponse.json({
              ...mockStatefulSet,
              spec: {
                ...mockStatefulSet.spec,
                template: {
                  ...mockStatefulSet.spec.template,
                  spec: {
                    containers: [
                      {
                        name: 'main',
                        image: 'mock-image:latest',
                      },
                      {
                        name: 'sidecar',
                        image: 'sidecar-image:latest',
                      },
                    ],
                  },
                },
              },
            });
          }
        ),
      ],
    },
  },
};
