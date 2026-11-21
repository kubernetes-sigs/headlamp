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

import type { QueryClient, QueryKey, QueryObserverOptions } from '@tanstack/react-query';
import { hashKey, useQueries, useQueryClient } from '@tanstack/react-query';
import { partition } from 'lodash';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  hasAllowedNamespacesRestriction,
  loadClusterSettings,
} from '../../../../helpers/clusterSettings';
import type { KubeObject, KubeObjectClass, KubeObjectInterface } from '../../KubeObject';
import type { QueryParameters } from '../v1/queryParameters';
import { ApiError, ListWatchError } from './ApiError';
import {
  getDiscoveredConnectionRevision,
  useDiscoveredConnectionRevisions,
  withDiscoveryConnectionRevision,
} from './discoveredConnectionRevisions';
import { recordDiscoveryConnection } from './discoveryConnection';
import { clusterFetch } from './fetch';
import type { QueryListResponse } from './hooks';
import { useEndpoints } from './hooks';
import type { KubeListUpdateEvent } from './KubeList';
import { KubeList } from './KubeList';
import { KubeObjectEndpoint } from './KubeObjectEndpoint';
import { makeUrl } from './makeUrl';
import { WebSocketManager } from './multiplexer';
import { kubeRequestRetry } from './retry';
import { isWatchRefresh, refreshWatchQuery } from './watchRefresh';
import { BASE_WS_URL, useWebSockets } from './webSocket';

/**
 * @returns true if the websocket multiplexer is enabled.
 * defaults to true. This is a feature flag to enable the websocket multiplexer.
 */
export function getWebsocketMultiplexerEnabled(): boolean {
  return import.meta.env.REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER === 'true';
}

/** Default page size for list consumers that opt in to pagination. */
export const DEFAULT_LIST_LIMIT = 1000;
const UPGRADE_FAILURE_RELIST_INTERVAL_MS = 30_000;
const NAMESPACE_SELECTOR_RETRY_INTERVAL_MS = 30_000;

function isAllowedNamespaceSelectorList(
  kubeObjectClass: KubeObjectClass,
  cluster: string,
  queryParams?: QueryParameters
) {
  if (kubeObjectClass.kind !== 'Namespace') return false;
  const selector = loadClusterSettings(cluster).allowedNamespacesSelector?.trim();
  return !!selector && queryParams?.labelSelector?.trim() === selector;
}

function toPaginationApiError(error: unknown, cluster: string, namespace?: string): ApiError {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(error instanceof Error ? error.message : 'Failed to load more resources');
  apiError.cluster ??= cluster;
  apiError.namespace ??= namespace;
  return apiError;
}

/**
 * Object representing a List of Kube object
 * with information about which cluster and namespace it came from
 */
export interface ListResponse<K extends KubeObject> {
  /** KubeList with items */
  list: KubeList<K>;
  /** Cluster of the list */
  cluster: string;
  /** If the list only has items from one namespace */
  namespace?: string;
  /** Version that started the direct watch, before watch events updated the list. */
  watchStartResourceVersion?: string;
  /** The last failure from the direct watch, retained across snapshot refreshes. */
  watchError?: ListWatchError;
  /** Revision of the discovered connection that returned this list. */
  connectionRevision?: string;
  /** Whether this synthesized list must not start a cluster-wide watch */
  skipWatch?: boolean;
}

/**
 * Builds a restricted Namespace query without broadening RBAC requirements.
 * Manually configured namespaces use per-name GET requests, while selector-based
 * restrictions retain LIST requests and intersect any selector from the caller.
 *
 * @param kubeObjectClass - Class used to instantiate Namespace objects.
 * @param cluster - Cluster to query.
 * @param queryParams - Additional Namespace list filters.
 * @param refetchInterval - Optional query refetch interval.
 * @returns Query options for the synthesized restricted Namespace list.
 */
function allowedNamespaceListQuery<K extends KubeObject>(
  kubeObjectClass: KubeObjectClass,
  cluster: string,
  queryParams: QueryParameters,
  refetchInterval?: number,
  connectionRevision?: string
): QueryObserverOptions<ListResponse<K> | undefined | null, ApiError> {
  const settings = loadClusterSettings(cluster);
  const allowedNamespaces = settings.allowedNamespaces ?? [];
  const configuredSelector = settings.allowedNamespacesSelector?.trim();
  const requestedSelector = queryParams.labelSelector?.trim();
  const selector = [configuredSelector, requestedSelector].filter(Boolean).join(',');

  return {
    placeholderData: null,
    refetchInterval,
    retry: kubeRequestRetry,
    queryKey: [
      'kubeObject',
      'list',
      kubeObjectClass.apiVersion,
      kubeObjectClass.apiName,
      cluster,
      '',
      { allowedNamespaces, selector },
    ],
    queryFn: async () => {
      const [manualItems, selectorList] = await Promise.all([
        Promise.all(
          allowedNamespaces.map(async name => {
            try {
              const item = await clusterFetch(
                makeUrl(
                  ['api', 'v1', 'namespaces', name],
                  withDiscoveryConnectionRevision({}, connectionRevision)
                ),
                { cluster }
              ).then(response => response.json());
              if (item.metadata?.managedFields) {
                delete item.metadata.managedFields;
              }
              const kubeObject = new kubeObjectClass(item) as K;
              kubeObject.cluster = cluster;
              recordDiscoveryConnection(kubeObject, cluster, connectionRevision);
              return kubeObject;
            } catch (error) {
              if (error instanceof ApiError) {
                error.cluster = cluster;
                error.namespace = name;
              }
              throw error;
            }
          })
        ),
        configuredSelector
          ? clusterFetch(
              makeUrl(
                ['api', 'v1', 'namespaces'],
                withDiscoveryConnectionRevision({ labelSelector: selector }, connectionRevision)
              ),
              { cluster }
            )
              .then(response => response.json())
              .catch(error => {
                if (error instanceof ApiError) {
                  error.cluster = cluster;
                }
                throw error;
              })
          : Promise.resolve(null),
      ]);

      const selectorItems = (selectorList?.items ?? []).map((item: any) => {
        if (item.metadata?.managedFields) {
          delete item.metadata.managedFields;
        }
        item.kind = selectorList.kind.replace(/List$/, '');
        item.apiVersion = selectorList.apiVersion;
        const kubeObject = new kubeObjectClass(item) as K;
        kubeObject.cluster = cluster;
        recordDiscoveryConnection(kubeObject, cluster, connectionRevision);
        return kubeObject;
      });
      const items = [...manualItems, ...selectorItems].filter(
        (item, index, allItems) =>
          allItems.findIndex(
            candidate => candidate.jsonData.metadata.name === item.jsonData.metadata.name
          ) === index
      );

      return {
        list: {
          items,
          kind: selectorList?.kind ?? 'NamespaceList',
          apiVersion: selectorList?.apiVersion ?? 'v1',
          metadata: { resourceVersion: selectorList?.metadata?.resourceVersion ?? '0' },
        } as KubeList<K>,
        cluster,
        skipWatch: true,
      };
    },
  };
}

