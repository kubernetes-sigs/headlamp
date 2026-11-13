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
import VPA from './vpa';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function makeVpa(targetRef: any) {
  return new VPA({
    apiVersion: 'autoscaling.k8s.io/v1',
    kind: 'VerticalPodAutoscaler',
    metadata: {
      name: 'test-vpa',
      namespace: 'default',
      uid: 'vpa-uid',
      creationTimestamp: '2020-01-01T00:00:00Z',
    },
    spec: {
      targetRef,
    },
  } as any);
}

describe('VPA referenceObject', () => {
  it('resolves the target class when kind and apiVersion group match', () => {
    const vpa = makeVpa({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      name: 'test-deployment',
    });

    expect(vpa.referenceObject).not.toBeNull();
    expect(vpa.referenceObject?.kind).toBe('Deployment');
  });

  it('returns null when the target kind matches a built-in but the group differs', () => {
    // Reproduces issue #7321: a CRD sharing a kind name with a built-in resource
    // must not resolve to the built-in class.
    const vpa = makeVpa({
      apiVersion: 'kueue.x-k8s.io/v1beta1',
      kind: 'Deployment',
      name: 'not-a-deployment',
    });

    expect(vpa.referenceObject).toBeNull();
  });

  it('returns null when there is no targetRef', () => {
    const vpa = makeVpa(undefined);
    expect(vpa.referenceObject).toBeNull();
  });
});
