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
import Endpoints, { KubeEndpoint, KubeEndpointSubset } from '../../../lib/k8s/endpoints';
import { EndpointsGlance } from './EndpointsGlance';

export default {
  title: 'resourceMap/KubeObjectGlance/EndpointsGlance',
  component: EndpointsGlance,
} as Meta<typeof EndpointsGlance>;

const Template: StoryFn<typeof EndpointsGlance> = args => <EndpointsGlance {...args} />;

function createEndpoints(subsets: KubeEndpointSubset[]): Endpoints {
  const json: KubeEndpoint = {
    apiVersion: 'v1',
    kind: 'Endpoints',
    metadata: {
      name: 'my-endpoints',
      namespace: 'default',
      uid: 'endpoints-uid',
      creationTimestamp: new Date().toISOString(),
      resourceVersion: '1',
      selfLink: '',
    } as any,
    subsets,
  };
  return new Endpoints(json);
}

export const SingleAddress = Template.bind({});
SingleAddress.args = {
  endpoints: createEndpoints([
    {
      addresses: [{ hostname: 'pod-1', ip: '10.244.0.5' }],
      ports: [{ name: 'http', appProtocol: 'http', port: 80, protocol: 'TCP' }],
    },
  ]),
};

export const MultipleAddressesAndPorts = Template.bind({});
MultipleAddressesAndPorts.args = {
  endpoints: createEndpoints([
    {
      addresses: [
        { hostname: 'pod-1', ip: '10.244.0.5' },
        { hostname: 'pod-2', ip: '10.244.0.6' },
        { hostname: 'pod-3', ip: '10.244.0.7' },
      ],
      ports: [
        { name: 'http', appProtocol: 'http', port: 80, protocol: 'TCP' },
        { name: 'https', appProtocol: 'https', port: 443, protocol: 'TCP' },
      ],
    },
  ]),
};

export const NoAddresses = Template.bind({});
NoAddresses.args = {
  endpoints: createEndpoints([
    { addresses: [], ports: [{ name: '', appProtocol: 'http', port: 80, protocol: 'TCP' }] },
  ]),
};
