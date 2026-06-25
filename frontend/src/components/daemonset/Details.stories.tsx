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
import { KubeObjectInterface } from '../../lib/k8s/KubeObject';
import { API_BASE, TestContext } from '../../test';
import Details from './Details';
import { DAEMONSET_DUMMY, DAEMONSET_NO_TOLERATIONS } from './storyHelper';

const emptyList = { kind: 'List', apiVersion: 'v1', metadata: {}, items: [] };

const podMetricsList = {
  kind: 'PodMetricsList',
  apiVersion: 'metrics.k8s.io/v1beta1',
  metadata: {},
  items: [],
};

// DaemonSets are namespaced, so the owned pods, pod metrics, events and
// controller revisions the details view pulls in are all queried under the
// DaemonSet's namespace. The collection path is also handled because the
// details view fires a watch on it in addition to the get-by-name request.
function commonHandlers(namespace: string) {
  return [
    http.get(`${API_BASE}/apis/apps/v1/namespaces/${namespace}/daemonsets`, () =>
      HttpResponse.json(emptyList)
    ),
    http.get(`${API_BASE}/api/v1/namespaces/${namespace}/pods`, () => HttpResponse.json(emptyList)),
    http.get(`${API_BASE}/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods`, () =>
      HttpResponse.json(podMetricsList)
    ),
    http.get(`${API_BASE}/api/v1/namespaces/${namespace}/events`, () =>
      HttpResponse.json(emptyList)
    ),
    http.get(`${API_BASE}/apis/apps/v1/namespaces/${namespace}/controllerrevisions`, () =>
      HttpResponse.json(emptyList)
    ),
  ];
}

const Template: StoryFn = () => <Details />;

// Build a story whose router param and get-by-name handler both match the
// DaemonSet's own name and namespace, so the mocked route stays realistic.
function makeStory(daemonSet: KubeObjectInterface) {
  const namespace = daemonSet.metadata.namespace ?? 'gadget';
  const name = daemonSet.metadata.name;

  const story = Template.bind({});
  story.decorators = [
    Story => (
      <TestContext routerMap={{ namespace, name }}>
        <Story />
      </TestContext>
    ),
  ];
  story.parameters = {
    msw: {
      handlers: {
        story: [
          http.get(`${API_BASE}/apis/apps/v1/namespaces/${namespace}/daemonsets/${name}`, () =>
            HttpResponse.json(daemonSet)
          ),
          ...commonHandlers(namespace),
        ],
      },
    },
  };
  return story;
}

export default {
  title: 'DaemonSet/Details',
  component: Details,
  argTypes: {},
} as Meta;

export const Default = makeStory(DAEMONSET_DUMMY);

export const NoTolerations = makeStory(DAEMONSET_NO_TOLERATIONS);
