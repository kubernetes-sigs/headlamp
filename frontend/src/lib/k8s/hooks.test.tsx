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
import { useKubeApiGet, useKubeApiList, useKubeGet, useKubeList } from './hooks';
import { KubeObject } from './KubeObject';

const mockApiList = vi.fn();
const mockApiGet = vi.fn();

class MockKubeObject extends KubeObject {
  static kind = 'MockKind';
  static isNamespaced = true;
  static apiList = mockApiList;
  static apiGet = mockApiGet;
}

vi.mock('./api/v1/hooks', () => ({
  useConnectApi: vi.fn(),
  useSelectedClusters: () => ['test-cluster'],
}));

vi.mock('./api/v2/useKubeObjectList', () => ({
  useKubeObjectList: vi.fn(() => ({ data: [], isLoading: false })),
  makeListRequests: vi.fn(),
}));

vi.mock('./api/v2/hooks', () => ({
  useKubeObject: vi.fn(() => ({ data: null, isLoading: false })),
}));

describe('KubeObject hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useKubeApiList', () => {
    it('calls apiList on the provided class', () => {
      const onList = vi.fn();
      renderHook(() =>
        useKubeApiList(MockKubeObject as any, onList, undefined, { namespace: 'test-ns' })
      );
      expect(mockApiList).toHaveBeenCalled();
    });
  });

  describe('useKubeApiGet', () => {
    it('calls apiGet on the provided class', () => {
      const onGet = vi.fn();
      renderHook(() => useKubeApiGet(MockKubeObject as any, onGet, 'test-name', 'test-ns'));
      expect(mockApiGet).toHaveBeenCalled();
    });
  });

  describe('useKubeList', () => {
    it('returns data from v2 hook', () => {
      const { result } = renderHook(() =>
        useKubeList(MockKubeObject as any, { namespace: 'test-ns' })
      );
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('useKubeGet', () => {
    it('returns data from v2 hook', () => {
      const { result } = renderHook(() =>
        useKubeGet(MockKubeObject as any, 'test-name', 'test-ns')
      );
      expect(result.current.isLoading).toBe(false);
    });
  });
});
