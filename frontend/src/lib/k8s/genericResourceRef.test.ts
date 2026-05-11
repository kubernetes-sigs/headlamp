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

import type { ApiResource } from './api/v2/ApiResource';
import {
  genericResourceRefFromApiResource,
  parseGenericResourceRef,
  serializeGenericResourceRef,
  type GenericResourceRef,
} from './genericResourceRef';

describe('genericResourceRef', () => {
  it('roundtrips core and extension API refs', () => {
    const core: ApiResource = {
      apiVersion: 'v1',
      version: 'v1',
      pluralName: 'pods',
      kind: 'Pod',
      isNamespaced: true,
      singularName: 'pod',
    };
    const id = serializeGenericResourceRef(genericResourceRefFromApiResource(core));
    expect(parseGenericResourceRef(id)).toEqual({
      apiVersion: 'v1',
      pluralName: 'pods',
      kind: 'Pod',
      isNamespaced: true,
      singularName: 'pod',
      groupName: undefined,
    });

    const ext: ApiResource = {
      apiVersion: 'storage.k8s.io/v1',
      version: 'v1',
      pluralName: 'csidrivers',
      kind: 'CSIDriver',
      isNamespaced: false,
      singularName: 'csidriver',
      groupName: 'storage.k8s.io',
    };
    const refExt = genericResourceRefFromApiResource(ext);
    const id2 = serializeGenericResourceRef(refExt);
    expect(parseGenericResourceRef(id2)).toEqual(refExt);
  });

  it('returns null for invalid id', () => {
    expect(parseGenericResourceRef('not-valid-base64!!!')).toBeNull();
  });

  it('returns null for empty or oversized id', () => {
    expect(parseGenericResourceRef('')).toBeNull();
    expect(parseGenericResourceRef('a'.repeat(9000))).toBeNull();
  });

  it('throws when serialized JSON exceeds limit', () => {
    const huge: GenericResourceRef = {
      apiVersion: 'v1',
      pluralName: 'pods',
      kind: 'Pod',
      isNamespaced: true,
      singularName: 'x'.repeat(5000),
    };
    expect(() => serializeGenericResourceRef(huge)).toThrow(
      'GenericResourceRef JSON exceeds maximum length'
    );
  });
});
