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
import { IDBFactory } from 'fake-indexeddb';
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAppUrl } from '../helpers/getAppUrl';
import store from '../redux/stores/store';
import { logout, setToken } from './auth';
import { encodeClusterPath } from './oidcLogout';
import { invalidateClusterUserInfo, queryClient, shouldRetryQuery } from './queryClient';

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
    queryClient.setQueryData(['auth', 'cluster-b'], { ok: true });
    // Non-auth resource data must be left alone.
    queryClient.setQueryData(['pods', 'cluster-b'], { items: [] });

    await invalidateClusterUserInfo();

    expect(queryClient.getQueryState(['clusterMe', 'cluster-a'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['clusterMe', 'cluster-b'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(['auth', 'cluster-b'])).toBeUndefined();
    expect(queryClient.getQueryState(['pods', 'cluster-b'])?.isInvalidated).toBe(false);
  });
});

describe('credential auth cache lifecycle', () => {
  const key = ['auth', 'sample', 'oidc', 'server'] as const;
  const unsubscribers: (() => void)[] = [];
  beforeEach(() => {
    queryClient.clear();
    vi.stubGlobal('indexedDB', new IDBFactory());
  });
  afterEach(() => {
    unsubscribers.splice(0).forEach(unsubscribe => unsubscribe());
    queryClient.clear();
    nock.cleanAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function observe(queryFn: () => Promise<string>) {
    const observer = new QueryObserver(queryClient, { queryKey: key, queryFn, retry: false });
    unsubscribers.push(observer.subscribe(() => {}));
    return observer;
  }
  function mockWrite(token: string | null, override: boolean) {
    if (override) {
      const state = store.getState();
      vi.spyOn(store, 'getState').mockReturnValue({
        ...state,
        ui: { ...state.ui, functionsToOverride: { setToken: () => true } },
      });
    } else {
      const endpoint = token
        ? '/clusters/sample/set-token'
        : `/encoded-clusters/${encodeClusterPath('sample')}/clear-token`;
      nock(getAppUrl()).post(endpoint, { token }).reply(200, {});
    }
  }

  it.each(['active', 'inactive', 'override', 'popup'])(
    '%s completion clears stale auth before current requests complete',
    async mode => {
      const pending = [Promise.withResolvers<string>(), Promise.withResolvers<string>()];
      let requests = 0;
      queryClient.setQueryData(key, 'old-success');
      queryClient.setQueryData(['auth', 'other'], 'other-success');
      queryClient.setQueryData(['pods', 'other'], 'keep-resources');
      const observer = mode === 'inactive' ? undefined : observe(() => pending[requests++].promise);
      if (observer) void observer.refetch();
      if (mode !== 'popup') mockWrite('replacement', mode === 'override');
      const writing =
        mode === 'popup' ? invalidateClusterUserInfo() : setToken('sample', 'replacement');
      await vi.waitFor(() => expect(queryClient.getQueryData(key)).toBeUndefined());
      if (observer) {
        expect(observer.getCurrentResult().isSuccess).toBe(false);
        pending[0].resolve('late-old-success');
        await Promise.resolve();
        expect(queryClient.getQueryData(key)).toBeUndefined();
        pending[1].resolve('current-success');
        expect(requests).toBe(2);
      }
      await writing;
      const current = observer ?? observe(async () => 'current-success');
      await vi.waitFor(() => expect(current.getCurrentResult().data).toBe('current-success'));
      expect(queryClient.getQueryData(['auth', 'other'])).toBe(
        mode === 'popup' ? undefined : 'other-success'
      );
      expect(queryClient.getQueryData(['pods', 'other'])).toBe('keep-resources');
    }
  );

  it.each(['clear', 'empty-clear', 'override-clear', 'logout'])(
    '%s evicts auth without a new probe or late repopulation',
    async mode => {
      const old = Promise.withResolvers<string>();
      let requests = 0;
      const observer = observe(() =>
        ++requests === 1 ? old.promise : Promise.resolve('forbidden-refetch')
      );
      const token = mode === 'empty-clear' ? '' : null;
      mockWrite(token, mode === 'override-clear');
      if (mode === 'logout') await logout('sample', true);
      else await setToken('sample', token);
      expect(queryClient.getQueryState(key)).toBeUndefined();
      old.resolve('late-success');
      await Promise.resolve();
      expect(queryClient.getQueryData(key)).toBeUndefined();
      expect(requests).toBe(1);
      expect(observer.getCurrentResult().isSuccess).toBe(false);
    }
  );

  it('failed token SET leaves current auth intact', async () => {
    queryClient.setQueryData(key, 'current-authenticated');
    nock(getAppUrl()).post('/clusters/sample/set-token', { token: 'bad-write' }).reply(500, {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(setToken('sample', 'bad-write')).rejects.toMatchObject({ status: 500 });
    expect(queryClient.getQueryData(key)).toBe('current-authenticated');
  });
});
