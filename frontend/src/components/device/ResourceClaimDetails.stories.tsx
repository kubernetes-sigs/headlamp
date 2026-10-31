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
import type { KubeResourceClaim } from '../../lib/k8s/resourceClaim';
import { API_BASE, TestContext } from '../../test';
import ResourceClaimDetails from './ResourceClaimDetails';
import { RESOURCE_CLAIM_DUMMY_DATA } from './storyHelper';

const [pendingClaim, sharedClaim] = RESOURCE_CLAIM_DUMMY_DATA;
const namespace = 'default';

const collectionUrl = `${API_BASE}/apis/resource.k8s.io/v1/namespaces/${namespace}/resourceclaims`;
const detailsUrl = (name: string) => `${collectionUrl}/${name}`;

/** The details view also watches the collection for the object it shows. */
const collectionWatch = http.get(collectionUrl, () => HttpResponse.error());

const emptyEvents = http.get(`${API_BASE}/api/v1/namespaces/${namespace}/events`, () =>
  HttpResponse.json({
    kind: 'EventList',
    items: [],
    metadata: {},
  })
);

const handlersFor = (claim: KubeResourceClaim) => [
  http.get(detailsUrl(claim.metadata.name), () => HttpResponse.json(claim)),
  collectionWatch,
  emptyEvents,
];

export default {
  title: 'ResourceClaim/Details',
  component: ResourceClaimDetails,
  argTypes: {},
} as Meta;

const Template: StoryFn<{ name: string }> = args => {
  return (
    <TestContext routerMap={{ namespace, name: args.name }}>
      <ResourceClaimDetails />
    </TestContext>
  );
};

/** Allocated to a node and shared by two pods. */
export const InUse = Template.bind({});
InUse.args = { name: sharedClaim.metadata.name };
InUse.parameters = { msw: { handlers: { story: handlersFor(sharedClaim) } } };

/** Waiting for the scheduler: no allocation, so no node either. */
export const Pending = Template.bind({});
Pending.args = { name: pendingClaim.metadata.name };
Pending.parameters = { msw: { handlers: { story: handlersFor(pendingClaim) } } };

export const Loading = Template.bind({});
Loading.args = { name: sharedClaim.metadata.name };
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(sharedClaim.metadata.name), () => new Promise(() => {})),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const Error = Template.bind({});
Error.args = { name: sharedClaim.metadata.name };
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(sharedClaim.metadata.name), () => HttpResponse.error()),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};
