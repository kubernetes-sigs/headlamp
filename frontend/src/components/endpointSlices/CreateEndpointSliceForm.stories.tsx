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
import React from 'react';
import EndpointSlice from '../../lib/k8s/endpointSlices';
import { TestContext } from '../../test';
import CreateEndpointSliceForm, {
  CreateEndpointSliceFormProps,
  EndpointSliceDraft,
} from './CreateEndpointSliceForm';

export default {
  title: 'endpointSlices/CreateEndpointSliceForm',
  component: CreateEndpointSliceForm,
  argTypes: { onChange: { action: 'changed' } },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<CreateEndpointSliceFormProps> = args => {
  const [resource, setResource] = React.useState<EndpointSliceDraft | undefined>(args.resource);
  return (
    <CreateEndpointSliceForm
      {...args}
      resource={resource}
      onChange={next => {
        setResource(next);
        args.onChange?.(next);
      }}
    />
  );
};

export const Default = Template.bind({});
Default.args = {
  resource: EndpointSlice.getBaseObject(),
};

export const Filled = Template.bind({});
Filled.args = {
  resource: {
    apiVersion: 'discovery.k8s.io/v1',
    kind: 'EndpointSlice',
    metadata: {
      name: 'example-abc',
      labels: { 'kubernetes.io/service-name': 'example' },
    },
    addressType: 'IPv4',
    ports: [{ name: 'http', protocol: 'TCP', port: 80 }],
    endpoints: [
      {
        addresses: ['10.1.2.3'],
        conditions: { ready: true },
        hostname: 'pod-1',
        nodeName: 'node-1',
        zone: 'us-west2-a',
      },
    ],
  },
};

export const FQDN = Template.bind({});
FQDN.args = {
  resource: {
    apiVersion: 'discovery.k8s.io/v1',
    kind: 'EndpointSlice',
    metadata: { name: 'external-backend' },
    addressType: 'FQDN',
    endpoints: [{ addresses: ['backend.example.com'], conditions: { ready: true } }],
  },
};

/** Addresses that don't match the address type or fall in rejected ranges are flagged inline. */
export const InvalidAddresses = Template.bind({});
InvalidAddresses.args = {
  resource: {
    apiVersion: 'discovery.k8s.io/v1',
    kind: 'EndpointSlice',
    metadata: { name: 'example-abc' },
    addressType: 'IPv4',
    endpoints: [{ addresses: ['2001:db8::1', '127.0.0.1', '10.1.2.300'] }],
  },
};
