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

import '../../../App';
import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import nock from 'nock';
import { createElement, PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { apply } from '../../../lib/k8s/api/v1/apply';
import { remove } from '../../../lib/k8s/api/v1/clusterRequests';
import { queryClient } from '../../../lib/queryClient';
import { createMuiTheme } from '../../../lib/themes';
import { PLUGINS_RELOAD_EVENT } from '../../../plugin/pluginsSlice';
import { setConfig } from '../../../redux/configSlice';
import reducers from '../../../redux/reducers/reducers';
import { API_BASE, TestContext } from '../../../test';
import {
  catalogSecretName,
  deleteCatalogSecret,
  fetchManagerInfo,
  ManagerInfo,
  ManagerState,
  probeIndex,
  resolvePlugin,
  saveCatalogSecret,
  saveManagerState,
  searchCatalog,
  searchCatalogAll,
  usePluginManagerInfo,
  withCatalog,
  withoutCatalog,
  withoutPlugin,
  withPlugin,
} from './api';
import CatalogSettings from './CatalogSettings';
import PluginBrowser from './PluginBrowser';

vi.mock('../../../lib/k8s/api/v1/apply', () => ({
  apply: vi.fn(),
}));

vi.mock('../../../lib/k8s/api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/k8s/api/v1/clusterRequests')>()),
  remove: vi.fn(),
}));

const info: ManagerInfo = {
  enabled: true,
  clusterName: 'hosting',
  resourceVersion: '42',
  namespace: 'headlamp',
  configMapName: 'headlamp-plugin-manager',
  state: {},
  status: { configMapFound: true, plugins: {} },
};

function entries(count: number, offset: number = 0) {
  return Array.from({ length: count }, (_, i) => ({
    name: `plugin-${offset + i}`,
    version: '1.0.0',
    catalog: 'nexus',
  }));
}

afterEach(() => {
  nock.cleanAll();
  vi.clearAllMocks();
});

describe('state helpers', () => {
  const plugin = { name: 'flux', version: '1.0.0', archiveUrl: 'https://x/a.tgz', checksum: 'c' };
  const catalog = { id: 'nexus', name: 'Nexus', type: 'index' as const, url: 'https://x' };

  it('withPlugin adds and replaces by name', () => {
    let state: ManagerState = withPlugin({}, plugin);
    expect(state.plugins).toHaveLength(1);

    state = withPlugin(state, { ...plugin, version: '2.0.0' });
    expect(state.plugins).toHaveLength(1);
    expect(state.plugins?.[0].version).toBe('2.0.0');
  });

  it('withoutPlugin removes by name', () => {
    const state = withoutPlugin(withPlugin({}, plugin), 'flux');
    expect(state.plugins).toHaveLength(0);
  });

  it('withCatalog adds and replaces by id', () => {
    let state: ManagerState = withCatalog({}, catalog);
    state = withCatalog(state, { ...catalog, name: 'Other' });
    expect(state.catalogs).toHaveLength(1);
    expect(state.catalogs?.[0].name).toBe('Other');
  });

  it('withoutCatalog removes by id', () => {
    const state = withoutCatalog(withCatalog({}, catalog), 'nexus');
    expect(state.catalogs).toHaveLength(0);
  });

  it('catalogSecretName derives a stable name', () => {
    expect(catalogSecretName('nexus')).toBe('headlamp-catalog-nexus');
  });
});

describe('fetchManagerInfo', () => {
  it('returns the backend info', async () => {
    nock(API_BASE)
      .get('/clusters/hosting/plugin-manager')
      .reply(200, { enabled: true, namespace: 'headlamp', configMapName: 'cm' });

    const result = await fetchManagerInfo('hosting');
    expect(result.enabled).toBe(true);
    expect(result.namespace).toBe('headlamp');
  });

  it('reports the manager as disabled when the endpoint is missing', async () => {
    nock(API_BASE).get('/clusters/hosting/plugin-manager').reply(404, { error: 'not found' });

    const result = await fetchManagerInfo('hosting');
    expect(result.enabled).toBe(false);
    expect(result.status.configMapFound).toBe(false);
  });
});

