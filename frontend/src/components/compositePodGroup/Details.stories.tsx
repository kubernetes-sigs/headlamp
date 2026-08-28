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
import { CHILD_POD_GROUP_DUMMY_DATA, COMPOSITE_POD_GROUP_DUMMY_DATA } from './storyHelper';

const [root, prefill, decode] = COMPOSITE_POD_GROUP_DUMMY_DATA;
const namespace = root.metadata.namespace ?? 'default';

const SERVED_VERSION = 'scheduling.k8s.io/v1alpha3';
const compositesPath = `${API_BASE}/apis/${SERVED_VERSION}/namespaces/${namespace}/compositepodgroups`;
const podGroupsPath = (apiVersion: string) =>
  `${API_BASE}/apis/${apiVersion}/namespaces/${namespace}/podgroups`;

const POD_GROUP_VERSIONS = [
  'scheduling.k8s.io/v1beta1',
  'scheduling.k8s.io/v1alpha3',
  'scheduling.k8s.io/v1alpha2',
];

/**
 * A cluster on v1alpha3 does not answer for the other versions PodGroup offers. The
 * links to the child pod groups also probe the collection itself, to find out which
 * version to address them by.
 */
const podGroupVersionProbes = POD_GROUP_VERSIONS.map(apiVersion =>
  http.get(`${API_BASE}/apis/${apiVersion}/podgroups`, () =>
    apiVersion === SERVED_VERSION
      ? HttpResponse.json({ kind: 'PodGroupList', items: [], metadata: {} })
      : HttpResponse.error()
  )
);

const otherPodGroupVersionsUnavailable = POD_GROUP_VERSIONS.filter(
  apiVersion => apiVersion !== SERVED_VERSION
).map(apiVersion => http.get(podGroupsPath(apiVersion), () => HttpResponse.error()));

/**
 * The details view watches the collections it needs: its own, for the object it shows
 * and for the child composite groups, and the pod groups for the child leaves.
 */
const collections = [
  http.get(compositesPath, () =>
    HttpResponse.json({
      kind: 'CompositePodGroupList',
      items: COMPOSITE_POD_GROUP_DUMMY_DATA,
      metadata: {},
    })
  ),
  http.get(podGroupsPath(SERVED_VERSION), () =>
    HttpResponse.json({
      kind: 'PodGroupList',
      items: CHILD_POD_GROUP_DUMMY_DATA,
      metadata: {},
    })
  ),
  ...otherPodGroupVersionsUnavailable,
  ...podGroupVersionProbes,
];

const emptyEvents = http.get(`${API_BASE}/api/v1/namespaces/${namespace}/events`, () =>
  HttpResponse.json({
    kind: 'EventList',
    items: [],
    metadata: {},
  })
);

const storyFor = (composite: (typeof COMPOSITE_POD_GROUP_DUMMY_DATA)[number]) => ({
  msw: {
    handlers: {
      story: [
        http.get(`${compositesPath}/${composite.metadata.name}`, () =>
          HttpResponse.json(composite)
        ),
        ...collections,
        emptyEvents,
      ],
    },
  },
});

export default {
  title: 'CompositePodGroup/Details',
  component: Details,
  argTypes: {},
} as Meta;

const Template: StoryFn<{ name: string }> = args => (
  <TestContext routerMap={{ namespace, name: args.name }}>
    <Details />
  </TestContext>
);

/** A hierarchy root, whose children are the two stage groups below it. */
export const CompositePodGroupDetails = Template.bind({});
CompositePodGroupDetails.args = { name: root.metadata.name };
CompositePodGroupDetails.parameters = storyFor(root);

/** A stage group, whose children are the pod groups that hold the pods. */
export const WithChildPodGroups = Template.bind({});
WithChildPodGroups.args = { name: prefill.metadata.name };
WithChildPodGroups.parameters = storyFor(prefill);

/** A group whose subtree never met its scheduling requirement. */
export const Unschedulable = Template.bind({});
Unschedulable.args = { name: decode.metadata.name };
Unschedulable.parameters = storyFor(decode);

export const Loading = Template.bind({});
Loading.args = { name: root.metadata.name };
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(`${compositesPath}/${root.metadata.name}`, () => new Promise(() => {})),
        ...collections,
        emptyEvents,
      ],
    },
  },
};

export const Error = Template.bind({});
Error.args = { name: root.metadata.name };
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${compositesPath}/${root.metadata.name}`, () => HttpResponse.error()),
        ...collections,
        emptyEvents,
      ],
    },
  },
};
