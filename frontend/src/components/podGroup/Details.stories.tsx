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
import { POD_GROUP_DUMMY_DATA } from './storyHelper';

const podGroup = POD_GROUP_DUMMY_DATA[0];
const name = podGroup.metadata.name;
const namespace = podGroup.metadata.namespace ?? 'default';

const SERVED_VERSION = 'scheduling.k8s.io/v1beta1';
const OLDER_VERSIONS = ['scheduling.k8s.io/v1alpha3', 'scheduling.k8s.io/v1alpha2'];
const allVersions = [SERVED_VERSION, ...OLDER_VERSIONS];

const detailsUrl = (apiVersion: string) =>
  `${API_BASE}/apis/${apiVersion}/namespaces/${namespace}/podgroups/${name}`;

/** A cluster on v1beta1 does not answer for the versions it has moved past. */
const olderVersionsUnavailable = OLDER_VERSIONS.map(apiVersion =>
  http.get(detailsUrl(apiVersion), () => HttpResponse.error())
);

/** The details view also watches the collection for the object it shows. */
const collectionWatch = allVersions.map(apiVersion =>
  http.get(`${API_BASE}/apis/${apiVersion}/namespaces/${namespace}/podgroups`, () =>
    HttpResponse.error()
  )
);

const emptyEvents = http.get(`${API_BASE}/api/v1/namespaces/${namespace}/events`, () =>
  HttpResponse.json({
    kind: 'EventList',
    items: [],
    metadata: {},
  })
);

export default {
  title: 'PodGroup/Details',
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

export const PodGroupDetails = Template.bind({});
PodGroupDetails.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(SERVED_VERSION), () => HttpResponse.json(podGroup)),
        ...olderVersionsUnavailable,
        ...collectionWatch,
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
      story: [
        ...allVersions.map(apiVersion =>
          http.get(detailsUrl(apiVersion), () => new Promise(() => {}))
        ),
        ...collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [
        ...allVersions.map(apiVersion =>
          http.get(detailsUrl(apiVersion), () => HttpResponse.error())
        ),
        ...collectionWatch,
        emptyEvents,
      ],
    },
  },
};
