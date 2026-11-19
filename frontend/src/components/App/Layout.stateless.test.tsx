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

// Initialize routes as at app startup, before Layout's sidebar imports.
import '../../lib/router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAppUrl } from '../../helpers/getAppUrl';
import { setConfig, setStatelessConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import { storeStatelessClusterKubeconfig } from '../../stateless';
import { TestContext } from '../../test';
import Layout from './Layout';

describe('Layout stateless read readiness', () => {
  let client: QueryClient;
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    store.dispatch(setConfig({ clusters: null }));
    store.dispatch(setStatelessConfig({ statelessClusters: null }));
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => {
    cleanup();
    client.clear();
    nock.cleanAll();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('open failure releases config fetch; retry rereads and awaits parsing', async () => {
    const parsed = { clusters: [{ name: 'imported', auth_type: 'oidc' }] };
    await storeStatelessClusterKubeconfig('eyJjb250ZXh0cyI6W119');
    nock(getAppUrl()).get('/config').twice().reply(200, {
      clusters: [],
      isDynamicClusterEnabled: true,
      oidcAutoLogin: false,
    });
    const blocked = new Error('IndexedDB unavailable');
    const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw blocked;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const parsing = Promise.withResolvers<Response>();
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) =>
      String(url).endsWith('/parseKubeConfig') ? parsing.promise : originalFetch(url, init)
    );
    render(
      <QueryClientProvider client={client}>
        <TestContext urlPrefix="/c" routerMap={{ cluster: 'imported', page: 'protected' }}>
          <Layout />
        </TestContext>
      </QueryClientProvider>
    );
    await waitFor(() => expect(client.getQueryState(['cluster-fetch'])?.error).toBe(blocked));
    expect(client.getQueryState(['cluster-fetch'])?.fetchStatus).toBe('idle');
    const recovery = client.refetchQueries({ queryKey: ['cluster-fetch'] });
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(client.getQueryState(['cluster-fetch'])?.fetchStatus).toBe('fetching');
    expect(store.getState().config.statelessClusters?.imported).toBeUndefined();
    await act(async () => {
      parsing.resolve(new Response(JSON.stringify(parsed), { status: 200 }));
      await recovery;
    });
    expect(client.getQueryState(['cluster-fetch'])?.status).toBe('success');
    expect(store.getState().config.statelessClusters?.imported.auth_type).toBe('oidc');
  });
});
