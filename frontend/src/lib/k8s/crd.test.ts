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
import type { CRDSpecLike } from './crdSpec';
import { resolveCRDApiGroup, selectMainAPIGroup, validateCRDSpec } from './crdSpec';

function spec(overrides: Partial<CRDSpecLike> = {}): CRDSpecLike {
  return {
    group: 'example.com',
    version: '',
    names: {
      plural: 'widgets',
      singular: 'widget',
      kind: 'Widget',
      listKind: 'WidgetList',
    },
    versions: [],
    scope: 'Namespaced',
    ...overrides,
  };
}

describe('selectMainAPIGroup', () => {
  it('returns null when spec.group is missing', () => {
    expect(selectMainAPIGroup(spec({ group: '' }))).toBeNull();
  });

  it('returns null when names.plural is missing', () => {
    expect(selectMainAPIGroup(spec({ names: { ...spec().names, plural: '' } }))).toBeNull();
  });

  it('returns null when versions[] and spec.version are both empty', () => {
    expect(selectMainAPIGroup(spec({ version: '', versions: [] }))).toBeNull();
  });

  it('prefers the storage version', () => {
    expect(
      selectMainAPIGroup(
        spec({
          versions: [
            { name: 'v1alpha1', served: true, storage: false },
            { name: 'v1', served: true, storage: true },
          ],
        })
      )
    ).toEqual(['example.com', 'v1', 'widgets']);
  });

  it('falls back to the first served version when no storage version is marked', () => {
    expect(
      selectMainAPIGroup(
        spec({
          versions: [
            { name: 'v1alpha1', served: true, storage: false },
            { name: 'v1beta1', served: true, storage: false },
          ],
        })
      )
    ).toEqual(['example.com', 'v1alpha1', 'widgets']);
  });

  it('skips entries with served=false', () => {
    expect(
      selectMainAPIGroup(
        spec({
          versions: [
            { name: 'v1alpha1', served: false, storage: true },
            { name: 'v1', served: true, storage: false },
          ],
        })
      )
    ).toEqual(['example.com', 'v1', 'widgets']);
  });

  it('returns null when versions[] has no served entries', () => {
    expect(
      selectMainAPIGroup(spec({ versions: [{ name: 'v1alpha1', served: false, storage: true }] }))
    ).toBeNull();
  });

  it('accepts spec.version when versions[] is empty (v1beta1 shape)', () => {
    expect(selectMainAPIGroup(spec({ version: 'v1', versions: [] }))).toEqual([
      'example.com',
      'v1',
      'widgets',
    ]);
  });

  it('honors spec.version when it matches a served entry in versions[]', () => {
    expect(
      selectMainAPIGroup(
        spec({
          version: 'v1beta1',
          versions: [
            { name: 'v1', served: true, storage: true },
            { name: 'v1beta1', served: true, storage: false },
          ],
        })
      )
    ).toEqual(['example.com', 'v1beta1', 'widgets']);
  });

  it('ignores spec.version when it does not match a served entry in versions[]', () => {
    expect(
      selectMainAPIGroup(
        spec({
          version: 'v1beta2',
          versions: [{ name: 'v1', served: true, storage: true }],
        })
      )
    ).toEqual(['example.com', 'v1', 'widgets']);
  });
});