async function fetchKubeObjectListPage<K extends KubeObject>(
  kubeObjectClass: KubeObjectClass,
  path: string,
  cluster: string,
  queryParams: QueryParameters,
  connectionRevision?: string,
  signal?: AbortSignal,
  fresh = false
): Promise<KubeList<K>> {
  const page: KubeList<KubeObjectInterface> = await clusterFetch(
    makeUrl([path], withDiscoveryConnectionRevision(queryParams, connectionRevision)),
    {
      cluster,
      signal,
      ...(fresh ? { headers: { 'Cache-Control': 'no-cache' } } : {}),
    }
  ).then(response => response.json());
  const kind = page.kind.replace(/List$/, '');
  const items = page.items.map(item => {
    // managedFields are not shown in list views and can be several KB per object.
    if (item.metadata?.managedFields) delete item.metadata.managedFields;
    item.kind = kind;
    item.apiVersion = page.apiVersion;
    const resource = new kubeObjectClass(item) as K;
    resource.cluster = cluster;
    recordDiscoveryConnection(resource, cluster, connectionRevision);
    return resource;
  });
  return { ...page, items };
}

async function completeWatchedList<K extends KubeObject>(
  firstPage: KubeList<K>,
  fetchPage: (params: QueryParameters) => Promise<KubeList<K>>,
  queryParams: QueryParameters,
  hasWatchObserver: () => boolean
): Promise<KubeList<K>> {
  const items = [...firstPage.items];
  const requestedTokens = new Set<string>();
  let page = firstPage;

  try {
    while (page.metadata.continue && hasWatchObserver()) {
      const token = page.metadata.continue;
      if (requestedTokens.has(token))
        throw new ApiError('The resource list repeated a continuation token');
      requestedTokens.add(token);
      page = await fetchPage({ ...queryParams, continue: token });
      for (const item of page.items) items.push(item);
    }
  } catch (error) {
    if (hasWatchObserver()) throw error;
    return firstPage;
  }

  // A snapshot consumer still needs the first page's continuation token.
  return hasWatchObserver() ? { ...firstPage, metadata: page.metadata, items } : firstPage;
}

/**
 * Query to list Kube objects from a cluster and namespace(optional)
 *
 * @param kubeObjectClass - Class to instantiate the object with
 * @param endpoint - API endpoint
 * @param namespace - namespace to list objects from(optional)
 * @param cluster - cluster name
 * @param queryParams - query parameters
 * @returns query options for getting a single list of kube resources
 */
export function kubeObjectListQuery<K extends KubeObject>(
  kubeObjectClass: KubeObjectClass,
  endpoint: KubeObjectEndpoint,
  namespace: string | undefined = '',
  cluster: string,
  queryParams: QueryParameters,
  refetchInterval?: number,
  connectionRevision: string | null | undefined = getDiscoveredConnectionRevision(cluster)
): QueryObserverOptions<ListResponse<K> | undefined | null, ApiError> {
  const isResolvingAllowedNamespaces = isAllowedNamespaceSelectorList(
    kubeObjectClass,
    cluster,
    queryParams
  );

  if (
    kubeObjectClass.kind === 'Namespace' &&
    !isResolvingAllowedNamespaces &&
    hasAllowedNamespacesRestriction(cluster)
  ) {
    const query = allowedNamespaceListQuery<K>(
      kubeObjectClass,
      cluster,
      queryParams,
      refetchInterval,
      connectionRevision ?? undefined
    );
    return connectionRevision
      ? { ...query, queryKey: [...query.queryKey!, connectionRevision] }
      : query;
  }

  const retryNamespaceSelector = isResolvingAllowedNamespaces && !isExactListVersion(queryParams);
  const retry = kubeRequestRetry;
  return {
    placeholderData: null,
    refetchInterval:
      refetchInterval ??
      (retryNamespaceSelector
        ? query =>
            query.state.data?.watchError &&
            query.observers.some(observer => observer.options.meta?.watchList === true)
              ? NAMESPACE_SELECTOR_RETRY_INTERVAL_MS
              : false
        : undefined),
    retry:
      isExactListVersion(queryParams) && retry
        ? (failures, error) => error.status !== 410 && retry(failures, error)
        : retry,
    queryKey: [
      'kubeObject',
      'list',
      kubeObjectClass.apiVersion,
      kubeObjectClass.apiName,
      cluster,
      namespace,
      queryParams,
      ...(connectionRevision ? [connectionRevision] : []),
    ],
    queryFn: async context => {
      // If no valid endpoint is passed, don't make the request
      if (!endpoint) return;

      try {
        const cacheEntry = context?.client.getQueryCache().find<ListResponse<K>>({
          queryKey: context.queryKey,
          exact: true,
        });
        const recovering = isWatchRefresh(cacheEntry);
        const bypassCache =
          recovering || (retryNamespaceSelector && !!cacheEntry?.state.data?.watchError);
        const path = KubeObjectEndpoint.toUrl(endpoint, namespace);
        const fetchPage = (params: QueryParameters) =>
          fetchKubeObjectListPage<K>(
            kubeObjectClass,
            path,
            cluster,
            params,
            connectionRevision ?? undefined,
            context?.signal,
            bypassCache
          );
        let list = await fetchPage(queryParams);

        // A watch starts after all pages have loaded. Its replacement snapshot must
        // be complete as well, or the first page's continuation token stops the watch.
        if (list.metadata.continue && !queryParams.continue) {
          const hasWatchObserver = () =>
            !!cacheEntry?.observers.some(observer => observer.options.meta?.watchList === true);
          // Use the current cache: Load More can complete while the refresh is pending.
          if (
            cacheEntry?.state.data &&
            !cacheEntry.state.data.list.metadata.continue &&
            hasWatchObserver()
          ) {
            list = await completeWatchedList(list, fetchPage, queryParams, hasWatchObserver);
          }
        }

        const previous = cacheEntry?.state.data;
        const response: ListResponse<K> = {
          list,
          cluster,
          namespace,
          connectionRevision: connectionRevision || undefined,
          ...(recovering && previous
            ? {
                watchStartResourceVersion:
                  previous.watchStartResourceVersion ?? previous.list.metadata.resourceVersion,
              }
            : {}),
          ...(previous?.watchError ? { watchError: previous.watchError } : {}),
        };

        return response;
      } catch (e) {
        // Rethrow error with cluster and namespace information
        if (e instanceof ApiError) {
          e.cluster = cluster;
          e.namespace = namespace;
        }
        throw e;
      }
    },
  };
}

