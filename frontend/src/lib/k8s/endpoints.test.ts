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

import { describe, expect, it } from 'vitest';
import App from '../../App';
import Endpoints, { KubeEndpointSubset } from './endpoints';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function makeEndpoints(subsets: KubeEndpointSubset[]) {
  return new Endpoints({
    apiVersion: 'v1',
    kind: 'Endpoints',
    metadata: {
      name: 'test-endpoints',
      namespace: 'default',
      uid: 'uid',
      creationTimestamp: '2020-01-01T00:00:00Z',
    },
    subsets,
  });
}

describe('Endpoints.getAddresses', () => {
  it('pairs every address with every port', () => {
    const endpoints = makeEndpoints([
      {
        addresses: [{ ip: '10.0.0.1' }, { ip: '10.0.0.2' }],
        ports: [
          { name: 'http', port: 80, protocol: 'TCP' },
          { name: 'https', port: 443, protocol: 'TCP' },
        ],
      } as KubeEndpointSubset,
    ]);
    expect(endpoints.getAddresses()).toEqual([
      '10.0.0.1:80',
      '10.0.0.2:80',
      '10.0.0.1:443',
      '10.0.0.2:443',
    ]);
  });

  it('wraps IPv6 addresses in brackets', () => {
    const endpoints = makeEndpoints([
      {
        addresses: [{ ip: 'fd00:10::5' }, { ip: '10.0.0.1' }],
        ports: [{ name: 'http', port: 80, protocol: 'TCP' }],
      } as KubeEndpointSubset,
    ]);
    expect(endpoints.getAddresses()).toEqual(['[fd00:10::5]:80', '10.0.0.1:80']);
  });

  it('lists the IPs of a subset with no ports, as for a headless service', () => {
    const endpoints = makeEndpoints([
      { addresses: [{ ip: '10.0.0.1' }, { ip: '10.0.0.2' }] } as KubeEndpointSubset,
    ]);
    expect(endpoints.getAddresses()).toEqual(['10.0.0.1', '10.0.0.2']);
    expect(endpoints.getAddressesText()).toBe('10.0.0.1, 10.0.0.2');
  });

  it('returns nothing when there are no subsets', () => {
    expect(makeEndpoints([]).getAddresses()).toEqual([]);
  });
});
