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
import {
  areEndpointSliceEndpointsValid,
  areEndpointSlicePortsValid,
} from '../../components/endpointSlices/endpointSliceValidation';
import EndpointSlice from './endpointSlices';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('EndpointSlice.getBaseObject', () => {
  it('seeds the create form with an IPv4 slice, one port and one ready endpoint', () => {
    expect(EndpointSlice.getBaseObject()).toEqual({
      apiVersion: 'discovery.k8s.io/v1',
      kind: 'EndpointSlice',
      metadata: { name: '' },
      addressType: 'IPv4',
      ports: [{ name: 'http', port: 80, protocol: 'TCP' }],
      endpoints: [{ addresses: [''], conditions: { ready: true } }],
    });
  });

  it('only needs an address to pass the create form validation', () => {
    const base = EndpointSlice.getBaseObject();
    expect(areEndpointSlicePortsValid(base.ports)).toBe(true);
    expect(areEndpointSliceEndpointsValid(base.endpoints, base.addressType)).toBe(false);

    base.endpoints![0].addresses = ['10.1.2.3'];
    expect(areEndpointSliceEndpointsValid(base.endpoints, base.addressType)).toBe(true);
  });
});
