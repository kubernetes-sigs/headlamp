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

import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import type { Cluster } from '../../lib/k8s/cluster';
import Pod from '../../lib/k8s/pod';
import { initialState as configInitialState } from '../../redux/configSlice';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import { generateK8sResourceList } from '../../test/mocker';
import { podList } from '../pod/storyHelper';
import { GlobalSearchContent } from './GlobalSearchContent';

const phonyPods = generateK8sResourceList(
  {
    ...podList[5],
    metadata: {
      ...podList[5].metadata,
      name: 'pod-{{i}}',
    },
  },
  { instantiateAs: Pod }
);

const sampleCluster: Cluster = {
  name: 'sample-cluster',
  auth_type: '',
};

const store = configureStore({
  reducer: reducers,
  preloadedState: {
    config: {
      ...configInitialState,
      clusters: {
        [sampleCluster.name]: sampleCluster,
      },
      allClusters: {
        [sampleCluster.name]: sampleCluster,
      },
    },
  },
});

const queryClients = new Map<string, QueryClient>();
const recentSearchItemsKey = 'search-recent-items';
const sampleClusterApiBase = `http://localhost:4466/clusters/${sampleCluster.name}`;

function getQueryClient(storyId: string) {
  let queryClient = queryClients.get(storyId);
  if (!queryClient) {
    queryClient = new QueryClient();
    queryClients.set(storyId, queryClient);
  }

  return queryClient;
}

function makeKubeList(apiVersion: string, kind: string, items: any[] = []) {
  return {
    apiVersion,
    kind: `${kind}List`,
    metadata: {
      resourceVersion: '1',
    },
    items,
  };
}

const meta: Meta<typeof GlobalSearchContent> = {
  title: 'GlobalSearch/GlobalSearchContent',
  component: GlobalSearchContent,
  args: {
    defaultValue: '',
    maxWidth: 500,
    onBlur: () => {},
  },
  parameters: {
    msw: {
      handlers: {
        pod: [
          http.get(`${sampleClusterApiBase}/api/v1/pods`, () =>
            HttpResponse.json(
              makeKubeList(
                'v1',
                'Pod',
                phonyPods.map(pod => pod.jsonData)
              )
            )
          ),
        ],
        resources: [
          http.get(`${sampleClusterApiBase}/apis/apps/v1/deployments`, () =>
            HttpResponse.json(makeKubeList('apps/v1', 'Deployment'))
          ),
          http.get(`${sampleClusterApiBase}/api/v1/services`, () =>
            HttpResponse.json(makeKubeList('v1', 'Service'))
          ),
          http.get(`${sampleClusterApiBase}/apis/batch/v1/jobs`, () =>
            HttpResponse.json(makeKubeList('batch/v1', 'Job'))
          ),
          http.get(`${sampleClusterApiBase}/apis/batch/v1/cronjobs`, () =>
            HttpResponse.json(makeKubeList('batch/v1', 'CronJob'))
          ),
          http.get(`${sampleClusterApiBase}/api/v1/configmaps`, () =>
            HttpResponse.json(makeKubeList('v1', 'ConfigMap'))
          ),
          http.get(`${sampleClusterApiBase}/api/v1/namespaces`, () =>
            HttpResponse.json(makeKubeList('v1', 'Namespace'))
          ),
          http.get(`${sampleClusterApiBase}/apis/apps/v1/statefulsets`, () =>
            HttpResponse.json(makeKubeList('apps/v1', 'StatefulSet'))
          ),
          http.get(`${sampleClusterApiBase}/apis/apps/v1/replicasets`, () =>
            HttpResponse.json(makeKubeList('apps/v1', 'ReplicaSet'))
          ),
          http.get(`${sampleClusterApiBase}/api/v1/persistentvolumeclaims`, () =>
            HttpResponse.json(makeKubeList('v1', 'PersistentVolumeClaim'))
          ),
          http.get(`${sampleClusterApiBase}/api/v1/endpoints`, () =>
            HttpResponse.json(makeKubeList('v1', 'Endpoints'))
          ),
          http.get(`${sampleClusterApiBase}/apis/discovery.k8s.io/v1/endpointslices`, () =>
            HttpResponse.json(makeKubeList('discovery.k8s.io/v1', 'EndpointSlice'))
          ),
          http.get(`${sampleClusterApiBase}/apis/networking.k8s.io/v1/ingresses`, () =>
            HttpResponse.json(makeKubeList('networking.k8s.io/v1', 'Ingress'))
          ),
          http.get(`${sampleClusterApiBase}/apis/extensions/v1beta1/ingresses`, () =>
            HttpResponse.json(makeKubeList('extensions/v1beta1', 'Ingress'))
          ),
          http.get(`${sampleClusterApiBase}/api/v1/serviceaccounts`, () =>
            HttpResponse.json(makeKubeList('v1', 'ServiceAccount'))
          ),
          http.get(`${sampleClusterApiBase}/api/v1/nodes`, () =>
            HttpResponse.json(makeKubeList('v1', 'Node'))
          ),
          http.get(`${sampleClusterApiBase}/apis/jobset.x-k8s.io/v1alpha2/jobsets`, () =>
            HttpResponse.json(makeKubeList('jobset.x-k8s.io/v1alpha2', 'JobSet'))
          ),
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      localStorage.removeItem(recentSearchItemsKey);

      const queryClient = getQueryClient(context.id);

      return (
        <QueryClientProvider client={queryClient}>
          <TestContext store={store} routerMap={{ cluster: sampleCluster.name }} urlPrefix="/c">
            <Story />
          </TestContext>
        </QueryClientProvider>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof GlobalSearchContent>;

export const WithEmptyInput: Story = {};

export const LoadingResources: Story = {
  args: {
    defaultValue: 'pod',
  },
  parameters: {
    storyshots: {
      disable: true,
    },
    msw: {
      handlers: {
        pod: [
          http.get(`${sampleClusterApiBase}/api/v1/pods`, async () => {
            await delay('infinite');
            return HttpResponse.json(makeKubeList('v1', 'Pod'));
          }),
        ],
      },
    },
  },
};

export const FoundSomeResults: Story = {
  args: {
    defaultValue: 'pod',
  },
};
