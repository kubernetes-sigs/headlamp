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
import EndpointSlice from './endpointSlices';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('EndpointSlice class', () => {
  const mockEndpointSliceData = {
    apiVersion: 'discovery.k8s.io/v1',
    kind: 'EndpointSlice',
    metadata: {
      name: 'test-endpointslice',
      namespace: 'default',
      resourceVersion: '123',
      ownerReferences: [
        {
          apiVersion: 'v1',
          kind: 'Service',
          name: 'my-service',
          uid: 'abc-123',
        },
      ],
    },
    addressType: 'IPv4',
    ports: [
      { name: 'http', port: 80, protocol: 'TCP' },
      { name: 'https', port: 443, protocol: 'TCP' },
    ],
    endpoints: [
      {
        addresses: ['10.0.0.1'],
        conditions: { ready: true, serving: true, terminating: false },
      },
    ],
  };

  describe('getBaseObject', () => {
    it('returns an EndpointSlice with correct defaults', () => {
      const base = EndpointSlice.getBaseObject();
      expect(base.kind).toBe('EndpointSlice');
      expect(base.apiVersion).toBe('discovery.k8s.io/v1');
      expect(base.metadata.name).toBe('');
    });
  });

  describe('spec', () => {
    it('returns the full jsonData object', () => {
      const data = JSON.parse(JSON.stringify(mockEndpointSliceData));
      const endpointSlice = new EndpointSlice(data);
      expect(endpointSlice.spec).toEqual(data);
    });
  });

  describe('ports', () => {
    it('returns port numbers from the ports list', () => {
      const endpointSlice = new EndpointSlice(JSON.parse(JSON.stringify(mockEndpointSliceData)));
      expect(endpointSlice.ports).toEqual([80, 443]);
    });

    it('returns an empty array when ports is undefined', () => {
      const data = JSON.parse(JSON.stringify(mockEndpointSliceData));
      delete data.ports;
      const endpointSlice = new EndpointSlice(data);
      expect(endpointSlice.ports).toEqual([]);
    });

    it('returns an empty array when ports is empty', () => {
      const data = JSON.parse(JSON.stringify(mockEndpointSliceData));
      data.ports = [];
      const endpointSlice = new EndpointSlice(data);
      expect(endpointSlice.ports).toEqual([]);
    });
  });

  describe('getOwnerServiceName', () => {
    it('returns the name of the owning Service', () => {
      const endpointSlice = new EndpointSlice(JSON.parse(JSON.stringify(mockEndpointSliceData)));
      expect(endpointSlice.getOwnerServiceName()).toBe('my-service');
    });

    it('returns undefined when there are no owner references', () => {
      const data = JSON.parse(JSON.stringify(mockEndpointSliceData));
      delete data.metadata.ownerReferences;
      const endpointSlice = new EndpointSlice(data);
      expect(endpointSlice.getOwnerServiceName()).toBeUndefined();
    });

    it('returns undefined when no owner reference is a Service', () => {
      const data = JSON.parse(JSON.stringify(mockEndpointSliceData));
      data.metadata.ownerReferences = [
        { apiVersion: 'v1', kind: 'ConfigMap', name: 'my-config', uid: 'def-456' },
      ];
      const endpointSlice = new EndpointSlice(data);
      expect(endpointSlice.getOwnerServiceName()).toBeUndefined();
    });

    it('picks the Service owner reference among multiple owners', () => {
      const data = JSON.parse(JSON.stringify(mockEndpointSliceData));
      data.metadata.ownerReferences = [
        { apiVersion: 'v1', kind: 'ConfigMap', name: 'my-config', uid: 'def-456' },
        { apiVersion: 'v1', kind: 'Service', name: 'my-service', uid: 'abc-123' },
      ];
      const endpointSlice = new EndpointSlice(data);
      expect(endpointSlice.getOwnerServiceName()).toBe('my-service');
    });
  });
});
