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

/**
 * Standalone custom hooks for KubeObject data fetching.
 *
 * These hooks implement the logic that was previously embedded in static class
 * methods (KubeObject.useList, KubeObject.useGet, etc.). Extracting them into
 * module-level functions makes them valid React hook call sites and removes the
 * need for `eslint-disable-next-line react-hooks/rules-of-hooks` suppressions.
 *
 * The static class methods now simply delegate to these hooks, preserving full
 * backward compatibility for all call sites (e.g. `Pod.useList()`).
 */

import cloneDeep from 'lodash/cloneDeep';
import unset from 'lodash/unset';
import React, { useMemo } from 'react';
import { useConnectApi, useSelectedClusters } from './api/v1/hooks';
import type { QueryParameters } from './api/v1/queryParameters';
import type { ApiError } from './api/v2/ApiError';
import { useKubeObject } from './api/v2/hooks';
import { makeListRequests, useKubeObjectList } from './api/v2/useKubeObjectList';
import type { ApiListOptions, ApiListSingleNamespaceOptions, KubeObjectClass } from './KubeObject';
import type { KubeObject } from './KubeObject';
import { getAllowedNamespaces } from './KubeObject';

/**
 * Standalone hook equivalent of KubeObject.useApiList.
 *
 * Fetches a list of resources across one or more namespaces, merging results
 * as each namespace responds. Uses the legacy v1 API/watch pattern.
 *
 * @param kubeClass - The KubeObject subclass to list (e.g. Pod, Deployment).
 * @param onList - Callback called with the merged list whenever results arrive.
 * @param onError - Optional error callback.
 * @param opts - Listing options (namespace, cluster, queryParams, etc.).
 */
export function useKubeApiList<K extends KubeObject>(
  kubeClass: (new (...args: any) => K) & KubeObjectClass,
  onList: (...arg: any[]) => any,
  onError?: (err: ApiError, cluster?: string) => void,
  opts?: ApiListOptions
) {
  // Use a ref so that onObjs always sees the latest merged map without relying
  // on React executing the state-updater synchronously (which is not guaranteed
  // under concurrent rendering or StrictMode).
  const objsRef = React.useRef<{ [key: string]: K[] }>({});
  const listCallback = onList as (arg: any[]) => void;

  function onObjs(namespace: string, objList: K[]) {
    // Mutate the ref synchronously so subsequent reads in this call are correct.
    objsRef.current = { ...objsRef.current, [namespace || '']: objList };
    const allObjs = Object.values(objsRef.current).flat();
    listCallback(allObjs);
  }

  const listCalls: (() => Promise<() => void>)[] = [];
  const queryParams = cloneDeep(opts);
  let namespaces: string[] = [];
  unset(queryParams, 'namespace');

  const cluster = opts?.cluster;

  if (!!opts?.namespace) {
    if (typeof opts.namespace === 'string') {
      namespaces = [opts.namespace];
    } else if (Array.isArray(opts.namespace)) {
      namespaces = opts.namespace as string[];
    } else {
      throw Error('namespace should be a string or array of strings');
    }
  }

  if (namespaces.length === 0 && kubeClass.isNamespaced) {
    namespaces = getAllowedNamespaces(cluster ?? null);
  }

  if (namespaces.length > 0) {
    for (const namespace of namespaces) {
      listCalls.push(
        // eslint-disable-next-line react-hooks/refs
        kubeClass.apiList(objList => onObjs(namespace, objList as K[]), onError, {
          namespace,
          queryParams: queryParams as ApiListSingleNamespaceOptions['queryParams'],
          cluster,
        })
      );
    }
  } else {
    listCalls.push(
      kubeClass.apiList(listCallback, onError, {
        queryParams: queryParams as ApiListSingleNamespaceOptions['queryParams'],
        cluster,
      })
    );
  }

  useConnectApi(...listCalls);
}

/**
 * Standalone hook equivalent of KubeObject.useList.
 *
 * Fetches and watches a list of resources using the v2 API (react-query + WebSocket).
 * Supports multi-cluster and multi-namespace fetching.
 *
 * @param kubeClass - The KubeObject subclass to list.
 * @param opts - Options including cluster, namespace, refetchInterval, and query params.
 */
export function useKubeList<K extends KubeObject>(
  kubeClass: (new (...args: any) => K) & KubeObjectClass,
  {
    cluster,
    clusters,
    namespace,
    refetchInterval,
    ...queryParams
  }: {
    cluster?: string;
    clusters?: string[];
    namespace?: string | string[];
    /** How often to refetch the list. Won't refetch by default. Disables watching if set. */
    refetchInterval?: number;
  } & QueryParameters = {}
) {
  const fallbackClusters = useSelectedClusters();

  const requests = useMemo(() => {
    const clusterList = cluster
      ? [cluster]
      : clusters || (fallbackClusters.length === 0 ? [''] : fallbackClusters);

    const namespacesFromParams =
      typeof namespace === 'string'
        ? [namespace]
        : Array.isArray(namespace)
        ? namespace
        : undefined;

    return makeListRequests(
      clusterList,
      getAllowedNamespaces,
      kubeClass.isNamespaced,
      namespacesFromParams
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, clusters, fallbackClusters, namespace, kubeClass.isNamespaced]);

  return useKubeObjectList<K>({
    queryParams,
    kubeObjectClass: kubeClass,
    requests,
    refetchInterval,
  });
}

/**
 * Standalone hook equivalent of KubeObject.useGet.
 *
 * Fetches a single resource by name (and optionally namespace) using the v2 API.
 *
 * @param kubeClass - The KubeObject subclass to fetch.
 * @param name - Name of the resource.
 * @param namespace - Namespace of the resource (for namespaced resources).
 * @param opts - Additional options (cluster, queryParams).
 */
export function useKubeGet<K extends KubeObject>(
  kubeClass: (new (...args: any) => K) & KubeObjectClass,
  name: string,
  namespace?: string,
  opts?: {
    queryParams?: QueryParameters;
    cluster?: string;
    initialData?: K;
  }
) {
  return useKubeObject<K>({
    kubeObjectClass: kubeClass,
    name,
    namespace,
    cluster: opts?.cluster,
    queryParams: opts?.queryParams,
    initialData: opts?.initialData,
  });
}

/**
 * Standalone hook equivalent of KubeObject.useApiGet.
 *
 * Fetches a single resource using the legacy v1 watch API, calling `onGet`
 * whenever the resource changes.
 *
 * @param kubeClass - The KubeObject subclass to fetch.
 * @param onGet - Callback called with the fetched resource (or null).
 * @param name - Name of the resource.
 * @param namespace - Namespace of the resource (for namespaced resources).
 * @param onError - Optional error callback.
 * @param opts - Additional options (cluster, queryParams).
 */
export function useKubeApiGet<K extends KubeObject>(
  kubeClass: (new (...args: any) => K) & KubeObjectClass,
  onGet: (item: K | null) => any,
  name: string,
  namespace?: string,
  onError?: (err: ApiError | null, cluster?: string) => void,
  opts?: {
    queryParams?: QueryParameters;
    cluster?: string;
  }
) {
  const getCallback = onGet as (item: K) => void;
  useConnectApi(kubeClass.apiGet(getCallback, name, namespace, onError, opts));
}
