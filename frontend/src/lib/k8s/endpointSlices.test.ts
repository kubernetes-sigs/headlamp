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

describe('EndpointSlice class', () => {
  const mockEndpointSliceData = {
    apiVersion: 'discovery.k8s.io/v1',
    kind: 'EndpointSlice',
    metadata: {
      name: 'nginx-65mbh',
      namespace: 'default',
      resourceVersion: '123',
      labels: { 'kubernetes.io/service-name': 'nginx' },
      ownerReferences: [{ apiVersion: 'v1', kind: 'Service', name: 'nginx', uid: 'abc-123' }],
    },
    addressType: 'IPv4',
    ports: [{ name: 'http', port: 80, protocol: 'TCP' }],
  };

  describe('getOwnerServiceName', () => {
    it('returns the service name from the label when there are no owner references', () => {
      const data = JSON.parse(JSON.stringify(mockEndpointSliceData));
      data.metadata.name = 'kubernetes';
      data.metadata.labels = { 'kubernetes.io/service-name': 'kubernetes' };
      delete data.metadata.ownerReferences;
      const endpointSlice = new EndpointSlice(data);
      expect(endpointSlice.getOwnerServiceName()).toBe('kubernetes');
    });

    it('prefers the label over the owner reference', () => {
      const data = JSON.parse(JSON.stringify(mockEndpointSliceData));
      data.metadata.labels = { 'kubernetes.io/service-name': 'from-label' };
      const endpointSlice = new EndpointSlice(data);
      expect(endpointSlice.getOwnerServiceName()).toBe('from-label');
    });

    it('falls back to the Service owner reference when the label is missing', () => {
      const data = JSON.parse(JSON.stringify(mockEndpointSliceData));
      delete data.metadata.labels;
      const endpointSlice = new EndpointSlice(data);
      expect(endpointSlice.getOwnerServiceName()).toBe('nginx');
    });

    it('ignores owner references that are not a Service', () => {
      const data = JSON.parse(JSON.stringify(mockEndpointSliceData));
      delete data.metadata.labels;
      data.metadata.ownerReferences = [
        { apiVersion: 'v1', kind: 'ConfigMap', name: 'my-config', uid: 'def-456' },
      ];
      const endpointSlice = new EndpointSlice(data);
      expect(endpointSlice.getOwnerServiceName()).toBeUndefined();
    });

    it('returns undefined when there is no label and no owner reference', () => {
      const data = JSON.parse(JSON.stringify(mockEndpointSliceData));
      delete data.metadata.labels;
      delete data.metadata.ownerReferences;
      const endpointSlice = new EndpointSlice(data);
      expect(endpointSlice.getOwnerServiceName()).toBeUndefined();
    });
  });
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
});
