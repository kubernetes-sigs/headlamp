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

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { getCluster } from '../../../cluster';
import type { QueryParameters } from '../../api/v1/queryParameters';
import type { KubeObject, KubeObjectInterface } from '../../KubeObject';
import { ApiError } from './ApiError';
import { clusterFetch } from './fetch';
import type { KubeList, KubeListUpdateEvent } from './KubeList';
import { KubeObjectEndpoint } from './KubeObjectEndpoint';
import { makeUrl } from './makeUrl';
import { useWebSocket } from './multiplexer';
import { kubeRequestRetry } from './retry';
import { getWebsocketMultiplexerEnabled } from './useKubeObjectList';
import { useWebSockets } from './webSocket';

export type QueryStatus = 'pending' | 'success' | 'error';

export interface QueryResponse<DataType, ErrorType> {
  /**
   * The last successfully resolved data for the query.
   */
  data: DataType | null;
  /**
   * The error object for the query, if an error was thrown.
   * - Defaults to `null`.
   */
  error: ErrorType | null;
  /**
   * A derived boolean from the `status` variable, provided for convenience.
   * - `true` if the query attempt resulted in an error.
   */
  isError: boolean;
  /**
   * Is `true` whenever the first fetch for a query is in-flight.
   */
  isLoading: boolean;
  /**
   * Is `true` whenever the query is executing, which includes initial fetch as well as background refetch.
   */
  isFetching: boolean;
  /**
   * A derived boolean from the `status` variable, provided for convenience.
   * - `true` if the query has received a response with no errors and is ready to display its data.
   */
  isSuccess: boolean;
  /**
   * The status of the query.
   * - Will be:
   *   - `pending` if there's no cached data and no query attempt was finished yet.
   *   - `error` if the query attempt resulted in an error.
   *   - `success` if the query has received a response with no errors and is ready to display its data.
   */
  status: QueryStatus;
}

/**
 * Query response containing KubeList with added items field for convenience
 */
export interface QueryListResponse<DataType, ItemType, ErrorType>
  extends QueryResponse<DataType, ErrorType> {
  items: Array<ItemType> | null;
  /**
   * Results from individual clusters. Keyed by cluster name.
   */
  clusterResults?: Record<string, QueryListResponse<DataType, ItemType, ErrorType>>;
  errors: ApiError[] | null;
  /** True when at least one cluster/namespace has more items available via pagination. */
  hasMore?: boolean;
  /** Approximate total count of items not yet fetched across all results. */
  remainingItemCount?: number;
  /** Fetch and append the next page of results. Only present when hasMore is true. */
  loadMore?: () => Promise<void>;
}

export const kubeObjectQueryKey = ({
  cluster,
  endpoint,
  namespace,
  name,
  queryParams,
}: {
  cluster: string;
  endpoint?: KubeObjectEndpoint | null;
  namespace?: string;
  name: string;
  queryParams?: QueryParameters;
}) => ['object', cluster, endpoint, namespace ?? '', name, queryParams ?? {}];

interface ObjectWatchState {
  resourceVersion: string | null;
  generation: number;
  expired: boolean;
  missing: boolean;
}

/**
 * Returns a single KubeObject.
 */
