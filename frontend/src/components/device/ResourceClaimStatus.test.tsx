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

import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '../../i18n/locales/en/translation.json';
import type ResourceClaim from '../../lib/k8s/resourceClaim';
import { getResourceClaimStatusText } from './ResourceClaimStatus';

const t = ((key: string, options?: { count?: number }) =>
  options?.count === undefined ? key : `${key}:${options.count}`) as unknown as TFunction;

const claim = (state: ResourceClaim['state'], consumers = 0) =>
  ({ state, consumers: Array.from({ length: consumers }) } as unknown as ResourceClaim);

describe('getResourceClaimStatusText', () => {
  it('reads a claim the scheduler has not answered as pending', () => {
    expect(getResourceClaimStatusText(claim('Pending'), t)).toBe('translation|Pending');
  });

  it('reads an allocated claim that nothing uses yet as allocated', () => {
    expect(getResourceClaimStatusText(claim('Allocated'), t)).toBe('translation|Allocated');
    expect(en).toHaveProperty('Allocated');
  });

  it('counts the consumers of a claim in use', () => {
    expect(getResourceClaimStatusText(claim('InUse', 2), t)).toBe(
      'translation|In use by {{count}}:2'
    );
  });
});
