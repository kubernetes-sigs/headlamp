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
import GatewayClass, { formatGatewayClassParametersRef, KubeGatewayClass } from './gatewayClass';

describe('formatGatewayClassParametersRef', () => {
  it('shows the kind with its group, the name and the namespace', () => {
    expect(
      formatGatewayClassParametersRef({
        group: 'gateway.example.com',
        kind: 'GatewayConfig',
        name: 'internet-facing',
        namespace: 'gateway-system',
      })
    ).toBe('GatewayConfig.gateway.example.com/internet-facing (gateway-system)');
  });

  it('leaves out the empty core group and a missing namespace', () => {
    expect(
      formatGatewayClassParametersRef({ group: '', kind: 'ConfigMap', name: 'gw-config' })
    ).toBe('ConfigMap/gw-config');
  });
});

describe('GatewayClass.supportedFeatures', () => {
  const gatewayClass = (status: KubeGatewayClass['status']) =>
    new GatewayClass({
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'GatewayClass',
      metadata: { name: 'example', uid: 'uid', creationTimestamp: '2023-07-19T09:48:42Z' },
      spec: { controllerName: 'example.com/gateway-controller' },
      status,
    });

  it('returns the names of the supported features', () => {
    expect(
      gatewayClass({
        supportedFeatures: [{ name: 'Gateway' }, { name: 'HTTPRouteQueryParamMatching' }],
      }).supportedFeatures
    ).toEqual(['Gateway', 'HTTPRouteQueryParamMatching']);
  });

  it('is empty when the controller does not report supported features', () => {
    expect(gatewayClass({}).supportedFeatures).toEqual([]);
  });
});
