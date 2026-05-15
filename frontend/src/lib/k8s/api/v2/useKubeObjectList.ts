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
  namespace: string | undefined,
  cluster: string,
  queryParams: QueryParameters,
  refetchInterval?: number
): QueryObserverOptions<ListResponse<K> | undefined | null, ApiError> {
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
      namespace ?? '',
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
        const kind = list.kind.replace('List', '');
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
}) {
  const multiplexerEnabled = getWebsocketMultiplexerEnabled();

  useWatchKubeObjectListsMultiplexed({
    kubeObjectClass,
    endpoint,
    lists: multiplexerEnabled ? lists : [],
    queryParams: multiplexerEnabled ? queryParams : undefined,
    watchQueryParams: multiplexerEnabled ? watchQueryParams : undefined,
    enabled: multiplexerEnabled,
  });

  useWatchKubeObjectListsLegacy({
    kubeObjectClass,
    endpoint,
    lists: !multiplexerEnabled ? lists : [],
    queryParams: !multiplexerEnabled ? queryParams : undefined,
    watchQueryParams: !multiplexerEnabled ? watchQueryParams : undefined,
    enabled: !multiplexerEnabled,
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
  lists: Array<{ cluster: string; namespace?: string; resourceVersion: string }>;
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
      };
    });
  }, [enabled, endpoint, lists, stableWatchQueryParams]);

  // Create stable update handler to process WebSocket messages
  // Re-create only when dependencies change
  const handleUpdate = useCallback(
    (update: any, cluster: string, namespace: string | undefined) => {
      if (!update || typeof update !== 'object' || !endpoint) {
        return;
      }

      const key = `${cluster}:${namespace || ''}`;

      // Update resource version from incoming message
      if (update.object?.metadata?.resourceVersion) {
        latestResourceVersions.current[key] = update.object.metadata.resourceVersion;
      }

      // Create query key for React Query cache
      const queryKey = kubeObjectListQuery<K>(
        kubeObjectClass,
        endpoint,
        namespace,
        cluster,
        stableQueryParams ?? {}
      ).queryKey;

      // Update React Query cache with new data
      client.setQueryData(queryKey, (oldResponse: ListResponse<any> | undefined | null) => {
        if (!oldResponse) {
          return oldResponse;
        }

        const newList = KubeList.applyUpdate(oldResponse.list, update, kubeObjectClass, cluster);

        // Only update if the list actually changed
        if (newList === oldResponse.list) {
          return oldResponse;
        }

        return { ...oldResponse, list: newList };
      });
    },
    [client, kubeObjectClass, endpoint, stableQueryParams]
  );

  // Set up WebSocket subscriptions
  useEffect(() => {
    if (!enabled || !endpoint || connections.length === 0) {
      return;
    }

    const cleanups: (() => void)[] = [];

    // Create subscriptions for each connection
    connections.forEach(({ url, cluster, namespace }) => {
      const parsedUrl = new URL(url, BASE_WS_URL);

      // Subscribe to WebSocket updates
      WebSocketManager.subscribe(cluster, parsedUrl.pathname, parsedUrl.search.slice(1), update =>
        handleUpdate(update, cluster, namespace)
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
  }, [connections, enabled, endpoint, handleUpdate]);
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
  lists: Array<{ cluster: string; namespace?: string; resourceVersion: string }>;
  enabled?: boolean;
}) {
  const client = useQueryClient();

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

  const connections = useMemo(() => {
    if (!enabled || !endpoint) return [];

    return lists.map(({ cluster, namespace, resourceVersion }) => {
      const url = makeUrl([KubeObjectEndpoint.toUrl(endpoint!, namespace)], {
        ...stableWatchQueryParams,
        watch: 1,
        resourceVersion,
      });

      return {
        cluster,
        url,
        onMessage(update: KubeListUpdateEvent<K>) {
          const key = kubeObjectListQuery<K>(
            kubeObjectClass,
            endpoint,
            namespace,
            cluster,
            stableQueryParams ?? {}
          ).queryKey;
          client.setQueryData(key, (oldResponse: ListResponse<any> | undefined | null) => {
            if (!oldResponse) return oldResponse;

            const newList = KubeList.applyUpdate(
              oldResponse.list,
              update,
              kubeObjectClass,
              cluster
            );
            return { ...oldResponse, list: newList };
          });
        },
      };
    });
  }, [
    enabled,
    lists,
    kubeObjectClass,
    endpoint,
    stableQueryParams,
    stableWatchQueryParams,
    client,
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
 *
 * @returns list of requests for clusters and appropriate namespaces
 */
export function makeListRequests(
  clusters: string[],
  getAllowedNamespaces: (cluster: string | null) => string[],
  isResourceNamespaced: boolean,
  requestedNamespaces: string[] = []
): Array<{ cluster: string; namespaces?: string[] }> {
  return clusters.map(cluster => {
    const allowedNamespaces = getAllowedNamespaces(cluster);

    let namespaces = requestedNamespaces.length > 0 ? requestedNamespaces : allowedNamespaces;

    if (allowedNamespaces.length) {
      namespaces = namespaces.filter(ns => allowedNamespaces.includes(ns));
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
}: {
  requests: Array<{ cluster: string; namespaces?: string[] }>;
  /** Class to instantiate the object with */
  kubeObjectClass: (new (...args: any) => K) & typeof KubeObject<any>;
  queryParams?: QueryParameters;
  /** Watch for updates @default true */
  watch?: boolean;
  /** How often to refetch the list. Won't refetch by default. Disables watching if set. */
  refetchInterval?: number;
}): [Array<K> | null, ApiError | null] &
  QueryListResponse<Array<ListResponse<K> | undefined | null>, K, ApiError> {
  const maybeNamespace = requests.find(it => it.namespaces)?.namespaces?.[0];

  // Get working endpoint from the first cluster
  // Now if clusters have different apiVersions for the same resource for example, this will not work
  const { endpoint, error: endpointError } = useEndpoints(
    kubeObjectClass.apiEndpoint.apiInfo,
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
  const listRequestInputKey = JSON.stringify([listRequests, cleanedUpQueryParams]);

  useEffect(() => {
    setActiveListRequestCount(initialListRequestCount);
  }, [initialListRequestCount, listRequestInputKey]);

  const activeListRequests = useMemo(
    () => listRequests.slice(0, activeListRequestCount),
    [activeListRequestCount, listRequests]
  );
  const hasPendingListRequests = activeListRequests.length < listRequests.length;
  const perRequestQueryParams = getPerRequestQueryParams(cleanedUpQueryParams, requests);

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

      return {
        data: results.map(result => result.data),
        clusterResults: results.reduce((acc, result) => {
          if (result.data && result.data.cluster) {
            acc[result.data.cluster] = {
              data: result.data,
              error: result.error,
              errors: result.error ? [result.error] : null,
              isError: result.isError,
              isFetching: result.isFetching,
              isLoading: result.isLoading,
              isSuccess: result.isSuccess,
              items: result?.data?.list?.items ?? null,
              status: result.status,
            };
          }
          return acc;
        }, {} as Record<string, QueryListResponse<any, K, ApiError>>),
        items: results.every(result => result.data === null)
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

  useEffect(() => {
    setListsToWatch(currentListsToWatch => {
      const keptListsToWatch = currentListsToWatch.filter(
        watching =>
          requests.find(request => {
            if (watching.cluster !== request?.cluster) return false;
            return !request.namespaces?.length
              ? !watching.namespace
              : !!watching.namespace && request.namespaces.includes(watching.namespace);
          }) !== undefined
      );

      if (!shouldWatch) {
        return keptListsToWatch.length === currentListsToWatch.length
          ? currentListsToWatch
          : keptListsToWatch;
      }

      const listsNotYetWatched = query.data
        .filter(Boolean)
        .filter(
          data =>
            keptListsToWatch.find(
              // resourceVersion is intentionally omitted to avoid recreating WS connection when list is updated
              watching =>
                watching.cluster === data?.cluster && watching.namespace === data.namespace
            ) === undefined
        )
        .map(data => ({
          cluster: data!.cluster,
          namespace: data!.namespace,
          resourceVersion: data!.list.metadata.resourceVersion,
        }));

      if (
        listsNotYetWatched.length === 0 &&
        keptListsToWatch.length === currentListsToWatch.length
      ) {
        return currentListsToWatch;
      }

      return [...keptListsToWatch, ...listsNotYetWatched];
    });
  }, [query.data, requests, shouldWatch]);

  useWatchKubeObjectLists({
    lists: shouldWatch ? listsToWatch : [],
    endpoint,
    kubeObjectClass,
    queryParams: perRequestQueryParams,
    watchQueryParams: withoutPaginationParams(perRequestQueryParams),
  });

  const [paginationError, setPaginationError] = useState<ApiError | null>(null);
  const paginationInputKey = JSON.stringify(queries.map(q => q.queryKey));
  useEffect(() => {
    setPaginationError(null);
  }, [paginationInputKey]);

  const errors = [...query.errors.filter(it => it !== null), paginationError].filter(
    it => it !== null
  );

  const queryClient = useQueryClient();
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
        const nextQueries = listRequests
          .slice(activeListRequestCount, nextListRequestCount)
          .map(({ cluster, namespace }) =>
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

        const rejectedResult = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        );
        if (rejectedResult) {
          setPaginationError(rejectedResult.reason);
          return;
        }

        setActiveListRequestCount(nextListRequestCount);
        return;
      }

      const results = await Promise.allSettled(
        queries.map(async q => {
          const cached = queryClient.getQueryData<ListResponse<K>>(q.queryKey!);
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

          const kind = raw.kind.replace('List', '');
          const apiVersion = raw.apiVersion;
          const newItems: K[] = raw.items.map((item: any) => {
            if (item.metadata?.managedFields) delete item.metadata.managedFields;
            item.kind = kind;
            item.apiVersion = apiVersion;
            const obj = new kubeObjectClass(item) as K;
            (obj as any).cluster = cached.cluster;
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

      const rejectedResult = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected'
      );
      if (rejectedResult) {
        setPaginationError(rejectedResult.reason);
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
