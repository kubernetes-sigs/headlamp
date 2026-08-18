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

import { vi } from 'vitest';

vi.mock('../cluster', () => ({
  formatClusterPathParam: vi.fn(),
  getCluster: vi.fn(),
  getSelectedClusters: vi.fn(),
}));
vi.mock('../../helpers/clusterSettings', () => ({ loadClusterSettings: vi.fn() }));
vi.mock('../router/createRouteURL', () => ({ createRouteURL: vi.fn() }));
vi.mock('../util', () => ({ timeAgo: vi.fn() }));
vi.mock('./api/v1/clusterRequests', () => ({ post: vi.fn() }));
vi.mock('./api/v1/factories', () => ({
  apiFactory: vi.fn(),
  apiFactoryWithNamespace: vi.fn(),
}));
vi.mock('./api/v1/hooks', () => ({
  useConnectApi: vi.fn(),
  useSelectedClusters: vi.fn(),
}));
vi.mock('./api/v2/hooks', () => ({ useKubeObject: vi.fn() }));
vi.mock('./api/v2/useKubeObjectList', () => ({
  makeListRequests: vi.fn(),
  useKubeObjectList: vi.fn(),
}));
vi.mock('./patchUtils', () => ({
  computePatchOperations: vi.fn(),
  computeRawPatchCount: vi.fn(),
}));

import { renderHook } from '@testing-library/react';
import { useSelectedClusters } from './api/v1/hooks';
import { makeListRequests, useKubeObjectList } from './api/v2/useKubeObjectList';
import { KubeObject } from './KubeObject';

describe('KubeObject', () => {
  it('returns no API group when the class does not define an API version', () => {
    expect(KubeObject.apiGroupName).toBeUndefined();
  });

  describe('useList', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('requests no clusters when no cluster is selected', () => {
      vi.mocked(useSelectedClusters).mockReturnValue([]);
      vi.mocked(useKubeObjectList).mockReturnValue([null, null] as any);

      renderHook(() => KubeObject.useList());

      expect(makeListRequests).toHaveBeenCalledWith([], expect.any(Function), undefined, undefined);
    });

    it('requests the selected clusters when no explicit cluster is given', () => {
      vi.mocked(useSelectedClusters).mockReturnValue(['cluster-a']);
      vi.mocked(useKubeObjectList).mockReturnValue([null, null] as any);

      renderHook(() => KubeObject.useList());

      expect(makeListRequests).toHaveBeenCalledWith(
        ['cluster-a'],
        expect.any(Function),
        undefined,
        undefined
      );
    });
  });

  it('matches subclasses that define a custom API group and kind', () => {
    class MyResource extends KubeObject {
      static apiVersion = 'example.headlamp.dev/v1';
      static kind = 'MyResourceKind';
    }

    expect(
      MyResource.isClassOf(
        new MyResource({ kind: 'MyResourceKind', metadata: { name: 'my-test-resource' } })
      )
    ).toBe(true);
  });
});
