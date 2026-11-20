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
import CertificateSigningRequestDetails from './Details';
import { CSR_DUMMY_DATA } from './storyHelper';

const pendingCSR = CSR_DUMMY_DATA[0];
const issuedCSR = CSR_DUMMY_DATA[1];
const deniedCSR = CSR_DUMMY_DATA[2];

const collectionUrl = `${API_BASE}/apis/certificates.k8s.io/v1/certificatesigningrequests`;
const detailsUrl = (name: string) => `${collectionUrl}/${name}`;

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
  title: 'CertificateSigningRequest/Details',
  component: CertificateSigningRequestDetails,
  argTypes: {},
} as Meta;

const Template: StoryFn<{ name: string }> = args => {
  return (
    <TestContext routerMap={{ name: args.name }}>
      <CertificateSigningRequestDetails />
    </TestContext>
  );
};

const handlersFor = (csr: (typeof CSR_DUMMY_DATA)[number]) => ({
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(csr.metadata.name), () => HttpResponse.json(csr)),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
});

export const Pending = Template.bind({});
Pending.args = { name: pendingCSR.metadata.name };
Pending.parameters = handlersFor(pendingCSR);

export const Issued = Template.bind({});
Issued.args = { name: issuedCSR.metadata.name };
Issued.parameters = handlersFor(issuedCSR);

export const Denied = Template.bind({});
Denied.args = { name: deniedCSR.metadata.name };
Denied.parameters = handlersFor(deniedCSR);

export const Loading = Template.bind({});
Loading.args = { name: pendingCSR.metadata.name };
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(pendingCSR.metadata.name), () => new Promise(() => {})),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const Error = Template.bind({});
Error.args = { name: pendingCSR.metadata.name };
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(pendingCSR.metadata.name), () => HttpResponse.error()),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};
