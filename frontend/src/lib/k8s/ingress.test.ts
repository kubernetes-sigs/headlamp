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
import type { IngressBackend } from './ingress';
import Ingress from './ingress';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('Ingress class', () => {
  const mockIngressData = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'test-ingress',
      namespace: 'default',
      resourceVersion: '123',
    },
    spec: {
      rules: [
        {
          host: 'example.com',
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'my-service',
                    port: { number: 80 },
                  },
                },
              },
              {
                path: '/api',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'api-service',
                    port: { number: 443 },
                  },
                },
              },
            ],
          },
        },
        {
          host: 'static.example.com',
          http: {
            paths: [
              {
                path: '/assets',
                backend: {
                  service: {
                    name: 'static-service',
                    port: { number: 8080 },
                  },
                },
              },
            ],
          },
        },
      ],
    },
    status: {
      loadBalancer: {
        ingress: [{ hostname: 'example.elb.amazonaws.com' }, { ip: '203.0.113.1' }],
      },
    },
  };

  describe('getBaseObject', () => {
    it('returns an Ingress with correct defaults', () => {
      const base = Ingress.getBaseObject();
      expect(base.kind).toBe('Ingress');
      expect(base.apiVersion).toBe('networking.k8s.io/v1');
      expect(base.spec.rules).toHaveLength(1);
      expect(base.spec.rules![0].host).toBe('');
      expect(base.spec.rules![0].http?.paths).toHaveLength(1);
      const defaultBackend = base.spec.rules![0].http!.paths[0].backend as IngressBackend;
      expect(defaultBackend.service!.name).toBe('');
      expect(defaultBackend.service!.port!.number).toBe(80);
    });

    it('includes a default TLS entry', () => {
      const base = Ingress.getBaseObject();
      expect(base.spec.tls).toHaveLength(1);
      expect(base.spec.tls![0].secretName).toBe('');
      expect(base.spec.tls![0].hosts).toEqual([]);
    });
  });

  describe('getAddresses', () => {
    it('returns load balancer hostnames and ips joined', () => {
      const ingress = new Ingress(JSON.parse(JSON.stringify(mockIngressData)));
      const addresses = ingress.getAddresses();
      expect(addresses).toContain('example.elb.amazonaws.com');
      expect(addresses).toContain('203.0.113.1');
      expect(addresses).toBe('example.elb.amazonaws.com, 203.0.113.1');
    });

    it('prefers hostname over ip for the same ingress entry', () => {
      const data = JSON.parse(JSON.stringify(mockIngressData));
      data.status = {
        loadBalancer: {
          ingress: [{ hostname: 'example.com', ip: '192.0.2.1' }],
        },
      };
      const ingress = new Ingress(data);
      expect(ingress.getAddresses()).toBe('example.com');
    });

    it('returns empty string when no load balancer ingress', () => {
      const data = JSON.parse(JSON.stringify(mockIngressData));
      delete data.status;
      const ingress = new Ingress(data);
      expect(ingress.getAddresses()).toBe('');
    });

    it('filters out entries with no hostname and no ip', () => {
      const data = JSON.parse(JSON.stringify(mockIngressData));
      data.status = {
        loadBalancer: {
          ingress: [{}],
        },
      };
      const ingress = new Ingress(data);
      expect(ingress.getAddresses()).toBe('');
    });
  });

  describe('getHosts', () => {
    it('returns hosts joined by pipe separator', () => {
      const ingress = new Ingress(JSON.parse(JSON.stringify(mockIngressData)));
      expect(ingress.getHosts()).toBe('example.com | static.example.com');
    });

    it('returns undefined when no rules exist', () => {
      const data = JSON.parse(JSON.stringify(mockIngressData));
      delete data.spec.rules;
      const ingress = new Ingress(data);
      expect(ingress.getHosts()).toBeUndefined();
    });
  });

  describe('getRules', () => {
    it('returns normalized rules with modern backend format', () => {
      const ingress = new Ingress(JSON.parse(JSON.stringify(mockIngressData)));
      const rules = ingress.getRules();
      expect(rules).toHaveLength(2);
      expect(rules[0].host).toBe('example.com');
      expect(rules[0].http!.paths).toHaveLength(2);
      expect(rules[0].http!.paths[0].backend.service!.name).toBe('my-service');
      expect(rules[0].http!.paths[0].backend.service!.port!.number).toBe(80);
      expect(rules[0].http!.paths[1].backend.service!.name).toBe('api-service');
      expect(rules[0].http!.paths[1].backend.service!.port!.number).toBe(443);
    });

    it('converts legacy backend (serviceName/servicePort) to modern format', () => {
      const data = JSON.parse(JSON.stringify(mockIngressData));
      data.spec.rules = [
        {
          host: 'legacy.example.com',
          http: {
            paths: [
              {
                path: '/api',
                backend: {
                  serviceName: 'legacy-svc',
                  servicePort: '8080',
                },
              },
            ],
          },
        },
      ];
      const ingress = new Ingress(data);
      const rules = ingress.getRules();
      expect(rules[0].http!.paths[0].backend.service!.name).toBe('legacy-svc');
      expect(rules[0].http!.paths[0].backend.service!.port!.number).toBe(8080);
    });

    it('handles mixed legacy and modern backends in the same rule', () => {
      const data = JSON.parse(JSON.stringify(mockIngressData));
      data.spec.rules = [
        {
          host: 'mixed.example.com',
          http: {
            paths: [
              {
                path: '/legacy',
                backend: { serviceName: 'old-svc', servicePort: '3000' },
              },
              {
                path: '/modern',
                backend: {
                  service: { name: 'new-svc', port: { number: 4000 } },
                },
              },
            ],
          },
        },
      ];
      const ingress = new Ingress(data);
      const rules = ingress.getRules();
      expect(rules[0].http!.paths[0].backend.service!.name).toBe('old-svc');
      expect(rules[0].http!.paths[0].backend.service!.port!.number).toBe(3000);
      expect(rules[0].http!.paths[1].backend.service!.name).toBe('new-svc');
      expect(rules[0].http!.paths[1].backend.service!.port!.number).toBe(4000);
    });

    it('creates a rule with empty paths when http is missing', () => {
      const data = JSON.parse(JSON.stringify(mockIngressData));
      data.spec.rules = [{ host: 'no-http.example.com' }];
      const ingress = new Ingress(data);
      const rules = ingress.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].host).toBe('no-http.example.com');
      expect(rules[0].http!.paths).toEqual([]);
    });

    it('caches rules and returns cached result on subsequent calls', () => {
      // Create a fresh instance with deep-cloned data to avoid shared refs
      const data = JSON.parse(JSON.stringify(mockIngressData));
      const ingress = new Ingress(data);
      const rules1 = ingress.getRules();
      const rules2 = ingress.getRules();
      // Rules object should be reused from cache (same identity)
      expect(rules1).toBe(rules2);
    });
  });
});