function setListWatchError<K extends KubeObject>(
  client: QueryClient,
  queryKey: QueryKey,
  error?: ListWatchError
) {
  const entry = client.getQueryCache().find<ListResponse<K>>({ queryKey, exact: true });
  const cached = entry?.state.data;
  if (entry && cached && cached.watchError !== error) {
    // A watch state change must not turn a failed LIST into a successful read.
    entry.setState({ data: { ...cached, watchError: error } });
  }
}

interface WatchedList {
  cluster: string;
  namespace?: string;
  resourceVersion: string;
  connectionRevision?: string;
}

/**
 * Accepts a list of lists to watch.
 * Upon receiving update it will modify query data for list query
 */
export function useWatchKubeObjectLists<K extends KubeObject>({
  kubeObjectClass,
  endpoint,
  lists,
  queryParams,
  watchQueryParams,
}: {
  /** KubeObject class of the watched resource list */
  kubeObjectClass: (new (...args: any) => K) & typeof KubeObject<any>;
  /** Query parameters for the WebSocket connection URL */
  queryParams?: QueryParameters;
  /** Query parameters for the WebSocket URL. Defaults to queryParams. */
  watchQueryParams?: QueryParameters;
  /** Kube resource API endpoint information */
  endpoint?: KubeObjectEndpoint | null;
  /** Which clusters and namespaces to watch */
  lists: WatchedList[];
}) {
  const multiplexerEnabled = getWebsocketMultiplexerEnabled();
  const connectionRevisions = useDiscoveredConnectionRevisions();
  const [multiplexedLists, directLists] = useMemo(
    () =>
      partition(
        lists.filter(
          ({ cluster, connectionRevision }) =>
            connectionRevision === (connectionRevisions.get(cluster) || undefined)
        ),
        ({ cluster }) => multiplexerEnabled && !connectionRevisions.has(cluster)
      ),
    [lists, connectionRevisions, multiplexerEnabled]
  );

  useWatchKubeObjectListsMultiplexed({
    kubeObjectClass,
    endpoint,
    lists: multiplexedLists,
    queryParams,
    watchQueryParams,
    enabled: multiplexedLists.length > 0,
  });

  useWatchKubeObjectListsLegacy({
    kubeObjectClass,
    endpoint,
    lists: directLists,
    queryParams,
    watchQueryParams,
    enabled: directLists.length > 0,
  });
}

/**
 * Watches Kubernetes resource lists using multiplexed WebSocket connections.
 * Efficiently manages subscriptions and updates to prevent unnecessary re-renders
 * and WebSocket reconnections.
 *
 * @template K - Type extending KubeObject for the resources being watched
 * @param kubeObjectClass - Class constructor for the Kubernetes resource type
 * @param endpoint - API endpoint information for the resource
 * @param lists - Array of cluster, namespace, and resourceVersion combinations to watch
 * @param queryParams - Optional query parameters for the WebSocket URL
 */
