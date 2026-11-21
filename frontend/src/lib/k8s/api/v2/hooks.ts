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
} from './discoveredConnectionRevisions';
import {
  getResourceDiscoveryConnection,
  isDiscoveryConnectionChanged,
  recordDiscoveryConnection,
  withDiscoveryConnectionRevision,
} from './discoveryConnection';
import { clusterFetch } from './fetch';
import type { KubeListUpdateEvent } from './KubeList';
import { KubeObjectEndpoint } from './KubeObjectEndpoint';
import { makeUrl } from './makeUrl';
import { useWebSocket } from './multiplexer';
import { kubeRequestRetry } from './retry';
import { getWebsocketMultiplexerEnabled } from './useKubeObjectList';
import { isWatchRefresh, refreshWatchQuery } from './watchRefresh';
import { useWebSockets } from './webSocket';

const OBJECT_WATCH_RETRY_INTERVAL_MS = 3000;

function isTerminalWatchStatus(status?: number) {
  return status === 401 || status === 403 || status === 404;
}

function hasStatus<Status extends number>(
  error: unknown,
  status: Status
): error is ApiError & { status: Status } {
  return error instanceof ApiError && error.status === status;
}

function rejectedWithStatus(result: PromiseSettledResult<unknown>, status: number) {
  return result.status === 'rejected' && hasStatus(result.reason, status);
}

function isObjectUnavailable(error?: ApiError | null) {
  return isTerminalWatchStatus(error?.status) || isDiscoveryConnectionChanged(error);
}

// A name-filtered watch can be authorized independently of GET and LIST.
class ObjectWatchRequired extends ApiError {
  constructor(error: ApiError) {
    super(error.message, { status: 403, namespace: error.namespace, cluster: error.cluster });
  }
}

const watchOnlyObjects = new WeakSet<KubeObject>();

type ObjectWatchEvent =
  | KubeListUpdateEvent<KubeObjectInterface>
  | { type: 'BOOKMARK'; object?: { metadata?: { resourceVersion?: string } } };

