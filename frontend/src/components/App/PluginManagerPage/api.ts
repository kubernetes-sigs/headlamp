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

import { useQuery } from '@tanstack/react-query';
import { addBackstageAuthHeaders } from '../../../helpers/addBackstageAuthHeaders';
import { getAppUrl } from '../../../helpers/getAppUrl';
import { apply } from '../../../lib/k8s/api/v1/apply';
import { remove } from '../../../lib/k8s/api/v1/clusterRequests';
import type { KubeObjectInterfaceCreate } from '../../../lib/k8s/KubeObject';

export interface PluginCatalog {
  id: string;
  name: string;
  type: 'artifacthub' | 'index';
  url: string;
  /** Disables TLS certificate verification for this catalog. Default off. */
  insecureSkipTlsVerify?: boolean;
  /** PEM-encoded CA certificate trusted in addition to the system roots. */
  caCert?: string;
  /** HTTP Basic auth user for a private catalog. */
  username?: string;
  /** Name of the Secret (in Headlamp's namespace) holding the password. */
  passwordSecret?: string;
}

export interface DesiredPlugin {
  name: string;
  version: string;
  archiveUrl: string;
  checksum: string;
  catalog?: string;
  source?: string;
}

export interface ManagerState {
  catalogs?: PluginCatalog[];
  plugins?: DesiredPlugin[];
}

export interface PluginSyncStatus {
  phase: 'synced' | 'pending' | 'error';
  version?: string;
  error?: string;
}

export interface ManagerStatus {
  configMapFound: boolean;
  lastSync?: string;
  error?: string;
  plugins: Record<string, PluginSyncStatus>;
}

export interface ManagerInfo {
  enabled: boolean;
  namespace: string;
  configMapName: string;
  state: ManagerState;
  status: ManagerStatus;
}

export interface CatalogEntry {
  name: string;
  displayName?: string;
  description?: string;
  version: string;
  catalog: string;
  source?: string;
  logoUrl?: string;
  repoName?: string;
  archiveUrl?: string;
  checksum?: string;
}

export interface ResolvedPlugin {
  name: string;
  version: string;
  archiveUrl: string;
  checksum: string;
  source?: string;
}

const STATE_KEY = 'state.json';

