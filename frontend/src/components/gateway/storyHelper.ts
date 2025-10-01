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

import { KubeBackendTLSPolicy } from '../../lib/k8s/backendTLSPolicy';
import { KubeBackendTrafficPolicy } from '../../lib/k8s/backendTrafficPolicy';
import { KubeGateway } from '../../lib/k8s/gateway';
import { KubeGatewayClass } from '../../lib/k8s/gatewayClass';
import { KubeGRPCRoute } from '../../lib/k8s/grpcRoute';
import { KubeHTTPRoute } from '../../lib/k8s/httpRoute';
import { KubeReferenceGrant } from '../../lib/k8s/referenceGrant';

export const DEFAULT_GATEWAY: KubeGateway = {
  apiVersion: 'gateway.networking.k8s.io/v1beta1',
  kind: 'Gateway',
  metadata: {
    creationTimestamp: '2023-07-19T09:48:42Z',
    generation: 1,
    name: 'default-gateway',
    namespace: 'default',
    resourceVersion: '12345',
    uid: 'abc123',
  },
  spec: {
    gatewayClassName: 'test',
    listeners: [
      {
        hostname: 'test',
        name: 'test',
        protocol: 'HTTP',
        port: 80,
      },
    ],
  },
  status: {
    addresses: [],
    listeners: [],
  },
};

export const DEFAULT_GATEWAY_CLASS: KubeGatewayClass = {
  apiVersion: 'gateway.networking.k8s.io/v1beta1',
  kind: 'GatewayClass',
  metadata: {
    creationTimestamp: '2023-07-19T09:48:42Z',
    generation: 1,
    name: 'default-gateway-class',
    namespace: 'default',
    resourceVersion: '1234',
    uid: 'abc1234',
  },
  spec: {
    controllerName: 'test',
  },
  status: {},
};

export const DEFAULT_HTTP_ROUTE: KubeHTTPRoute = {
  apiVersion: 'gateway.networking.k8s.io/v1beta1',
  kind: 'HTTPRoute',
  metadata: {
    creationTimestamp: '2023-07-19T09:48:42Z',
    generation: 1,
    name: 'default-httproute',
    namespace: 'default',
    resourceVersion: '1234',
    uid: 'abc1234',
  },
  spec: {
    hostnames: ['test'],
    parentRefs: [
      {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: 'shared-gateway',
        namespace: 'envoy-gateway-system',
        sectionName: 'cloud-internal-https',
      },
    ],
    rules: [
      {
        name: 'test',
        backendRefs: [],
        matches: [
          {
            path: {
              type: 'PathPrefix',
              value: '/',
            },
          },
        ],
        filters: [
          {
            requestRedirect: {
              port: 443,
              scheme: 'https',
              statusCode: 302,
            },
            type: 'RequestRedirect',
          },
        ],
      },
      {
        backendRefs: [
          {
            group: '',
            kind: 'Service',
            name: 'service',
            port: 8080,
            weight: 1,
          },
        ],
      },
    ],
  },
};

export const EMPTY_HTTP_ROUTE: KubeHTTPRoute = {
  apiVersion: 'gateway.networking.k8s.io/v1beta1',
  kind: 'HTTPRoute',
  metadata: {
    creationTimestamp: '2023-07-19T09:48:42Z',
    generation: 1,
    name: 'default-httproute',
    namespace: 'default',
    resourceVersion: '1234',
    uid: 'abc1234',
  },
  spec: {
    hostnames: [],
    parentRefs: [],
    rules: [],
  },
};

export const DEFAULT_GRPC_ROUTE: KubeGRPCRoute = {
  apiVersion: 'gateway.networking.k8s.io/v1beta1',
  kind: 'GRPCRoute',
  metadata: {
    creationTimestamp: '2023-07-19T09:48:42Z',
    generation: 1,
    name: 'default-httproute',
    namespace: 'default',
    resourceVersion: '1234',
    uid: 'abc1234',
  },
  spec: {
    parentRefs: [
      {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        namespace: 'shared-gateway',
        name: 'envoy-gateway-system',
      },
      {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        namespace: 'shared-gateway',
        sectionName: 'test',
        name: 'envoy-gateway-system-test',
      },
    ],
  },
};

export const DEFAULT_REFERENCE_GRANT: KubeReferenceGrant = {
  apiVersion: 'gateway.networking.k8s.io/v1beta1',
  kind: 'ReferenceGrant',
  metadata: {
    uid: 'abc1234',
    name: 'example-refgrant',
    namespace: 'default',
    creationTimestamp: '2025-06-16T09:18:00Z',
  },
  spec: {
    from: [
      {
        group: 'gateway.networking.k8s.io',
        kind: 'HTTPRoute',
        namespace: 'default',
      },
    ],
    to: [
      {
        group: '',
        kind: 'Service',
        name: 'example-service',
      },
    ],
  },
};

export const DEFAULT_BACKEND_TLS_POLICY: KubeBackendTLSPolicy = {
  apiVersion: 'gateway.networking.k8s.io/v1alpha3',
  kind: 'BackendTLSPolicy',
  metadata: {
    uid: 'abc1234',
    name: 'example-policy',
    namespace: 'default',
    creationTimestamp: '2025-06-16T09:18:00Z',
  },
  spec: {
    targetRefs: [
      {
        group: '',
        kind: 'Service',
        name: 'example-service',
      },
    ],
    validation: {
      hostname: 'example.com',
      caCertificateRefs: [],
    },
  },
};

export const DEFAULT_BACKEND_TRAFFIC_POLICY: KubeBackendTrafficPolicy = {
  apiVersion: 'gateway.networking.x-k8s.io/v1alpha1',
  kind: 'XBackendTrafficPolicy',
  metadata: {
    uid: 'abc1234',
    name: 'example-traffic-policy',
    namespace: 'default',
    creationTimestamp: '2025-07-24T12:00:00Z',
  },
  spec: {
    targetRefs: [
      {
        group: 'gateway.networking.k8s.io',
        kind: 'Service',
        name: 'example-service',
      },
    ],
    retryConstraint: {
      budget: {
        percent: 10,
        interval: '30s',
      },
      minRetryRate: {
        count: 1,
        interval: '10s',
      },
    },
    sessionPersistence: {
      type: 'Cookie',
      cookieName: 'session-id',
    },
  },
};