function namedListParams(name: string, params: QueryParameters = {}): QueryParameters {
  const fieldSelector = [params.fieldSelector, `metadata.name=${name}`].filter(Boolean).join(',');
  return params.labelSelector
    ? { fieldSelector, labelSelector: params.labelSelector }
    : { fieldSelector };
}

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
  const connectionRevision = useDiscoveredConnectionRevisions().get(cluster);
  const multiplexerEnabled = getWebsocketMultiplexerEnabled() && connectionRevision === undefined;
  const { endpoint, error: endpointError } = useEndpoints(
    kubeObjectClass.apiEndpoint.apiInfo,
    cluster,
    namespace,
    name,
    !multiplexerEnabled
  );

  const queryParamsString = JSON.stringify(queryParams);
  const cleanedUpQueryParams = useMemo(() => {
    return Object.fromEntries(
      Object.entries(queryParams ?? {}).filter(([, value]) => value !== undefined && value !== '')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParamsString]);
  const hasSelectors = !!(cleanedUpQueryParams.fieldSelector || cleanedUpQueryParams.labelSelector);

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

  // Remember where the supplied object came from even while endpoint probing is pending.
  const [suppliedSeed, setSuppliedSeed] = useState(() => ({ initialData, connectionRevision }));
  if (initialData !== undefined && suppliedSeed.initialData !== initialData) {
    setSuppliedSeed({ initialData, connectionRevision });
  }
  const seedConnection = initialData && getResourceDiscoveryConnection(initialData);
  const currentSeed =
    !hasSelectors &&
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
      !multiplexerEnabled &&
      state.data !== undefined &&
      state.error &&
      !isObjectUnavailable(state.error)
        ? OBJECT_WATCH_RETRY_INTERVAL_MS
        : false,
    queryKey,
    queryFn: async ({ signal }) => {
      const cacheEntry = client.getQueryCache().find({ queryKey, exact: true });
      const recovering = isWatchRefresh(cacheEntry);
      const readOptions = {
        cluster,
        signal,
        expectedDiscoveryConnection: { revision: connectionRevision },
        ...(recovering ? { headers: { 'Cache-Control': 'no-cache' } } : {}),
      };
      const path = KubeObjectEndpoint.toUrl(endpoint!, namespace);
      const readParams = { ...cleanedUpQueryParams };
      if (recovering) {
        delete readParams.resourceVersion;
        delete readParams.resourceVersionMatch;
      }
      const params = withDiscoveryConnectionRevision(readParams, connectionRevision);
      const readNamedList = async () => {
        const selectors = namedListParams(name, cleanedUpQueryParams);
        const listParams = hasSelectors ? { ...readParams, ...selectors } : selectors;
        const list: { items: KubeObjectInterface[]; apiVersion: string; kind: string } =
          await clusterFetch(
            makeUrl([path], withDiscoveryConnectionRevision(listParams, connectionRevision)),
            readOptions
          ).then(response => response.json());
        const found = list.items.find(item => item.metadata.name === name);
        return found
          ? {
              ...found,
              apiVersion: found.apiVersion || list.apiVersion,
              kind: found.kind || list.kind?.replace(/List$/, '') || kubeObjectClass.kind,
            }
          : null;
      };

      let object: KubeObjectInterface | null;
      let getForbidden: ApiError | undefined;
      try {
        if (hasSelectors) {
          object = await readNamedList();
        } else {
          try {
            object = await clusterFetch(makeUrl([path, name], params), readOptions).then(response =>
              response.json()
            );
          } catch (error) {
            if (multiplexerEnabled || !hasStatus(error, 403)) throw error;
            getForbidden = error;
            object = await readNamedList();
            if (!object)
              throw new ApiError('Resource not found', { status: 404, cluster, namespace });
          }
        }
      } catch (error) {
        if (!multiplexerEnabled && hasStatus(error, 403)) {
          const verified = client.getQueryData<Instance | null>(queryKey);
          if (verified && watchOnlyObjects.has(verified)) return verified;
          if (!signal.aborted) cacheEntry?.setState({ data: null });
          throw new ObjectWatchRequired(getForbidden ?? error);
        }
        if (!signal.aborted && error instanceof ApiError && isObjectUnavailable(error)) {
          cacheEntry?.setState({ data: null });
        }
        throw error;
      }

      if (!object) return null;
      const resource = new kubeObjectClass(object, cluster) as Instance;
      if (cluster) resource.cluster = cluster;
      recordDiscoveryConnection(resource, cluster, connectionRevision);
      return resource;
    },
  });

  useLayoutEffect(() => {
    if (!currentSeed) return;
    if (!getResourceDiscoveryConnection(currentSeed) && currentSeed.cluster === cluster) {
      recordDiscoveryConnection(currentSeed, cluster, connectionRevision);
    }
    if (!endpoint) return;

    client.setQueryData(queryKey, currentSeed);
    setSeededInitialData(currentSeed);
  }, [client, endpoint, currentSeed, queryKey, cluster, connectionRevision]);

  const data = isObjectUnavailable(query.error)
    ? null
    : (currentSeed && seededInitialData !== currentSeed ? currentSeed : query.data) ?? null;

  const cacheWatchedObject = useCallback(
    (object: KubeObjectInterface, watchOnly = false) => {
      // Keep the cluster this hook was asked for, as in the initial fetch.
      const resource = new kubeObjectClass(object, cluster);
      if (cluster) resource.cluster = cluster;
      recordDiscoveryConnection(resource, cluster, connectionRevision);
      if (watchOnly) watchOnlyObjects.add(resource);
      client.setQueryData(queryKey, resource);
    },
    [client, queryKey, kubeObjectClass, cluster, connectionRevision]
  );

  const handleMessage = useCallback(
    (update: KubeListUpdateEvent<K>) => {
      if (hasSelectors && update.type === 'DELETED') {
        client.setQueryData(queryKey, null);
      } else if (
        (update.type === 'MODIFIED' ||
          update.type === 'DELETED' ||
          (hasSelectors && update.type === 'ADDED')) &&
        update.object
      ) {
        cacheWatchedObject(update.object);
      }
    },
    [cacheWatchedObject, client, hasSelectors, queryKey]
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
      ...namedListParams(name, cleanedUpQueryParams),
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
    const refreshObject = (event?: object, beforeRead?: () => void) =>
      refreshWatchQuery(client, queryKey, event, beforeRead).catch(() => {});
    const cacheEntry = client.getQueryCache().find<Instance | null, ApiError>({
      queryKey,
      exact: true,
    });
    const clearUnavailableObject = (error: ApiError) => {
      cacheEntry?.setState({ data: null, error, errorUpdatedAt: Date.now(), status: 'error' });
    };
    let refreshing: Promise<void> | undefined;
    let lastWatchVersion: string | undefined;
    let watchedObjectVersion = currentVersion();
    let bookmark: { version: string; objectVersion?: string } | undefined;
    let reconcileOnReconnect = true;

    return [
      {
        cluster,
        cacheEntry,
        expectedDiscoveryConnection: { revision: connectionRevision },
        url: watchOnly ? latestWatchUrl : makeUrl([path], watchParams),
        async getWatchUrl(reconnecting: boolean) {
          const expired = refreshing;
          refreshing = undefined;
          if (reconnecting && (expired || reconcileOnReconnect)) {
            reconcileOnReconnect = false;
            await (expired ?? refreshObject());
          }

          const objectVersion = currentVersion();
          watchedObjectVersion = objectVersion;
          // Versions are opaque. A read that changed the object supersedes the stream checkpoint.
          if (bookmark && bookmark.objectVersion !== objectVersion) bookmark = undefined;
          const version = bookmark?.version ?? objectVersion;
          const requiresWatch = cacheEntry?.state.error instanceof ObjectWatchRequired;
          if (!requiresWatch && !expired && version && version !== lastWatchVersion) {
            lastWatchVersion = version;
            return makeUrl([path], { ...watchParams, resourceVersion: version });
          }

          // An unchanged object can still have an expired version.
          lastWatchVersion = version;
          return latestWatchUrl;
        },
        onOpen(url: string, event: Event) {
          reconcileOnReconnect = true;
          // A versionless watch has no deletion event for an object already absent.
          // Reconcile after the stream is established so its events cover later changes.
          if (url === latestWatchUrl && !watchOnly && !cacheEntry?.state.error) {
            void refreshObject(event);
          }
        },
        onOpenFailure() {
          // Keep the details current while the watch retries with backoff.
          reconcileOnReconnect = true;
        },
        onClose() {
          const resource = cacheEntry?.state.data;
          if (!cacheEntry || !resource || !watchOnlyObjects.delete(resource)) return;
          if (isObjectUnavailable(cacheEntry.state.error)) return;
          clearUnavailableObject(
            new ObjectWatchRequired(
              new ApiError('Unable to verify the resource', { cluster, namespace })
            )
          );
        },
        onMessage(update: ObjectWatchEvent) {
          if (update.type === 'ERROR') {
            const status = update.object?.code;
            if (status === 410) {
              bookmark = undefined;
              refreshing = refreshObject(update);
              return;
            }

            const error = new ApiError(update.object?.message ?? 'The resource watch stopped', {
              status,
            });
            if (status === 403) {
              // A rejected WATCH does not establish that GET or LIST was revoked.
              void refreshObject(update, () => {
                const resource = cacheEntry?.state.data;
                if (resource && watchOnlyObjects.delete(resource)) {
                  cacheEntry?.setState({ data: null });
                }
              }).then(() => {
                if (cacheEntry?.state.error instanceof ObjectWatchRequired) {
                  clearUnavailableObject(error);
                }
              });
            } else if (isObjectUnavailable(error)) {
              void client.cancelQueries({ queryKey, exact: true });
              clearUnavailableObject(error);
            }
            return;
          }
          if (update.type === 'BOOKMARK') {
            const version = update.object?.metadata?.resourceVersion;
            if (version) bookmark = { version, objectVersion: watchedObjectVersion };
            return;
          }
          if (update.type === 'DELETED') {
            watchedObjectVersion = undefined;
            bookmark = undefined;
            void refreshObject(update, () => client.setQueryData(queryKey, null));
            return;
          }
          if (update.object && (update.type === 'ADDED' || update.type === 'MODIFIED')) {
            watchedObjectVersion = update.object.metadata?.resourceVersion;
            bookmark = undefined;
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
          ...namedListParams(name, cleanedUpQueryParams),
        }),
      [endpoint, namespace, cleanedUpQueryParams, name]
    ),
    enabled: multiplexerEnabled && !!endpoint && (!!data || (hasSelectors && query.isSuccess)),
    cluster,
    onMessage: handleMessage,
  });

  useWebSockets({
    enabled:
      !multiplexerEnabled &&
      !!endpoint &&
      (query.error instanceof ObjectWatchRequired ||
        ((!!data || client.getQueryState(queryKey)?.data !== undefined) &&
          !isObjectUnavailable(query.error))),
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
  connectionRevision?: string,
  allowWatchFallback = false
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
      expectedDiscoveryConnection: { revision: connectionRevision },
    }).then(() => endpoint);
  });

  return Promise.any(promises).catch(async (aggregateError: AggregateError) => {
    const connectionChanged =
      connectionRevision && aggregateError.errors.find(error => hasStatus(error, 409));
    if (connectionChanged) throw connectionChanged;

    if (allowWatchFallback && name) {
      const denied = endpoints.filter((_, index) => hasStatus(aggregateError.errors[index], 403));
      const fetch = (path: string, params: QueryParameters = {}) =>
        clusterFetch(makeUrl(path, withDiscoveryConnectionRevision(params, connectionRevision)), {
          cluster,
          expectedDiscoveryConnection: { revision: connectionRevision },
        });
      // Prefer an endpoint where LIST is authorized. If it is denied too, API
      // discovery can confirm the resource is served before trying WATCH.
      const lists = await Promise.allSettled(
        denied.map(endpoint =>
          fetch(KubeObjectEndpoint.toUrl(endpoint, namespace), namedListParams(name))
        )
      );
      const listed = lists.findIndex(result => result.status === 'fulfilled');
      if (listed >= 0) return denied[listed];

      const watchCandidates = denied.filter((_, index) => rejectedWithStatus(lists[index], 403));
      const discovery = await Promise.allSettled(
        watchCandidates.map(async endpoint => {
          const path = endpoint.group
            ? `apis/${endpoint.group}/${endpoint.version}`
            : `api/${endpoint.version}`;
          const listing: { resources?: Array<{ name: string }> } = await fetch(path).then(
            response => response.json()
          );
          return listing.resources?.some(resource => resource.name === endpoint.resource);
        })
      );
      const discovered = discovery.findIndex(
        result => result.status === 'fulfilled' && result.value
      );
      if (discovered >= 0) return watchCandidates[discovered];
      const replaced = [...lists, ...discovery].find(result => rejectedWithStatus(result, 409));
      if (replaced?.status === 'rejected') throw replaced.reason;

      // With API discovery also denied, let a watch try a candidate rather than
      // making LIST or access to the discovery URL a prerequisite for watching.
      const unknown = discovery.findIndex(result => rejectedWithStatus(result, 403));
      if (unknown >= 0) return watchCandidates[unknown];
    }

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
  name?: string,
  allowWatchFallback = false
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
      ...(allowWatchFallback ? ['watch-fallback'] : []),
      ...(connectionRevision ? [connectionRevision] : []),
    ],
    queryFn: () =>
      getWorkingEndpoint(
        endpoints,
        cluster,
        namespace,
        name,
        connectionRevision,
        allowWatchFallback
      ),
  });

  if (endpoints.length === 1) return { endpoint: endpoints[0], error: null };

  return { endpoint, error };
};
