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
import type {
  KubeResourcePoolStatusRequest,
  PoolStatus,
  ResourcePoolStatusRequestStatus,
} from '../../lib/k8s/resourcePoolStatusRequest';
import { API_BASE, TestContext } from '../../test';
import PoolAvailability from './PoolAvailability';
import { RESOURCE_SLICE_DUMMY_DATA } from './storyHelper';

const driver = 'gpu.example.com';
const cluster = 'gpu-cluster';
const clusterUrl = `${API_BASE}/clusters/${cluster}`;
const requestsUrl = `${clusterUrl}/apis/resource.k8s.io/v1alpha3/resourcepoolstatusrequests`;

const discovery = (served: boolean, base = clusterUrl) =>
  http.get(`${base}/apis/resource.k8s.io/v1alpha3`, () =>
    HttpResponse.json({
      kind: 'APIResourceList',
      groupVersion: 'resource.k8s.io/v1alpha3',
      resources: served
        ? [{ name: 'resourcepoolstatusrequests', kind: 'ResourcePoolStatusRequest' }]
        : [],
    })
  );

const slicesUrl = `${clusterUrl}/apis/resource.k8s.io/v1/resourceslices`;

const slices = http.get(slicesUrl, () =>
  HttpResponse.json({ kind: 'ResourceSliceList', items: RESOURCE_SLICE_DUMMY_DATA, metadata: {} })
);

const pool = (poolName: string, counts: Partial<PoolStatus> = {}): PoolStatus => ({
  driver,
  poolName,
  generation: 1,
  nodeName: poolName,
  resourceSliceCount: 1,
  totalDevices: 4,
  allocatedDevices: 1,
  availableDevices: 3,
  unavailableDevices: 0,
  ...counts,
});

const answer = (status: ResourcePoolStatusRequestStatus): KubeResourcePoolStatusRequest => ({
  apiVersion: 'resource.k8s.io/v1alpha3',
  kind: 'ResourcePoolStatusRequest',
  metadata: { name: 'headlamp-pool-status-x1', uid: 'request-uid', creationTimestamp: '' },
  spec: { driver },
  status,
});

const condition = (type: string, message = type) => ({
  type,
  status: 'True',
  reason: type,
  message,
  lastTransitionTime: '2026-11-21T00:00:00Z',
});

const answers = (status: ResourcePoolStatusRequestStatus | (() => Promise<never>)) => [
  http.post(requestsUrl, () =>
    typeof status === 'function' ? status() : HttpResponse.json(answer(status))
  ),
  http.delete(`${requestsUrl}/:name`, () => HttpResponse.json({})),
];

export default {
  title: 'Device/PoolAvailability',
  component: PoolAvailability,
  argTypes: {},
} as Meta;

interface StoryArgs {
  search?: Record<string, string>;
  clusters?: string;
}

const Template: StoryFn<StoryArgs> = ({ search = { driver }, clusters = cluster }) => (
  <TestContext routerMap={{ cluster: clusters }} urlPrefix="/c" urlSearchParams={search}>
    <Container maxWidth="xl">
      <PoolAvailability />
    </Container>
  </TestContext>
);

export const Pools = Template.bind({});
Pools.parameters = {
  msw: {
    handlers: {
      story: [
        discovery(true),
        slices,
        ...answers({
          poolCount: 2,
          pools: [
            pool('gpu-worker-0'),
            pool('gpu-worker-1', { allocatedDevices: 4, availableDevices: 0 }),
          ],
          conditions: [condition('Complete')],
        }),
      ],
    },
  },
};

export const OnePool = Template.bind({});
OnePool.args = { search: { driver, pool: 'gpu-worker-0' } };
OnePool.parameters = Pools.parameters;

export const SeveralClusters = Template.bind({});
SeveralClusters.args = { clusters: `cpu-cluster+${cluster}` };
SeveralClusters.parameters = {
  msw: {
    handlers: {
      story: [
        discovery(false, `${API_BASE}/clusters/cpu-cluster`),
        ...Pools.parameters.msw.handlers.story,
      ],
    },
  },
};

export const IncompletePool = Template.bind({});
IncompletePool.parameters = {
  msw: {
    handlers: {
      story: [
        discovery(true),
        slices,
        ...answers({
          poolCount: 2,
          pools: [
            pool('gpu-worker-0'),
            pool('gpu-worker-1', {
              totalDevices: undefined,
              allocatedDevices: undefined,
              availableDevices: undefined,
              unavailableDevices: undefined,
              validationError: 'PoolIncomplete: 1 of 2 slices published',
            }),
          ],
          conditions: [condition('Complete')],
        }),
      ],
    },
  },
};

export const ValidationError = Template.bind({});
ValidationError.parameters = {
  msw: {
    handlers: {
      story: [
        discovery(true),
        slices,
        ...answers({
          poolCount: 1,
          pools: [pool('gpu-worker-0', { validationError: 'PartitionTypeMissing: gpu-0' })],
          conditions: [condition('Complete')],
        }),
      ],
    },
  },
};

export const Truncated = Template.bind({});
Truncated.parameters = {
  msw: {
    handlers: {
      story: [
        discovery(true),
        slices,
        ...answers({
          poolCount: 150,
          pools: [pool('gpu-worker-0')],
          conditions: [condition('Complete')],
        }),
      ],
    },
  },
};

export const Failed = Template.bind({});
Failed.parameters = {
  msw: {
    handlers: {
      story: [
        discovery(true),
        slices,
        ...answers({ conditions: [condition('Failed', 'Listing ResourceSlices failed')] }),
      ],
    },
  },
};

export const Forbidden = Template.bind({});
Forbidden.parameters = {
  msw: {
    handlers: {
      story: [
        discovery(true),
        slices,
        http.post(requestsUrl, () =>
          HttpResponse.json(
            { kind: 'Status', reason: 'Forbidden', code: 403, message: 'forbidden' },
            { status: 403 }
          )
        ),
      ],
    },
  },
};

export const Calculating = Template.bind({});
Calculating.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [discovery(true), slices, http.post(requestsUrl, () => new Promise(() => {}))],
    },
  },
};

export const PickADriver = Template.bind({});
PickADriver.args = { search: {} };
PickADriver.parameters = {
  msw: { handlers: { story: [discovery(true), slices] } },
};

export const NoDrivers = Template.bind({});
NoDrivers.args = { search: {} };
NoDrivers.parameters = {
  msw: {
    handlers: {
      story: [
        discovery(true),
        http.get(slicesUrl, () =>
          HttpResponse.json({ kind: 'ResourceSliceList', items: [], metadata: {} })
        ),
      ],
    },
  },
};

export const LoadingDrivers = Template.bind({});
LoadingDrivers.args = { search: {} };
LoadingDrivers.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [discovery(true), http.get(slicesUrl, () => new Promise(() => {}))],
    },
  },
};

export const DriversError = Template.bind({});
DriversError.args = { search: {} };
DriversError.parameters = {
  msw: {
    handlers: {
      story: [
        discovery(true),
        http.get(slicesUrl, () =>
          HttpResponse.json(
            { kind: 'Status', reason: 'Forbidden', code: 403, message: 'forbidden' },
            { status: 403 }
          )
        ),
      ],
    },
  },
};

export const NotServed = Template.bind({});
NotServed.parameters = {
  msw: { handlers: { story: [discovery(false), slices] } },
};
