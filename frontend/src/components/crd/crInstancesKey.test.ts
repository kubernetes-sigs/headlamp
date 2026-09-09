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
import { __FINGERPRINT_JOIN_LIMIT_FOR_TESTS, fingerprint, sortKey } from './crInstancesKey';

// The join path's actual budget is `LIMIT - \`${keys.length}:j:\`.length`,
// since the digit count of `keys.length` contributes to the final returned
// string. Compute it per-case so the boundary assertions stay exact even if
// `LIMIT` changes.
const joinBudgetFor = (numKeys: number) =>
  __FINGERPRINT_JOIN_LIMIT_FOR_TESTS - `${numKeys}:j:`.length;

describe('sortKey', () => {
  it('combines cluster and uid', () => {
    expect(sortKey({ cluster: 'c1', metadata: { uid: 'u-1', name: 'widget' } })).toBe('c1/u-1');
  });

  it('falls back to metadata.name when uid is missing', () => {
    expect(sortKey({ cluster: 'c1', metadata: { name: 'widget' } })).toBe('c1/widget');
  });

  it('coalesces missing cluster to empty string instead of "undefined"', () => {
    expect(sortKey({ metadata: { uid: 'u-1', name: 'widget' } })).toBe('/u-1');
  });

  it('treats different clusters as distinct keys', () => {
    const a = sortKey({ cluster: 'c1', metadata: { name: 'widget' } });
    const b = sortKey({ cluster: 'c2', metadata: { name: 'widget' } });
    expect(a).not.toBe(b);
  });
});

describe('fingerprint', () => {
  it('is deterministic for identical input', () => {
    const keys = ['c1/widget', 'c1/gadget', 'c2/widget'];
    expect(fingerprint(keys)).toBe(fingerprint(keys));
  });

  it('changes when a key is added', () => {
    const before = fingerprint(['c1/widget']);
    const after = fingerprint(['c1/widget', 'c1/gadget']);
    expect(before).not.toBe(after);
  });

  it('changes when a key is removed', () => {
    const before = fingerprint(['c1/widget', 'c1/gadget']);
    const after = fingerprint(['c1/widget']);
    expect(before).not.toBe(after);
  });

  it('changes when a key is renamed', () => {
    const before = fingerprint(['c1/widget']);
    const after = fingerprint(['c1/gadget']);
    expect(before).not.toBe(after);
  });

  it('separates entries so split boundaries cannot collide', () => {
    // `['ab', 'c']` and `['a', 'bc']` would share characters with the same
    // total ordering. The separator + length prefix must make them distinct.
    expect(fingerprint(['ab', 'c'])).not.toBe(fingerprint(['a', 'bc']));
  });

  it('uses the collision-free join path for small inputs', () => {
    const result = fingerprint(['c1/widget', 'c1/gadget']);
    // Sentinel `:j:` marks the join path; `:h:` marks the hash path.
    expect(result.startsWith('2:j:')).toBe(true);
    expect(result.includes(':h:')).toBe(false);
  });

  it('falls back to the hash path when joined material exceeds the limit', () => {
    // Two keys at the single-key budget guarantee total >> limit.
    const longKey = 'x'.repeat(joinBudgetFor(1));
    const result = fingerprint([longKey, longKey]);
    expect(result.startsWith('2:h:')).toBe(true);
  });

  it('still uses the join path when joined material is exactly at the limit', () => {
    // The boundary is inclusive (`<=`), so a single key whose length matches
    // the budget must stay on the collision-free path, not flip to the hash.
    // The final returned key's total length must also be `<= LIMIT`.
    const atBudget = 'x'.repeat(joinBudgetFor(1));
    const result = fingerprint([atBudget]);
    expect(result.startsWith('1:j:')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(__FINGERPRINT_JOIN_LIMIT_FOR_TESTS);
  });

  it('hash path stays deterministic and sensitive to membership changes', () => {
    const longKey = 'x'.repeat(joinBudgetFor(1));
    const a1 = fingerprint([longKey, longKey, 'extra-a']);
    const a2 = fingerprint([longKey, longKey, 'extra-a']);
    const b = fingerprint([longKey, longKey, 'extra-b']);
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });
});
