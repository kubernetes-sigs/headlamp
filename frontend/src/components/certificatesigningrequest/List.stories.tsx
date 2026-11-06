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
import CertificateSigningRequestList from './List';
import { CSR_DUMMY_DATA } from './storyHelper';

const listUrl = `${API_BASE}/apis/certificates.k8s.io/v1/certificatesigningrequests`;

const csrList = (items: typeof CSR_DUMMY_DATA) =>
  HttpResponse.json({
    kind: 'CertificateSigningRequestList',
    items,
    metadata: {},
  });

export default {
  title: 'CertificateSigningRequest/List',
  component: CertificateSigningRequestList,
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
        story: [http.get(listUrl, () => csrList(CSR_DUMMY_DATA))],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return (
    <Container maxWidth="xl">
      <CertificateSigningRequestList />
    </Container>
  );
};

export const CertificateSigningRequests = Template.bind({});

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [http.get(listUrl, () => new Promise(() => {}))],
    },
  },
};

export const Empty = Template.bind({});
Empty.parameters = {
  msw: {
    handlers: {
      story: [http.get(listUrl, () => csrList([]))],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [http.get(listUrl, () => HttpResponse.error())],
    },
  },
};
