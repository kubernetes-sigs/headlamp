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

import nock from 'nock';
import { afterEach, describe, expect, it, Mock, vi } from 'vitest';
import { apply } from '../../../lib/k8s/api/v1/apply';
import { remove } from '../../../lib/k8s/api/v1/clusterRequests';
import { API_BASE } from '../../../test';
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
  withCatalog,
  withoutCatalog,
  withoutPlugin,
  withPlugin,
} from './api';

vi.mock('../../../lib/k8s/api/v1/apply', () => ({
  apply: vi.fn(),
}));

vi.mock('../../../lib/k8s/api/v1/clusterRequests', () => ({
  remove: vi.fn(),
}));

const info: ManagerInfo = {
  enabled: true,
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
      .get('/plugin-manager')
      .reply(200, { enabled: true, namespace: 'headlamp', configMapName: 'cm' });

    const result = await fetchManagerInfo();
    expect(result.enabled).toBe(true);
    expect(result.namespace).toBe('headlamp');
  });

  it('reports the manager as disabled when the endpoint is missing', async () => {
    nock(API_BASE).get('/plugin-manager').reply(404, { error: 'not found' });

    const result = await fetchManagerInfo();
    expect(result.enabled).toBe(false);
    expect(result.status.configMapFound).toBe(false);
  });
});

describe('searchCatalog', () => {
  it('returns entries and hasMore', async () => {
    nock(API_BASE)
      .get('/plugin-manager/catalogs/nexus/search')
      .query({ q: 'flux', offset: '0', limit: '50' })
      .reply(200, { entries: entries(2), hasMore: true });

    const result = await searchCatalog('nexus', 'flux');
    expect(result.entries).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it('defaults to an empty result set', async () => {
    nock(API_BASE).get('/plugin-manager/catalogs/nexus/search').query(true).reply(200, {});

    const result = await searchCatalog('nexus', '');
    expect(result.entries).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('throws the backend error message', async () => {
    nock(API_BASE)
      .get('/plugin-manager/catalogs/nexus/search')
      .query(true)
      .reply(502, { error: 'catalog unreachable' });

    await expect(searchCatalog('nexus', '')).rejects.toThrow('catalog unreachable');
  });
});

describe('searchCatalogAll', () => {
  it('pages until the backend reports no more results', async () => {
    nock(API_BASE)
      .get('/plugin-manager/catalogs/nexus/search')
      .query({ q: '', offset: '0', limit: '50' })
      .reply(200, { entries: entries(50), hasMore: true });
    nock(API_BASE)
      .get('/plugin-manager/catalogs/nexus/search')
      .query({ q: '', offset: '50', limit: '50' })
      .reply(200, { entries: entries(20, 50), hasMore: false });

    const result = await searchCatalogAll('nexus', '');
    expect(result).toHaveLength(70);
    expect(result[0].name).toBe('plugin-0');
    expect(result[69].name).toBe('plugin-69');
  });

  it('stops when a page comes back empty', async () => {
    nock(API_BASE)
      .get('/plugin-manager/catalogs/nexus/search')
      .query({ q: '', offset: '0', limit: '50' })
      .reply(200, { entries: [], hasMore: true });

    const result = await searchCatalogAll('nexus', '');
    expect(result).toHaveLength(0);
  });
});

describe('resolvePlugin', () => {
  it('resolves a catalog entry to an archive', async () => {
    nock(API_BASE)
      .get('/plugin-manager/catalogs/hub/resolve')
      .query({ name: 'flux', repoName: 'repo', source: 'https://src' })
      .reply(200, { name: 'flux', version: '1.0.0', archiveUrl: 'https://x/a.tgz', checksum: 'c' });

    const resolved = await resolvePlugin('hub', {
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
      .post('/plugin-manager/probe-index', body => body.url === 'https://nexus.example')
      .reply(200, { indexUrl: 'https://nexus.example/index.json' });

    const indexUrl = await probeIndex({ url: 'https://nexus.example' });
    expect(indexUrl).toBe('https://nexus.example/index.json');
  });
});

describe('saveManagerState', () => {
  it('writes the state into the manager ConfigMap', async () => {
    const state: ManagerState = { catalogs: [], plugins: [] };
    await saveManagerState(info, state);

    expect(apply).toHaveBeenCalledTimes(1);
    const configMap = (apply as Mock).mock.calls[0][0];
    expect(configMap.kind).toBe('ConfigMap');
    expect(configMap.metadata.name).toBe('headlamp-plugin-manager');
    expect(JSON.parse(configMap.data['state.json'])).toEqual(state);
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
    (remove as Mock).mockRejectedValueOnce(new Error('not found'));

    await expect(deleteCatalogSecret(info, 'nexus')).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith(
      '/api/v1/namespaces/headlamp/secrets/headlamp-catalog-nexus'
    );
  });
});
