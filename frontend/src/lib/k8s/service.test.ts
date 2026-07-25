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
import Service from './service';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('Service class', () => {
  const mockServiceData = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'test-service',
      namespace: 'default',
      resourceVersion: '123',
    },
    spec: {
      clusterIP: '10.0.0.1',
      ports: [
        { name: 'http', port: 80, protocol: 'TCP', targetPort: 80 },
        { name: 'https', port: 443, protocol: 'TCP', targetPort: 443 },
      ],
      type: 'ClusterIP',
      externalIPs: ['203.0.113.1'],
      selector: { app: 'myapp' },
    },
  };

  describe('getBaseObject', () => {
    it('returns a Service with correct defaults', () => {
      const base = Service.getBaseObject();
      expect(base.kind).toBe('Service');
      expect(base.apiVersion).toBe('v1');
      expect(base.spec.type).toBe('ClusterIP');
      expect(base.spec.clusterIP).toBe('');
      expect(base.spec.externalIPs).toEqual([]);
      expect(base.spec.selector).toEqual({});
    });

    it('includes a default port entry', () => {
      const base = Service.getBaseObject();
      expect(base.spec.ports).toHaveLength(1);
      expect(base.spec.ports![0].port).toBe(80);
      expect(base.spec.ports![0].protocol).toBe('TCP');
    });
  });

  describe('getExternalAddresses', () => {
    it('returns externalIPs when no load balancer ingress exists', () => {
      const service = new Service(JSON.parse(JSON.stringify(mockServiceData)));
      expect(service.getExternalAddresses()).toBe('203.0.113.1');
    });

    it('includes load balancer hostname', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      data.status = { loadBalancer: { ingress: [{ hostname: 'example.elb.amazonaws.com' }] } };
      const service = new Service(data);
      const addresses = service.getExternalAddresses();
      expect(addresses).toContain('example.elb.amazonaws.com');
      expect(addresses).toContain('203.0.113.1');
    });

    it('prefers hostname over ip in load balancer ingress', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      data.status = {
        loadBalancer: { ingress: [{ hostname: 'example.com', ip: '192.0.2.1' }] },
      };
      const service = new Service(data);
      expect(service.getExternalAddresses()).toContain('example.com');
      expect(service.getExternalAddresses()).not.toContain('192.0.2.1');
    });

    it('falls back to ip when hostname is missing', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      data.status = { loadBalancer: { ingress: [{ ip: '192.0.2.1' }] } };
      const service = new Service(data);
      expect(service.getExternalAddresses()).toContain('192.0.2.1');
    });

    it('deduplicates addresses from ingress and externalIPs', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      data.spec.externalIPs = ['203.0.113.1', '10.0.0.2'];
      data.status = { loadBalancer: { ingress: [{ ip: '203.0.113.1' }] } };
      const service = new Service(data);
      const addresses = service.getExternalAddresses().split(', ');
      expect(addresses.filter(a => a === '203.0.113.1')).toHaveLength(1);
    });

    it('returns empty string when no addresses exist', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      data.spec.externalIPs = [];
      delete data.status;
      const service = new Service(data);
      expect(service.getExternalAddresses()).toBe('');
    });
  });

  describe('getPorts', () => {
    it('returns port numbers from spec', () => {
      const service = new Service(JSON.parse(JSON.stringify(mockServiceData)));
      expect(service.getPorts()).toEqual([80, 443]);
    });

    it('returns undefined when no ports defined', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      delete data.spec.ports;
      const service = new Service(data);
      expect(service.getPorts()).toBeUndefined();
    });
  });

  describe('getFormattedPorts', () => {
    it('formats simple ports with protocol', () => {
      const service = new Service(JSON.parse(JSON.stringify(mockServiceData)));
      const formatted = service.getFormattedPorts();
      expect(formatted).toContain('80/TCP');
      expect(formatted).toContain('443/TCP');
    });

    it('includes nodePort when present', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      data.spec.ports = [
        { name: 'http', port: 80, nodePort: 30080, protocol: 'TCP', targetPort: 80 },
      ];
      const service = new Service(data);
      expect(service.getFormattedPorts()).toContain('80:30080/TCP');
    });

    it('includes targetPort when different from port', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      data.spec.ports = [{ name: 'http', port: 80, protocol: 'TCP', targetPort: 8080 }];
      const service = new Service(data);
      expect(service.getFormattedPorts()).toContain('80:8080/TCP');
    });

    it('omits targetPort when it equals port', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      data.spec.ports = [{ name: 'http', port: 80, protocol: 'TCP', targetPort: 80 }];
      const service = new Service(data);
      expect(service.getFormattedPorts()).toContain('80/TCP');
    });

    it('handles missing protocol', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      data.spec.ports = [{ name: 'http', port: 80, targetPort: 80 }];
      const service = new Service(data);
      expect(service.getFormattedPorts()).toContain('80');
    });

    it('returns undefined when no ports', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      delete data.spec.ports;
      const service = new Service(data);
      expect(service.getFormattedPorts()).toBeUndefined();
    });
  });

  describe('getSelector', () => {
    it('formats selector entries as key=value', () => {
      const service = new Service(JSON.parse(JSON.stringify(mockServiceData)));
      expect(service.getSelector()).toContain('app=myapp');
    });

    it('returns empty array when no selector', () => {
      const data = JSON.parse(JSON.stringify(mockServiceData));
      data.spec.selector = {};
      const service = new Service(data);
      expect(service.getSelector()).toEqual([]);
    });
  });
});
