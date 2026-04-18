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
import { useMemo } from 'react';
import { getCluster } from '../../../cluster';
import type { QueryParameters } from '../../api/v1/queryParameters';
import type { KubeObject, KubeObjectInterface } from '../../KubeObject';
import type { ApiError } from './ApiError';
import { clusterFetch } from './fetch';
import type { KubeListUpdateEvent } from './KubeList';
import { KubeObjectEndpoint } from './KubeObjectEndpoint';
import { makeUrl } from './makeUrl';
import { useWebSocket } from './multiplexer';
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

/**
 * Returns a single KubeObject.
 */
export function useKubeObject<K extends KubeObject>({
  kubeObjectClass,
  namespace,
  name,
  cluster = getCluster() ?? '',
  queryParams,
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
}): [K | null, ApiError | null] & QueryResponse<K, ApiError> {
  type Instance = K;
  const { endpoint, error: endpointError } = useEndpoints(
    kubeObjectClass.apiEndpoint.apiInfo,
    cluster,
    namespace,
    name
  );

  const cleanedUpQueryParams = Object.fromEntries(
    Object.entries(queryParams ?? {}).filter(([, value]) => value !== undefined && value !== '')
  );

  const queryKey = useMemo(
    () =>
      kubeObjectQueryKey({ cluster, name, namespace, endpoint, queryParams: cleanedUpQueryParams }),
    [endpoint, namespace, name]
  );

  const client = useQueryClient();
  const query = useQuery<Instance | null, ApiError>({
    enabled: !!endpoint,
    placeholderData: null,
    staleTime: 5000,
    queryKey,
    queryFn: async () => {
      const url = makeUrl(
        [KubeObjectEndpoint.toUrl(endpoint!, namespace), name],
        cleanedUpQueryParams
      );
      const obj: KubeObjectInterface = await clusterFetch(url, {
        cluster,
      }).then(it => it.json());
      return new kubeObjectClass(obj, cluster) as Instance;
    },
  });

  const data: Instance | null = query.error ? null : query.data ?? null;

  const connectionsRequests = useMemo(() => {
    if (!endpoint) return [];

    return [
      {
        url: makeUrl([KubeObjectEndpoint.toUrl(endpoint!, namespace)], {
          ...cleanedUpQueryParams,
          watch: 1,
          fieldSelector: `metadata.name=${name}`,
        }),
        cluster,
        onMessage(update: KubeListUpdateEvent<K>) {
          if (update.type !== 'ADDED' && update.object) {
            client.setQueryData(queryKey, new kubeObjectClass(update.object));
          }
        },
      },
    ];
  }, [endpoint]);

  // Breaking rules of hooks here a little but
  // getWebsocketMultiplexerEnabled is a feature toggle
  // and not a variable so this `if` should never change during runtime
  if (getWebsocketMultiplexerEnabled()) {
    useWebSocket<KubeListUpdateEvent<K>>({
      url: () =>
        makeUrl([KubeObjectEndpoint.toUrl(endpoint!)], {
          ...cleanedUpQueryParams,
          watch: 1,
          fieldSelector: `metadata.name=${name}`,
        }),
      enabled: !!endpoint && !!data,
      cluster,
      onMessage(update: KubeListUpdateEvent<K>) {
        if (update.type !== 'ADDED' && update.object) {
          client.setQueryData(queryKey, new kubeObjectClass(update.object));
        }
      },
    });
  } else {
    useWebSockets({
      enabled: !!endpoint && !!data,
      connections: connectionsRequests,
    });
  }

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
    queryKey: ['endpoints', cluster, namespace, name ?? '', endpointsKey],
    queryFn: () => getWorkingEndpoint(endpoints, cluster!, namespace, name),
  });

  if (endpoints.length === 1) return { endpoint: endpoints[0], error: null };

  return { endpoint, error };
};