export function useKubeObject<K extends KubeObject>({
  kubeObjectClass,
  namespace,
  name,
  cluster = getCluster() ?? '',
  queryParams,
  initialData,
}: {
  /** Class to instantiate the object with */
  kubeObjectClass: (new (...args: any) => K) & typeof KubeObject<any>;
  /** Object namespace */
  namespace?: string;
  /** Object name */
  name: string;
  /** Cluster name */
  cluster?: string;
  queryParams?: QueryParameters;
  /**
   * Seed data to use before the query resolves. Must be reference-stable across
   * renders (memoize it or capture it once) — an object rebuilt on every render
   * will cause repeated re-renders.
   */
  initialData?: K;
}): [K | null, ApiError | null] & QueryResponse<K, ApiError> {
  type Instance = K;
  const { endpoint, error: endpointError } = useEndpoints(
    kubeObjectClass.apiEndpoint.apiInfo,
    cluster,
    namespace,
    name
  );

  const queryParamsString = JSON.stringify(queryParams);
  const cleanedUpQueryParams = useMemo(() => {
    return Object.fromEntries(
      Object.entries(queryParams ?? {}).filter(([, value]) => value !== undefined && value !== '')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParamsString]);

  const queryKey = useMemo(
    () =>
      kubeObjectQueryKey({ cluster, name, namespace, endpoint, queryParams: cleanedUpQueryParams }),
    [cluster, name, namespace, endpoint, cleanedUpQueryParams]
  );

  const client = useQueryClient();
  const [seededInitialData, setSeededInitialData] = useState<K | null>(null);
  // All observers must join the same ordered watch, even when only one runs the fetch.
  const watchQueryKey = useMemo(() => ['object-watch', ...queryKey], [queryKey]);
  const { data: watchState } = useQuery<ObjectWatchState>({
    queryKey: watchQueryKey,
    enabled: false,
    // A later mount must resume from cached data, not replay an abandoned watch.
    gcTime: 0,
    initialData: { resourceVersion: null, generation: 0, expired: false, missing: false },
  });
  const setWatchSnapshot = useCallback(
    (resourceVersion: string | undefined, missing = false) => {
      client.setQueryData<ObjectWatchState>(watchQueryKey, previous => ({
        resourceVersion: resourceVersion ?? '',
        generation:
          (previous?.generation ?? 0) +
          (previous?.resourceVersion === (resourceVersion ?? '') && !previous.expired ? 0 : 1),
        expired: false,
        missing,
      }));
    },
    [client, watchQueryKey]
  );
  const query = useQuery<Instance | null, ApiError>({
    enabled: !!endpoint,
    placeholderData: null,
    staleTime: 5000,
    retry: kubeRequestRetry,
    queryKey,
    queryFn: async ({ signal }) => {
      if (client.getQueryData<ObjectWatchState>(watchQueryKey)?.expired) {
        // An unchanged object's own version can remain expired after a GET.
        // A name-filtered collection snapshot supplies a fresh watch cursor.
        const url = makeUrl([KubeObjectEndpoint.toUrl(endpoint!, namespace)], {
          ...cleanedUpQueryParams,
          fieldSelector: `metadata.name=${name}`,
          resourceVersion: '',
          resourceVersionMatch: '',
          continue: '',
        });
        const list: KubeList<KubeObjectInterface> = await clusterFetch(url, {
          cluster,
          signal,
        }).then(it => it.json());
        signal.throwIfAborted();
        const obj = list.items[0];
        setWatchSnapshot(list.metadata.resourceVersion, !obj);
        return obj
          ? (new kubeObjectClass(
              {
                ...obj,
                kind: obj.kind ?? list.kind?.replace(/List$/, ''),
                apiVersion: obj.apiVersion ?? list.apiVersion,
              },
              cluster
            ) as Instance)
          : null;
      }
      const url = makeUrl(
        [KubeObjectEndpoint.toUrl(endpoint!, namespace), name],
        cleanedUpQueryParams
      );
      const obj: KubeObjectInterface = await clusterFetch(url, {
        cluster,
        signal,
      }).then(it => it.json());
      signal.throwIfAborted();
      setWatchSnapshot(obj.metadata?.resourceVersion);
      return new kubeObjectClass(obj, cluster) as Instance;
    },
  });

  useLayoutEffect(() => {
    if (!endpoint || !initialData) {
      return;
    }

    client.setQueryData(queryKey, initialData);
    setSeededInitialData(initialData);
    setWatchSnapshot(initialData.jsonData.metadata.resourceVersion);
  }, [client, endpoint, initialData, queryKey, setWatchSnapshot]);

  const queryData: Instance | null = query.error ? null : query.data ?? null;
  const data = initialData && seededInitialData !== initialData ? initialData : queryData;
  useLayoutEffect(() => {
    if (data && watchState.resourceVersion === null) {
      setWatchSnapshot(data.jsonData.metadata.resourceVersion);
    } else if (
      query.isSuccess &&
      !query.isPlaceholderData &&
      query.data === null &&
      watchState.resourceVersion === null &&
      !client.getQueryData<ObjectWatchState>(watchQueryKey)?.expired
    ) {
      client.setQueryData<ObjectWatchState>(watchQueryKey, previous => ({
        resourceVersion: null,
        generation: previous?.generation ?? 0,
        expired: true,
        missing: true,
      }));
      void client.invalidateQueries({ queryKey, exact: true });
    }
  }, [
    client,
    data,
    query.data,
    query.isSuccess,
    query.isPlaceholderData,
    queryKey,
    watchQueryKey,
    watchState.resourceVersion,
    setWatchSnapshot,
  ]);
  const watchReady = watchState.resourceVersion !== null && !watchState.expired;
  const multiplexerEnabled = getWebsocketMultiplexerEnabled();
  const watchResourceVersion = watchState.resourceVersion ?? '';

  const handleMessage = useCallback(
    (update: KubeListUpdateEvent<K>) => {
      const currentWatch = client.getQueryData<ObjectWatchState>(watchQueryKey);
      if (currentWatch?.expired || currentWatch?.generation !== watchState.generation) {
        return;
      }
      if (update.type === 'ERROR') {
        if (update.object && 'code' in update.object && update.object.code === 410) {
          client.setQueryData<ObjectWatchState>(watchQueryKey, {
            ...currentWatch,
            expired: true,
          });
          void client.invalidateQueries({ queryKey, exact: true });
        }
      } else if (update.type === 'DELETED') {
        client.setQueryData(queryKey, null);
        client.setQueryData<ObjectWatchState>(watchQueryKey, {
          ...currentWatch,
          missing: true,
          resourceVersion: multiplexerEnabled
            ? currentWatch.resourceVersion
            : update.object.metadata.resourceVersion ?? currentWatch.resourceVersion,
        });
      } else if (update.object) {
        // Rebuild with the cluster this hook was asked for, the same as the
        // initial fetch above. Without it the object falls back to getCluster(),
        // which reads the URL — wrong whenever the caller passed an explicit
        // cluster (details panels on the resource map) or the URL holds several
        // (`/c/a+b` resolves to just the first).
        client.setQueryData(queryKey, new kubeObjectClass(update.object, cluster));
        if (currentWatch.missing || !multiplexerEnabled) {
          client.setQueryData<ObjectWatchState>(watchQueryKey, {
            ...currentWatch,
            missing: false,
            resourceVersion: multiplexerEnabled
              ? currentWatch.resourceVersion
              : update.object.metadata.resourceVersion ?? currentWatch.resourceVersion,
          });
        }
      }
    },
    [
      client,
      queryKey,
      watchQueryKey,
      watchState.generation,
      kubeObjectClass,
      cluster,
      multiplexerEnabled,
    ]
  );

  const connectionsRequests = useMemo(() => {
    if (!endpoint) return [];

    return [
      {
        url: makeUrl([KubeObjectEndpoint.toUrl(endpoint!, namespace)], {
          ...cleanedUpQueryParams,
          watch: 1,
          resourceVersion: watchResourceVersion,
          fieldSelector: `metadata.name=${name}`,
        }),
        cluster,
        onMessage: handleMessage,
      },
    ];
  }, [
    endpoint,
    namespace,
    name,
    cleanedUpQueryParams,
    cluster,
    handleMessage,
    watchResourceVersion,
  ]);

  useWebSocket<KubeListUpdateEvent<K>>({
    url: useCallback(
      () =>
        makeUrl([KubeObjectEndpoint.toUrl(endpoint!, namespace)], {
          ...cleanedUpQueryParams,
          watch: 1,
          resourceVersion: watchResourceVersion,
          fieldSelector: `metadata.name=${name}`,
        }),
      [endpoint, namespace, cleanedUpQueryParams, name, watchResourceVersion]
    ),
    enabled: multiplexerEnabled && !!endpoint && watchReady,
    cluster,
    onMessage: handleMessage,
    retryWatch: true,
  });

  useWebSockets({
    enabled: !multiplexerEnabled && !!endpoint && watchReady,
    connections: connectionsRequests,
  });

  const missingError = useMemo(
    () =>
      watchState.missing ? new ApiError('Not found', { status: 404, cluster, namespace }) : null,
    [watchState.missing, cluster, namespace]
  );
  const error = endpointError ?? query.error ?? missingError;

  // @ts-ignore
  return {
    data,
    error,
    isError: !!error,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isSuccess: query.isSuccess && !error,
    status: error ? 'error' : query.status,
    *[Symbol.iterator](): ArrayIterator<ApiError | K | null> {
      yield data;
      yield error;
    },
  };
}

/**
 * Probes the provided endpoints and returns the first one that works.
 *
 * @param endpoints - List of possible endpoints
 * @param cluster - Target cluster name
 * @param namespace - Optional namespace scope
 * @param name - Resource name. When provided, uses GET-by-name probing
 * @returns The first endpoint that responds with an OK status
 *
 * @throws {ApiError}
 * When no endpoints are working
 */
const getWorkingEndpoint = async (
  endpoints: KubeObjectEndpoint[],
  cluster: string,
  namespace?: string,
  name?: string
) => {
  const promises = endpoints.map(endpoint => {
    const resourceUrl = KubeObjectEndpoint.toUrl(endpoint, namespace);
    // If a name is provided, we probe for that specific resource.
    // Otherwise we probe for the list of resources.
    const url = name ? makeUrl([resourceUrl, name]) : resourceUrl;

    return clusterFetch(url, {
      method: 'GET',
      cluster: cluster ?? getCluster() ?? '',
    }).then(() => endpoint);
  });

  return Promise.any(promises).catch((aggregateError: AggregateError) => {
    // when no endpoint is available, throw an error
    throw aggregateError.errors[0];
  });
};

/**
 * Returns a working endpoint for the given resource.
 *
 * It tries to find a working endpoint by probing the provided list.
 *
 * @param endpoints - List of possible endpoints
 * @param cluster - Cluster name
 * @param namespace - Optional namespace scope
 * @param name - Resource name. When provided, uses GET-by-name probing
 */
export const useEndpoints = (
  endpoints: KubeObjectEndpoint[],
  cluster: string,
  namespace?: string,
  name?: string
) => {
  const endpointsKey = useMemo(
    () => endpoints.map(ep => `${ep.group ?? ''}/${ep.version}/${ep.resource}`),
    [endpoints]
  );

  const { data: endpoint, error } = useQuery<KubeObjectEndpoint, ApiError>({
    enabled: endpoints.length > 1,
    retry: false,
    queryKey: ['endpoints', cluster, namespace, name ?? '', endpointsKey],
    queryFn: () => getWorkingEndpoint(endpoints, cluster!, namespace, name),
  });

  if (endpoints.length === 1) return { endpoint: endpoints[0], error: null };

  return { endpoint, error };
};