function useWatchKubeObjectListsMultiplexed<K extends KubeObject>({
  kubeObjectClass,
  endpoint,
  lists,
  queryParams,
  watchQueryParams,
  enabled = true,
}: {
  kubeObjectClass: (new (...args: any) => K) & typeof KubeObject<any>;
  endpoint?: KubeObjectEndpoint | null;
  lists: WatchedList[];
  queryParams?: QueryParameters;
  watchQueryParams?: QueryParameters;
  enabled?: boolean;
}): void {
  const client = useQueryClient();

  // Track the latest resource versions to prevent duplicate updates
  const latestResourceVersions = useRef<Record<string, string>>({});

  // Stabilize queryParams to prevent unnecessary effect triggers
  // Only update when the stringified params change
  const stableQueryParamsKey = enabled ? JSON.stringify(queryParams) : '__disabled__';
  const stableWatchQueryParamsKey = enabled
    ? JSON.stringify(watchQueryParams ?? queryParams)
    : '__disabled__';
  /* eslint-disable react-hooks/exhaustive-deps -- Query params are intentionally stabilized by their JSON keys. */
  const stableQueryParams = useMemo(() => queryParams, [stableQueryParamsKey]);
  const stableWatchQueryParams = useMemo(
    () => watchQueryParams ?? queryParams,
    [stableWatchQueryParamsKey]
  );
  /* eslint-enable react-hooks/exhaustive-deps */
  const pinned = isExactListVersion(stableQueryParams ?? {});

  // Create stable connection URLs for each list
  // Updates only when endpoint, lists, or stableQueryParams change
  const connections = useMemo(() => {
    if (!enabled || !endpoint) {
      return [];
    }

    return lists.map(list => {
      const key = `${list.cluster}:${list.namespace || ''}`;

      // Always use the latest resource version from the server
      latestResourceVersions.current[key] = list.resourceVersion;

      // Construct WebSocket URL with current parameters
      return {
        url: makeUrl([KubeObjectEndpoint.toUrl(endpoint, list.namespace)], {
          ...stableWatchQueryParams,
          watch: 1,
          resourceVersion: latestResourceVersions.current[key],
        }),
        cluster: list.cluster,
        namespace: list.namespace,
        queryKey: kubeObjectListQuery<K>(
          kubeObjectClass,
          endpoint,
          list.namespace,
          list.cluster,
          stableQueryParams ?? {},
          undefined,
          list.connectionRevision ?? null
        ).queryKey,
      };
    });
  }, [enabled, endpoint, lists, kubeObjectClass, stableQueryParams, stableWatchQueryParams]);

  // Create stable update handler to process WebSocket messages
  // Re-create only when dependencies change
  const handleUpdate = useCallback(
    (
      update: KubeListUpdateEvent<KubeObjectInterface>,
      cluster: string,
      namespace: string | undefined,
      queryKey: QueryKey
    ) => {
      if (!update || typeof update !== 'object' || !endpoint) {
        return;
      }

      const key = `${cluster}:${namespace || ''}`;

      // Update resource version from incoming message
      if (update.object?.metadata?.resourceVersion) {
        latestResourceVersions.current[key] = update.object.metadata.resourceVersion;
      }

      if (update.type === 'ERROR') {
        const status = update.object?.code;
        if (status === 410 && !pinned) {
          void client.invalidateQueries({ queryKey, exact: true });
        } else {
          setListWatchError(
            client,
            queryKey,
            new ListWatchError(update.object?.message ?? 'The resource watch stopped', {
              status,
              cluster,
              namespace,
            })
          );
        }
        return;
      }

      const entry = client
        .getQueryCache()
        .find<ListResponse<KubeObject>>({ queryKey, exact: true });
      const cached = entry?.state.data;
      if (!entry || !cached) return;
      const list = KubeList.applyUpdate(cached.list, update, kubeObjectClass, cluster);
      if (list !== cached.list || cached.watchError) {
        entry.setState({ data: { ...cached, list, watchError: undefined } });
      }
    },
    [client, kubeObjectClass, endpoint, pinned]
  );

  // Set up WebSocket subscriptions
  useEffect(() => {
    if (!enabled || !endpoint || connections.length === 0) {
      return;
    }

    const cleanups: (() => void)[] = [];
    // Create subscriptions for each connection
    connections.forEach(({ url, cluster, namespace, queryKey }) => {
      if (pinned && client.getQueryData<ListResponse<K>>(queryKey)?.watchError?.status === 410) {
        return;
      }
      setListWatchError<K>(client, queryKey);
      const parsedUrl = new URL(url, BASE_WS_URL);
      let stopped = false;
      let unsubscribe: (() => void) | undefined;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        unsubscribe?.();
      };
      cleanups.push(stop);
      const reportError = (error: Error) => {
        if (!stopped) {
          setListWatchError<K>(
            client,
            queryKey,
            new ListWatchError(error.message, { cluster, namespace })
          );
        }
      };

      // Subscribe to WebSocket updates
      WebSocketManager.subscribe(
        cluster,
        parsedUrl.pathname,
        parsedUrl.search.slice(1),
        update => {
          if (stopped) return;
          handleUpdate(update, cluster, namespace, queryKey);
          if (pinned && update?.type === 'ERROR' && update.object?.code === 410) stop();
        },
        reportError
      ).then(cleanup => {
        if (stopped) cleanup();
        else unsubscribe = cleanup;
      }, reportError);
    });

    // Cleanup subscriptions when effect re-runs or unmounts
    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [client, connections, enabled, endpoint, handleUpdate, pinned]);
}

/**
 * Accepts a list of lists to watch.
 * Upon receiving update it will modify query data for list query
 * @param kubeObjectClass - KubeObject class of the watched resource list
 * @param endpoint - Kube resource API endpoint information
 * @param lists - Which clusters and namespaces to watch
 * @param queryParams - Query parameters for the WebSocket connection URL
 */
