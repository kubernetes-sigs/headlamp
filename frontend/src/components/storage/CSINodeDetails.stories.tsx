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
import Details from './CSINodeDetails';
import { BASE_CSI_NODE } from './storyHelper';

export default {
  title: 'CSINode/DetailsView',
  component: Details,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ name: 'my-node' }}>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn = () => {
  return <Details />;
};

export const Base = Template.bind({});
Base.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/apis/storage.k8s.io/v1/csinodes/my-node`, () =>
          HttpResponse.json(BASE_CSI_NODE)
        ),
        http.get(`${API_BASE}/apis/storage.k8s.io/v1/csinodes`, () => HttpResponse.error()),
        http.get(`${API_BASE}/api/v1/events`, () =>
          HttpResponse.json({
            kind: 'EventList',
            items: [],
            metadata: {},
          })
        ),
      ],
    },
  },
};
