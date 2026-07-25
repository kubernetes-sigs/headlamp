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
    const id = getResourceRowId(
      {
        cluster: 'staging',
        metadata: { uid: 'abc-123', namespace: 'default', name: 'pod-a' },
      },
      0
    );
    expect(id).toBe('abc-123');
  });

  it('falls back to cluster/namespace/name when uid is missing (#5707)', () => {
    const id = getResourceRowId(
      {
        cluster: 'staging',
        metadata: { namespace: 'default', name: 'pod-a' },
      },
      0
    );
    expect(id).toBe('staging/default/pod-a');
  });

  it('falls back to the composite when metadata.uid is an empty string', () => {
    // An empty-string uid is semantically "no uid": treat the same as
    // missing rather than emitting a degenerate row id of `''`.
    const id = getResourceRowId(
      {
        cluster: 'staging',
        metadata: { uid: '', namespace: 'default', name: 'pod-a' },
      },
      0
    );
    expect(id).toBe('staging/default/pod-a');
  });

  it('keeps fallback ids distinct across clusters for same-name resources', () => {
    const a = getResourceRowId(
      { cluster: 'prod', metadata: { namespace: 'default', name: 'pod-a' } },
      0
    );
    const b = getResourceRowId(
      { cluster: 'staging', metadata: { namespace: 'default', name: 'pod-a' } },
      0
    );
    expect(a).not.toBe(b);
  });

  it('returns the same id for the same resource across calls (selection stability)', () => {
    const item = {
      cluster: 'prod',
      metadata: { namespace: 'kube-system', name: 'coredns-789' },
    };
    expect(getResourceRowId(item, 0)).toBe(getResourceRowId(item, 0));
  });

  it('falls back to the row index when no identifying metadata is present', () => {
    expect(getResourceRowId({}, 5)).toBe('row-5');
  });

  it('falls back to the row index for null and undefined inputs without throwing', () => {
    // Material React Table's documented contract passes a non-null row, but
    // the previous `item?.metadata?.uid` implementation tolerated sparse
    // data arrays and programmer errors; preserve that safety contract.
    expect(getResourceRowId(null, 0)).toBe('row-0');
    expect(getResourceRowId(undefined, 3)).toBe('row-3');
  });

  it('falls back to the row index when every identifying field is the empty string', () => {
    // Mirrors the "no metadata" case but exercises the empty-string branch
    // when the fields are present-but-empty rather than undefined; both
    // shapes must produce the index fallback.
    expect(getResourceRowId({ cluster: '', metadata: { namespace: '', name: '' } }, 7)).toBe(
      'row-7'
    );
  });

  it('falls back to the row index when name is missing even if cluster is set', () => {
    // The composite is meaningful only when `name` is present; without it,
    // every row from the same cluster would collapse to `cluster//` and
    // collide. The index fallback keeps such rows distinct.
    const a = getResourceRowId({ cluster: 'prod' }, 0);
    const b = getResourceRowId({ cluster: 'prod' }, 1);
    const c = getResourceRowId({ cluster: 'prod', metadata: { namespace: 'default' } }, 2);
    expect(a).toBe('row-0');
    expect(b).toBe('row-1');
    expect(c).toBe('row-2');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('keeps anonymous rows distinct via index (no id collisions)', () => {
    const a = getResourceRowId({}, 0);
    const b = getResourceRowId({}, 1);
    const c = getResourceRowId({ metadata: {} }, 2);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('handles cluster-scoped resources (no namespace)', () => {
    const id = getResourceRowId({ cluster: 'prod', metadata: { name: 'node-1' } }, 0);
    expect(id).toBe('prod//node-1');
  });

  it('collides on the composite when two uid-less rows share cluster/namespace/name', () => {
    // Documents the helper's known limitation: K8s name+namespace uniqueness
    // makes this impossible for real persisted objects, but a synthetic /
    // virtual row caller is on the hook for disambiguating.
    const a = getResourceRowId(
      { cluster: 'prod', metadata: { namespace: 'default', name: 'pod-a' } },
      0
    );
    const b = getResourceRowId(
      { cluster: 'prod', metadata: { namespace: 'default', name: 'pod-a' } },
      1
    );
    expect(a).toBe(b);
  });
});
