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

import type { QueryObserverOptions } from '@tanstack/react-query';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  hasAllowedNamespacesRestriction,
  loadClusterSettings,
} from '../../../../helpers/clusterSettings';
import type { KubeObject, KubeObjectClass } from '../../KubeObject';
import type { QueryParameters } from '../v1/queryParameters';
import { ApiError } from './ApiError';
import { clusterFetch } from './fetch';
import type { QueryListResponse } from './hooks';
import { useEndpoints } from './hooks';
import type { KubeListUpdateEvent } from './KubeList';
import { KubeList } from './KubeList';
import { KubeObjectEndpoint } from './KubeObjectEndpoint';
import { makeUrl } from './makeUrl';
import { WebSocketManager } from './multiplexer';
import { kubeRequestRetry } from './retry';
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

/**
 * Checks whether an incoming update represents an expired resourceVersion error (e.g. HTTP 410 Gone).
 */
export function isResourceVersionExpiredError(update: any): boolean {
  if (!update || typeof update !== 'object') return false;
  if (update.type === 'ERROR') {
    const obj = update.object || {};
    if (obj.code === 410 || obj.reason === 'Expired' || obj.reason === 'Gone') {
      return true;
    }
    const message =
      typeof obj.message === 'string'
        ? obj.message
        : typeof update.message === 'string'
        ? update.message
        : '';
    if (/too old resource version|expired/i.test(message)) {
      return true;
    }
    return false;
  }
  return false;
}

/**
 * Returns a stable identifier for a Kubernetes resource endpoint or class.
 */
