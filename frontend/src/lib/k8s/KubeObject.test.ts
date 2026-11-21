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

import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
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
vi.mock('./api/v1/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/hooks')>()),
  useSelectedClusters: vi.fn(),
}));
vi.mock('./api/v2/discoveredConnectionRevisions', () => ({
  getDiscoveredConnectionRevision: vi.fn(),
  useDiscoveredConnectionRevisions: vi.fn(),
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
import { useSelectedClusters } from './api/v1/hooks';
import { ScaleApi } from './api/v1/scaleApi';
import {
  getDiscoveredConnectionRevision,
  useDiscoveredConnectionRevisions,
} from './api/v2/discoveredConnectionRevisions';
import {
  getResourceDiscoveryConnection,
  recordDiscoveryConnection,
} from './api/v2/discoveryConnection';
import { makeListRequests, useKubeObjectList } from './api/v2/useKubeObjectList';
import { KubeObject, KubeObjectInterface } from './KubeObject';
import { computePatchOperations, computeRawPatchCount } from './patchUtils';

describe('KubeObject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDiscoveredConnectionRevision).mockReset();
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
    const wrapper = ({ children }: React.PropsWithChildren) =>
      React.createElement(MemoryRouter, null, children);

    beforeEach(() => {
      vi.resetAllMocks();
      vi.mocked(getCluster).mockReturnValue('selected');
      vi.mocked(useDiscoveredConnectionRevisions).mockReturnValue(new Map());
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
      renderHook(() => Widget.useApiList(vi.fn(), undefined, { cluster: 'selected' }), { wrapper });

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
      const { unmount } = renderHook(
        () =>
          Widget.useApiList(vi.fn(), onError, {
            namespace: ['one', 'two'],
            labelSelector: 'app=example',
            fieldSelector: 'metadata.name=sample',
            limit: 5,
            cluster: 'east',
          }),
        { wrapper }
      );
      expect(getCombinedAllowedNamespaces).not.toHaveBeenCalled();
      for (const namespace of ['one', 'two']) {
        expect(endpoint.list).toHaveBeenCalledWith(
          namespace,
          expect.any(Function),
          expect.any(Function),
          { labelSelector: 'app=example', fieldSelector: 'metadata.name=sample', limit: 5 },
          'east'
        );
      }
      const error = new Error('List failed');
      vi.mocked(endpoint.list).mock.calls[0][2]?.(error, cancel);
      expect(onError).toHaveBeenCalledWith(error, cancel);
      unmount();
      await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
    });

    it('uses an all-namespace request when no cluster or restriction is selected', async () => {
      vi.mocked(getCluster).mockReturnValue(null);
      vi.mocked(endpoint.list).mockResolvedValue(vi.fn());
      renderHook(() => Widget.useApiList(vi.fn()), { wrapper });

      expect(endpoint.list).toHaveBeenCalledWith(
        '',
        expect.any(Function),
        undefined,
        {},
        undefined
      );
      expect(getCombinedAllowedNamespaces).not.toHaveBeenCalled();
    });

    it.each([
      { currentRevision: 'original:1', recordedRevision: 'original:1' },
      { currentRevision: 'replacement:2', recordedRevision: 'original' },
    ])(
      'keeps the guarded LIST origin when the current revision is $currentRevision',
      async ({ currentRevision, recordedRevision }) => {
        vi.mocked(getDiscoveredConnectionRevision).mockReturnValue(currentRevision);
        const onList = vi.fn<(items: Widget[]) => void>();
        await Widget.apiList(onList, undefined, {
          cluster: 'east',
          namespace: 'apps',
          queryParams: { __headlamp_connection_revision: 'original' },
        })();

        const [, callback, , query, cluster] = vi.mocked(endpoint.list).mock.calls[0];
        expect(query).toEqual({ __headlamp_connection_revision: 'original' });
        expect(cluster).toBe('east');
        vi.mocked(getDiscoveredConnectionRevision).mockReturnValue('replacement:3');
        vi.mocked(getCluster).mockReturnValue('selected-later');
        // The streaming list callback receives an array.
        const onResults = callback as unknown as (items: KubeObjectInterface[]) => void;
        onResults([data]);

        const [item] = onList.mock.calls[0][0];
        expect(getResourceDiscoveryConnection(item)).toEqual({
          cluster: 'east',
          revision: recordedRevision,
        });
        await expect(item.update(data)).rejects.toMatchObject({ status: 409 });
        expect(endpoint.put).not.toHaveBeenCalled();
      }
    );

    it('wraps a get response and forwards request errors and cancellation', async () => {
      const cancel = vi.fn();
      const onError = vi.fn();
      vi.mocked(endpoint.get).mockImplementation(async (_namespace, _name, onGet) => {
        onGet(data);
        return cancel;
      });
      const onGet = vi.fn();
      const { unmount } = renderHook(
        () => Widget.useApiGet(onGet, 'sample', 'apps', onError, { cluster: 'east' }),
        { wrapper }
      );
      expect(endpoint.get).toHaveBeenCalledWith(
        'apps',
        'sample',
        expect.any(Function),
        expect.any(Function),
        {},
        'east'
      );
      expect(onGet).toHaveBeenCalledWith(expect.objectContaining({ jsonData: data }));
      const error = new Error('Get failed');
      vi.mocked(endpoint.get).mock.calls[0][3]?.(error, cancel);
      expect(onError).toHaveBeenCalledWith(error, cancel);
      unmount();
      await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    });

    it('clears and restarts legacy reads when their explicit cluster is replaced', async () => {
      const select = (revision: string) => {
        vi.mocked(getDiscoveredConnectionRevision).mockImplementation(cluster =>
          cluster === 'east' ? revision : undefined
        );
        vi.mocked(useDiscoveredConnectionRevisions).mockReturnValue(new Map([['east', revision]]));
      };
      const cancel = vi.fn();
      const onError = vi.fn();
      vi.mocked(endpoint.list).mockResolvedValue(cancel);
      vi.mocked(endpoint.get).mockResolvedValue(cancel);
      const onGet = vi.fn();
      const onList = vi.fn();
      select('original:1');
      const options = { cluster: 'east' };
      const { rerender } = renderHook(
        () => {
          Widget.useApiGet(onGet, 'sample', 'apps', onError, options);
          Widget.useApiList(onList, onError, { ...options, namespace: ['one', 'two'] });
        },
        { wrapper }
      );
      const getCalls = vi.mocked(endpoint.get).mock.calls;
      const listCalls = vi.mocked(endpoint.list).mock.calls;
      getCalls[0][2](data);
      const sendList = (index: number, items: KubeObjectInterface[]) => {
        (listCalls[index][1] as unknown as (items: KubeObjectInterface[]) => void)(items);
      };
      sendList(0, [data]);
      sendList(1, [data]);
      expect(onList.mock.lastCall?.[0]).toHaveLength(2);

      select('replacement:2');
      rerender();
      expect(onList.mock.lastCall?.[0]).toEqual([]);
      expect(onGet.mock.lastCall?.[0]).toBeNull();
      expect(getCalls[1][4]).toEqual({ __headlamp_connection_revision: 'replacement' });
      expect(listCalls[2][3]).toEqual({ __headlamp_connection_revision: 'replacement' });
      expect(listCalls[3][3]).toEqual({ __headlamp_connection_revision: 'replacement' });

      getCalls[0][2](data);
      getCalls[0][3]?.(new Error('Old GET failed'), cancel);
      sendList(1, [data]);
      expect(onList.mock.lastCall?.[0]).toEqual([]);
      expect(onGet.mock.lastCall?.[0]).toBeNull();
      expect(onError).not.toHaveBeenCalled();
      getCalls[1][2](data);
      sendList(2, [data]);
      expect(onGet.mock.lastCall?.[0]).toBeInstanceOf(Widget);
      expect(onList.mock.lastCall?.[0]).toHaveLength(1);
      await waitFor(() => expect(cancel).toHaveBeenCalledTimes(3));
    });

    it('restarts legacy reads when their request inputs change on the same cluster', async () => {
      const cancel = vi.fn();
      vi.mocked(endpoint.list).mockResolvedValue(cancel);
      vi.mocked(endpoint.get).mockResolvedValue(cancel);
      const onGet = vi.fn();
      const onList = vi.fn();
      const initial = { name: 'first', namespace: 'one', labelSelector: 'app=first' };
      const { rerender } = renderHook(
        ({ name, namespace, labelSelector }) => {
          const queryParams = { labelSelector };
          Widget.useApiGet(onGet, name, namespace, undefined, { cluster: 'east', queryParams });
          Widget.useApiList(onList, undefined, {
            ...queryParams,
            namespace: [namespace],
            cluster: 'east',
          });
        },
        { wrapper, initialProps: initial }
      );
      const getCalls = vi.mocked(endpoint.get).mock.calls;
      const listCalls = vi.mocked(endpoint.list).mock.calls;

      rerender({ ...initial });
      expect(getCalls).toHaveLength(1);
      expect(listCalls).toHaveLength(1);
      rerender({ name: 'second', namespace: 'two', labelSelector: 'app=second' });
      expect(onList.mock.lastCall?.[0]).toEqual([]);
      expect(onGet.mock.lastCall?.[0]).toBeNull();
      expect(getCalls[1]).toEqual([
        'two',
        'second',
        expect.any(Function),
        undefined,
        { labelSelector: 'app=second' },
        'east',
      ]);
      expect(listCalls[1]).toEqual([
        'two',
        expect.any(Function),
        undefined,
        { labelSelector: 'app=second' },
        'east',
      ]);
      getCalls[0][2](data);
      expect(onGet.mock.lastCall?.[0]).toBeNull();
      await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
    });

    it('keeps the connection selected when an implicit GET starts', async () => {
      vi.mocked(getDiscoveredConnectionRevision).mockReturnValue('original:1');
      const onGet = vi.fn<(item: Widget) => void>();
      await Widget.apiGet(onGet, 'sample', 'apps')();

      const [, , onResult, , query, cluster] = vi.mocked(endpoint.get).mock.calls[0];
      expect(query).toEqual({ __headlamp_connection_revision: 'original' });
      expect(cluster).toBe('selected');
      vi.mocked(getCluster).mockReturnValue('selected-later');
      onResult(data);

      const [item] = onGet.mock.calls[0];
      await item.update(data);
      expect(endpoint.put).toHaveBeenCalledWith(
        data,
        { __headlamp_connection_revision: 'original' },
        'selected'
      );
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

    it('uses the originating route for mutations of a retained discovered resource', async () => {
      const widget = new Widget(data, 'east');
      vi.mocked(getDiscoveredConnectionRevision).mockReturnValue('original:2');
      recordDiscoveryConnection(widget, 'east', 'original:2');
      const query = { __headlamp_connection_revision: 'original' };
      const operations = [{ op: 'replace' as const, path: '/spec/replicas', value: 3 }];
      vi.mocked(computePatchOperations).mockReturnValue(operations);

      await widget.delete(true);
      expect(endpoint.delete).toHaveBeenCalledWith(
        'apps',
        'sample',
        { ...query, gracePeriodSeconds: 0 },
        'east'
      );
      await widget.update(data);
      expect(endpoint.put).toHaveBeenCalledWith(data, query, 'east');
      await widget.patch({ spec: { replicas: 3 } });
      expect(endpoint.patch).toHaveBeenCalledWith(
        { spec: { replicas: 3 } },
        'apps',
        'sample',
        query,
        'east'
      );
      await widget.patchUpdate(data, data);
      expect(endpoint.jsonPatch).toHaveBeenCalledWith(operations, 'apps', 'sample', query, 'east');

      widget.cluster = 'west';
      await expect(widget.delete()).rejects.toMatchObject({ status: 409 });
      expect(endpoint.delete).toHaveBeenCalledTimes(1);
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

    it('rejects scaling a retained resource reassigned to another cluster', async () => {
      const patch = vi.fn<ScaleApi['patch']>().mockResolvedValue(data);
      Widget.apiEndpoint = { ...endpoint, scale: { get: vi.fn(), put: vi.fn(), patch } };
      const widget = new Widget(data, 'east');
      vi.mocked(getDiscoveredConnectionRevision).mockReturnValue('original:2');
      recordDiscoveryConnection(widget, 'east', 'original:2');

      await widget.scale(3);
      expect(patch).toHaveBeenCalledWith({ spec: { replicas: 3 } }, data.metadata, 'east', {
        __headlamp_connection_revision: 'original',
      });

      widget.cluster = 'west';
      await expect(widget.scale(3)).rejects.toMatchObject({ status: 409 });
      expect(patch).toHaveBeenCalledTimes(1);
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
        { cluster: 'east', expectedDiscoveryConnection: { revision: undefined } }
      );
    });

    it('does not retry forbidden authorization requests', async () => {
      const error = { status: 403 };
      vi.mocked(post).mockRejectedValue(error);

      await expect(Widget.fetchAuthorization({ verb: 'get' }, 'east')).rejects.toBe(error);
      expect(post).toHaveBeenCalledOnce();
    });

    it('does not try another authorization API after the connection changes', async () => {
      const revision = vi.mocked(getDiscoveredConnectionRevision).mockReturnValue('original:1');
      vi.mocked(post).mockImplementationOnce(async () => {
        revision.mockReturnValue('replacement:2');
        throw { status: 404 };
      });

      await expect(Widget.fetchAuthorization({ verb: 'get' }, 'east')).rejects.toMatchObject({
        status: 409,
      });
      expect(vi.mocked(post).mock.calls.map(([path]) => path)).toEqual([
        '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews?__headlamp_connection_revision=original',
      ]);
    });

    it('discards a successful authorization result from a replaced connection', async () => {
      const revision = vi.mocked(getDiscoveredConnectionRevision).mockReturnValue('original:1');
      const late = Promise.withResolvers<{ status: { allowed: boolean } }>();
      vi.mocked(post).mockReturnValueOnce(late.promise);
      const review = Widget.fetchAuthorization({ verb: 'get' }, 'east');
      revision.mockReturnValue('replacement:2');
      late.resolve({ status: { allowed: true } });

      await expect(review).rejects.toMatchObject({ status: 409 });
    });

    it('does not ask another connection about a retained resource', async () => {
      vi.mocked(getDiscoveredConnectionRevision).mockReturnValue('replacement:2');
      const widget = new Widget(data, 'east');
      recordDiscoveryConnection(widget, 'east', 'original:1');

      await expect(widget.getAuthorization('update')).rejects.toMatchObject({ status: 409 });
      await expect(widget.getAuthorization('update', {}, 'west')).rejects.toMatchObject({
        status: 409,
      });
      expect(post).not.toHaveBeenCalled();
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
