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
import type { KubeResourceClaimTemplate } from '../../lib/k8s/resourceClaimTemplate';
import { API_BASE, TestContext } from '../../test';
import ResourceClaimTemplateDetails from './ResourceClaimTemplateDetails';
import {
  PRIORITIZED_RESOURCE_CLAIM_TEMPLATE,
  RESOURCE_CLAIM_TEMPLATE_DUMMY_DATA,
} from './storyHelper';

const [singleRequest, multipleRequests] = RESOURCE_CLAIM_TEMPLATE_DUMMY_DATA;
const namespace = 'default';

const collectionUrl = `${API_BASE}/apis/resource.k8s.io/v1/namespaces/${namespace}/resourceclaimtemplates`;
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

const handlersFor = (template: KubeResourceClaimTemplate) => [
  http.get(detailsUrl(template.metadata.name), () => HttpResponse.json(template)),
  collectionWatch,
  emptyEvents,
];

export default {
  title: 'ResourceClaimTemplate/Details',
  component: ResourceClaimTemplateDetails,
  argTypes: {},
} as Meta;

const Template: StoryFn<{ name: string }> = args => {
  return (
    <TestContext routerMap={{ namespace, name: args.name }}>
      <ResourceClaimTemplateDetails />
    </TestContext>
  );
};

export const SingleRequest = Template.bind({});
SingleRequest.args = { name: singleRequest.metadata.name };
SingleRequest.parameters = { msw: { handlers: { story: handlersFor(singleRequest) } } };

export const MultipleRequests = Template.bind({});
MultipleRequests.args = { name: multipleRequests.metadata.name };
MultipleRequests.parameters = { msw: { handlers: { story: handlersFor(multipleRequests) } } };

export const PrioritizedRequest = Template.bind({});
PrioritizedRequest.args = { name: PRIORITIZED_RESOURCE_CLAIM_TEMPLATE.metadata.name };
PrioritizedRequest.parameters = {
  msw: { handlers: { story: handlersFor(PRIORITIZED_RESOURCE_CLAIM_TEMPLATE) } },
};

export const Loading = Template.bind({});
Loading.args = { name: singleRequest.metadata.name };
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(singleRequest.metadata.name), () => new Promise(() => {})),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const Error = Template.bind({});
Error.args = { name: singleRequest.metadata.name };
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(singleRequest.metadata.name), () => HttpResponse.error()),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};
