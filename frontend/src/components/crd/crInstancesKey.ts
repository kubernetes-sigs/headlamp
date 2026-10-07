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

/**
 * Threshold below which the joined sort keys themselves are used as the
 * React `key` (collision-free by construction). Above the threshold we fall
 * back to a hashed key to keep reconciler diff cost bounded.
 */
const FINGERPRINT_JOIN_LIMIT = 4096;

/**
 * Separator used both when joining sort keys for the collision-free path and
 * (as a code unit) inside the hashed path. Chosen as ASCII unit-separator
 * (`\x1f`) which cannot appear in a normal sort-key string.
 */
const KEY_SEPARATOR = '\x1f';

/**
 * Code-unit form of `KEY_SEPARATOR`, used by the hash path so the join and
 * hash branches can't silently drift if the separator ever changes.
 */
const KEY_SEPARATOR_CODE = KEY_SEPARATOR.charCodeAt(0);

/**
 * Hashes a list of stable identifiers into a compact React `key`. For small
 * input sets we use the joined string verbatim (zero collision risk), then
 * fall back to a length-prefixed pair of 32-bit hashes when the joined
 * material would itself be too large to pass to the reconciler. Both paths
 * are length-prefixed so any membership-size change forces a remount.
 *
 * The hashed path combines FNV-1a with an independently seeded
 * multiplicative hash, giving ~64 bits of mixed state. The length prefix
 * is a separate discriminator on top, so a same-length input set is the
 * only collision shape that can defeat a remount, and that's exactly the
 * shape the consumer also protects against by sorting input.
 */
export function fingerprint(keys: string[]): string {
  // Compute the projected joined length incrementally with an early break:
  // for a huge key set we don't want to materialize the full joined string
  // just to discard it and fall through to the hash path. The budget is
  // derived from the actual prefix (`${keys.length}:j:`) rather than a
  // fixed upper bound so the full returned key length stays under
  // `FINGERPRINT_JOIN_LIMIT` for any `keys.length`, including digit counts
  // that would push past a hard-coded reservation.
  const prefixLength = `${keys.length}:j:`.length;
  const joinPathBudget = FINGERPRINT_JOIN_LIMIT - prefixLength;
  let projectedLength = 0;
  let withinLimit = true;
  for (let i = 0; i < keys.length; i++) {
    projectedLength += keys[i].length + (i > 0 ? KEY_SEPARATOR.length : 0);
    if (projectedLength > joinPathBudget) {
      withinLimit = false;
      break;
    }
  }
  if (withinLimit) {
    // Collision-free: the joined keys themselves are the fingerprint.
    return `${keys.length}:j:${keys.join(KEY_SEPARATOR)}`;
  }
  let hashA = 0x811c9dc5 | 0; // FNV-1a 32-bit offset basis
  let hashB = 0xdeadbeef | 0; // arbitrary independent seed
  for (const k of keys) {
    for (let i = 0; i < k.length; i++) {
      const c = k.charCodeAt(i);
      hashA = Math.imul(hashA ^ c, 0x01000193) | 0;
      hashB = Math.imul(hashB ^ c, 0x5bd1e995) | 0;
    }
    // Entry separator so `['ab','c']` and `['a','bc']` produce distinct hashes.
    hashA = Math.imul(hashA ^ KEY_SEPARATOR_CODE, 0x01000193) | 0;
    hashB = Math.imul(hashB ^ KEY_SEPARATOR_CODE, 0x5bd1e995) | 0;
  }
  const a = (hashA >>> 0).toString(36);
  const b = (hashB >>> 0).toString(36);
  return `${keys.length}:h:${a}.${b}`;
}

/**
 * Builds a stable, cluster-qualified sort key for a CRD-like object so
 * cross-cluster CRDs with the same name don't collide. Falls back to
 * `metadata.name` when `metadata.uid` isn't populated yet, and coalesces a
 * missing `cluster` to the empty string so we don't surface the literal
 * "undefined" via template stringification.
 */
export function sortKey(crd: {
  cluster?: string;
  metadata: { uid?: string; name: string };
}): string {
  const cluster = crd.cluster ?? '';
  const id = crd.metadata.uid || crd.metadata.name;
  return `${cluster}/${id}`;
}

/**
 * Total fingerprint length limit, exposed for tests so they can compute
 * their own per-case budget without hard-coding the value. The actual
 * join-path budget is `FINGERPRINT_JOIN_LIMIT - \`${keys.length}:j:\`.length`
 * and varies with the digit count of `keys.length`.
 */
export const __FINGERPRINT_JOIN_LIMIT_FOR_TESTS = FINGERPRINT_JOIN_LIMIT;
