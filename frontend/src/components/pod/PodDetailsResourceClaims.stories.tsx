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
import { useEffect } from 'react';
import { API_BASE, TestContext } from '../../test';
import PodDetails from './Details';
import { podWithResourceClaims } from './storyHelper';

const { name } = podWithResourceClaims.metadata;
const namespace = podWithResourceClaims.metadata.namespace ?? 'default';
const cluster = 'gpu-cluster';
const namespaceUrl = `${API_BASE}/clusters/${cluster}/api/v1/namespaces/${namespace}`;
const podsUrl = `${namespaceUrl}/pods`;
const INITIAL_PATH = window.location.pathname;

export default {
  title: 'Pod/PodDetailsWithResourceClaims',
  component: PodDetails,
  decorators: [
    Story => {
      window.history.replaceState({}, '', `/c/${cluster}/pods/${namespace}/${name}`);

      const RestorePath = () => {
        useEffect(() => () => window.history.replaceState({}, '', INITIAL_PATH), []);
        return <Story />;
      };

      return <RestorePath />;
    },
  ],
} as Meta;

export const WithResourceClaims: StoryFn = () => (
  <TestContext routerMap={{ cluster, namespace, name }} urlPrefix="/c">
    <PodDetails />
  </TestContext>
);
WithResourceClaims.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${podsUrl}/${name}`, () => HttpResponse.json(podWithResourceClaims)),
        http.get(podsUrl, () => HttpResponse.error()),
        http.get(`${namespaceUrl}/events`, () =>
          HttpResponse.json({ kind: 'EventList', items: [], metadata: {} })
        ),
        http.post(
          `${API_BASE}/clusters/${cluster}/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`,
          () => HttpResponse.json({ status: { allowed: true } })
        ),
      ],
    },
  },
};
