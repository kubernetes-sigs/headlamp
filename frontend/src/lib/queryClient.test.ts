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

import { QueryObserver } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  invalidateClusterUserInfo,
  queryClient,
  removeClusterResourceQueries,
  shouldRetryQuery,
} from './queryClient';

describe('queryClient', () => {
  it('keeps the existing query defaults', () => {
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      staleTime: 3 * 60_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    });
  });
});

describe('shouldRetryQuery', () => {
  it.each([400, 401, 403, 404])('does not immediately retry HTTP %s responses', status => {
    expect(shouldRetryQuery(0, { status })).toBe(false);
  });

  it.each([408, 429, 500])('retries transient HTTP %s responses up to three times', status => {
    expect(shouldRetryQuery(2, { status })).toBe(true);
    expect(shouldRetryQuery(3, { status })).toBe(false);
  });

  it.each([
    null,
    'network error',
    new Error('network error'),
    { message: 'network error' },
    { status: '403' },
    { status: Number.NaN },
  ])('retries errors without a numeric HTTP status up to three times', error => {
    expect(shouldRetryQuery(2, error)).toBe(true);
    expect(shouldRetryQuery(3, error)).toBe(false);
  });

  it('retries responses outside the permanent client-error range', () => {
    expect(shouldRetryQuery(2, { status: 399 })).toBe(true);
    expect(shouldRetryQuery(2, { status: undefined })).toBe(true);
  });
});

describe('invalidateClusterUserInfo', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('invalidates the cached identity of every cluster, not only the one logged into', async () => {
    // Alice has been browsing cluster B; her identity is cached there. Cluster A
    // is cached too. Then Bob logs into A. With token broadcast, B's cookie is
    // now Bob's — so B's cached "alice" must not be served for its staleTime.
    queryClient.setQueryData(['clusterMe', 'cluster-a'], { name: 'alice' });
    queryClient.setQueryData(['clusterMe', 'cluster-b'], { name: 'alice' });
    queryClient.setQueryData(['object', 'cluster-b', '/api/v1/pods', 'ns', 'pod-a', {}], {
      name: 'pod-a',
    });
    queryClient.setQueryData(
      ['kubeObject', 'list', 'v1', 'pods', 'cluster-b', 'ns', {}],
      [{ name: 'pod-a' }]
    );
    // An unrelated cache entry must be left alone.
    queryClient.setQueryData(['auth', 'cluster-b'], { ok: true });

    await invalidateClusterUserInfo();

    expect(queryClient.getQueryState(['clusterMe', 'cluster-a'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['clusterMe', 'cluster-b'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['auth', 'cluster-b'])?.isInvalidated).toBe(false);
    expect(
      queryClient.getQueryData(['object', 'cluster-b', '/api/v1/pods', 'ns', 'pod-a', {}])
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(['kubeObject', 'list', 'v1', 'pods', 'cluster-b', 'ns', {}])
    ).toBeUndefined();
  });
});

describe('removeClusterResourceQueries', () => {
  beforeEach(() => {
    queryClient.clear();
  });

  it('removes only object and list results belonging to the specified cluster', () => {
    const clusterAObject = ['object', 'cluster-a', '/api/v1/pods', 'ns', 'pod-a', {}];
    const clusterAList = ['kubeObject', 'list', 'v1', 'pods', 'cluster-a', 'ns', {}];
    const clusterBObject = ['object', 'cluster-b', '/api/v1/pods', 'ns', 'pod-b', {}];
    const clusterBList = ['kubeObject', 'list', 'v1', 'pods', 'cluster-b', 'ns', {}];
    const otherClusterData = ['clusterVersion', 'cluster-a'];

    queryClient.setQueryData(clusterAObject, { name: 'pod-a' });
    queryClient.setQueryData(clusterAList, [{ name: 'pod-a' }]);
    queryClient.setQueryData(clusterBObject, { name: 'pod-b' });
    queryClient.setQueryData(clusterBList, [{ name: 'pod-b' }]);
    queryClient.setQueryData(otherClusterData, 'v1.30.0');

    removeClusterResourceQueries('cluster-a');

    expect(queryClient.getQueryData(clusterAObject)).toBeUndefined();
    expect(queryClient.getQueryData(clusterAList)).toBeUndefined();
    expect(queryClient.getQueryData(clusterBObject)).toEqual({ name: 'pod-b' });
    expect(queryClient.getQueryData(clusterBList)).toEqual([{ name: 'pod-b' }]);
    expect(queryClient.getQueryData(otherClusterData)).toBe('v1.30.0');
  });

  it('clears results already held by active observers', () => {
    const queryKey = ['kubeObject', 'list', 'v1', 'pods', 'cluster-a', 'ns', {}];
    queryClient.setQueryData(queryKey, [{ name: 'pod-a' }]);
    const observer = new QueryObserver(queryClient, {
      queryKey,
      queryFn: async () => [{ name: 'pod-a' }],
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});

    expect(observer.getCurrentResult().data).toEqual([{ name: 'pod-a' }]);

    removeClusterResourceQueries('cluster-a');

    expect(observer.getCurrentResult().data).toBeNull();
    unsubscribe();
  });
});
