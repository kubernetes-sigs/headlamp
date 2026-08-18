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
import { ApiResource } from '../../../lib/k8s/api/v2/ApiResource';
import { useKubeLists } from './useKubeLists';

const { mockBuiltinUseList, mockFallbackUseList, mockResourceClasses } = vi.hoisted(() => {
  const builtinItems = [{ marker: 'builtin' }];
  const fallbackItems = [{ marker: 'fallback' }];
  const mockBuiltinUseList = vi.fn(() => ({ items: builtinItems, isError: false }));
  const mockFallbackUseList = vi.fn(() => ({ items: fallbackItems, isError: false }));

  class FakeDeployment {
    static kind = 'Deployment';
    static apiVersion = 'apps/v1';
    static useList = mockBuiltinUseList;
  }

  return {
    mockBuiltinUseList,
    mockFallbackUseList,
    mockResourceClasses: { Deployment: FakeDeployment },
  };
});

vi.mock('../../../redux/filterSlice', () => ({
  useNamespaces: () => undefined,
}));

vi.mock('../../../lib/k8s', () => ({
  ResourceClasses: mockResourceClasses,
  getResourceClass: (kind: string, apiVersion?: string) => {
    const cls = (mockResourceClasses as Record<string, any>)[kind];
    if (!cls) {
      return null;
    }
    if (!apiVersion) {
      return cls;
    }
    const groupOf = (v: string) => (v.includes('/') ? v.split('/')[0] : '');
    const classVersions = Array.isArray(cls.apiVersion) ? cls.apiVersion : [cls.apiVersion];
    return classVersions.some((v: string) => groupOf(v) === groupOf(apiVersion)) ? cls : null;
  },
}));

vi.mock('../../../lib/k8s/cluster', () => ({
  KubeObject: class {
    static useList = mockFallbackUseList;
  },
}));

function makeResource(overrides: Partial<ApiResource>): ApiResource {
  return {
    apiVersion: 'apps/v1',
    version: 'v1',
    pluralName: 'deployments',
    singularName: 'deployment',
    kind: 'Deployment',
    isNamespaced: true,
    ...overrides,
  };
}

describe('useKubeLists', () => {
  beforeEach(() => {
    mockBuiltinUseList.mockClear();
    mockFallbackUseList.mockClear();
  });

  it('uses the built-in class when kind and apiVersion group match', () => {
    const { result } = renderHook(() =>
      useKubeLists([makeResource({ apiVersion: 'apps/v1' })], ['test-cluster'], 100)
    );

    expect(mockBuiltinUseList).toHaveBeenCalled();
    expect(mockFallbackUseList).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([{ marker: 'builtin' }]);
  });

  it('falls back to the ad-hoc class when the kind matches a built-in but the group differs', () => {
    // Reproduces issue #7321: a CRD sharing a kind name with a built-in resource
    // (e.g. Kueue's kueue.x-k8s.io/v1beta1 Workload) must not resolve to the
    // built-in class from a different group.
    const { result } = renderHook(() =>
      useKubeLists([makeResource({ apiVersion: 'kueue.x-k8s.io/v1beta1' })], ['test-cluster'], 100)
    );

    expect(mockFallbackUseList).toHaveBeenCalled();
    expect(mockBuiltinUseList).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([{ marker: 'fallback' }]);
  });
});
