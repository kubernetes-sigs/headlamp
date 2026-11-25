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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCluster } from '../../../cluster';
import { clusterRequest, jsonPatch, patch, post, put, remove } from './clusterRequests';
import {
  apiFactory,
  apiFactoryWithNamespace,
  multipleApiFactory,
  resourceDefToApiFactory,
  singleApiFactory,
} from './factories';
import { apiScaleFactory } from './scaleApi';
import { streamResult, streamResultsForCluster } from './streamingApi';

vi.mock('../../../cluster', () => ({
  getCluster: vi.fn(() => 'default-cluster'),
}));

vi.mock('./clusterRequests', () => ({
  clusterRequest: vi.fn(),
  post: vi.fn().mockResolvedValue({ ok: 'post' }),
  put: vi.fn().mockResolvedValue({ ok: 'put' }),
  patch: vi.fn().mockResolvedValue({ ok: 'patch' }),
  jsonPatch: vi.fn().mockResolvedValue({ ok: 'jsonPatch' }),
  remove: vi.fn().mockResolvedValue({ ok: 'delete' }),
}));

vi.mock('./streamingApi', () => ({
  streamResult: vi.fn(),
  streamResultsForCluster: vi.fn(),
}));

vi.mock('./scaleApi', () => ({
  apiScaleFactory: vi.fn(() => ({ get: vi.fn(), put: vi.fn() })),
}));