export function getResourceIdentity(
  endpoint?: KubeObjectEndpoint | null,
  kubeObjectClass?: KubeObjectClass | (new (...args: any) => any)
): string {
  if (endpoint) {
    const groupPrefix = endpoint.group ? `${endpoint.group}/` : '';
    return `${groupPrefix}${endpoint.version || ''}/${endpoint.resource || ''}`;
  }
  const objClass = kubeObjectClass as any;
  if (objClass) {
    return `${objClass.apiVersion || ''}/${objClass.apiName || objClass.kind || ''}`;
  }
  return '';
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
  refetchInterval?: number
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
              const item = await clusterFetch(makeUrl(['api', 'v1', 'namespaces', name]), {
                cluster,
              }).then(response => response.json());
              if (item.metadata?.managedFields) {
                delete item.metadata.managedFields;
              }
              const kubeObject = new kubeObjectClass(item) as K;
              kubeObject.cluster = cluster;
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
          ? clusterFetch(makeUrl(['api', 'v1', 'namespaces'], { labelSelector: selector }), {
              cluster,
            })
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
  refetchInterval?: number
): QueryObserverOptions<ListResponse<K> | undefined | null, ApiError> {
  const configuredSelector =
    loadClusterSettings(cluster).allowedNamespacesSelector?.trim() || undefined;
  const isResolvingAllowedNamespaces =
    configuredSelector !== undefined && queryParams.labelSelector?.trim() === configuredSelector;

  if (
    kubeObjectClass.kind === 'Namespace' &&
    !isResolvingAllowedNamespaces &&
    hasAllowedNamespacesRestriction(cluster)
  ) {
    return allowedNamespaceListQuery<K>(kubeObjectClass, cluster, queryParams, refetchInterval);
  }

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
      namespace,
      queryParams,
    ],
    queryFn: async () => {
      // If no valid endpoint is passed, don't make the request
      if (!endpoint) return;

      try {
        const list: KubeList<any> = await clusterFetch(
          makeUrl([KubeObjectEndpoint.toUrl(endpoint!, namespace)], queryParams),
          {
            cluster,
          }
        ).then(it => it.json());
        const kind = list.kind.replace(/List$/, '');
        const apiVersion = list.apiVersion;
        list.items = list.items.map(item => {
          // managedFields are not shown in list views and can be several KB per
          // object. Drop them to keep memory proportional to what's rendered.
          if (item.metadata?.managedFields) {
            delete item.metadata.managedFields;
          }
          // Mutate kind/apiVersion in-place to avoid cloning the whole pod JSON.
          item.kind = kind;
          item.apiVersion = apiVersion;
          const itm = new kubeObjectClass(item);
          itm.cluster = cluster;
          return itm;
        });

        const response: ListResponse<K> = {
          list: list as KubeList<K>,
          cluster,
          namespace,
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
  onReconnect,
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
  lists: Array<{ cluster: string; namespace?: string; resourceVersion: string }>;
  /** Callback invoked when an active watch connection disconnects and needs to reconnect */
  onReconnect?: (
    cluster: string,
    namespace?: string,
    latestResourceVersion?: string,
    watchQueryKey?: string
  ) => void;
}) {
  const multiplexerEnabled = getWebsocketMultiplexerEnabled();

  useWatchKubeObjectListsMultiplexed({
    kubeObjectClass,
    endpoint,
    lists: multiplexerEnabled ? lists : [],
    queryParams: multiplexerEnabled ? queryParams : undefined,
    watchQueryParams: multiplexerEnabled ? watchQueryParams : undefined,
    enabled: multiplexerEnabled,
    onReconnect,
  });

  useWatchKubeObjectListsLegacy({
    kubeObjectClass,
    endpoint,
    lists: !multiplexerEnabled ? lists : [],
    queryParams: !multiplexerEnabled ? queryParams : undefined,
    watchQueryParams: !multiplexerEnabled ? watchQueryParams : undefined,
    enabled: !multiplexerEnabled,
    onReconnect,
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
  onReconnect,
}: {
  kubeObjectClass: (new (...args: any) => K) & typeof KubeObject<any>;
  endpoint?: KubeObjectEndpoint | null;
  lists: Array<{ cluster: string; namespace?: string; resourceVersion: string }>;
  queryParams?: QueryParameters;
  watchQueryParams?: QueryParameters;
  enabled?: boolean;
  onReconnect?: (
    cluster: string,
    namespace?: string,
    latestResourceVersion?: string,
    watchQueryKey?: string
  ) => void;
}): void {
  const client = useQueryClient();
  const endpointKey = getResourceIdentity(endpoint, kubeObjectClass);

  // Track the latest resource versions to prevent duplicate updates
  const latestResourceVersions = useRef<Record<string, string>>({});
  const prevListsResourceVersions = useRef<Record<string, string>>({});

  const hasQueryParams = watchQueryParams !== undefined || queryParams !== undefined;
  const watchQueryKey = useMemo(
    () => (enabled ? getWatchQueryParamsKey(watchQueryParams ?? queryParams) : ''),
    [enabled, watchQueryParams, queryParams]
  );

  // Stabilize queryParams to prevent unnecessary effect triggers
  // Only update when the stringified params change
  const stableQueryParamsKey = enabled
    ? JSON.stringify(
        queryParams
          ? Object.entries(queryParams)
              .sort(([a], [b]) => a.localeCompare(b))
              .filter(([, v]) => v !== undefined && v !== '')
          : null
      )
    : '__disabled__';
  const stableWatchQueryParamsKey = enabled ? watchQueryKey : '__disabled__';
  /* eslint-disable react-hooks/exhaustive-deps -- Query params are intentionally stabilized by their keys. */
  const stableQueryParams = useMemo(() => queryParams, [stableQueryParamsKey]);
  const stableWatchQueryParams = useMemo(
    () => watchQueryParams ?? queryParams,
    [stableWatchQueryParamsKey]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  // Create stable connection URLs for each list
  // Updates only when endpoint, lists, or stableQueryParams change
  const connections = useMemo(() => {
    if (!enabled || !endpoint) {
      return [];
    }

    return lists.map(list => {
      const key = `${list.cluster}:${endpointKey}:${list.namespace || ''}:${watchQueryKey}`;

      const prevListRV = prevListsResourceVersions.current[key];
      if (list.resourceVersion && list.resourceVersion !== prevListRV) {
        prevListsResourceVersions.current[key] = list.resourceVersion;
        latestResourceVersions.current[key] = list.resourceVersion;
      } else if (list.resourceVersion && !latestResourceVersions.current[key]) {
        latestResourceVersions.current[key] = list.resourceVersion;
      }

      // Construct WebSocket URL with current parameters
      return {
        url: makeUrl([KubeObjectEndpoint.toUrl(endpoint, list.namespace)], {
          ...stableWatchQueryParams,
          watch: 1,
          resourceVersion: latestResourceVersions.current[key] || list.resourceVersion,
        }),
        cluster: list.cluster,
        namespace: list.namespace,
        watchQueryKey,
      };
    });
  }, [enabled, endpoint, endpointKey, lists, stableWatchQueryParams, watchQueryKey]);

  // Create stable update handler to process WebSocket messages
  // Re-create only when dependencies change
  const handleUpdate = useCallback(
    (
      update: any,
      cluster: string,
      namespace: string | undefined,
      currentWatchQueryKey?: string
    ) => {
      if (!update || typeof update !== 'object' || !endpoint) {
        return;
      }

      const activeWatchQueryKey = currentWatchQueryKey ?? watchQueryKey;
      const key = `${cluster}:${endpointKey}:${namespace || ''}:${activeWatchQueryKey}`;

      // Create query key for React Query cache
      const queryKey = kubeObjectListQuery<K>(
        kubeObjectClass,
        endpoint,
        namespace,
        cluster,
        stableQueryParams ?? {}
      ).queryKey;

      if (isResourceVersionExpiredError(update)) {
        delete latestResourceVersions.current[key];
        delete prevListsResourceVersions.current[key];
        if (onReconnect) {
          if (hasQueryParams) {
            onReconnect(cluster, namespace, '', activeWatchQueryKey);
          } else {
            onReconnect(cluster, namespace, '');
          }
        } else {
          client.invalidateQueries({ queryKey });
        }
        return;
      }

      if (update.type === 'ERROR') {
        return;
      }

      let appliedResourceVersion: string | undefined;

      // Update React Query cache with new data
      client.setQueryData(queryKey, (oldResponse: ListResponse<any> | undefined | null) => {
        if (!oldResponse) {
          return oldResponse;
        }

        const newList = KubeList.applyUpdate(oldResponse.list, update, kubeObjectClass, cluster);
        appliedResourceVersion = newList.metadata.resourceVersion;

        // Only update if the list actually changed
        if (newList === oldResponse.list) {
          return oldResponse;
        }

        return { ...oldResponse, list: newList };
      });

      if (appliedResourceVersion) {
        latestResourceVersions.current[key] = appliedResourceVersion;
      } else if (update.object?.metadata?.resourceVersion) {
        latestResourceVersions.current[key] = update.object.metadata.resourceVersion;
      }
    },
    [
      client,
      kubeObjectClass,
      endpoint,
      endpointKey,
      stableQueryParams,
      watchQueryKey,
      hasQueryParams,
      onReconnect,
    ]
  );

  // Set up WebSocket subscriptions
  useEffect(() => {
    if (!enabled || !endpoint || connections.length === 0) {
      return;
    }

    const cleanups: (() => void)[] = [];

    // Create subscriptions for each connection
    connections.forEach(({ url, cluster, namespace, watchQueryKey: connWatchQueryKey }) => {
      const parsedUrl = new URL(url, BASE_WS_URL);

      // Subscribe to WebSocket updates
      WebSocketManager.subscribe(
        cluster,
        parsedUrl.pathname,
        parsedUrl.search.slice(1),
        update => handleUpdate(update, cluster, namespace, connWatchQueryKey),
        error => {
          console.error(`WebSocket subscription error for cluster ${cluster}:`, error);
          const key = `${cluster}:${endpointKey}:${namespace || ''}:${connWatchQueryKey}`;
          delete latestResourceVersions.current[key];
          delete prevListsResourceVersions.current[key];
          if (onReconnect) {
            if (hasQueryParams) {
              onReconnect(cluster, namespace, '', connWatchQueryKey);
            } else {
              onReconnect(cluster, namespace, '');
            }
          } else {
            const queryKey = kubeObjectListQuery<K>(
              kubeObjectClass,
              endpoint,
              namespace,
              cluster,
              stableQueryParams ?? {}
            ).queryKey;
            client.invalidateQueries({ queryKey });
          }
        }
      ).then(
        cleanup => cleanups.push(cleanup),
        error => {
          // Track retry count in the URL's searchParams
          const retryCount = parseInt(parsedUrl.searchParams.get('retryCount') || '0');
          if (retryCount < 3) {
            // Only log and allow retry if under threshold
            console.error('WebSocket subscription failed:', error);
            parsedUrl.searchParams.set('retryCount', (retryCount + 1).toString());
          }
        }
      );
    });

    // Cleanup subscriptions when effect re-runs or unmounts
    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [
    connections,
    enabled,
    endpoint,
    endpointKey,
    handleUpdate,
    kubeObjectClass,
    client,
    stableQueryParams,
    hasQueryParams,
    onReconnect,
  ]);
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
  onReconnect,
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
  lists: Array<{ cluster: string; namespace?: string; resourceVersion: string }>;
  enabled?: boolean;
  onReconnect?: (
    cluster: string,
    namespace?: string,
    latestResourceVersion?: string,
    watchQueryKey?: string
  ) => void;
}) {
  const client = useQueryClient();
  const endpointKey = getResourceIdentity(endpoint, kubeObjectClass);
  const latestResourceVersions = useRef<Record<string, string>>({});
  const prevListsResourceVersions = useRef<Record<string, string>>({});

  const hasQueryParams = watchQueryParams !== undefined || queryParams !== undefined;
  const watchQueryKey = useMemo(
    () => (enabled ? getWatchQueryParamsKey(watchQueryParams ?? queryParams) : ''),
    [enabled, watchQueryParams, queryParams]
  );

  const stableQueryParamsKey = enabled
    ? JSON.stringify(
        queryParams
          ? Object.entries(queryParams)
              .sort(([a], [b]) => a.localeCompare(b))
              .filter(([, v]) => v !== undefined && v !== '')
          : null
      )
    : '__disabled__';
  const stableWatchQueryParamsKey = enabled ? watchQueryKey : '__disabled__';
  /* eslint-disable react-hooks/exhaustive-deps -- Query params are intentionally stabilized by their keys. */
  const stableQueryParams = useMemo(() => queryParams, [stableQueryParamsKey]);
  const stableWatchQueryParams = useMemo(
    () => watchQueryParams ?? queryParams,
    [stableWatchQueryParamsKey]
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const connections = useMemo(() => {
    if (!enabled || !endpoint) return [];

    return lists.map(({ cluster, namespace, resourceVersion }) => {
      const watchKey = `${cluster}:${endpointKey}:${namespace || ''}:${watchQueryKey}`;
      const prevListRV = prevListsResourceVersions.current[watchKey];
      if (resourceVersion && resourceVersion !== prevListRV) {
        prevListsResourceVersions.current[watchKey] = resourceVersion;
        latestResourceVersions.current[watchKey] = resourceVersion;
      } else if (resourceVersion && !latestResourceVersions.current[watchKey]) {
        latestResourceVersions.current[watchKey] = resourceVersion;
      }

      const url = makeUrl([KubeObjectEndpoint.toUrl(endpoint!, namespace)], {
        ...stableWatchQueryParams,
        watch: 1,
        resourceVersion: latestResourceVersions.current[watchKey] || resourceVersion,
      });

      return {
        cluster,
        url,
        onMessage(update: KubeListUpdateEvent<K>) {
          if (isResourceVersionExpiredError(update)) {
            delete latestResourceVersions.current[watchKey];
            delete prevListsResourceVersions.current[watchKey];
            if (onReconnect) {
              if (hasQueryParams) {
                onReconnect(cluster, namespace, '', watchQueryKey);
              } else {
                onReconnect(cluster, namespace, '');
              }
            } else {
              const key = kubeObjectListQuery<K>(
                kubeObjectClass,
                endpoint,
                namespace,
                cluster,
                stableQueryParams ?? {}
              ).queryKey;
              client.invalidateQueries({ queryKey: key });
            }
            return;
          }

          if (update.type === 'ERROR') {
            return;
          }

          const key = kubeObjectListQuery<K>(
            kubeObjectClass,
            endpoint,
            namespace,
            cluster,
            stableQueryParams ?? {}
          ).queryKey;
          let appliedResourceVersion: string | undefined;

          client.setQueryData(key, (oldResponse: ListResponse<any> | undefined | null) => {
            if (!oldResponse) return oldResponse;

            const newList = KubeList.applyUpdate(
              oldResponse.list,
              update,
              kubeObjectClass,
              cluster
            );
            appliedResourceVersion = newList.metadata.resourceVersion;
            return { ...oldResponse, list: newList };
          });

          if (appliedResourceVersion) {
            latestResourceVersions.current[watchKey] = appliedResourceVersion;
          } else if (update.object?.metadata?.resourceVersion) {
            latestResourceVersions.current[watchKey] = update.object.metadata.resourceVersion;
          }
        },
        onClose(event?: CloseEvent) {
          if (enabled) {
            const key = kubeObjectListQuery<K>(
              kubeObjectClass,
              endpoint,
              namespace,
              cluster,
              stableQueryParams ?? {}
            ).queryKey;
            const cached = client.getQueryData<ListResponse<any>>(key);
            const cachedRV = cached?.list?.metadata?.resourceVersion;
            const eventRV = latestResourceVersions.current[watchKey];
            const isAbnormalClose = Boolean(
              event && (event.code === 1002 || event.code === 1008 || event.code === 4404)
            );
            const rv = isAbnormalClose ? '' : cachedRV || eventRV || resourceVersion;
            if (rv) {
              latestResourceVersions.current[watchKey] = rv;
            } else {
              delete latestResourceVersions.current[watchKey];
              delete prevListsResourceVersions.current[watchKey];
              if (!onReconnect) {
                client.invalidateQueries({ queryKey: key });
              }
            }
            if (hasQueryParams) {
              onReconnect?.(cluster, namespace, rv, watchQueryKey);
            } else {
              onReconnect?.(cluster, namespace, rv);
            }
          }
        },
      };
    });
  }, [
    enabled,
    lists,
    kubeObjectClass,
    endpoint,
    endpointKey,
    stableQueryParams,
    stableWatchQueryParams,
    watchQueryKey,
    hasQueryParams,
    client,
    onReconnect,
  ]);

  useWebSockets<KubeListUpdateEvent<K>>({
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
  return params;
}

/**
 * Generates a stable, canonical query string key from query parameters for Kubernetes watches.
 * Excludes pagination parameters (continue, limit), watch mechanics (watch, resourceVersion),
 * and undefined or empty values. Sorts keys alphabetically to guarantee order invariance.
 *
 * @param queryParams - The query parameters object to canonicalize
 * @returns A sorted, URL-encoded query string representing the watch stream identity
 */
export function getWatchQueryParamsKey(queryParams?: QueryParameters): string {
  if (!queryParams) {
    return '';
  }

  const params = new URLSearchParams();
  const sortedKeys = Object.keys(queryParams).sort();

  for (const key of sortedKeys) {
    if (key === 'continue' || key === 'limit' || key === 'resourceVersion' || key === 'watch') {
      continue;
    }
    const val = (queryParams as Record<string, any>)[key];
    if (val !== undefined && val !== '') {
      params.set(key, String(val));
    }
  }

  params.sort();
  return params.toString();
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
  const queryClient = useQueryClient();
  const maybeNamespace = requests.find(it => it.namespaces)?.namespaces?.[0];

  // Get working endpoint from the first cluster
  // Now if clusters have different apiVersions for the same resource for example, this will not work
  const { endpoint, error: endpointError } = useEndpoints(
    requests.length === 0 ? [] : kubeObjectClass.apiEndpoint.apiInfo,
    requests[0]?.cluster,
    maybeNamespace
  );

  const endpointKey = getResourceIdentity(endpoint, kubeObjectClass);
  const queryParamsKey = JSON.stringify(
    queryParams
      ? Object.entries(queryParams)
          .sort(([a], [b]) => a.localeCompare(b))
          .filter(([, v]) => v !== undefined && v !== '')
      : null
  );
  const cleanedUpQueryParams = useMemo(() => {
    const entries = Object.entries(queryParams ?? {})
      .filter(([, value]) => value !== undefined && value !== '')
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries);
  }, [queryParamsKey]);
  const listRequests = useMemo(() => flattenListRequests(requests), [requests]);
  const limit = getPositiveLimit(cleanedUpQueryParams);
  const initialListRequestCount =
    limit && listRequests.length > limit ? limit : listRequests.length;
  const [activeListRequestCount, setActiveListRequestCount] = useState(initialListRequestCount);
  const listRequestInputKey = JSON.stringify([endpointKey, listRequests, cleanedUpQueryParams]);

  useEffect(() => {
    setActiveListRequestCount(initialListRequestCount);
  }, [initialListRequestCount, listRequestInputKey]);

  const activeListRequests = useMemo(
    () => listRequests.slice(0, activeListRequestCount),
    [activeListRequestCount, listRequests]
  );
  const hasPendingListRequests = activeListRequests.length < listRequests.length;
  const perRequestQueryParams = useMemo(
    () => getPerRequestQueryParams(cleanedUpQueryParams, requests),
    [cleanedUpQueryParams, requests]
  );

  const queries = useMemo(
    () =>
      endpoint
        ? activeListRequests.map(({ cluster, namespace }) =>
            kubeObjectListQuery<K>(
              kubeObjectClass,
              endpoint,
              namespace,
              cluster,
              perRequestQueryParams,
              refetchInterval
            )
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeListRequests, kubeObjectClass, endpoint, perRequestQueryParams]
  );

  const query = useQueries({
    queries,
    combine(results) {
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
          .map(result => result.error)
          .filter((error): error is ApiError => !!error);
        const isError = clusterQueryResults.some(result => result.isError);
        const isSuccess = clusterQueryResults.every(
          result => result.isSuccess && !result.isPlaceholderData
        );
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
        dataUpdatedAts: results.map(result => result.dataUpdatedAt),
        queryStatuses: results.map(result => result.status),
        clusterResults,
        items:
          emptyWhenNoRequests && results.length === 0
            ? []
            : results.every(result => result.data === null)
            ? null
            : results.flatMap(result => result?.data?.list?.items ?? []),
        errors: results.map(result => result.error).filter(Boolean),
        isError: results.some(result => result.isError),
        isLoading: results.some(result => result.isLoading),
        isFetching: results.some(result => result.isFetching),
        isSuccess: results.every(result => result.isSuccess),
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
  const shouldWatch = watch && !refetchInterval && !query.isLoading && !query.hasMore;

  const [listsToWatch, setListsToWatch] = useState<
    { cluster: string; namespace?: string; resourceVersion: string }[]
  >([]);

  const disconnectedWatchesRef = useRef<Map<string, string | undefined>>(new Map());
  const pendingRelistKeysRef = useRef<Set<string>>(new Set());
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  const endpointRef = useRef(endpoint);
  endpointRef.current = endpoint;
  const kubeObjectClassRef = useRef(kubeObjectClass);
  kubeObjectClassRef.current = kubeObjectClass;
  const perRequestQueryParamsRef = useRef(perRequestQueryParams);
  perRequestQueryParamsRef.current = perRequestQueryParams;

  const handleWatchReconnect = useCallback(
    (
      cluster: string,
      namespace?: string,
      latestResourceVersion?: string,
      watchQueryKey?: string
    ) => {
      const currentWatchQueryKey = getWatchQueryParamsKey(
        withoutPaginationParams(perRequestQueryParamsRef.current)
      );

      // If watchQueryKey is provided from a disconnecting connection and does not match the
      // currently active query, it belongs to an obsolete subscription; ignore it to prevent
      // corrupting the active query's cursor or relist state.
      if (watchQueryKey !== undefined && watchQueryKey !== currentWatchQueryKey) {
        return;
      }

      const activeQueryKey = watchQueryKey ?? currentWatchQueryKey;
      const currentEndpointKey = getResourceIdentity(
        endpointRef.current,
        kubeObjectClassRef.current
      );
      const key = `${cluster}:${currentEndpointKey}:${namespace || ''}:${activeQueryKey}`;
      if (!latestResourceVersion) {
        pendingRelistKeysRef.current.add(key);
        disconnectedWatchesRef.current.delete(key);
        const queryKey = endpointRef.current
          ? kubeObjectListQuery<K>(
              kubeObjectClassRef.current,
              endpointRef.current,
              namespace,
              cluster,
              perRequestQueryParamsRef.current,
              refetchInterval
            ).queryKey
          : undefined;
        if (queryKey) {
          queryClient.invalidateQueries({ queryKey });
        }
        setReconnectTrigger(prev => prev + 1);
      } else {
        pendingRelistKeysRef.current.delete(key);
        disconnectedWatchesRef.current.set(key, latestResourceVersion);
        setReconnectTrigger(prev => prev + 1);
      }
    },
    [queryClient, refetchInterval]
  );

  const prevListRequestInputKeyRef = useRef(listRequestInputKey);
  const prevDataUpdatedAtsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const inputsChanged = prevListRequestInputKeyRef.current !== listRequestInputKey;
    prevListRequestInputKeyRef.current = listRequestInputKey;

    if (inputsChanged) {
      pendingRelistKeysRef.current.clear();
      prevDataUpdatedAtsRef.current = {};
      disconnectedWatchesRef.current.clear();
    }

    const activeWatchQueryKey = getWatchQueryParamsKey(
      withoutPaginationParams(perRequestQueryParams)
    );

    const relistedKeys = new Set<string>();
    if (query.data) {
      query.data.forEach((data, index) => {
        if (data && query.queryStatuses?.[index] === 'success') {
          const key = `${data.cluster}:${endpointKey}:${
            data.namespace || ''
          }:${activeWatchQueryKey}`;
          const currentUpdatedAt = query.dataUpdatedAts?.[index] || 0;
          const prevUpdatedAt = prevDataUpdatedAtsRef.current[key];
          if (currentUpdatedAt > (prevUpdatedAt || 0)) {
            prevDataUpdatedAtsRef.current[key] = currentUpdatedAt;
            if (pendingRelistKeysRef.current.has(key)) {
              relistedKeys.add(key);
              pendingRelistKeysRef.current.delete(key);
            }
          }
        }
      });
    }

    // Capture any watches that requested a reconnect and clear the ref
    const disconnectedWatches = new Map(disconnectedWatchesRef.current);
    const hasDisconnected = disconnectedWatches.size > 0;
    disconnectedWatchesRef.current.clear();

    setListsToWatch(currentListsToWatch => {
      const keptListsToWatch = currentListsToWatch.filter(watching =>
        isWatchedListStillRequested(watching, requests)
      );

      if (!shouldWatch || !query.data) {
        return keptListsToWatch.length > 0 ? [] : currentListsToWatch;
      }

      const nextListsToWatch = query.data
        .filter(data => data && !data.skipWatch)
        .filter(data => {
          const key = `${data!.cluster}:${endpointKey}:${
            data!.namespace || ''
          }:${activeWatchQueryKey}`;
          return !pendingRelistKeysRef.current.has(key);
        })
        .map(data => {
          const key = `${data!.cluster}:${endpointKey}:${
            data!.namespace || ''
          }:${activeWatchQueryKey}`;
          const isDisconnected = disconnectedWatches.has(key);
          const wasRelisted = relistedKeys.has(key);
          const shouldRefresh = inputsChanged || isDisconnected || wasRelisted;

          // If this watch was already established and hasn't been disconnected or refreshed,
          // preserve its starting resourceVersion so healthy connections aren't torn down.
          const existingWatch = shouldRefresh
            ? undefined
            : currentListsToWatch.find(
                watching =>
                  watching.cluster === data!.cluster &&
                  (watching.namespace || '') === (data!.namespace || '')
              );

          const disconnectedRV = disconnectedWatches.get(key);
          const currentDataRV = data!.list.metadata.resourceVersion;
          const latestAvailableRV =
            (wasRelisted ? currentDataRV || disconnectedRV : disconnectedRV || currentDataRV) || '';

          return {
            cluster: data!.cluster,
            namespace: data!.namespace,
            resourceVersion: existingWatch ? existingWatch.resourceVersion : latestAvailableRV,
          };
        });

      if (
        !hasDisconnected &&
        relistedKeys.size === 0 &&
        nextListsToWatch.length === currentListsToWatch.length &&
        nextListsToWatch.every((nextList, index) => {
          const currentList = currentListsToWatch[index];
          return (
            currentList.cluster === nextList.cluster &&
            currentList.namespace === nextList.namespace &&
            currentList.resourceVersion === nextList.resourceVersion
          );
        })
      ) {
        return currentListsToWatch;
      }

      return nextListsToWatch;
    });
  }, [
    query.data,
    query.dataUpdatedAts,
    query.isFetching,
    query.queryStatuses,
    requests,
    shouldWatch,
    listRequestInputKey,
    reconnectTrigger,
    endpointKey,
    perRequestQueryParams,
  ]);

  useWatchKubeObjectLists({
    lists: shouldWatch ? listsToWatch : [],
    endpoint,
    kubeObjectClass,
    queryParams: perRequestQueryParams,
    watchQueryParams: withoutPaginationParams(perRequestQueryParams),
    onReconnect: handleWatchReconnect,
  });

  const [paginationError, setPaginationError] = useState<ApiError | null>(null);
  const paginationInputKey = JSON.stringify(queries.map(q => q.queryKey));
  useEffect(() => {
    setPaginationError(null);
  }, [paginationInputKey]);

  const errors = [...query.errors.filter(it => it !== null), paginationError].filter(
    it => it !== null
  );

  const loadMorePromiseRef = useRef<Promise<void> | null>(null);

  const loadMore = useCallback(async () => {
    if (!endpoint) return;

    if (loadMorePromiseRef.current) {
      return loadMorePromiseRef.current;
    }

    loadMorePromiseRef.current = (async () => {
      setPaginationError(null);

      if (hasPendingListRequests) {
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
            refetchInterval
          )
        );

        const results = await Promise.allSettled(
          nextQueries.map(q => queryClient.fetchQuery(q as any))
        );

        const rejectedResultIndex = results.findIndex(result => result.status === 'rejected');
        const rejectedResult = results[rejectedResultIndex];
        if (rejectedResult?.status === 'rejected') {
          const rejectedRequest = nextListRequests[rejectedResultIndex];
          setPaginationError(
            toPaginationApiError(
              rejectedResult.reason,
              rejectedRequest.cluster,
              rejectedRequest.namespace
            )
          );
          return;
        }

        setActiveListRequestCount(nextListRequestCount);
        return;
      }

      const pageRequests = queries.map(q => ({
        query: q,
        cached: queryClient.getQueryData<ListResponse<K>>(q.queryKey!),
      }));
      const results = await Promise.allSettled(
        pageRequests.map(async ({ query: q, cached }) => {
          const continueToken = cached?.list?.metadata?.continue;
          if (!continueToken || !cached) return;

          const fetchParams: QueryParameters = {
            ...perRequestQueryParams,
            continue: continueToken,
          };
          let raw: KubeList<any>;
          try {
            raw = await clusterFetch(
              makeUrl([KubeObjectEndpoint.toUrl(endpoint, cached.namespace)], fetchParams),
              { cluster: cached.cluster }
            ).then(r => r.json());
          } catch (e) {
            const error =
              e instanceof ApiError
                ? e
                : new ApiError(e instanceof Error ? e.message : 'Failed to load more resources');
            error.cluster = cached.cluster;
            error.namespace = cached.namespace;

            if (error.status === 410) {
              queryClient.invalidateQueries({ queryKey: q.queryKey! });
            }

            throw error;
          }

          const kind = raw.kind.replace(/List$/, '');
          const apiVersion = raw.apiVersion;
          const newItems: K[] = raw.items.map((item: any) => {
            if (item.metadata?.managedFields) delete item.metadata.managedFields;
            item.kind = kind;
            item.apiVersion = apiVersion;
            const obj = new kubeObjectClass(item) as K;
            obj.cluster = cached.cluster;
            return obj;
          });

          queryClient.setQueryData<ListResponse<K>>(q.queryKey!, old => {
            if (!old) return old;
            return {
              ...old,
              list: {
                ...old.list,
                metadata: {
                  resourceVersion: raw.metadata.resourceVersion,
                  continue: raw.metadata.continue,
                  remainingItemCount: raw.metadata.remainingItemCount,
                },
                items: [...old.list.items, ...newItems],
              },
            };
          });
        })
      );

      const rejectedResultIndex = results.findIndex(result => result.status === 'rejected');
      const rejectedResult = results[rejectedResultIndex];
      if (rejectedResult?.status === 'rejected') {
        const cached = pageRequests[rejectedResultIndex].cached!;
        setPaginationError(
          toPaginationApiError(rejectedResult.reason, cached.cluster, cached.namespace)
        );
      }
    })();

    try {
      return await loadMorePromiseRef.current;
    } finally {
      loadMorePromiseRef.current = null;
    }
  }, [
    endpoint,
    activeListRequestCount,
    hasPendingListRequests,
    limit,
    listRequests,
    queries,
    queryClient,
    kubeObjectClass,
    perRequestQueryParams,
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
