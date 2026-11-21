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
import {
  getDiscoveredConnectionRevision,
  useDiscoveredConnectionRevisions,
  withDiscoveryConnectionRevision,
} from './discoveredConnectionRevisions';
import { getResourceDiscoveryConnection, recordDiscoveryConnection } from './discoveryConnection';
import { clusterFetch } from './fetch';
import type { KubeListUpdateEvent } from './KubeList';
import { KubeObjectEndpoint } from './KubeObjectEndpoint';
import { makeUrl } from './makeUrl';
import { useWebSocket } from './multiplexer';
import { kubeRequestRetry } from './retry';
import { getWebsocketMultiplexerEnabled } from './useKubeObjectList';
import { useWebSockets } from './webSocket';

const OBJECT_WATCH_RETRY_INTERVAL_MS = 3000;

function isTerminalWatchStatus(status?: number) {
  return status === 401 || status === 403 || status === 404;
}

// A name-filtered watch can be authorized independently of GET and LIST.
class ObjectWatchRequired extends ApiError {
  constructor(error: ApiError) {
    super(error.message, { status: 403, namespace: error.namespace, cluster: error.cluster });
  }
}

const watchOnlyObjects = new WeakSet<KubeObject>();

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
  connectionRevision = getDiscoveredConnectionRevision(cluster),
}: {
  cluster: string;
  endpoint?: KubeObjectEndpoint | null;
  namespace?: string;
  name: string;
  queryParams?: QueryParameters;
  connectionRevision?: string;
}) => [
  'object',
  cluster,
  endpoint,
  namespace ?? '',
  name,
  queryParams ?? {},
  ...(connectionRevision ? [connectionRevision] : []),
];

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

  const connectionRevision = useDiscoveredConnectionRevisions().get(cluster);
  const queryKey = useMemo(
    () =>
      kubeObjectQueryKey({
        cluster,
        name,
        namespace,
        endpoint,
        queryParams: cleanedUpQueryParams,
        connectionRevision,
      }),
    [cluster, name, namespace, endpoint, cleanedUpQueryParams, connectionRevision]
  );

  const client = useQueryClient();
  const multiplexerEnabled = getWebsocketMultiplexerEnabled() && connectionRevision === undefined;

  // Remember where the supplied object came from even while endpoint probing is pending.
  const [suppliedSeed, setSuppliedSeed] = useState(() => ({ initialData, connectionRevision }));
  if (initialData !== undefined && suppliedSeed.initialData !== initialData) {
    setSuppliedSeed({ initialData, connectionRevision });
  }
  const seedConnection = initialData && getResourceDiscoveryConnection(initialData);
  const currentSeed =
    suppliedSeed.connectionRevision === connectionRevision &&
    (!seedConnection ||
      (seedConnection.cluster === cluster && seedConnection.revision === connectionRevision))
      ? initialData
      : undefined;
  const [seededInitialData, setSeededInitialData] = useState<K | null>(null);
  const query = useQuery<Instance | null, ApiError>({
    enabled: !!endpoint,
    placeholderData: null,
    staleTime: 5000,
    retry: kubeRequestRetry,
    refetchInterval: ({ state }) =>
      !multiplexerEnabled && state.data && state.error && !isTerminalWatchStatus(state.error.status)
        ? OBJECT_WATCH_RETRY_INTERVAL_MS
        : false,
    queryKey,
    queryFn: async ({ signal }) => {
      const path = KubeObjectEndpoint.toUrl(endpoint!, namespace);
      const params = withDiscoveryConnectionRevision(cleanedUpQueryParams, connectionRevision);
      let object: KubeObjectInterface;
      try {
        object = await clusterFetch(makeUrl([path, name], params), { cluster, signal }).then(
          response => response.json()
        );
      } catch (error) {
        if (multiplexerEnabled || !(error instanceof ApiError) || error.status !== 403) throw error;
        const selector = [cleanedUpQueryParams.fieldSelector, `metadata.name=${name}`]
          .filter(Boolean)
          .join(',');
        try {
          const list: { items: KubeObjectInterface[]; apiVersion: string; kind: string } =
            await clusterFetch(
              makeUrl(
                [path],
                withDiscoveryConnectionRevision(
                  {
                    fieldSelector: selector,
                    labelSelector: cleanedUpQueryParams.labelSelector,
                  },
                  connectionRevision
                )
              ),
              { cluster, signal }
            ).then(response => response.json());
          const found = list.items.find(item => item.metadata.name === name);
          if (!found) throw new ApiError('Resource not found', { status: 404, cluster, namespace });
          object = {
            ...found,
            apiVersion: found.apiVersion || list.apiVersion,
            kind: found.kind || list.kind?.replace(/List$/, '') || kubeObjectClass.kind,
          };
        } catch (listError) {
          if (listError instanceof ApiError && listError.status === 403) {
            throw new ObjectWatchRequired(error);
          }
          throw listError;
        }
      }
      const resource = new kubeObjectClass(object, cluster) as Instance;
      recordDiscoveryConnection(resource, cluster, connectionRevision);
      return resource;
    },
  });

  useLayoutEffect(() => {
    if (!endpoint || !currentSeed) return;

    client.setQueryData(queryKey, currentSeed);
    setSeededInitialData(currentSeed);
  }, [client, endpoint, currentSeed, queryKey]);

  const queryData: Instance | null = query.error ? null : query.data ?? null;
  const data = currentSeed && seededInitialData !== currentSeed ? currentSeed : queryData;

  const cacheWatchedObject = useCallback(
    (object: KubeObjectInterface, watchOnly = false) => {
      // Keep the cluster this hook was asked for, as in the initial fetch.
      const resource = new kubeObjectClass(object, cluster);
      recordDiscoveryConnection(resource, cluster, connectionRevision);
      if (watchOnly) watchOnlyObjects.add(resource);
      client.setQueryData(queryKey, resource);
    },
    [client, queryKey, kubeObjectClass, cluster, connectionRevision]
  );

  const handleMessage = useCallback(
    (update: KubeListUpdateEvent<K>) => {
      if ((update.type === 'MODIFIED' || update.type === 'DELETED') && update.object) {
        cacheWatchedObject(update.object);
      }
    },
    [cacheWatchedObject]
  );

  const watchOnly =
    query.error instanceof ObjectWatchRequired ||
    (!!query.data && watchOnlyObjects.has(query.data));

  const connectionsRequests = useMemo(() => {
    if (!endpoint) return [];

    const path = KubeObjectEndpoint.toUrl(endpoint, namespace);
    const watchParams: QueryParameters = {
      ...withDiscoveryConnectionRevision(cleanedUpQueryParams, connectionRevision),
      watch: '1',
      fieldSelector: `metadata.name=${name}`,
    };
    const latestWatchParams = { ...watchParams };
    delete latestWatchParams.resourceVersion;
    delete latestWatchParams.resourceVersionMatch;
    delete latestWatchParams.sendInitialEvents;
    if (watchOnly) latestWatchParams.allowWatchBookmarks = 'true';

    const latestWatchUrl = makeUrl([path], latestWatchParams);
    const currentVersion = () =>
      client.getQueryData<Instance>(queryKey)?.metadata?.resourceVersion ??
      watchParams.resourceVersion;
    const refreshObject = () =>
      client.invalidateQueries({ queryKey, exact: true }, { cancelRefetch: false });
    const cacheEntry = client.getQueryCache().find<Instance | null, ApiError>({
      queryKey,
      exact: true,
    });
    let refreshing: Promise<void> | undefined;
    let lastWatchVersion: string | undefined;

    return [
      {
        cluster,
        cacheEntry,
        url: watchOnly ? latestWatchUrl : makeUrl([path], watchParams),
        async getWatchUrl(reconnecting: boolean) {
          const expired = refreshing;
          refreshing = undefined;
          if (reconnecting) await (expired ?? refreshObject());

          const version = currentVersion();
          const requiresWatch = cacheEntry?.state.error instanceof ObjectWatchRequired;
          if (!requiresWatch && !expired && version && version !== lastWatchVersion) {
            lastWatchVersion = version;
            return makeUrl([path], { ...watchParams, resourceVersion: version });
          }

          // An unchanged object can still have an expired version.
          lastWatchVersion = version;
          return latestWatchUrl;
        },
        onClose() {
          const resource = cacheEntry?.state.data;
          if (!cacheEntry || cacheEntry.state.error || !resource || !watchOnlyObjects.has(resource))
            return;
          cacheEntry.setState({
            error: new ObjectWatchRequired(
              new ApiError('Unable to verify the resource', { cluster, namespace })
            ),
            errorUpdatedAt: Date.now(),
            status: 'error',
          });
        },
        onMessage(update: KubeListUpdateEvent<KubeObjectInterface>) {
          if (update.type === 'ERROR') {
            const status = update.object?.code;
            if (status === 410) {
              refreshing = refreshObject();
            } else if (isTerminalWatchStatus(status)) {
              void client.cancelQueries({ queryKey, exact: true });
              const error = new ApiError(update.object?.message ?? 'The resource watch stopped', {
                status,
              });
              cacheEntry?.setState({ error, errorUpdatedAt: Date.now(), status: 'error' });
            }
            return;
          }
          if (update.type === 'DELETED') {
            void client.cancelQueries({ queryKey, exact: true });
            client.setQueryData(queryKey, null);
            void refreshObject();
            return;
          }
          if (update.object && (update.type === 'ADDED' || update.type === 'MODIFIED')) {
            // Let the stream update win over an older GET still in flight.
            if (client.getQueryState(queryKey)?.fetchStatus !== 'idle') {
              void client.cancelQueries({ queryKey, exact: true });
            }
            cacheWatchedObject(update.object, watchOnly);
          }
        },
      },
    ];
  }, [
    endpoint,
    namespace,
    name,
    cleanedUpQueryParams,
    cluster,
    client,
    queryKey,
    connectionRevision,
    cacheWatchedObject,
    watchOnly,
  ]);

  useWebSocket<KubeListUpdateEvent<K>>({
    url: useCallback(
      () =>
        makeUrl([KubeObjectEndpoint.toUrl(endpoint!, namespace)], {
          ...cleanedUpQueryParams,
          watch: 1,
          fieldSelector: `metadata.name=${name}`,
        }),
      [endpoint, namespace, cleanedUpQueryParams, name]
    ),
    enabled: multiplexerEnabled && !!endpoint && !!data,
    cluster,
    onMessage: handleMessage,
  });

  useWebSockets({
    enabled:
      !multiplexerEnabled &&
      !!endpoint &&
      (query.error instanceof ObjectWatchRequired ||
        ((!!(data || query.data) || (query.isSuccess && !query.isPlaceholderData)) &&
          !isTerminalWatchStatus(query.error?.status))),
    connections: connectionsRequests,
  });

  // @ts-ignore
  return {
    data,
    error: endpointError ?? query.error,
    isError: query.isError,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isSuccess: query.isSuccess,
    status: query.status,
    *[Symbol.iterator](): ArrayIterator<ApiError | K | null> {
      yield data;
      yield endpointError ?? query.error;
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
  name?: string,
  connectionRevision?: string
) => {
  const promises = endpoints.map(endpoint => {
    const resourceUrl = KubeObjectEndpoint.toUrl(endpoint, namespace);
    // If a name is provided, we probe for that specific resource.
    // Otherwise we probe for the list of resources.
    const url = makeUrl(
      name ? [resourceUrl, name] : resourceUrl,
      withDiscoveryConnectionRevision({}, connectionRevision)
    );

    return clusterFetch(url, {
      method: 'GET',
      cluster: cluster ?? getCluster() ?? '',
    }).then(() => endpoint);
  });

  return Promise.any(promises).catch((aggregateError: AggregateError) => {
    // when no endpoint is available, throw an error
    const connectionChanged =
      connectionRevision &&
      aggregateError.errors.find(error => error instanceof ApiError && error.status === 409);
    throw connectionChanged || aggregateError.errors[0];
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

  const connectionRevision = useDiscoveredConnectionRevisions().get(cluster);
  const { data: endpoint, error } = useQuery<KubeObjectEndpoint, ApiError>({
    enabled: endpoints.length > 1,
    retry: (failureCount, error) =>
      !!connectionRevision &&
      error.status === 409 &&
      typeof kubeRequestRetry === 'function' &&
      kubeRequestRetry(failureCount, error),
    queryKey: [
      'endpoints',
      cluster,
      namespace,
      name ?? '',
      endpointsKey,
      ...(connectionRevision ? [connectionRevision] : []),
    ],
    queryFn: () => getWorkingEndpoint(endpoints, cluster!, namespace, name, connectionRevision),
  });

  if (endpoints.length === 1) return { endpoint: endpoints[0], error: null };

  return { endpoint, error };
};
