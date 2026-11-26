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
import { expect } from 'storybook/test';
import { API_BASE, TestContext } from '../../test';
import ClusterTrustBundleList from './List';
import { CTB_DUMMY_DATA } from './storyHelper';

const apiVersionUrl = `${API_BASE}/clusters/main/apis/certificates.k8s.io/v1beta1`;
const listUrl = `${apiVersionUrl}/clustertrustbundles`;

const servesBundles = http.get(apiVersionUrl, () =>
  HttpResponse.json({
    kind: 'APIResourceList',
    groupVersion: 'certificates.k8s.io/v1beta1',
    resources: [{ name: 'clustertrustbundles' }],
  })
);

const allowsCreate = http.post(
  `${API_BASE}/clusters/main/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`,
  () => HttpResponse.json({ status: { allowed: true } })
);

const bundleList = (items: typeof CTB_DUMMY_DATA) =>
  HttpResponse.json({
    apiVersion: 'certificates.k8s.io/v1beta1',
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
        <TestContext routerMap={{ cluster: 'main' }} urlPrefix="/c">
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        story: [servesBundles, allowsCreate, http.get(listUrl, () => bundleList(CTB_DUMMY_DATA))],
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
ClusterTrustBundles.parameters = {
  storyshots: {
    waitForState: () => {
      const signedName = document.body.querySelector(
        'a[href="/c/main/clustertrustbundles/example.com:my-signer:roots"]'
      );
      expect(signedName).toBeVisible();
      expect(signedName).toHaveTextContent('example.com:my-signer:roots');
      expect(document.body).toHaveTextContent('example.com/my-signer');
      expect(document.body).toHaveTextContent('internal-roots');
      expect(document.body).toHaveTextContent('2');
    },
  },
};

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [servesBundles, allowsCreate, http.get(listUrl, () => new Promise(() => {}))],
    },
  },
};

export const Empty = Template.bind({});
Empty.parameters = {
  storyshots: {
    waitForState: () => {
      expect(document.body).toHaveTextContent('No data to be shown');
    },
  },
  msw: {
    handlers: {
      story: [servesBundles, allowsCreate, http.get(listUrl, () => bundleList([]))],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [servesBundles, allowsCreate, http.get(listUrl, () => HttpResponse.error())],
    },
  },
};
