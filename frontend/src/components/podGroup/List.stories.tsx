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
import { POD_GROUP_DUMMY_DATA } from './storyHelper';

const SERVED_VERSION = 'scheduling.k8s.io/v1beta1';
const OLDER_VERSIONS = ['scheduling.k8s.io/v1alpha3', 'scheduling.k8s.io/v1alpha2'];

const listUrl = (apiVersion: string) => `${API_BASE}/apis/${apiVersion}/podgroups`;

/** A cluster on v1beta1 does not answer for the versions it has moved past. */
const olderVersionsUnavailable = OLDER_VERSIONS.map(apiVersion =>
  http.get(listUrl(apiVersion), () => HttpResponse.error())
);

const allVersions = [SERVED_VERSION, ...OLDER_VERSIONS];

const podGroupList = (items: typeof POD_GROUP_DUMMY_DATA) =>
  HttpResponse.json({
    kind: 'PodGroupList',
    items,
    metadata: {},
  });

export default {
  title: 'PodGroup/List',
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
          http.get(listUrl(SERVED_VERSION), () => podGroupList(POD_GROUP_DUMMY_DATA)),
          ...olderVersionsUnavailable,
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

export const PodGroups = Template.bind({});

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: allVersions.map(apiVersion =>
        http.get(listUrl(apiVersion), () => new Promise(() => {}))
      ),
    },
  },
};

export const Empty = Template.bind({});
Empty.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(listUrl(SERVED_VERSION), () => podGroupList([])),
        ...olderVersionsUnavailable,
      ],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: allVersions.map(apiVersion =>
        http.get(listUrl(apiVersion), () => HttpResponse.error())
      ),
    },
  },
};
