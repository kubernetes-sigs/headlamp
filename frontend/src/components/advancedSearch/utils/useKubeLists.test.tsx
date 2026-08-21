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

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKubeLists } from './useKubeLists';

const { listResult, MockKubeObject } = vi.hoisted(() => {
  const listResult = { items: [] as any[], errors: null as any, isError: false };

  class MockKubeObject {
    static useList() {
      return listResult;
    }
  }

  return { listResult, MockKubeObject };
});

vi.mock('../../../lib/k8s/KubeObject', () => ({ KubeObject: MockKubeObject }));

vi.mock('../../../redux/filterSlice', () => ({
  default: () => ({}),
  initialState: {},
  useNamespaces: () => [],
}));

vi.mock('../../../lib/k8s', () => ({
  ResourceClasses: { Pod: MockKubeObject },
}));

const podResource = {
  kind: 'Pod',
  apiVersion: 'v1',
  pluralName: 'pods',
  isNamespaced: true,
} as any;

function itemsOfLength(n: number) {
  return Array.from({ length: n }, (_, i) => ({ metadata: { uid: String(i) } }));
}

describe('useKubeLists', () => {
  beforeEach(() => {
    listResult.items = [];
  });

  it('includes a resource holding exactly the maximum number of items', () => {
    listResult.items = itemsOfLength(3);

    const { result } = renderHook(() => useKubeLists([podResource], ['cluster'], 3));

    expect(result.current.items).toHaveLength(3);
  });

  it('keeps items when the maximum is not a number', () => {
    listResult.items = itemsOfLength(3);

    const { result } = renderHook(() => useKubeLists([podResource], ['cluster'], NaN));

    expect(result.current.items).toHaveLength(3);
  });

  it('excludes a resource holding more than the maximum', () => {
    listResult.items = itemsOfLength(4);

    const { result } = renderHook(() => useKubeLists([podResource], ['cluster'], 3));

    expect(result.current.items).toHaveLength(0);
  });
});