async function managerFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${getAppUrl()}${path}`, {
    ...init,
    headers: new Headers(addBackstageAuthHeaders(init?.headers)),
  });
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {}
    throw new Error(message);
  }
  return response;
}

export async function fetchManagerInfo(): Promise<ManagerInfo> {
  try {
    const response = await managerFetch('plugin-manager');
    return (await response.json()) as ManagerInfo;
  } catch {
    // A 404 means the backend runs without the plugin manager.
    return {
      enabled: false,
      namespace: '',
      configMapName: '',
      state: {},
      status: { configMapFound: false, plugins: {} },
    };
  }
}

export function usePluginManagerInfo(refetchIntervalMs: number = 5000, enabled: boolean = true) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['plugin-manager-info'],
    queryFn: fetchManagerInfo,
    refetchInterval: refetchIntervalMs,
    enabled,
  });
  return { info: data, isLoading, refetch };
}

// Kept at or below the backend's maximum page size.
const searchPageSize = 50;
const maxCatalogEntries = 2000;

export async function searchCatalog(
  catalogId: string,
  query: string,
  offset: number = 0,
  limit: number = searchPageSize
): Promise<{ entries: CatalogEntry[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    q: query,
    offset: String(offset),
    limit: String(limit),
  });
  const response = await managerFetch(
    `plugin-manager/catalogs/${encodeURIComponent(catalogId)}/search?${params}`
  );
  const result = (await response.json()) as { entries?: CatalogEntry[]; hasMore?: boolean };
  return { entries: result.entries || [], hasMore: !!result.hasMore };
}

// searchCatalogAll pages through the catalog and returns every matching entry.
export async function searchCatalogAll(catalogId: string, query: string): Promise<CatalogEntry[]> {
  const all: CatalogEntry[] = [];
  for (let offset = 0; all.length < maxCatalogEntries; offset += searchPageSize) {
    const { entries, hasMore } = await searchCatalog(catalogId, query, offset, searchPageSize);
    all.push(...entries);
    if (!hasMore || entries.length === 0) {
      break;
    }
  }
  return all;
}

export async function resolvePlugin(
  catalogId: string,
  entry: CatalogEntry
): Promise<ResolvedPlugin> {
  const params = new URLSearchParams({ name: entry.name });
  if (entry.repoName) {
    params.set('repoName', entry.repoName);
  }
  if (entry.source) {
    params.set('source', entry.source);
  }
  const response = await managerFetch(
    `plugin-manager/catalogs/${encodeURIComponent(catalogId)}/resolve?${params}`
  );
  return (await response.json()) as ResolvedPlugin;
}

/**
 * Writes the desired state into the manager ConfigMap using the current
 * user's credentials, so RBAC on the ConfigMap decides who may do this.
 */
export async function saveManagerState(info: ManagerInfo, state: ManagerState): Promise<void> {
  const configMap: KubeObjectInterfaceCreate & { data: Record<string, string> } = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: info.configMapName,
      namespace: info.namespace,
    },
    data: {
      [STATE_KEY]: JSON.stringify(state, null, 2),
    },
  };
  await apply(configMap);
}

export interface ProbeIndexParams {
  url: string;
  insecureSkipTlsVerify?: boolean;
  caCert?: string;
  username?: string;
  password?: string;
}

/**
 * Asks the backend to locate a plugin index at or below a base URL. The
 * credentials are used transiently to probe and are not persisted.
 */
export async function probeIndex(params: ProbeIndexParams): Promise<string> {
  const response = await managerFetch('plugin-manager/probe-index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const result = (await response.json()) as { indexUrl: string };
  return result.indexUrl;
}

/** The Secret name that holds a catalog's password. */
export function catalogSecretName(catalogId: string): string {
  return `headlamp-catalog-${catalogId}`;
}

/**
 * Stores a catalog password in a Kubernetes Secret with the user's own
 * credentials, so it never lands in the plain-text ConfigMap.
 */
export async function saveCatalogSecret(
  info: ManagerInfo,
  catalogId: string,
  password: string
): Promise<string> {
  const name = catalogSecretName(catalogId);
  const secret: KubeObjectInterfaceCreate & { stringData: Record<string, string> } = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name,
      namespace: info.namespace,
    },
    stringData: {
      password,
    },
  };
  await apply(secret);
  return name;
}

/** Deletes a catalog's password Secret, tolerating a missing Secret. */
export async function deleteCatalogSecret(info: ManagerInfo, catalogId: string): Promise<void> {
  const name = catalogSecretName(catalogId);
  try {
    await remove(`/api/v1/namespaces/${info.namespace}/secrets/${name}`);
  } catch {
    // Already gone or never existed — nothing to clean up.
  }
}

export function withPlugin(state: ManagerState, plugin: DesiredPlugin): ManagerState {
  const plugins = (state.plugins || []).filter(p => p.name !== plugin.name);
  plugins.push(plugin);
  return { ...state, plugins };
}

export function withoutPlugin(state: ManagerState, name: string): ManagerState {
  return { ...state, plugins: (state.plugins || []).filter(p => p.name !== name) };
}

export function withCatalog(state: ManagerState, catalog: PluginCatalog): ManagerState {
  const catalogs = (state.catalogs || []).filter(c => c.id !== catalog.id);
  catalogs.push(catalog);
  return { ...state, catalogs };
}

export function withoutCatalog(state: ManagerState, id: string): ManagerState {
  return { ...state, catalogs: (state.catalogs || []).filter(c => c.id !== id) };
}
