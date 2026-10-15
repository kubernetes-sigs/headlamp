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
import type PersistentVolumeClaim from '../../lib/k8s/persistentVolumeClaim';
import { sortByCapacity } from './sortByCapacity';

function claim(name: string, storage?: string) {
  return {
    metadata: { name },
    status: storage ? { capacity: { storage } } : {},
  } as unknown as PersistentVolumeClaim;
}

describe('sortByCapacity', () => {
  it('orders by size in bytes, not as text', () => {
    const claims = [claim('a', '1Gi'), claim('b', '500Mi'), claim('c', '10Gi'), claim('d', '2Gi')];

    expect(claims.sort(sortByCapacity).map(c => c.metadata.name)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('compares binary and decimal units by their real size', () => {
    // 1G is 1,000,000,000 bytes, 1Gi is 1,073,741,824 bytes
    const claims = [claim('gi', '1Gi'), claim('g', '1G'), claim('mi', '999Mi')];

    expect(claims.sort(sortByCapacity).map(c => c.metadata.name)).toEqual(['g', 'mi', 'gi']);
  });

  it('puts claims without a capacity first', () => {
    const claims = [claim('bound', '1Gi'), claim('pending')];

    expect(claims.sort(sortByCapacity).map(c => c.metadata.name)).toEqual(['pending', 'bound']);
  });
});
