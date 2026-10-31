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
import ClusterTrustBundleList from './List';
import { CTB_DUMMY_DATA } from './storyHelper';

const listUrl = `${API_BASE}/apis/certificates.k8s.io/v1beta1/clustertrustbundles`;

/**
 * The class declares v1 ahead of v1beta1, so the endpoint tries v1 first and falls
 * back. A cluster without the newer version answers 404 there, as this does.
 */
const v1NotServed = http.get(`${API_BASE}/apis/certificates.k8s.io/v1/clustertrustbundles`, () =>
  HttpResponse.json(
    { message: 'the server could not find the requested resource' },
    { status: 404 }
  )
);

const bundleList = (items: typeof CTB_DUMMY_DATA) =>
  HttpResponse.json({
    kind: 'ClusterTrustBundleList',
    items,
    metadata: {},
  });

export default {
  title: 'ClusterTrustBundle/List',
  component: ClusterTrustBundleList,
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
        story: [v1NotServed, http.get(listUrl, () => bundleList(CTB_DUMMY_DATA))],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return (
    <Container maxWidth="xl">
      <ClusterTrustBundleList />
    </Container>
  );
};

export const ClusterTrustBundles = Template.bind({});

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [v1NotServed, http.get(listUrl, () => new Promise(() => {}))],
    },
  },
};

export const Empty = Template.bind({});
Empty.parameters = {
  msw: {
    handlers: {
      story: [v1NotServed, http.get(listUrl, () => bundleList([]))],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [v1NotServed, http.get(listUrl, () => HttpResponse.error())],
    },
  },
};
