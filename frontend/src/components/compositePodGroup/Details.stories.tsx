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
import Details from './Details';
import { COMPOSITE_POD_GROUP_DUMMY_DATA } from './storyHelper';

const compositePodGroup = COMPOSITE_POD_GROUP_DUMMY_DATA[1];
const name = compositePodGroup.metadata.name;
const namespace = compositePodGroup.metadata.namespace ?? 'default';

const SERVED_VERSION = 'scheduling.k8s.io/v1alpha3';
const basePath = `${API_BASE}/apis/${SERVED_VERSION}/namespaces/${namespace}/compositepodgroups`;
const detailsUrl = `${basePath}/${name}`;

/** The details view also watches the collection for the object it shows. */
const collectionWatch = http.get(basePath, () => HttpResponse.error());

const emptyEvents = http.get(`${API_BASE}/api/v1/namespaces/${namespace}/events`, () =>
  HttpResponse.json({
    kind: 'EventList',
    items: [],
    metadata: {},
  })
);

export default {
  title: 'CompositePodGroup/Details',
  component: Details,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ namespace, name }}>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn = () => {
  return <Details />;
};

export const CompositePodGroupDetails = Template.bind({});
CompositePodGroupDetails.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl, () => HttpResponse.json(compositePodGroup)),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const Unschedulable = Template.bind({});
Unschedulable.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl, () =>
          HttpResponse.json({
            ...COMPOSITE_POD_GROUP_DUMMY_DATA[2],
            metadata: { ...COMPOSITE_POD_GROUP_DUMMY_DATA[2].metadata, name },
          })
        ),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [http.get(detailsUrl, () => new Promise(() => {})), collectionWatch, emptyEvents],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [http.get(detailsUrl, () => HttpResponse.error()), collectionWatch, emptyEvents],
    },
  },
};
