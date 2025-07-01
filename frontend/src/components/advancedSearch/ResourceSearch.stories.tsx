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
import React from 'react';
import { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import { TestContext } from '../../test';
import { ResourceSearch } from './ResourceSearch';

export default {
  title: 'AdvancedSearch/ResourceSearch',
  component: ResourceSearch,
  argTypes: {},
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get('http://localhost:4466/clusters/kind-kind/api/v1/pods', () =>
            HttpResponse.json({
              kind: 'PodList',
              apiVersion: 'v1',
              metadata: {},
              items: [
                {
                  metadata: {
                    name: 'test-pod-1',
                    namespace: 'default',
                    uid: 'pod-uid-1',
                    creationTimestamp: '2025-06-09T10:00:00Z',
                  },
                  spec: {
                    nodeName: 'kind-control-plane',
                  },
                  status: {
                    phase: 'Running',
                    containerStatuses: [
                      {
                        name: 'nginx',
                        ready: true,
                        restartCount: 0,
                        image: 'nginx:latest',
                        imageID: '',
                        state: { running: {} },
                      },
                    ],
                  },
                },
              ],
            })
          ),
          http.get('http://localhost:4466/clusters/kind-kind/apis/apps/v1/deployments', () =>
            HttpResponse.json({
              kind: 'DeploymentList',
              apiVersion: 'apps/v1',
              metadata: {},
              items: [
                {
                  metadata: {
                    name: 'test-deployment-1',
                    namespace: 'default',
                    uid: 'deploy-uid-1',
                    creationTimestamp: '2025-06-09T10:00:00Z',
                  },
                  spec: {
                    replicas: 1,
                    selector: { matchLabels: { app: 'test' } },
                    template: {
                      metadata: { labels: { app: 'test' } },
                      spec: { containers: [{ name: 'nginx', image: 'nginx' }] },
                    },
                  },
                  status: {
                    replicas: 1,
                    readyReplicas: 1,
                    availableReplicas: 1,
                    conditions: [
                      {
                        type: 'Available',
                        status: 'True',
                        reason: 'MinimumReplicasAvailable',
                        message: 'Deployment has minimum availability.',
                      },
                    ],
                  },
                },
              ],
            })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn<{
  resources: ApiResource[];
  selectedClusters: string[];
  rawQuery: string;
  maxItemsPerResource: number;
  refetchIntervalMs: number;
  setRawQuery: (q?: string) => void;
}> = args => (
  <TestContext>
    <ResourceSearch {...args} />
  </TestContext>
);

export const Default = Template.bind({});
Default.args = {
  resources: [
    {
      apiVersion: 'v1',
      version: 'v1',
      singularName: 'pod',
      kind: 'Pod',
      groupName: 'core',
      pluralName: 'pods',
      isNamespaced: true,
    },
    {
      apiVersion: 'v1',
      version: 'v1',
      singularName: 'deployment',
      kind: 'Deployment',
      groupName: 'apps',
      pluralName: 'deployments',
      isNamespaced: true,
    },
  ],
  selectedClusters: ['kind-kind'],
  rawQuery: 'status.phase === "Running"',
  maxItemsPerResource: 10000,
  refetchIntervalMs: 60000,
  setRawQuery: () => {},
};
