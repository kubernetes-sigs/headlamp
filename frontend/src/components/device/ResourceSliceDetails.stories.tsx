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
import type { KubeResourceSlice } from '../../lib/k8s/resourceSlice';
import { API_BASE, TestContext } from '../../test';
import ResourceSliceDetails from './ResourceSliceDetails';
import { RESOURCE_SLICE_DUMMY_DATA } from './storyHelper';

const [nodeSlice, allNodesSlice] = RESOURCE_SLICE_DUMMY_DATA;

const collectionUrl = `${API_BASE}/apis/resource.k8s.io/v1/resourceslices`;
const detailsUrl = (name: string) => `${collectionUrl}/${name}`;

const collectionWatch = http.get(collectionUrl, () => HttpResponse.error());

const emptyEvents = http.get(`${API_BASE}/api/v1/namespaces/default/events`, () =>
  HttpResponse.json({
    kind: 'EventList',
    items: [],
    metadata: {},
  })
);

const handlersFor = (slice: KubeResourceSlice) => [
  http.get(detailsUrl(slice.metadata.name), () => HttpResponse.json(slice)),
  collectionWatch,
  emptyEvents,
];

export default {
  title: 'ResourceSlice/Details',
  component: ResourceSliceDetails,
  argTypes: {},
} as Meta;

const Template: StoryFn<{ name: string }> = args => {
  return (
    <TestContext routerMap={{ name: args.name }}>
      <ResourceSliceDetails />
    </TestContext>
  );
};

export const OnANode = Template.bind({});
OnANode.args = { name: nodeSlice.metadata.name };
OnANode.parameters = { msw: { handlers: { story: handlersFor(nodeSlice) } } };

export const AllNodes = Template.bind({});
AllNodes.args = { name: allNodesSlice.metadata.name };
AllNodes.parameters = { msw: { handlers: { story: handlersFor(allNodesSlice) } } };

export const Loading = Template.bind({});
Loading.args = { name: nodeSlice.metadata.name };
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(nodeSlice.metadata.name), () => new Promise(() => {})),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const Error = Template.bind({});
Error.args = { name: nodeSlice.metadata.name };
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(nodeSlice.metadata.name), () => HttpResponse.error()),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};
