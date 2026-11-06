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
import ClusterTrustBundleDetails from './Details';
import { CTB_DUMMY_DATA } from './storyHelper';

const signedBundle = CTB_DUMMY_DATA[0];
const unsignedBundle = CTB_DUMMY_DATA[1];

const collectionUrl = `${API_BASE}/apis/certificates.k8s.io/v1beta1/clustertrustbundles`;
const detailsUrl = (name: string) => `${collectionUrl}/${name}`;

/**
 * The class declares v1 ahead of v1beta1, so every call tries v1 first and falls
 * back. A cluster without the newer version answers 404 there, as this does.
 */
const v1NotServed = http.get(
  `${API_BASE}/apis/certificates.k8s.io/v1/clustertrustbundles/:name`,
  () =>
    HttpResponse.json(
      { message: 'the server could not find the requested resource' },
      { status: 404 }
    )
);

/** The details view also watches the collection for the object it shows. */
const collectionWatch = http.get(collectionUrl, () => HttpResponse.error());

const emptyEvents = http.get(`${API_BASE}/api/v1/namespaces/default/events`, () =>
  HttpResponse.json({
    kind: 'EventList',
    items: [],
    metadata: {},
  })
);

export default {
  title: 'ClusterTrustBundle/Details',
  component: ClusterTrustBundleDetails,
  argTypes: {},
} as Meta;

const Template: StoryFn<{ name: string }> = args => {
  return (
    <TestContext routerMap={{ name: args.name }}>
      <ClusterTrustBundleDetails />
    </TestContext>
  );
};

const handlersFor = (bundle: (typeof CTB_DUMMY_DATA)[number]) => ({
  msw: {
    handlers: {
      story: [
        v1NotServed,
        http.get(detailsUrl(bundle.metadata.name), () => HttpResponse.json(bundle)),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
});

export const SignerBundle = Template.bind({});
SignerBundle.args = { name: signedBundle.metadata.name };
SignerBundle.parameters = handlersFor(signedBundle);

export const UnsignedBundle = Template.bind({});
UnsignedBundle.args = { name: unsignedBundle.metadata.name };
UnsignedBundle.parameters = handlersFor(unsignedBundle);

export const Loading = Template.bind({});
Loading.args = { name: signedBundle.metadata.name };
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        v1NotServed,
        http.get(detailsUrl(signedBundle.metadata.name), () => new Promise(() => {})),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const Error = Template.bind({});
Error.args = { name: signedBundle.metadata.name };
Error.parameters = {
  msw: {
    handlers: {
      story: [
        v1NotServed,
        http.get(detailsUrl(signedBundle.metadata.name), () => HttpResponse.error()),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};