describe('validateCRDSpec', () => {
  it('reports ok=true with usable versions when the spec is complete', () => {
    const result = validateCRDSpec(
      spec({ versions: [{ name: 'v1', served: true, storage: true }] })
    );
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.usableVersions).toEqual([{ name: 'v1', served: true, storage: true }]);
  });

  it('reports each missing required field', () => {
    const result = validateCRDSpec({
      group: '',
      names: { plural: '', kind: '', singular: 'x' },
      versions: [],
      scope: '',
    });
    expect(result.ok).toBe(false);
    // Asserted as a set-like check so a future cosmetic reorder of the
    // pushes inside `validateCRDSpec` doesn't fail the test for the
    // wrong reason. The length pin keeps the assertion exhaustive.
    expect(result.missing).toEqual(
      expect.arrayContaining(['names.plural', 'names.kind', 'group', 'scope', 'versions'])
    );
    expect(result.missing).toHaveLength(5);
  });

  it('flags versions[] when entries exist but none are usable (no name or unserved)', () => {
    const result = validateCRDSpec(
      spec({
        versions: [
          { name: '', served: true, storage: true },
          { name: 'v1', served: false, storage: true },
        ],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('versions[].name+served');
    expect(result.usableVersions).toEqual([]);
  });

  it('filters usable versions to those with name and served', () => {
    const result = validateCRDSpec(
      spec({
        versions: [
          { name: 'v1', served: true, storage: true },
          { name: 'v1beta1', served: false, storage: false },
          { name: '', served: true, storage: false },
          { name: 'v2', served: true, storage: false },
        ],
      })
    );
    expect(result.ok).toBe(true);
    expect(result.usableVersions.map(v => v.name)).toEqual(['v1', 'v2']);
  });

  it('accepts the v1beta1 shape (spec.version set, versions[] empty)', () => {
    const result = validateCRDSpec(spec({ version: 'v1', versions: [] }));
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.usableVersions).toEqual([]);
  });

  it('returns ok=false when spec is undefined', () => {
    const result = validateCRDSpec(undefined);
    expect(result.ok).toBe(false);
    // names.plural/kind/group/scope plus versions all missing.
    expect(result.missing).toEqual(
      expect.arrayContaining(['names.plural', 'names.kind', 'group', 'scope', 'versions'])
    );
    expect(result.missing).toHaveLength(5);
  });

  it('flags scope.invalid when the value is non-empty but unrecognized', () => {
    const result = validateCRDSpec(
      spec({
        scope: 'WeirdScope',
        versions: [{ name: 'v1', served: true, storage: true }],
      })
    );
    expect(result.ok).toBe(false);
    // Length-pinned so a regression that pushes a spurious second id (or
    // accidentally drops `scope.invalid`) fails the test; mirrors the style
    // of the "reports each missing required field" assertion.
    expect(result.missing).toEqual(['scope.invalid']);
  });

  it('flags scope.invalid for the lowercase mis-capitalization', () => {
    // Real-world malformed CRDs sometimes carry `"namespaced"` instead of the
    // canonical `"Namespaced"`; the validator must not silently downgrade to
    // cluster-scoped just because the string is non-empty.
    const result = validateCRDSpec(
      spec({
        scope: 'namespaced',
        versions: [{ name: 'v1', served: true, storage: true }],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['scope.invalid']);
  });

  it('accepts the two valid scope values', () => {
    expect(
      validateCRDSpec(
        spec({ scope: 'Namespaced', versions: [{ name: 'v1', served: true, storage: true }] })
      ).ok
    ).toBe(true);
    expect(
      validateCRDSpec(
        spec({ scope: 'Cluster', versions: [{ name: 'v1', served: true, storage: true }] })
      ).ok
    ).toBe(true);
  });
});

describe('resolveCRDApiGroup', () => {
  it('returns null when the CRD reference is null or undefined', () => {
    expect(resolveCRDApiGroup(null)).toBeNull();
    expect(resolveCRDApiGroup(undefined)).toBeNull();
  });

  it('returns null when the CRD exposes neither method', () => {
    expect(resolveCRDApiGroup({})).toBeNull();
  });

  it('returns null when getMainAPIGroup is present but not a function', () => {
    // An older plugin bundle could ship the property as a getter that
    // resolves to a non-function value. The duck-type guard must catch
    // this rather than call `undefined()` and throw a TypeError.
    const crd = { getMainAPIGroup: 'not a function' as unknown as () => [string, string, string] };
    expect(resolveCRDApiGroup(crd)).toBeNull();
  });

  it('returns null when getMainAPIGroupOrNull is present but not a function', () => {
    const crd = {
      getMainAPIGroupOrNull: 42 as unknown as () => [string, string, string] | null,
    };
    expect(resolveCRDApiGroup(crd)).toBeNull();
  });

  it('prefers getMainAPIGroupOrNull when both methods exist', () => {
    const crd = {
      getMainAPIGroupOrNull: () =>
        ['new.group', 'v1', 'newplural'] as [string, string, string] | null,
      getMainAPIGroup: () =>
        ['legacy.group', 'v1beta1', 'legacyplural'] as [string, string, string],
    };
    expect(resolveCRDApiGroup(crd)).toEqual(['new.group', 'v1', 'newplural']);
  });

  it('returns null when getMainAPIGroupOrNull returns null', () => {
    const crd = { getMainAPIGroupOrNull: () => null };
    expect(resolveCRDApiGroup(crd)).toBeNull();
  });

  it('falls back to legacy getMainAPIGroup when OrNull is absent', () => {
    const crd = {
      getMainAPIGroup: () => ['example.com', 'v1', 'widgets'] as [string, string, string],
    };
    expect(resolveCRDApiGroup(crd)).toEqual(['example.com', 'v1', 'widgets']);
  });

  it('rejects a legacy tuple with an empty group', () => {
    const crd = {
      getMainAPIGroup: () => ['', 'v1', 'widgets'] as [string, string, string],
    };
    expect(resolveCRDApiGroup(crd)).toBeNull();
  });

  it('rejects a legacy tuple with an empty version', () => {
    const crd = {
      getMainAPIGroup: () => ['example.com', '', 'widgets'] as [string, string, string],
    };
    expect(resolveCRDApiGroup(crd)).toBeNull();
  });

  it('rejects a legacy tuple with an empty plural', () => {
    const crd = {
      getMainAPIGroup: () => ['example.com', 'v1', ''] as [string, string, string],
    };
    expect(resolveCRDApiGroup(crd)).toBeNull();
  });

  it('rejects an all-empty sentinel from the new in-tree getMainAPIGroup', () => {
    // The non-Null variant returns ['', '', ''] for an incomplete spec; the
    // resolver must treat that as "no usable identity" too.
    const crd = {
      getMainAPIGroup: () => ['', '', ''] as [string, string, string],
    };
    expect(resolveCRDApiGroup(crd)).toBeNull();
  });

  it('rejects a malformed return value (not a 3-tuple) from a legacy bundle', () => {
    const crd = {
      getMainAPIGroup: () => ['example.com', 'v1'] as unknown as [string, string, string],
    };
    expect(resolveCRDApiGroup(crd)).toBeNull();
  });

  it('rejects a tuple with a non-string component from a legacy bundle', () => {
    // An older bundle's `getMainAPIGroup` could return a 3-element tuple
    // with an `undefined` slot (e.g. when no version was resolvable). The
    // `isValidApiGroupTuple` guard must reject that shape, not just the
    // empty-string sentinel.
    const crd = {
      getMainAPIGroup: () =>
        ['example.com', undefined, 'widgets'] as unknown as [string, string, string],
    };
    expect(resolveCRDApiGroup(crd)).toBeNull();
  });
});
