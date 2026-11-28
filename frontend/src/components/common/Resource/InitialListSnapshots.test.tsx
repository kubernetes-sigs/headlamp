/*
 * Copyright 2026 The Kubernetes Authors
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

import '../../../i18n/config';
import '../../../lib/router';
import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import * as apiFetch from '../../../lib/k8s/api/v2/fetch';
import { WebSocketManager } from '../../../lib/k8s/api/v2/multiplexer';
import CRD from '../../../lib/k8s/crd';
import Secret from '../../../lib/k8s/secret';
import { createMuiTheme } from '../../../lib/themes';
import { setConfig } from '../../../redux/configSlice';
import reducers from '../../../redux/reducers/reducers';
import { TestContext } from '../../../test';
import { CrInstanceList } from '../../crd/CustomResourceInstancesList';
import CustomResourceDefinitionList from '../../crd/List';
import SecretList from '../../secret/List';

const cases = [
  {
    name: 'Secrets',
    View: SecretList,
    model: Secret,
    resource: 'secrets',
    emptyText: 'No data to be shown.',
  },
  {
    name: 'CRDs',
    View: CustomResourceDefinitionList,
    model: CRD,
    resource: 'customresourcedefinitions',
    emptyText: 'No data to be shown.',
  },
  {
    name: 'instance definitions',
    View: CrInstanceList,
    model: CRD,
    resource: 'customresourcedefinitions',
    emptyText: 'No custom resources instances found.',
  },
];

const clients = new Set<QueryClient>();
let previousURL: string;

beforeEach(() => {
  previousURL = window.location.href;
  localStorage.clear();
  vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
  vi.spyOn(WebSocketManager, 'subscribe').mockResolvedValue(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('selfsubjectaccessreviews')) throw new Error(`Unexpected request: ${url}`);
      return Response.json({ status: { allowed: false } });
    })
  );
});

afterEach(async () => {
  cleanup();
  for (const client of clients) {
    await client.cancelQueries();
    client.clear();
  }
  clients.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', previousURL);
});

describe.each(cases)('$name real LIST snapshots', ({ name, View, model, resource, emptyText }) => {
  function setup(initialFailure: boolean) {
    const failure = new ApiError('Initial LIST forbidden', {
      status: 403,
      cluster: 'test-cluster',
    });
    let fail = initialFailure;
    window.history.replaceState({}, '', `/c/test-cluster/${resource}`);
    vi.spyOn(apiFetch, 'clusterFetch').mockImplementation(async url => {
      const path = new URL(String(url), 'http://localhost').pathname;
      if (path.endsWith(`/${resource}`)) {
        if (fail) throw failure;
        return Response.json({
          kind: resource === 'secrets' ? 'SecretList' : 'CustomResourceDefinitionList',
          apiVersion: resource === 'secrets' ? 'v1' : 'apiextensions.k8s.io/v1',
          metadata: { resourceVersion: '1' },
          items: [],
        });
      }
      if (path.endsWith('/namespaces')) {
        return Response.json({
          kind: 'NamespaceList',
          apiVersion: 'v1',
          metadata: { resourceVersion: '1' },
          items: [],
        });
      }
      if (path.endsWith('/selfsubjectaccessreviews')) {
        return Response.json({ status: { allowed: false } });
      }
      throw new Error(`Unexpected cluster request: ${url}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.add(client);
    const store = configureStore({ reducer: reducers });
    store.dispatch(
      setConfig({
        clusters: { 'test-cluster': { name: 'test-cluster', auth_type: '' } },
        isDynamicClusterEnabled: false,
      })
    );
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider theme={createMuiTheme({ base: 'light', name: 'light' })}>
          <TestContext
            store={store}
            urlPrefix="/c"
            routerMap={{ cluster: 'test-cluster', resource }}
          >
            <View />
          </TestContext>
        </ThemeProvider>
      </QueryClientProvider>
    );
    return {
      client,
      failure,
      rejectRefresh: () => {
        fail = true;
      },
    };
  }

  it('blocks an initial failed LIST instead of claiming the resources are empty', async () => {
    const { failure } = setup(true);
    const errorText =
      name === 'instance definitions'
        ? /Error getting custom resource definitions:/
        : model.getErrorMessage(failure);
    if (!errorText) throw new Error('Expected a resource error message');
    expect(await screen.findByText(errorText, {}, { timeout: 3000 })).toBeVisible();
    expect(screen.queryAllByText(emptyText)).toHaveLength(0);
  });

  it('keeps a genuinely loaded empty snapshot visible after a failed refresh', async () => {
    const { client, rejectRefresh } = setup(false);
    expect((await screen.findAllByText(emptyText, {}, { timeout: 3000 }))[0]).toBeInTheDocument();
    rejectRefresh();
    await act(async () => {
      await client.refetchQueries({ queryKey: ['kubeObject', 'list'] });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You don't have permissions to view this resource"
    );
    expect(screen.getAllByText(emptyText)[0]).toBeInTheDocument();
  });
});