describe('searchCatalog', () => {
  it('returns entries and hasMore', async () => {
    nock(API_BASE)
      .get('/clusters/hosting/plugin-manager/catalogs/nexus/search')
      .query({ q: 'flux', offset: '0', limit: '50' })
      .reply(200, { entries: entries(2), hasMore: true });

    const result = await searchCatalog('hosting', 'nexus', 'flux');
    expect(result.entries).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it('defaults to an empty result set', async () => {
    nock(API_BASE)
      .get('/clusters/hosting/plugin-manager/catalogs/nexus/search')
      .query(true)
      .reply(200, {});

    const result = await searchCatalog('hosting', 'nexus', '');
    expect(result.entries).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('throws the backend error message', async () => {
    nock(API_BASE)
      .get('/clusters/hosting/plugin-manager/catalogs/nexus/search')
      .query(true)
      .reply(502, { error: 'catalog unreachable' });

    await expect(searchCatalog('hosting', 'nexus', '')).rejects.toThrow('catalog unreachable');
  });
});

describe('searchCatalogAll', () => {
  it('pages until the backend reports no more results', async () => {
    nock(API_BASE)
      .get('/clusters/hosting/plugin-manager/catalogs/nexus/search')
      .query({ q: '', offset: '0', limit: '50' })
      .reply(200, { entries: entries(50), hasMore: true });
    nock(API_BASE)
      .get('/clusters/hosting/plugin-manager/catalogs/nexus/search')
      .query({ q: '', offset: '50', limit: '50' })
      .reply(200, { entries: entries(20, 50), hasMore: false });

    const result = await searchCatalogAll('hosting', 'nexus', '');
    expect(result).toHaveLength(70);
    expect(result[0].name).toBe('plugin-0');
    expect(result[69].name).toBe('plugin-69');
  });

  it('stops when a page comes back empty', async () => {
    nock(API_BASE)
      .get('/clusters/hosting/plugin-manager/catalogs/nexus/search')
      .query({ q: '', offset: '0', limit: '50' })
      .reply(200, { entries: [], hasMore: true });

    const result = await searchCatalogAll('hosting', 'nexus', '');
    expect(result).toHaveLength(0);
  });
});

describe('resolvePlugin', () => {
  it('resolves a catalog entry to an archive', async () => {
    nock(API_BASE)
      .get('/clusters/hosting/plugin-manager/catalogs/hub/resolve')
      .query({ name: 'flux', version: '1.0.0', repoName: 'repo', source: 'https://src' })
      .reply(200, { name: 'flux', version: '1.0.0', archiveUrl: 'https://x/a.tgz', checksum: 'c' });

    const resolved = await resolvePlugin('hosting', 'hub', {
      name: 'flux',
      version: '1.0.0',
      catalog: 'hub',
      repoName: 'repo',
      source: 'https://src',
    });
    expect(resolved.archiveUrl).toBe('https://x/a.tgz');
  });
});

describe('probeIndex', () => {
  it('returns the located index URL', async () => {
    nock(API_BASE)
      .post(
        '/clusters/hosting/plugin-manager/probe-index',
        body => body.url === 'https://nexus.example'
      )
      .reply(200, { indexUrl: 'https://nexus.example/index.json' });

    const indexUrl = await probeIndex('hosting', { url: 'https://nexus.example' });
    expect(indexUrl).toBe('https://nexus.example/index.json');
  });
});

describe('saveManagerState', () => {
  it('patches only manager state with a resource version precondition', async () => {
    const state: ManagerState = { catalogs: [], plugins: [] };
    const scope = nock(API_BASE)
      .patch(
        '/clusters/hosting/api/v1/namespaces/headlamp/configmaps/headlamp-plugin-manager',
        body => {
          expect(body).toEqual({
            metadata: { resourceVersion: '42' },
            data: { 'state.json': JSON.stringify(state, null, 2) },
          });
          return true;
        }
      )
      .reply(200, {});
    scope.matchHeader('Content-Type', 'application/merge-patch+json');
    await saveManagerState(info, state);
    expect(scope.isDone()).toBe(true);
  });
});

describe('catalog secrets', () => {
  it('saveCatalogSecret stores the password in a Secret', async () => {
    const name = await saveCatalogSecret(info, 'nexus', 'hunter2');

    expect(name).toBe('headlamp-catalog-nexus');
    const secret = (apply as Mock).mock.calls[0][0];
    expect(secret.kind).toBe('Secret');
    expect(secret.stringData.password).toBe('hunter2');
  });

  it('deleteCatalogSecret tolerates a missing Secret', async () => {
    (remove as Mock).mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));

    await expect(deleteCatalogSecret(info, 'nexus')).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith(
      '/api/v1/namespaces/headlamp/secrets/headlamp-catalog-nexus',
      { cluster: 'hosting' }
    );
  });
});

it('surfaces stale ConfigMap writes without overwriting them', async () => {
  nock(API_BASE)
    .patch('/clusters/hosting/api/v1/namespaces/headlamp/configmaps/headlamp-plugin-manager')
    .reply(409, { message: 'resourceVersion conflict' });
  await expect(saveManagerState(info, { plugins: [] })).rejects.toThrow('configuration changed');
});

it('creates a missing ConfigMap without falling back to an unconditional update', async () => {
  nock(API_BASE)
    .post('/clusters/hosting/api/v1/namespaces/headlamp/configmaps')
    .reply(409, { message: 'already exists' });
  await expect(
    saveManagerState(
      { ...info, resourceVersion: '', status: { ...info.status, configMapFound: false } },
      {}
    )
  ).rejects.toThrow('configuration changed');
});

it('rejects deletion of a catalog still referenced by a plugin', () => {
  expect(() =>
    withoutCatalog(
      {
        plugins: [
          {
            name: 'p',
            version: '1',
            catalog: 'private',
            archiveUrl: 'https://example.com/p',
            checksum: 'c',
          },
        ],
      },
      'private'
    )
  ).toThrow('Uninstall');
});

it('surfaces authentication failures when fetching manager info', async () => {
  nock(API_BASE)
    .get('/clusters/hosting/plugin-manager')
    .reply(401, { error: 'authentication required' });
  await expect(fetchManagerInfo('hosting')).rejects.toThrow('authentication required');
});

it('passes the hosting cluster explicitly when saving secrets', async () => {
  await saveCatalogSecret(info, 'private', 'password');
  expect(apply).toHaveBeenCalledWith(expect.objectContaining({ kind: 'Secret' }), 'hosting');
});

it('does not suppress secret deletion permission errors', async () => {
  vi.mocked(remove).mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
  await expect(deleteCatalogSecret(info, 'private')).rejects.toThrow('forbidden');
});

const browserInfo: ManagerInfo = {
  enabled: true,
  clusterName: 'hosting',
  resourceVersion: '1',
  namespace: 'headlamp',
  configMapName: 'plugins',
  state: {
    catalogs: [
      { id: 'catalog', name: 'Catalog', type: 'index', url: 'https://example.com/index.json' },
    ],
  },
  status: { configMapFound: true, plugins: {} },
};

function wrapper(cluster: string = 'hosting') {
  const store = configureStore({ reducer: reducers });
  store.dispatch(
    setConfig({
      clusters: {
        hosting: { name: 'hosting', auth_type: '', meta_data: { source: 'incluster' } },
        remote: { name: 'remote', auth_type: '', meta_data: { source: 'kubeconfig' } },
      },
    })
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        ThemeProvider,
        { theme: createMuiTheme({ base: 'light', name: 'light' }) },
        createElement(TestContext, { store, routerMap: { cluster }, urlPrefix: '/c' }, children)
      )
    );
}

function pendingResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function entry(name: string) {
  return new Response(
    JSON.stringify({ entries: [{ name, catalog: 'catalog', version: '1' }], hasMore: false }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

afterEach(() => vi.restoreAllMocks());

describe('PluginBrowser searches', () => {
  it.each(['success', 'error'])(
    'ignores an older search %s after the newer search finishes',
    async outcome => {
      const first = pendingResponse();
      const second = pendingResponse();
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      render(createElement(PluginBrowser, { info: browserInfo, onChanged: () => {} }), {
        wrapper: wrapper(),
      });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      const search = screen.getByLabelText('Search plugins');
      fireEvent.change(search, { target: { value: 'latest' } });
      fireEvent.keyDown(search, { key: 'Enter' });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      await act(async () => second.resolve(entry('latest-plugin')));
      expect(await screen.findByText('latest-plugin')).toBeInTheDocument();
      await act(async () =>
        first.resolve(
          outcome === 'success' ? entry('stale-plugin') : new Response('{}', { status: 502 })
        )
      );
      expect(screen.getByText('latest-plugin')).toBeInTheDocument();
      expect(screen.queryByText('stale-plugin')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  );
});

describe('hosting cluster binding', () => {
  it('does not fetch deployment manager info while a remote cluster is selected', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => usePluginManagerInfo(), { wrapper: wrapper('remote') });
    expect(result.current.info?.enabled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches the hosting context explicitly', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(browserInfo)));
    const { result } = renderHook(() => usePluginManagerInfo(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.info?.enabled).toBe(true));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/clusters/hosting/plugin-manager'),
      expect.anything()
    );
  });
});

describe('CatalogSettings saving', () => {
  beforeEach(() => {
    vi.mocked(window.matchMedia).mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  const catalog = {
    id: 'foo-bar',
    name: 'Foo bar',
    type: 'index' as const,
    url: 'https://example.com/index.json',
    username: 'user',
    passwordSecret: 'headlamp-catalog-foo-bar',
  };
  const catalogInfo = { ...info, state: { catalogs: [catalog] } };
  const configMapPath =
    '/clusters/hosting/api/v1/namespaces/headlamp/configmaps/headlamp-plugin-manager';

  it('rejects a new name that normalizes to an existing ID before writing credentials', async () => {
    const onChanged = vi.fn();
    render(createElement(CatalogSettings, { info: catalogInfo, onChanged }), {
      wrapper: wrapper(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Catalog' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'FOO-bar' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://other.example' } });
    fireEvent.click(screen.getByLabelText('Requires authentication (username / password)'));
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new-user' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A catalog with this ID already exists'
    );
    expect(apply).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('allows editing the existing catalog without replacing its credentials', async () => {
    const onChanged = vi.fn();
    const scope = nock(API_BASE)
      .patch(configMapPath, body => {
        const saved = JSON.parse(body.data['state.json']).catalogs;
        expect(saved).toEqual([{ ...catalog, name: 'Renamed' }]);
        return true;
      })
      .reply(200, {});
    render(createElement(CatalogSettings, { info: catalogInfo, onChanged }), {
      wrapper: wrapper(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(scope.isDone()).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['success', 'conflict', 'cleanup failure'])(
    'disables authentication with safe secret cleanup: %s',
    async outcome => {
      const onChanged = vi.fn();
      const scope = nock(API_BASE)
        .patch(configMapPath, body => {
          expect(remove).not.toHaveBeenCalled();
          const saved = JSON.parse(body.data['state.json']).catalogs[0];
          expect(saved.passwordSecret).toBeUndefined();
          expect(saved.username).toBeUndefined();
          return true;
        })
        .reply(outcome === 'conflict' ? 409 : 200, {});
      if (outcome === 'cleanup failure') {
        vi.mocked(remove).mockRejectedValueOnce(
          Object.assign(new Error('forbidden'), { status: 403 })
        );
      }
      render(createElement(CatalogSettings, { info: catalogInfo, onChanged }), {
        wrapper: wrapper(),
      });
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByLabelText('Requires authentication (username / password)'));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
      expect(scope.isDone()).toBe(true);
      if (outcome === 'conflict') {
        expect(remove).not.toHaveBeenCalled();
        expect(await screen.findByRole('alert')).toHaveTextContent('configuration changed');
      } else {
        expect(remove).toHaveBeenCalledWith(
          '/api/v1/namespaces/headlamp/secrets/headlamp-catalog-foo-bar',
          { cluster: 'hosting' }
        );
        if (outcome === 'cleanup failure') {
          expect(await screen.findByRole('alert')).toHaveTextContent('forbidden');
        } else {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        }
      }
    }
  );
});

describe('manager plugin refresh', () => {
  it('honors the reload signal on manager responses', async () => {
    const refresh = vi.fn();
    window.addEventListener(PLUGINS_RELOAD_EVENT, refresh);
    try {
      nock(API_BASE)
        .get('/clusters/hosting/plugin-manager')
        .reply(200, info, { 'X-Reload': 'reload' });
      await fetchManagerInfo('hosting');
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(PLUGINS_RELOAD_EVENT, refresh);
    }
  });

  it.each([{}, { fixture: { phase: 'synced', version: '2.0.0' } }])(
    'refreshes changed plugin status even without a reload header: %s',
    async plugins => {
      const refresh = vi.fn();
      window.addEventListener(PLUGINS_RELOAD_EVENT, refresh);
      queryClient.setQueryData(['plugin-manager-info', 'hosting'], {
        ...info,
        status: { ...info.status, plugins: { fixture: { phase: 'synced', version: '1.0.0' } } },
      });
      try {
        nock(API_BASE)
          .get('/clusters/hosting/plugin-manager')
          .reply(200, { ...info, status: { ...info.status, plugins } });
        await fetchManagerInfo('hosting');
        expect(refresh).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener(PLUGINS_RELOAD_EVENT, refresh);
        queryClient.removeQueries({ queryKey: ['plugin-manager-info', 'hosting'], exact: true });
      }
    }
  );
});
