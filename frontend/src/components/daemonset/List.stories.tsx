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
import { API_BASE, TestContext } from '../../test';
import List from './List';
import { DAEMONSET_DUMMY_LIST } from './storyHelper';

const objList = DAEMONSET_DUMMY_LIST;

export default {
  title: 'DaemonSet/List',
  component: List,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get(`${API_BASE}/apis/apps/v1/daemonsets`, () =>
            HttpResponse.json({
              kind: 'DaemonSetList',
              items: objList,
              metadata: {},
            })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return (
    <Container maxWidth="xl">
      <List />
    </Container>
  );
};

export const DaemonSets = Template.bind({});

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [http.get(`${API_BASE}/apis/apps/v1/daemonsets`, () => new Promise(() => {}))],
    },
  },
};

export const Empty = Template.bind({});
Empty.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/apis/apps/v1/daemonsets`, () =>
          HttpResponse.json({
            kind: 'DaemonSetList',
            items: [],
            metadata: {},
          })
        ),
      ],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [http.get(`${API_BASE}/apis/apps/v1/daemonsets`, () => HttpResponse.error())],
    },
  },
};

export const LongName = Template.bind({});
LongName.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/apis/apps/v1/daemonsets`, () =>
          HttpResponse.json({
            kind: 'DaemonSetList',
            items: [
              {
                ...objList[0],
                metadata: {
                  ...objList[0].metadata,
                  name: 'this-is-a-very-long-daemonset-name-that-should-test-overflow-behaviour',
                  namespace: 'this-is-also-a-very-long-namespace-name',
                },
              },
            ],
            metadata: {},
          })
        ),
      ],
    },
  },
};
