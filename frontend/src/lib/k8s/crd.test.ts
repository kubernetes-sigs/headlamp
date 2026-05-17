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
import { selectMainAPIGroup, validateCRDSpec } from './crdSpec';

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

  it('honours spec.version when it matches a served entry in versions[]', () => {
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
    expect(result.missing).toEqual(['names.plural', 'names.kind', 'group', 'scope', 'versions']);
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
    expect(result.missing).toEqual(['names.plural', 'names.kind', 'group', 'scope', 'versions']);
  });
});
