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
import { vi } from 'vitest';

vi.mock('../cluster', () => ({
  formatClusterPathParam: vi.fn(),
  getCluster: vi.fn(),
  getSelectedClusters: vi.fn(),
}));
vi.mock('../../helpers/clusterSettings', () => ({
  loadClusterSettings: vi.fn(),
  getCombinedAllowedNamespaces: vi.fn(),
  hasAllowedNamespacesRestriction: vi.fn(),
}));
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

import { getCombinedAllowedNamespaces } from '../../helpers/clusterSettings';
import { getCluster } from '../cluster';
import { post } from './api/v1/clusterRequests';
import { ApiClient, ApiWithNamespaceClient } from './api/v1/factories';
import { useConnectApi, useSelectedClusters } from './api/v1/hooks';
import { ScaleApi } from './api/v1/scaleApi';
import { makeListRequests, useKubeObjectList } from './api/v2/useKubeObjectList';
import { KubeObject, KubeObjectInterface } from './KubeObject';
import { computePatchOperations, computeRawPatchCount } from './patchUtils';

describe('KubeObject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSelectedClusters).mockReturnValue([]);
    vi.mocked(useKubeObjectList).mockReturnValue({} as any);
  });

  describe('KubeObject requests and editing', () => {
    class Widget extends KubeObject<KubeObjectInterface> {
      static apiVersion = 'example.test/v1';
      static apiName = 'widgets';
      static kind = 'Widget';
      static isNamespaced = true;
    }

    const data: KubeObjectInterface = {
      apiVersion: 'example.test/v1',
      kind: 'Widget',
      metadata: {
        name: 'sample',
        namespace: 'apps',
        uid: 'sample-uid',
        creationTimestamp: '2026-01-01T00:00:00Z',
      },
      spec: { replicas: 1 },
    };
    let endpoint: ApiWithNamespaceClient<KubeObjectInterface>;

    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(getCluster).mockReturnValue('selected');
      endpoint = {
        isNamespaced: true,
        apiInfo: [
          { group: 'example.test', version: 'v1', resource: 'widgets' },
          { group: 'example.test', version: 'v1beta1', resource: 'widgets' },
        ],
        list: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['list']>(),
        get: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['get']>(),
        post: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['post']>(),
        put: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['put']>(),
        patch: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['patch']>(),
        jsonPatch: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['jsonPatch']>(),
        delete: vi.fn<ApiWithNamespaceClient<KubeObjectInterface>['delete']>(),
      };
      Widget.apiEndpoint = endpoint;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('removes nested readonly fields without modifying the original resource', () => {
      class EditableWidget extends Widget {
        static readOnlyFields = ['$.metadata.resourceVersion', '$.spec.containers[*].status'];
      }
      const original = {
        ...data,
        metadata: { ...data.metadata, resourceVersion: '42' },
        spec: { containers: [{ name: 'app', status: 'running' }] },
      };

      const editable = new EditableWidget(original).getEditableObject();

      expect(editable).toEqual({
        ...data,
        spec: { containers: [{ name: 'app' }] },
      });
      expect(original.metadata.resourceVersion).toBe('42');
      expect(original.spec.containers[0].status).toBe('running');
    });

    it('uses allowed namespaces when a namespaced list has no explicit namespace', async () => {
      vi.mocked(getCombinedAllowedNamespaces).mockReturnValue(['permitted']);
      vi.mocked(endpoint.list).mockResolvedValue(vi.fn());
      renderHook(() => Widget.useApiList(vi.fn(), undefined, { cluster: 'selected' }));

      await vi.mocked(useConnectApi).mock.calls[0][0]();

      expect(getCombinedAllowedNamespaces).toHaveBeenCalledWith('selected');
      expect(endpoint.list).toHaveBeenCalledWith(
        'permitted',
        expect.any(Function),
        undefined,
        {},
        'selected'
      );
    });

    it('preserves selectors, errors and cancellation for each explicitly requested namespace', async () => {
      const cancel = vi.fn();
      const onError = vi.fn();
      vi.mocked(endpoint.list).mockResolvedValue(cancel);
      renderHook(() =>
        Widget.useApiList(vi.fn(), onError, {
          namespace: ['one', 'two'],
          labelSelector: 'app=example',
          fieldSelector: 'metadata.name=sample',
          limit: 5,
          cluster: 'east',
        })
      );

      for (const request of vi.mocked(useConnectApi).mock.calls[0]) {
        const stop = await request();
        stop();
      }

      expect(getCombinedAllowedNamespaces).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledTimes(2);
      for (const namespace of ['one', 'two']) {
        expect(endpoint.list).toHaveBeenCalledWith(
          namespace,
          expect.any(Function),
          onError,
          { labelSelector: 'app=example', fieldSelector: 'metadata.name=sample', limit: 5 },
          'east'
        );
      }
    });

    it('uses an all-namespace request when no cluster or restriction is selected', async () => {
      vi.mocked(getCluster).mockReturnValue(null);
      vi.mocked(endpoint.list).mockResolvedValue(vi.fn());
      renderHook(() => Widget.useApiList(vi.fn()));

      await vi.mocked(useConnectApi).mock.calls[0][0]();

      expect(endpoint.list).toHaveBeenCalledWith(
        '',
        expect.any(Function),
        undefined,
        {},
        undefined
      );
      expect(getCombinedAllowedNamespaces).not.toHaveBeenCalled();
    });

    it('wraps a get response and forwards request errors and cancellation', async () => {
      const cancel = vi.fn();
      const onError = vi.fn();
      vi.mocked(endpoint.get).mockImplementation(async (_namespace, _name, onGet) => {
        onGet(data);
        return cancel;
      });
      const onGet = vi.fn();
      renderHook(() => Widget.useApiGet(onGet, 'sample', 'apps', onError, { cluster: 'east' }));

      expect(await vi.mocked(useConnectApi).mock.calls[0][0]()).toBe(cancel);
      expect(endpoint.get).toHaveBeenCalledWith(
        'apps',
        'sample',
        expect.any(Function),
        onError,
        undefined,
        'east'
      );
      expect(onGet).toHaveBeenCalledWith(expect.objectContaining({ jsonData: data }));
    });

    it('sets background propagation and immediate deletion for a forced Job deletion', () => {
      class Job extends Widget {
        static kind = 'Job';
      }
      new Job({ ...data, kind: 'Job' }, 'east').delete(true);

      expect(endpoint.delete).toHaveBeenCalledWith(
        'apps',
        'sample',
        { propagationPolicy: 'Background', gracePeriodSeconds: 0 },
        'east'
      );
    });

    it('sends merge patches with the resource namespace and cluster', () => {
      new Widget(data, 'east').patch({ spec: { replicas: 3 } });

      expect(endpoint.patch).toHaveBeenCalledWith(
        { spec: { replicas: 3 } },
        'apps',
        'sample',
        {},
        'east'
      );
    });

    it('sends only editable JSON patch operations to the namespaced endpoint', async () => {
      const operations = [{ op: 'replace' as const, path: '/spec/replicas', value: 3 }];
      vi.mocked(computePatchOperations).mockReturnValue(operations);
      vi.mocked(endpoint.jsonPatch).mockResolvedValue(data);

      await expect(new Widget(data, 'east').patchUpdate(data, data)).resolves.toBe(data);
      expect(endpoint.jsonPatch).toHaveBeenCalledWith(operations, 'apps', 'sample', {}, 'east');
    });

    it('rejects edits limited to server-managed fields rather than silently discarding them', async () => {
      vi.mocked(computePatchOperations).mockReturnValue([]);
      vi.mocked(computeRawPatchCount).mockReturnValue(2);

      await expect(new Widget(data).patchUpdate(data, data)).rejects.toThrow(
        'No editable changes to apply: all 2 change(s) for sample were in server-managed fields'
      );
      expect(endpoint.jsonPatch).not.toHaveBeenCalled();
    });

    it('does not send a patch for an unchanged resource', async () => {
      vi.mocked(computePatchOperations).mockReturnValue([]);
      vi.mocked(computeRawPatchCount).mockReturnValue(0);

      await expect(new Widget(data).patchUpdate(data, data)).resolves.toBe(data);
      expect(endpoint.jsonPatch).not.toHaveBeenCalled();
    });

    it('rejects scaling resources whose endpoint has no scale API', () => {
      expect(() => new Widget(data).scale(3)).toThrow('This class has no scale API: Widget');
    });

    it('passes replica changes, metadata and cluster to the scale subresource', async () => {
      const patch = vi.fn<ScaleApi['patch']>().mockResolvedValue(data);
      Widget.apiEndpoint = {
        ...endpoint,
        scale: { get: vi.fn(), put: vi.fn(), patch },
      };

      await new Widget(data, 'east').scale(3);

      expect(patch).toHaveBeenCalledWith({ spec: { replicas: 3 } }, data.metadata, 'east');
    });

    it('does not insert a namespace into a cluster-scoped JSON patch request', async () => {
      class ClusterWidget extends Widget {
        static isNamespaced = false;
      }
      const jsonPatch = vi
        .fn<ApiClient<KubeObjectInterface>['jsonPatch']>()
        .mockResolvedValue(data);
      const client: ApiClient<KubeObjectInterface> = {
        ...endpoint,
        isNamespaced: false,
        list: vi.fn(),
        get: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        jsonPatch,
      };
      ClusterWidget.apiEndpoint = client;
      const operations = [{ op: 'replace' as const, path: '/spec/replicas', value: 3 }];
      vi.mocked(computePatchOperations).mockReturnValue(operations);

      await new ClusterWidget(data, 'east').patchUpdate(data, data);

      expect(jsonPatch).toHaveBeenCalledWith(operations, 'sample', {}, 'east');
    });

    it('retries authorization on the beta review API only for a missing stable API', async () => {
      const result = { status: { allowed: true } };
      vi.mocked(post).mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce(result);

      await expect(
        Widget.fetchAuthorization({ verb: 'get', resource: 'widgets' }, 'east')
      ).resolves.toEqual(result);
      expect(post).toHaveBeenNthCalledWith(
        2,
        '/apis/authorization.k8s.io/v1beta1/selfsubjectaccessreviews',
        {
          kind: 'SelfSubjectAccessReview',
          apiVersion: 'authorization.k8s.io/v1beta1',
          spec: { resourceAttributes: { verb: 'get', resource: 'widgets' } },
        },
        false,
        { cluster: 'east' }
      );
    });

    it('does not retry forbidden authorization requests', async () => {
      const error = { status: 403 };
      vi.mocked(post).mockRejectedValue(error);

      await expect(Widget.fetchAuthorization({ verb: 'get' }, 'east')).rejects.toBe(error);
      expect(post).toHaveBeenCalledOnce();
    });

    it('propagates a missing authorization API after both supported versions fail', async () => {
      const error = { status: 404 };
      vi.mocked(post).mockRejectedValue(error);

      await expect(Widget.fetchAuthorization({ verb: 'get' }, 'east')).rejects.toBe(error);
      expect(post).toHaveBeenCalledTimes(2);
    });

    it('falls back to the next resource API version after a not-found authorization result', async () => {
      const result = { status: { allowed: true } };
      const fetch = vi
        .spyOn(Widget, 'fetchAuthorization')
        .mockRejectedValueOnce({ status: 404 })
        .mockResolvedValueOnce(result);

      await expect(Widget.getAuthorization('list', undefined, 'east')).resolves.toEqual(result);
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        { verb: 'list', resource: 'widgets', group: 'example.test', version: 'v1beta1' },
        'east'
      );
    });

    it('propagates resource authorization errors without trying unrelated API versions', async () => {
      const error = { status: 403 };
      const fetch = vi.spyOn(Widget, 'fetchAuthorization').mockRejectedValue(error);

      await expect(Widget.getAuthorization('list', undefined, 'east')).rejects.toBe(error);
      expect(fetch).toHaveBeenCalledOnce();
    });
  });

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

  it('uses exact namespace requests instead of constructing a cross-product', () => {
    class MyNamespacedResource extends KubeObject {
      static apiVersion = 'example.headlamp.dev/v1';
      static kind = 'MyNamespacedResource';
      static apiName = 'mynamespacedresources';
      static isNamespaced = true;
    }
    const requests = [
      { cluster: 'cluster-a', namespaces: ['foo'] },
      { cluster: 'cluster-b', namespaces: ['bar'] },
    ];

    renderHook(() =>
      MyNamespacedResource.useList({
        clusters: ['cluster-a', 'cluster-b'],
        namespace: ['foo', 'bar'],
        requests,
      })
    );

    expect(makeListRequests).not.toHaveBeenCalled();
    expect(useKubeObjectList).toHaveBeenCalledWith(
      expect.objectContaining({ kubeObjectClass: MyNamespacedResource, requests })
    );
  });

  it('removes namespaces from exact requests for cluster-scoped resources', () => {
    class MyClusterResource extends KubeObject {
      static apiVersion = 'example.headlamp.dev/v1';
      static kind = 'MyClusterResource';
      static apiName = 'myclusterresources';
      static isNamespaced = false;
    }

    renderHook(() =>
      MyClusterResource.useList({
        requests: [{ cluster: 'cluster-a', namespaces: ['foo'] }],
      })
    );

    expect(useKubeObjectList).toHaveBeenCalledWith(
      expect.objectContaining({
        kubeObjectClass: MyClusterResource,
        requests: [{ cluster: 'cluster-a', namespaces: undefined }],
      })
    );
  });

  it('uses an explicit cluster for instance authorization checks', async () => {
    class MyResource extends KubeObject {
      static apiVersion = 'example.headlamp.dev/v1';
      static apiName = 'myresources';
    }
    const getAuthorization = vi
      .spyOn(MyResource, 'getAuthorization')
      .mockResolvedValue({ status: { allowed: true } } as any);
    const resource = new MyResource(
      {
        apiVersion: 'example.headlamp.dev/v1',
        metadata: { name: 'my-resource', namespace: 'default' },
      },
      'original-cluster'
    );

    await resource.getAuthorization('get', undefined, 'explicit-cluster');

    expect(getAuthorization).toHaveBeenCalledWith(
      'get',
      {
        group: 'example.headlamp.dev',
        name: 'my-resource',
        namespace: 'default',
        verb: 'get',
        version: 'v1',
      },
      'explicit-cluster'
    );
  });
});
