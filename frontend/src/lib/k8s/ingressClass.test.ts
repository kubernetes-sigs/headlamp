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
import { formatIngressClassParameters } from './ingressClass';

describe('formatIngressClassParameters', () => {
  it('includes the API group and namespace when they are set', () => {
    expect(
      formatIngressClassParameters({
        apiGroup: 'k8s.example.com',
        kind: 'IngressParameters',
        name: 'external-lb',
        scope: 'Namespace',
        namespace: 'ingress-system',
      })
    ).toBe('IngressParameters.k8s.example.com/external-lb (ingress-system)');
  });

  it('formats a core, cluster scoped reference as kind/name', () => {
    expect(formatIngressClassParameters({ kind: 'ConfigMap', name: 'settings' })).toBe(
      'ConfigMap/settings'
    );
  });
});