function useWatchKubeObjectListsLegacy<K extends KubeObject>({
  kubeObjectClass,
  endpoint,
  lists,
  queryParams,
  watchQueryParams,
  enabled = true,
}: {
  /** KubeObject class of the watched resource list */
  kubeObjectClass: (new (...args: any) => K) & typeof KubeObject<any>;
  /** Query parameters for the WebSocket connection URL */
  queryParams?: QueryParameters;
  /** Query parameters for the WebSocket URL. Defaults to queryParams. */
  watchQueryParams?: QueryParameters;
  /** Kube resource API endpoint information */
  endpoint?: KubeObjectEndpoint | null;
  /** Which clusters and namespaces to watch */
  lists: WatchedList[];
  enabled?: boolean;
}) {
  const client = useQueryClient();

  const stableQueryParamsKey = enabled ? JSON.stringify(queryParams) : '__disabled__';
  const stableWatchQueryParamsKey = enabled
    ? JSON.stringify(watchQueryParams ?? queryParams)
    : '__disabled__';
  const stableListsKey = JSON.stringify(lists);
  /* eslint-disable react-hooks/exhaustive-deps -- Inputs are intentionally stabilized by their JSON keys. */
  const stableLists = useMemo(() => lists, [stableListsKey]);
  const stableQueryParams = useMemo(() => queryParams, [stableQueryParamsKey]);
  const stableWatchQueryParams = useMemo(
    () => watchQueryParams ?? queryParams,
    [stableWatchQueryParamsKey]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const connections = useMemo(() => {
    if (!enabled || !endpoint) return [];

    return stableLists.map(({ cluster, namespace, resourceVersion, connectionRevision }) => {
      const path = KubeObjectEndpoint.toUrl(endpoint, namespace);
      const watchUrl = (version: string) =>
        makeUrl(
          [path],
          withDiscoveryConnectionRevision(
            { ...stableWatchQueryParams, watch: '1', resourceVersion: version },
            connectionRevision
          )
        );
      const queryKey = kubeObjectListQuery<K>(
        kubeObjectClass,
        endpoint,
        namespace,
        cluster,
        stableQueryParams ?? {},
        undefined,
        connectionRevision ?? null
      ).queryKey;
      const pinned = isExactListVersion(stableQueryParams ?? {});
      const retryNamespaceSelector =
        !pinned && isAllowedNamespaceSelectorList(kubeObjectClass, cluster, stableQueryParams);
      const readWatchError = () => client.getQueryData<ListResponse<K>>(queryKey)?.watchError;
      const rememberWatchError = (error?: ListWatchError) => {
        // Repeated failures must leave the selector's pending LIST refresh in place.
        if (retryNamespaceSelector && error && readWatchError()) return;
        setListWatchError<K>(client, queryKey, error);
      };
      let relisting: Promise<void> | undefined;
      let needsRelist = false;
      let lastUpgradeRecoveryAt: number | undefined;

      return {
        cluster,
        cacheEntry: client.getQueryCache().find({ queryKey, exact: true }),
        url: watchUrl(resourceVersion),
        async getWatchUrl(reconnecting: boolean) {
          if (
            pinned &&
            client.getQueryData<ListResponse<K>>(queryKey)?.watchError?.status === 410
          ) {
            return null;
          }
          if (reconnecting && needsRelist) {
            const refresh = relisting ?? refreshWatchQuery(client, queryKey);
            relisting = undefined;
            await refresh;
            needsRelist = false;
          }
          const cached = client.getQueryData<ListResponse<K>>(queryKey);
          if (cached?.list.metadata.continue) return null;
          return watchUrl(cached?.list.metadata.resourceVersion ?? resourceVersion);
        },
        onOpen() {
          lastUpgradeRecoveryAt = undefined;
          needsRelist = false;
          relisting = undefined;
          // An accepted socket can still send a failed WATCH response.
          if (!retryNamespaceSelector) rememberWatchError();
        },
        onOpenFailure() {
          const now = Date.now();
          if (
            !pinned &&
            (lastUpgradeRecoveryAt === undefined ||
              now - lastUpgradeRecoveryAt >= UPGRADE_FAILURE_RELIST_INTERVAL_MS)
          ) {
            // An upgrade can be rejected before the browser receives a 410 frame.
            lastUpgradeRecoveryAt = now;
            needsRelist = true;
          }
          if (!readWatchError()) {
            rememberWatchError(
              new ListWatchError('Unable to open the resource watch', { cluster, namespace })
            );
          }
        },
        onMessage(update: KubeListUpdateEvent<KubeObjectInterface>) {
          if (update.type === 'ERROR') {
            const status = update.object?.code;
            if (status === 410 && !pinned) {
              needsRelist = true;
              relisting = refreshWatchQuery(client, queryKey, update);
            } else {
              rememberWatchError(
                new ListWatchError(update.object?.message ?? 'The resource watch stopped', {
                  status,
                  cluster,
                  namespace,
                })
              );
            }
            return;
          }

          const entry = client
            .getQueryCache()
            .find<ListResponse<KubeObject>>({ queryKey, exact: true });
          const cached = entry?.state.data;
          if (!entry || !cached) return;

          const list = KubeList.applyUpdate(
            cached.list,
            update,
            kubeObjectClass,
            cluster,
            connectionRevision
          );
          const objectChanged =
            update.type === 'ADDED' || update.type === 'MODIFIED' || update.type === 'DELETED';
          const watchRecovered = objectChanged && !!cached.watchError;
          if (list === cached.list && !watchRecovered) return;

          if (objectChanged && entry.state.fetchStatus !== 'idle') {
            // An earlier LIST must not replace a newer update from the same watch.
            void client.cancelQueries({ queryKey, exact: true });
          }

          entry.setState({
            data: {
              ...cached,
              watchStartResourceVersion:
                cached.watchStartResourceVersion ?? cached.list.metadata.resourceVersion,
              list,
              ...(watchRecovered ? { watchError: undefined } : {}),
            },
          });
        },
      };
    });
  }, [
    enabled,
    stableLists,
    kubeObjectClass,
    endpoint,
    stableQueryParams,
    stableWatchQueryParams,
    client,
  ]);

  useWebSockets<KubeListUpdateEvent<KubeObjectInterface>>({
    enabled: enabled && !!endpoint,
    connections,
  });
}

/**
 * Creates multiple requests to list Kube objects
 * Handles multiple clusters, namespaces and allowed namespaces
 *
 * @param clusters - list of clusters
 * @param getAllowedNamespaces -  function to get allowed namespaces for a cluster
 * @param isResourceNamespaced - if the resource is namespaced
 * @param requestedNamespaces - requested namespaces(optional)
 * @param hasAllowedNamespacesRestriction - checks whether each cluster has an active restriction
 *
 * @returns list of requests for clusters and appropriate namespaces
 */
export function makeListRequests(
  clusters: string[],
  getAllowedNamespaces: (cluster: string | null) => string[],
  isResourceNamespaced: boolean,
  requestedNamespaces: string[] = [],
  hasAllowedNamespacesRestriction: (cluster: string) => boolean = () => false
): Array<{ cluster: string; namespaces?: string[] }> {
  return clusters.flatMap(cluster => {
    const allowedNamespaces = getAllowedNamespaces(cluster);

    if (
      isResourceNamespaced &&
      allowedNamespaces.length === 0 &&
      hasAllowedNamespacesRestriction(cluster)
    ) {
      return [];
    }

    let namespaces = requestedNamespaces.length > 0 ? requestedNamespaces : allowedNamespaces;

    if (allowedNamespaces.length) {
      namespaces = namespaces.filter(ns => allowedNamespaces.includes(ns));
      if (isResourceNamespaced && namespaces.length === 0) {
        return [];
      }
    }

    return { cluster, namespaces: isResourceNamespaced ? namespaces : undefined };
  });
}

function withoutPaginationParams(queryParams: QueryParameters): QueryParameters {
  const params = { ...queryParams };
  delete params.continue;
  delete params.limit;
  if (params.resourceVersionMatch === 'Exact') delete params.resourceVersionMatch;
  return params;
}

function getListRequestCount(requests: Array<{ cluster: string; namespaces?: string[] }>) {
  return requests.reduce(
    (count, request) => count + Math.max(request.namespaces?.length ?? 1, 1),
    0
  );
}

type ListRequest = { cluster: string; namespace?: string };

function flattenListRequests(
  requests: Array<{ cluster: string; namespaces?: string[] }>
): ListRequest[] {
  return requests.flatMap<ListRequest>(({ cluster, namespaces }) =>
    namespaces && namespaces.length > 0
      ? namespaces.map(namespace => ({ cluster, namespace }))
      : [{ cluster }]
  );
}

/**
 * Whether a currently-watched list is still covered by one of the given requests.
 *
 * An empty-string namespace is a real, valid value: it means "all namespaces" for a
 * namespaced resource, and it is what a request with no namespace filter produces.
 * Because it is falsy, matching it against a request's namespace list needs an
 * explicit undefined check rather than a truthiness check, or the watch entry is
 * dropped every render and immediately re-added, looping setState (see 9542b5cb5).
 * The unfiltered branch keeps the falsy check on purpose, so a watch on '' still
 * matches a request that asks for no particular namespace.
 */
export function isWatchedListStillRequested(
  watching: { cluster: string; namespace?: string },
  requests: Array<{ cluster: string; namespaces?: string[] }>
): boolean {
  return requests.some(request => {
    if (watching.cluster !== request?.cluster) return false;
    return !request.namespaces?.length
      ? !watching.namespace
      : watching.namespace !== undefined && request.namespaces.includes(watching.namespace);
  });
}

function getPositiveLimit(queryParams: QueryParameters): number | undefined {
  const limit = Number(queryParams.limit);

  if (!queryParams.limit || !Number.isFinite(limit) || limit <= 0) {
    return undefined;
  }

  return Math.floor(limit);
}

function isExactListVersion(queryParams: QueryParameters): boolean {
  if (queryParams.resourceVersionMatch) return queryParams.resourceVersionMatch === 'Exact';

  // A paginated LIST with a nonzero version defaults to an exact version match.
  return (
    !queryParams.continue &&
    !!queryParams.resourceVersion &&
    queryParams.resourceVersion !== '0' &&
    getPositiveLimit(queryParams) !== undefined
  );
}

function getPerRequestQueryParams(
  queryParams: QueryParameters,
  requests: Array<{ cluster: string; namespaces?: string[] }>
): QueryParameters {
  const requestCount = getListRequestCount(requests);
  const limit = getPositiveLimit(queryParams);

  if (!limit || requestCount <= 1) {
    return queryParams;
  }

  return {
    ...queryParams,
    limit: requestCount > limit ? 1 : Math.floor(limit / requestCount),
  };
}

/**
 * Returns a combined list of Kubernetes objects and watches for changes from the clusters given.
 *
 * @param param - request paramaters
 * @returns Combined list of Kubernetes resources
 */
export function useKubeObjectList<K extends KubeObject>({
  requests,
  kubeObjectClass,
  queryParams,
  watch = true,
  refetchInterval,
  emptyWhenNoRequests = false,
}: {
  requests: Array<{ cluster: string; namespaces?: string[] }>;
  /** Class to instantiate the object with */
  kubeObjectClass: (new (...args: any) => K) & typeof KubeObject<any>;
  queryParams?: QueryParameters;
  /** Watch for updates @default true */
  watch?: boolean;
  /** How often to refetch the list. Won't refetch by default. Disables watching if set. */
  refetchInterval?: number;
  /** Return an empty list instead of a loading state when requests were intentionally suppressed. */
  emptyWhenNoRequests?: boolean;
}): [Array<K> | null, ApiError | null] &
  QueryListResponse<Array<ListResponse<K> | undefined | null>, K, ApiError> {
  const connectionRevisions = useDiscoveredConnectionRevisions();
  const maybeNamespace = requests.find(it => it.namespaces)?.namespaces?.[0];

  // Get working endpoint from the first cluster
  // Now if clusters have different apiVersions for the same resource for example, this will not work
  const { endpoint, error: endpointError } = useEndpoints(
    requests.length === 0 ? [] : kubeObjectClass.apiEndpoint.apiInfo,
    requests[0]?.cluster,
    maybeNamespace
  );

  const cleanedUpQueryParams = Object.fromEntries(
    Object.entries(queryParams ?? {}).filter(([, value]) => value !== undefined && value !== '')
  );
  const listRequests = useMemo(() => flattenListRequests(requests), [requests]);
  const limit = getPositiveLimit(cleanedUpQueryParams);
  const initialListRequestCount =
    limit && listRequests.length > limit ? limit : listRequests.length;
  const [activeListRequestCount, setActiveListRequestCount] = useState(initialListRequestCount);
  const listRequestInputKey = JSON.stringify([
    listRequests,
    cleanedUpQueryParams,
    listRequests.map(({ cluster }) => connectionRevisions.get(cluster)),
  ]);

  useEffect(() => {
    setActiveListRequestCount(initialListRequestCount);
  }, [initialListRequestCount, listRequestInputKey]);

  const activeListRequests = useMemo(
    () => listRequests.slice(0, activeListRequestCount),
    [activeListRequestCount, listRequests]
  );
  const hasPendingListRequests = activeListRequests.length < listRequests.length;
  const perRequestQueryParams = getPerRequestQueryParams(cleanedUpQueryParams, requests);
  const watchList = watch && !refetchInterval;

  const queries = useMemo(
    () =>
      endpoint
        ? activeListRequests.map(({ cluster, namespace }) => ({
            ...kubeObjectListQuery<K>(
              kubeObjectClass,
              endpoint,
              namespace,
              cluster,
              perRequestQueryParams,
              refetchInterval,
              connectionRevisions.get(cluster)
            ),
            meta: { watchList },
          }))
        : [],
    [
      activeListRequests,
      kubeObjectClass,
      endpoint,
      perRequestQueryParams,
      refetchInterval,
      connectionRevisions,
      watchList,
    ]
  );

  const query = useQueries({
    queries,
    combine(results) {
      const getError = (result: (typeof results)[number]) =>
        result.error ?? (watchList ? result.data?.watchError : undefined);
      const errors = results.map(getError).filter((error): error is ApiError => !!error);
      const hasMore =
        hasPendingListRequests || results.some(result => !!result.data?.list?.metadata?.continue);
      const hasUnknownRemainingItemCount = results.some(
        result =>
          !!result.data?.list?.metadata?.continue &&
          result.data.list.metadata.remainingItemCount === undefined
      );

      // A cluster gets one request per allowed namespace, so group the results by cluster and
      // combine them, instead of letting the last namespace replace the others. Every request
      // counts, also the ones still loading or failed. A request still loading shows its
      // placeholder data, which React Query reports as a success, so isPlaceholderData is what
      // marks it as loading.
      const resultsByCluster: Record<string, typeof results> = {};
      results.forEach((result, index) => {
        const cluster = activeListRequests[index]?.cluster;
        if (cluster) {
          (resultsByCluster[cluster] ??= []).push(result);
        }
      });
      const clusterResults: Record<string, QueryListResponse<any, K, ApiError>> = {};
      Object.entries(resultsByCluster).forEach(([cluster, clusterQueryResults]) => {
        const withData = clusterQueryResults.filter(result => result.data);
        // A cluster only gets an entry once one of its namespaces has data, as before.
        if (withData.length === 0) {
          return;
        }
        const errors = clusterQueryResults
          .map(getError)
          .filter((error): error is ApiError => !!error);
        const isError = errors.length > 0;
        const isSuccess =
          !isError &&
          clusterQueryResults.every(result => result.isSuccess && !result.isPlaceholderData);
        clusterResults[cluster] = {
          data: withData[0].data,
          error: errors[0] ?? null,
          errors: errors.length > 0 ? errors : null,
          isError,
          isFetching: clusterQueryResults.some(result => result.isFetching),
          isLoading: clusterQueryResults.some(
            result => result.isLoading || result.isPlaceholderData
          ),
          isSuccess,
          items: withData.flatMap(result => result.data?.list?.items ?? []),
          status: isError ? 'error' : isSuccess ? 'success' : 'pending',
        };
      });

      return {
        data: results.map(result => result.data),
        clusterResults,
        items:
          emptyWhenNoRequests && results.length === 0
            ? []
            : results.every(result => result.data === null)
            ? null
            : results.flatMap(result => result?.data?.list?.items ?? []),
        errors,
        isError: errors.length > 0,
        isLoading: results.some(result => result.isLoading),
        isFetching: results.some(result => result.isFetching),
        isSuccess: errors.length === 0 && results.every(result => result.isSuccess),
        // Whether any result set has more items available via pagination.
        hasMore,
        remainingItemCount:
          hasPendingListRequests || hasUnknownRemainingItemCount
            ? undefined
            : results.reduce(
                (sum, result) => sum + (result.data?.list?.metadata?.remainingItemCount ?? 0),
                0
              ),
      };
    },
  });

  // Don't watch when results are paginated — the watch stream would deliver events
  // for resources outside our fetched page, causing the list to grow unboundedly.
  const shouldWatch = watchList && !query.isLoading && !query.hasMore;

  const [listsToWatch, setListsToWatch] = useState<WatchedList[]>([]);

  useEffect(() => {
    setListsToWatch(currentListsToWatch => {
      const keptListsToWatch = currentListsToWatch.filter(watching =>
        isWatchedListStillRequested(watching, requests)
      );

      if (!shouldWatch) {
        return keptListsToWatch.length === currentListsToWatch.length
          ? currentListsToWatch
          : keptListsToWatch;
      }

      const nextListsToWatch = query.data
        .filter(data => data && !data.skipWatch)
        .map(data => ({
          cluster: data!.cluster,
          namespace: data!.namespace,
          resourceVersion: data!.watchStartResourceVersion ?? data!.list.metadata.resourceVersion,
          connectionRevision: data!.connectionRevision,
        }));

      if (
        nextListsToWatch.length === currentListsToWatch.length &&
        nextListsToWatch.every((nextList, index) => {
          const currentList = currentListsToWatch[index];
          return (
            currentList.cluster === nextList.cluster &&
            currentList.namespace === nextList.namespace &&
            currentList.connectionRevision === nextList.connectionRevision &&
            currentList.resourceVersion === nextList.resourceVersion
          );
        })
      ) {
        return currentListsToWatch;
      }

      return nextListsToWatch;
    });
  }, [query.data, requests, shouldWatch]);

  useWatchKubeObjectLists({
    lists: shouldWatch ? listsToWatch : [],
    endpoint,
    kubeObjectClass,
    queryParams: perRequestQueryParams,
    watchQueryParams: withoutPaginationParams(perRequestQueryParams),
  });

  const paginationInput = useMemo(
    () => ({ endpoint, kubeObjectClass, listRequestInputKey }),
    [endpoint, kubeObjectClass, listRequestInputKey]
  );
  const [failedPage, setFailedPage] = useState<{
    input: typeof paginationInput;
    error: ApiError;
  } | null>(null);
  const paginationError = failedPage?.input === paginationInput ? failedPage.error : null;
  const activePaginationInput = useRef<typeof paginationInput | null>(null);
  useLayoutEffect(() => {
    activePaginationInput.current = paginationInput;
    return () => {
      activePaginationInput.current = null;
    };
  }, [paginationInput]);

  const errors = [...query.errors.filter(it => it !== null), paginationError].filter(
    it => it !== null
  );

  const queryClient = useQueryClient();
  const loadMoreOperation = useRef<{
    input: typeof paginationInput;
    promise: Promise<void>;
  } | null>(null);

  const pendingPages = useRef(
    new Map<
      string,
      {
        input: typeof paginationInput;
        snapshot: ListResponse<K>;
        promise: Promise<void>;
      }
    >()
  );

  const loadMore = useCallback(async () => {
    const isCurrentInput = () => activePaginationInput.current === paginationInput;
    if (!endpoint || !isCurrentInput()) return;

    setFailedPage(null);

    if (hasPendingListRequests) {
      const pending = loadMoreOperation.current;
      if (pending?.input === paginationInput) return pending.promise;

      const promise = (async () => {
        const nextListRequestCount = Math.min(
          listRequests.length,
          activeListRequestCount + (limit ?? listRequests.length)
        );
        const nextListRequests = listRequests.slice(activeListRequestCount, nextListRequestCount);
        const nextQueries = nextListRequests.map(({ cluster, namespace }) =>
          kubeObjectListQuery<K>(
            kubeObjectClass,
            endpoint,
            namespace,
            cluster,
            perRequestQueryParams,
            refetchInterval,
            connectionRevisions.get(cluster)
          )
        );

        const results = await Promise.allSettled(
          nextQueries.map(q => queryClient.fetchQuery(q as any))
        );
        if (!isCurrentInput()) return;

        const rejectedResultIndex = results.findIndex(result => result.status === 'rejected');
        const rejectedResult = results[rejectedResultIndex];
        if (rejectedResult?.status === 'rejected') {
          const rejectedRequest = nextListRequests[rejectedResultIndex];
          setFailedPage({
            input: paginationInput,
            error: toPaginationApiError(
              rejectedResult.reason,
              rejectedRequest.cluster,
              rejectedRequest.namespace
            ),
          });
          return;
        }

        setActiveListRequestCount(nextListRequestCount);
      })();
      const operation = { input: paginationInput, promise };
      loadMoreOperation.current = operation;
      try {
        await promise;
      } finally {
        if (loadMoreOperation.current === operation) loadMoreOperation.current = null;
      }
      return;
    }

    await Promise.all(
      queries.map(({ queryKey }) => {
        const snapshot = queryClient.getQueryData<ListResponse<K>>(queryKey);
        const continueToken = snapshot?.list.metadata.continue;
        if (!snapshot || !continueToken) return;

        const key = hashKey(queryKey);
        const pending = pendingPages.current.get(key);
        if (pending?.input === paginationInput && pending.snapshot === snapshot)
          return pending.promise;

        const isCurrent = () => isCurrentInput() && queryClient.getQueryData(queryKey) === snapshot;
        const promise = (async () => {
          try {
            const page = await fetchKubeObjectListPage<K>(
              kubeObjectClass,
              KubeObjectEndpoint.toUrl(endpoint, snapshot.namespace),
              snapshot.cluster,
              { ...perRequestQueryParams, continue: continueToken },
              snapshot.connectionRevision
            );
            if (!isCurrent()) return;

            queryClient.setQueryData<ListResponse<K>>(queryKey, {
              ...snapshot,
              list: {
                ...snapshot.list,
                metadata: {
                  resourceVersion: page.metadata.resourceVersion,
                  continue: page.metadata.continue,
                  remainingItemCount: page.metadata.remainingItemCount,
                },
                items: [...snapshot.list.items, ...page.items],
              },
            });
          } catch (reason) {
            if (!isCurrent()) return;
            const error = toPaginationApiError(reason, snapshot.cluster, snapshot.namespace);
            if (error.status === 410) void queryClient.invalidateQueries({ queryKey, exact: true });
            setFailedPage(current =>
              current?.input === paginationInput ? current : { input: paginationInput, error }
            );
          }
        })();

        const operation = { input: paginationInput, snapshot, promise };
        pendingPages.current.set(key, operation);
        return promise.finally(() => {
          if (pendingPages.current.get(key) === operation) pendingPages.current.delete(key);
        });
      })
    );
  }, [
    endpoint,
    paginationInput,
    activeListRequestCount,
    hasPendingListRequests,
    limit,
    listRequests,
    queries,
    queryClient,
    kubeObjectClass,
    perRequestQueryParams,
    connectionRevisions,
    refetchInterval,
  ]);

  // @ts-ignore - TS compiler gets confused with iterators
  return {
    items: endpointError ? [] : query.items,
    errors: endpointError ? [endpointError] : errors.length > 0 ? errors : null,
    error: endpointError ?? paginationError ?? query.errors.find(it => it !== null) ?? null,
    clusterResults: query.clusterResults,
    isError: query.isError || !!paginationError,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isSuccess: query.isSuccess,
    hasMore: query.hasMore,
    remainingItemCount: query.remainingItemCount,
    loadMore: query.hasMore ? loadMore : undefined,
    *[Symbol.iterator](): ArrayIterator<ApiError | K[] | null> {
      yield query.items;
      yield endpointError ?? paginationError ?? query.errors.find(it => it !== null) ?? null;
    },
  };
}
