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
import { getResourceRowId } from './getResourceRowId';

describe('getResourceRowId', () => {
  it('returns metadata.uid when present', () => {
    const id = getResourceRowId({
      cluster: 'staging',
      metadata: { uid: 'abc-123', namespace: 'default', name: 'pod-a' },
    });
    expect(id).toBe('abc-123');
  });

  it('falls back to cluster/namespace/name when uid is missing (#5707)', () => {
    const id = getResourceRowId({
      cluster: 'staging',
      metadata: { namespace: 'default', name: 'pod-a' },
    });
    expect(id).toBe('staging/default/pod-a');
  });

  it('keeps fallback ids distinct across clusters for same-name resources', () => {
    const a = getResourceRowId({
      cluster: 'prod',
      metadata: { namespace: 'default', name: 'pod-a' },
    });
    const b = getResourceRowId({
      cluster: 'staging',
      metadata: { namespace: 'default', name: 'pod-a' },
    });
    expect(a).not.toBe(b);
  });

  it('returns the same id for the same resource across calls (selection stability)', () => {
    const item = {
      cluster: 'prod',
      metadata: { namespace: 'kube-system', name: 'coredns-789' },
    };
    expect(getResourceRowId(item)).toBe(getResourceRowId(item));
  });

  it('falls back to the row index for null and undefined inputs without throwing', () => {
    expect(getResourceRowId(null, 0)).toBe('row-0');
    expect(getResourceRowId(undefined, 3)).toBe('row-3');
  });

  it('falls back to the row index when no identifying metadata is present', () => {
    expect(getResourceRowId({}, 5)).toBe('row-5');
  });

  it('keeps anonymous rows distinct via index (no id collisions)', () => {
    const a = getResourceRowId(null, 0);
    const b = getResourceRowId(null, 1);
    const c = getResourceRowId({}, 2);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('defaults the index to 0 when not provided (single-row case)', () => {
    expect(getResourceRowId(null)).toBe('row-0');
    expect(getResourceRowId({})).toBe('row-0');
  });

  it('handles cluster-scoped resources (no namespace)', () => {
    const id = getResourceRowId({
      cluster: 'prod',
      metadata: { name: 'node-1' },
    });
    expect(id).toBe('prod//node-1');
  });
});
