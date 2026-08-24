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

import { KubeObject } from './KubeObject';
import { computePatchOperations, computeRawPatchCount } from './patchUtils';

describe('KubeObject', () => {
  it('returns no API group when the class does not define an API version', () => {
    expect(KubeObject.apiGroupName).toBeUndefined();
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

describe('KubeObject write requests', () => {
  // Every write must carry fieldValidation=Strict, otherwise the apiserver defaults to
  // Warn and silently drops unknown fields, so a typo applies successfully and does
  // nothing. See https://github.com/kubernetes-sigs/headlamp/issues/7147.
  const STRICT = { fieldValidation: 'Strict' };
  const original = { kind: 'X', apiVersion: 'v1', metadata: { name: 'n', namespace: 'ns' } } as any;
  const modified = { ...original, spec: { replicas: 2 } };

  beforeEach(() => {
    vi.mocked(computePatchOperations).mockReturnValue([
      { op: 'replace', path: '/spec/replicas', value: 2 },
    ] as any);
    vi.mocked(computeRawPatchCount).mockReturnValue(1);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('patchUpdate sends strict field validation for namespaced resources', () => {
    const jsonPatch = vi.fn().mockResolvedValue({});
    class Namespaced extends KubeObject {
      static kind = 'Namespaced';
      static isNamespaced = true;
    }
    Namespaced.apiEndpoint = { jsonPatch } as any;

    new Namespaced(original, 'my-cluster').patchUpdate(original, modified);

    expect(jsonPatch).toHaveBeenCalledWith(expect.anything(), 'ns', 'n', STRICT, 'my-cluster');
  });

  it('patchUpdate sends strict field validation for cluster-scoped resources', () => {
    const jsonPatch = vi.fn().mockResolvedValue({});
    class ClusterScoped extends KubeObject {
      static kind = 'ClusterScoped';
      static isNamespaced = false;
    }
    ClusterScoped.apiEndpoint = { jsonPatch } as any;

    new ClusterScoped(original, 'my-cluster').patchUpdate(original, modified);

    expect(jsonPatch).toHaveBeenCalledWith(expect.anything(), 'n', STRICT, 'my-cluster');
  });

  it('update sends strict field validation', () => {
    const put = vi.fn().mockResolvedValue({});
    class Puttable extends KubeObject {
      static kind = 'Puttable';
      static isNamespaced = true;
    }
    Puttable.apiEndpoint = { put } as any;

    new Puttable(original, 'my-cluster').update(modified);

    expect(put).toHaveBeenCalledWith(modified, STRICT, 'my-cluster');
  });

  it('static put sends strict field validation', () => {
    const put = vi.fn().mockResolvedValue({});
    class StaticPuttable extends KubeObject {
      static kind = 'StaticPuttable';
      static isNamespaced = true;
    }
    StaticPuttable.apiEndpoint = { put } as any;

    StaticPuttable.put(modified);

    expect(put).toHaveBeenCalledWith(modified, STRICT);
  });

  it('patch sends strict field validation', () => {
    const patch = vi.fn().mockResolvedValue({});
    class Patchable extends KubeObject {
      static kind = 'Patchable';
      static isNamespaced = true;
    }
    Patchable.apiEndpoint = { patch } as any;

    new Patchable(original, 'my-cluster').patch({ spec: { replicas: 2 } } as any);

    expect(patch).toHaveBeenCalledWith({ spec: { replicas: 2 } }, 'ns', 'n', STRICT, 'my-cluster');
  });
});