describe('v1 api factories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('singleApiFactory builds cluster-scoped CRUD and streaming methods', async () => {
    const client = singleApiFactory('', 'v1', 'nodes');
    expect(client.isNamespaced).toBe(false);
    expect(client.apiInfo).toEqual([{ group: '', version: 'v1', resource: 'nodes' }]);

    const cb = vi.fn();
    const errCb = vi.fn();
    client.list(cb, errCb, { labelSelector: 'a=b' }, 'c1');
    expect(streamResultsForCluster).toHaveBeenCalledWith(
      'api/v1/nodes',
      { cb, errCb, cluster: 'c1' },
      { labelSelector: 'a=b' }
    );

    client.get('n1', cb, errCb, undefined, 'c1');
    expect(streamResult).toHaveBeenCalledWith('api/v1/nodes', 'n1', cb, errCb, undefined, 'c1');

    await client.post({ metadata: { name: 'n1' } }, { dryRun: 'All' }, 'c1');
    expect(post).toHaveBeenCalledWith(
      'api/v1/nodes?dryRun=All',
      { metadata: { name: 'n1' } },
      true,
      { cluster: 'c1' }
    );

    await client.put({ metadata: { name: 'n1' } } as any, undefined, 'c1');
    expect(put).toHaveBeenCalledWith('api/v1/nodes/n1', { metadata: { name: 'n1' } }, true, {
      cluster: 'c1',
    });

    await client.patch([{ op: 'replace', path: '/a', value: 1 }], 'n1', undefined, 'c1');
    expect(patch).toHaveBeenCalledWith(
      'api/v1/nodes/n1?pretty=true',
      [{ op: 'replace', path: '/a', value: 1 }],
      true,
      { cluster: 'c1' }
    );

    await client.jsonPatch([{ op: 'replace', path: '/a', value: 1 }], 'n1', undefined, 'c1');
    expect(jsonPatch).toHaveBeenCalledWith(
      'api/v1/nodes/n1?pretty=true',
      [{ op: 'replace', path: '/a', value: 1 }],
      true,
      { cluster: 'c1' }
    );

    await client.delete('n1', { gracePeriodSeconds: 0 } as any, 'c1');
    expect(remove).toHaveBeenCalledWith('api/v1/nodes/n1?gracePeriodSeconds=0', {
      cluster: 'c1',
    });
  });

  it('apiFactory delegates single and multiple endpoints and retries on 404', async () => {
    const single = apiFactory('apps', 'v1', 'deployments');
    expect(single.apiInfo).toHaveLength(1);

    const multi = apiFactory(
      ['networking.k8s.io', 'v1', 'ingresses'],
      ['extensions', 'v1beta1', 'ingresses']
    );
    expect(multi.isNamespaced).toBe(false);
    expect(multi.apiInfo).toHaveLength(2);

    // repeatFactoryMethod: 404 on first endpoint falls back to second
    vi.mocked(post)
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }))
      .mockResolvedValueOnce({ ok: 'v1beta1' });
    expect(await multi.post({ metadata: { name: 'ing' } })).toEqual({ ok: 'v1beta1' });
    expect(post).toHaveBeenCalledTimes(2);

    // Non-404 error does not retry
    vi.mocked(post).mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
    await expect(multi.post({ metadata: { name: 'ing' } })).rejects.toThrow('forbidden');

    // repeatStreamFunc: 404 triggers next endpoint, non-404 calls errCb
    const cancelFirst = vi.fn();
    const cancelSecond = vi.fn();
    vi.mocked(streamResultsForCluster)
      .mockImplementationOnce(async (_url, { errCb: innerErrCb }) => {
        queueMicrotask(() =>
          innerErrCb(Object.assign(new Error('404'), { status: 404 }), cancelFirst)
        );
        return cancelFirst;
      })
      .mockResolvedValueOnce(cancelSecond);

    const errCb = vi.fn();
    const cancelAll = await multi.list(vi.fn(), errCb);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(cancelFirst).toHaveBeenCalled();
    expect(streamResultsForCluster).toHaveBeenCalledTimes(2);
    cancelAll();
    expect(cancelSecond).toHaveBeenCalled();

    // Non-404 error forwards to caller errCb
    vi.mocked(streamResult).mockImplementationOnce(async (_url, _name, _cb, innerErrCb) => {
      innerErrCb(Object.assign(new Error('500'), { status: 500 }));
      return () => {};
    });
    await multi.get('ing', vi.fn(), errCb);
    expect(errCb).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
      expect.any(Function)
    );
  });

  it('apiFactoryWithNamespace builds single, scaled, and multiple namespaced clients', async () => {
    const scaled = apiFactoryWithNamespace('apps', 'v1', 'deployments', true);
    expect(scaled.isNamespaced).toBe(true);
    expect(apiScaleFactory).toHaveBeenCalledWith('/apis/apps/v1', 'deployments');
    expect(scaled.scale).toBeDefined();

    await scaled.post({ metadata: { name: 'd1', namespace: 'ns1' } });
    expect(post).toHaveBeenCalledWith(
      '/apis/apps/v1/namespaces/ns1/deployments',
      { metadata: { name: 'd1', namespace: 'ns1' } },
      true,
      { cluster: undefined }
    );

    await scaled.put({ metadata: { name: 'd1', namespace: '' } } as any);
    expect(put).toHaveBeenCalledWith(
      '/apis/apps/v1/deployments/d1',
      { metadata: { name: 'd1', namespace: '' } },
      true,
      { cluster: undefined }
    );

    await scaled.patch([], 'ns1', 'd1');
    expect(patch).toHaveBeenCalledWith(
      '/apis/apps/v1/namespaces/ns1/deployments/d1?pretty=true',
      [],
      true,
      { cluster: undefined }
    );

    await scaled.jsonPatch([], 'ns1', 'd1');
    expect(jsonPatch).toHaveBeenCalledWith(
      '/apis/apps/v1/namespaces/ns1/deployments/d1?pretty=true',
      [],
      true,
      { cluster: undefined }
    );

    await scaled.delete('ns1', 'd1');
    expect(remove).toHaveBeenCalledWith('/apis/apps/v1/namespaces/ns1/deployments/d1', {
      cluster: undefined,
    });

    const multiNs = apiFactoryWithNamespace(
      ['networking.k8s.io', 'v1', 'ingresses'],
      ['extensions', 'v1beta1', 'ingresses']
    );
    expect(multiNs.isNamespaced).toBe(true);
    expect(multiNs.apiInfo).toHaveLength(2);
    await multiNs.list('ns1', vi.fn(), vi.fn());
    expect(streamResultsForCluster).toHaveBeenCalledWith(
      '/apis/networking.k8s.io/v1/namespaces/ns1/ingresses',
      expect.any(Object),
      undefined
    );

    // multipleApiFactory direct call
    expect(multipleApiFactory(['', 'v1', 'pods']).apiInfo).toHaveLength(1);
  });

  it('resourceDefToApiFactory validates inputs and resolves namespaced vs cluster resources', async () => {
    await expect(resourceDefToApiFactory({} as any)).rejects.toThrow(
      'Cannot handle unknown resource kind'
    );
    await expect(resourceDefToApiFactory({ kind: 'Pod' } as any)).rejects.toThrow(
      'Definition Pod has no apiVersion'
    );
    await expect(resourceDefToApiFactory({ kind: 'Pod', apiVersion: '/' } as any)).rejects.toThrow(
      'apiVersion has no version string'
    );

    vi.mocked(clusterRequest).mockResolvedValueOnce(null);
    await expect(resourceDefToApiFactory({ kind: 'Pod', apiVersion: 'v1' } as any)).rejects.toThrow(
      'Unkown apiVersion: v1'
    );

    vi.mocked(clusterRequest).mockResolvedValueOnce({ resources: [] });
    await expect(resourceDefToApiFactory({ kind: 'Pod', apiVersion: 'v1' } as any)).rejects.toThrow(
      'Unkown resource kind: Pod'
    );

    vi.mocked(clusterRequest).mockResolvedValueOnce({
      resources: [{ kind: 'Pod', namespaced: true, name: 'pods', singularName: 'pod' }],
    });
    const podClient = await resourceDefToApiFactory({ kind: 'Pod', apiVersion: 'v1' } as any);
    expect(clusterRequest).toHaveBeenLastCalledWith('/api/v1', {
      cluster: 'default-cluster',
      autoLogoutOnAuthError: false,
    });
    expect(podClient.isNamespaced).toBe(true);

    vi.mocked(getCluster).mockReturnValue('');
    vi.mocked(clusterRequest).mockResolvedValueOnce({
      resources: [
        { kind: 'ClusterRole', namespaced: false, name: 'clusterroles', singularName: '' },
      ],
    });
    const crClient = await resourceDefToApiFactory(
      { kind: 'ClusterRole', apiVersion: 'rbac.authorization.k8s.io/v1' } as any,
      'explicit-cluster'
    );
    expect(clusterRequest).toHaveBeenLastCalledWith('/apis/rbac.authorization.k8s.io/v1', {
      cluster: 'explicit-cluster',
      autoLogoutOnAuthError: false,
    });
    expect(crClient.isNamespaced).toBe(false);
  });
});
