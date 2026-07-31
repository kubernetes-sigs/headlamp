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
import {
  findClusterProviderCapability,
  getDeclaredClusterProviders,
} from './clusterProviderCapabilities';

describe('getDeclaredClusterProviders', () => {
  it('reads unique provider IDs from plugin metadata', () => {
    expect(
      getDeclaredClusterProviders({
        headlamp: { clusterProviders: ['example.cluster', 'example.cluster'] },
      })
    ).toEqual(['example.cluster']);
  });

  it('ignores invalid provider IDs', () => {
    expect(
      getDeclaredClusterProviders({
        headlamp: { clusterProviders: ['example.cluster', '../provider', 1] },
      })
    ).toEqual(['example.cluster']);
  });
});

describe('findClusterProviderCapability', () => {
  it('returns only the requested provider capability', () => {
    const capabilities = [
      { provider: 'example.cluster', capability: 'example-capability' },
      { provider: 'other.cluster', capability: 'other-capability' },
    ];

    expect(findClusterProviderCapability(capabilities, 'example.cluster')).toBe(
      'example-capability'
    );
    expect(findClusterProviderCapability(capabilities, 'missing.cluster')).toBeUndefined();
  });
});
