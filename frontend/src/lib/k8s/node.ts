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

import { useQueries } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { useErrorState } from '../util';
import { useConnectApi } from '.';
import { testAuth } from './api/v1/clusterApi';
import { useSelectedClusters } from './api/v1/hooks';
import { metrics } from './api/v1/metricsApi';
import { extractResourceNamesRestriction } from './api/v1/rbacResourceNames';
import type { ApiError } from './api/v2/ApiError';
import type { QueryStatus } from './api/v2/hooks';
import { getWorkingEndpoint } from './api/v2/hooks';
import type { KubeObjectEndpoint } from './api/v2/KubeObjectEndpoint';
import { KubeNodeSummaryStats, nodeSummaryStats } from './api/v2/nodeSummaryApi';
import { kubeObjectListQuery, ListResponse } from './api/v2/useKubeObjectList';
import type { KubeCondition, KubeMetrics } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import { NODE_POOL_LABEL_KEYS } from './nodeConstants';

/**
 * Restricted-cluster list requests (see the resourceNames-restricted branch of
 * {@link Node.useList}) fetch each authorized node individually via kubeObjectListQuery,
 * which doesn't participate in KubeObject.useList's live watch wiring. Without a watch,
 * restricted users would see a single static snapshot that never updates. Poll as a
 * fallback when the caller didn't already request a refetchInterval — matches the
 * cadence Overview.tsx uses for its own Node.useList call (OVERVIEW_REFETCH_INTERVAL_MS).
 */
const RESTRICTED_LIST_REFETCH_INTERVAL_MS = 60_000;

export interface KubeNode extends KubeObjectInterface {
  status: {
    addresses?: {
      address: string;
      type: string;
    }[];
    /**
     * Resource quantities keyed by their k8s name (e.g. cpu, memory, pods, ephemeral-storage).
     * Note: keys are kebab-case as returned by the API, not camelCase.
     */
    allocatable?: { [key: string]: string };
    capacity?: { [key: string]: string };
    conditions?: (Omit<KubeCondition, 'lastProbeTime' | 'lastUpdateTime'> & {
      lastHeartbeatTime: string;
    })[];
    nodeInfo?: {
      architecture: string;
      bootID: string;
      containerRuntimeVersion: string;
      kernelVersion: string;
      kubeProxyVersion: string;
      kubeletVersion: string;
      machineID: string;
      operatingSystem: string;
      osImage: string;
      systemUUID: string;
    };
  };
  spec: {
    podCIDR: string;
    taints: {
      key: string;
      value?: string;
      effect: string;
    }[];
    [otherProps: string]: any;
  };
}

class Node extends KubeObject<KubeNode> {
  static kind = 'Node';
  static apiName = 'nodes';
  static apiVersion = 'v1';
  static isNamespaced = false;

  /**
   * Lists Nodes, same as {@link KubeObject.useList}, but additionally respects RBAC rules
   * that restrict "list nodes" to a specific set of resourceNames.
   *
   * The Kubernetes API rejects an unfiltered `list nodes` request for a ServiceAccount whose
   * RBAC rule is scoped with `resourceNames`, unless the request carries a matching
   * `fieldSelector=metadata.name=<name>`. When such a restriction is detected for a cluster,
   * this issues one list request per authorized name for that cluster (field selectors are
   * AND-only, so multiple names can't be combined into a single request) and merges the
   * results, instead of the normal unfiltered list call. Clusters without a resourceNames
   * restriction are listed normally, unchanged from the default behavior.
   */
  static useList<K extends KubeObject>(
    this: (new (...args: any) => K) & typeof KubeObject<any>,
    {
      cluster,
      clusters,
      refetchInterval,
      ...queryParams
    }: {
      cluster?: string;
      clusters?: string[];
      refetchInterval?: number;
    } & Record<string, any> = {}
  ) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const fallbackClusters = useSelectedClusters();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const clusterList = useMemo(
      () =>
        cluster ? [cluster] : clusters || (fallbackClusters.length === 0 ? [''] : fallbackClusters),
      [cluster, clusters, fallbackClusters]
    );

    // Reuse AuthRoute's ['auth', cluster] query — testAuth() posts the same
    // SelfSubjectRulesReview this needs, so sharing the key avoids firing a second,
    // redundant request on every Nodes page load (see RouteSwitcher.tsx).
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const restrictionResults = useQueries({
      queries: clusterList.map(clusterName => ({
        queryKey: ['auth', clusterName],
        queryFn: () => testAuth(clusterName),
        // RBAC rules essentially never change mid-session; avoid re-checking on every render.
        staleTime: 5 * 60 * 1000,
        retry: 0,
      })),
    });

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const restrictionByCluster = useMemo(() => {
      const map = new Map<string, { names: string[] | null; isLoading: boolean }>();
      clusterList.forEach((clusterName, i) => {
        const result = restrictionResults[i];
        // If the shared auth review failed, don't block the normal list request on it —
        // same fallback fetchResourceNamesRestriction used to apply internally.
        const names = result?.isError
          ? null
          : result?.data
          ? extractResourceNamesRestriction(result.data, '', 'nodes', 'list')
          : null;
        map.set(clusterName, {
          names,
          isLoading: result?.isLoading ?? true,
        });
      });
      return map;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clusterList, restrictionResults]);

    // Clusters whose restriction check has resolved and confirmed unrestricted. These get
    // the normal, unfiltered fetch. Pending clusters are handled separately below
    // (see pendingClusters) so we don't send an unfiltered request that might 403 for a
    // cluster that turns out to be restricted.

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const unrestrictedClusters = useMemo(
      () =>
        clusterList.filter(clusterName => {
          const restriction = restrictionByCluster.get(clusterName);
          return !!restriction && !restriction.isLoading && restriction.names === null;
        }),
      [clusterList, restrictionByCluster]
    );

    // Clusters whose restriction check hasn't resolved yet. These are excluded from both
    // the unfiltered fetch (to avoid a transient 403) and the restricted fetch (we don't yet
    // know which names, if any, they're scoped to) — they only contribute to the overall
    // loading state until the check resolves.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const pendingClusters = useMemo(
      () =>
        clusterList.filter(clusterName => {
          const restriction = restrictionByCluster.get(clusterName);
          return !restriction || restriction.isLoading;
        }),
      [clusterList, restrictionByCluster]
    );

    const defaultResult = KubeObject.useList.call(this, {
      ...queryParams,
      cluster: undefined,
      clusters: unrestrictedClusters,
      refetchInterval,
    }) as ReturnType<typeof KubeObject.useList<K>>;

    // Resolve a working endpoint per cluster (not once from clusterList[0]) — endpoints can
    // be cluster-specific, so reusing a single cluster's endpoint for every cluster's request
    // can route restricted queries to the wrong API server. useQueries lets us do this
    // without violating the rules of hooks even as clusterList's length varies.
    const apiInfo = this.apiEndpoint.apiInfo;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const endpointsKey = useMemo(
      () => apiInfo.map(ep => `${ep.group ?? ''}/${ep.version}/${ep.resource}`),
      [apiInfo]
    );

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const endpointResults = useQueries({
      queries: clusterList.map(clusterName => ({
        queryKey: ['endpoints', clusterName, '', '', endpointsKey],
        queryFn: () => getWorkingEndpoint(apiInfo, clusterName),
        enabled: apiInfo.length > 1,
      })),
    });

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const endpointByCluster = useMemo(() => {
      const map = new Map<string, KubeObjectEndpoint | undefined>();
      clusterList.forEach((clusterName, i) => {
        map.set(clusterName, apiInfo.length === 1 ? apiInfo[0] : endpointResults[i]?.data);
      });
      return map;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clusterList, apiInfo, endpointResults]);

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const restrictedRequests = useMemo(() => {
      const requests: Array<{ cluster: string; name: string }> = [];
      clusterList.forEach(clusterName => {
        const restriction = restrictionByCluster.get(clusterName);
        if (restriction && !restriction.isLoading && restriction.names) {
          restriction.names.forEach(name => requests.push({ cluster: clusterName, name }));
        }
      });
      return requests;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clusterList, restrictionByCluster]);

    // Mirrors exactly which requests restrictedListResults' queries array includes (any
    // request whose cluster's endpoint isn't resolved yet is skipped below), so this stays
    // index-aligned with restrictedListResults for the per-cluster grouping further down.
    const includedRestrictedRequests = restrictedRequests.filter(({ cluster: clusterName }) =>
      endpointByCluster.get(clusterName)
    );

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const restrictedListResults = useQueries({
      queries: includedRestrictedRequests.map(({ cluster: clusterName, name }) =>
        kubeObjectListQuery<K>(
          this,
          endpointByCluster.get(clusterName)!,
          undefined,
          clusterName,
          {
            ...queryParams,
            fieldSelector: [queryParams.fieldSelector, `metadata.name=${name}`]
              .filter(Boolean)
              .join(','),
          },
          refetchInterval ?? RESTRICTED_LIST_REFETCH_INTERVAL_MS
        )
      ),
    }) as Array<{
      data: ListResponse<K> | undefined | null;
      error: ApiError | null;
      isLoading: boolean;
      isFetching: boolean;
      isError: boolean;
      isSuccess: boolean;
    }>;

    const isPending = pendingClusters.length > 0;

    if (restrictedRequests.length === 0) {
      if (!isPending) {
        // Cast: TS can't see that this matches KubeObject.useList's declared return type
        // exactly (it's the same object KubeObject.useList itself returns).
        return defaultResult as ReturnType<typeof KubeObject.useList<K>>;
      }
      // Some clusters' restriction checks haven't resolved yet — report pending rather than
      // surfacing defaultResult's (possibly already-successful) status for the other clusters.
      return {
        ...defaultResult,
        isLoading: true,
        isSuccess: false,
        status: 'pending' as QueryStatus,
      } as ReturnType<typeof KubeObject.useList<K>>;
    }

    const restrictedItems = restrictedListResults
      .filter(result => !!result.data)
      .flatMap(result => result.data!.list.items);
    const restrictedErrors = restrictedListResults
      .map(result => result.error)
      .filter((error): error is ApiError => !!error);

    // If we have restricted requests to make but the endpoint hasn't resolved yet,
    // restrictedListResults will be empty (queries: [] above) — treat that as still loading
    // rather than letting `.some()`/`.every()` on an empty array report false/true.
    const restrictedEndpointPending = restrictedRequests.some(
      ({ cluster: clusterName }) => !endpointByCluster.get(clusterName)
    );
    const restrictedIsLoading =
      restrictedEndpointPending || restrictedListResults.some(result => result.isLoading);
    const restrictedIsFetching =
      restrictedEndpointPending || restrictedListResults.some(result => result.isFetching);
    const restrictedIsSuccess =
      !restrictedEndpointPending && restrictedListResults.every(result => result.isSuccess);

    // Once every applicable request (default + restricted) has settled, report an empty
    // array rather than null — null signals "still loading" to consumers like
    // ResourceTable, so an all-restricted-and-empty result would otherwise spin forever.
    const allSettled = !isPending && !restrictedIsLoading;
    const items =
      defaultResult.items || restrictedItems.length || allSettled
        ? [...(defaultResult.items ?? []), ...restrictedItems]
        : null;
    const errors = [...(defaultResult.errors ?? []), ...restrictedErrors];
    const isError = defaultResult.isError || restrictedErrors.length > 0;
    const isLoading = isPending || defaultResult.isLoading || restrictedIsLoading;
    const isSuccess = !isPending && defaultResult.isSuccess && restrictedIsSuccess;
    const status: QueryStatus = isError ? 'error' : isLoading ? 'pending' : 'success';

    // Group restricted per-name results back by cluster and merge them into
    // defaultResult.clusterResults, so callers relying on the useList clusterResults
    // contract (see api/v2/hooks.ts QueryListResponse) see restricted clusters too, not
    // just unrestricted ones, which is all defaultResult itself covers.
    const restrictedClusterResults: Record<
      string,
      {
        data: K[];
        error: ApiError | null;
        errors: ApiError[] | null;
        items: K[] | null;
        isLoading: boolean;
        isFetching: boolean;
        isError: boolean;
        isSuccess: boolean;
        status: QueryStatus;
      }
    > = {};
    includedRestrictedRequests.forEach(({ cluster: clusterName }) => {
      if (restrictedClusterResults[clusterName]) return; // already built for this cluster
      const resultsForCluster = restrictedListResults.filter(
        (_, j) => includedRestrictedRequests[j].cluster === clusterName
      );
      const clusterItems = resultsForCluster
        .filter(result => !!result.data)
        .flatMap(result => result.data!.list.items);
      const clusterErrors = resultsForCluster
        .map(result => result.error)
        .filter((error): error is ApiError => !!error);
      const clusterIsLoading = resultsForCluster.some(result => result.isLoading);
      const clusterIsError = clusterErrors.length > 0;
      const clusterIsSuccess = resultsForCluster.every(result => result.isSuccess);
      restrictedClusterResults[clusterName] = {
        data: clusterItems,
        error: clusterErrors[0] ?? null,
        errors: clusterErrors.length ? clusterErrors : null,
        items: clusterItems,
        isLoading: clusterIsLoading,
        isFetching: resultsForCluster.some(result => result.isFetching),
        isError: clusterIsError,
        isSuccess: clusterIsSuccess,
        status: clusterIsError ? 'error' : clusterIsLoading ? 'pending' : 'success',
      };
    });

    return {
      ...defaultResult,
      items,
      data: items,
      error: errors[0] ?? null,
      errors: errors.length ? errors : null,
      isLoading,
      isFetching: defaultResult.isFetching || restrictedIsFetching,
      isError,
      isSuccess,
      status,
      clusterResults: { ...defaultResult.clusterResults, ...restrictedClusterResults },
      [0]: items,
      [1]: errors[0] ?? null,
      [Symbol.iterator]: function* () {
        yield items;
        yield errors[0] ?? null;
      },
    } as ReturnType<typeof KubeObject.useList<K>>;
  }

  get status(): KubeNode['status'] {
    return this.jsonData.status;
  }

  get spec(): KubeNode['spec'] {
    return this.jsonData.spec;
  }

  static useMetrics(cluster?: string): [KubeMetrics[] | null, ApiError | null] {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [nodeMetrics, setNodeMetrics] = React.useState<KubeMetrics[] | null>(null);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [error, setError] = useErrorState(setNodeMetrics);

    function setMetrics(metrics: KubeMetrics[]) {
      setNodeMetrics(metrics);

      if (metrics !== null) {
        setError(null);
      }
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useConnectApi(
      metrics.bind(null, '/apis/metrics.k8s.io/v1beta1/nodes', setMetrics, setError, cluster)
    );

    return [nodeMetrics, error];
  }

  static useNodeSummaryStats(
    nodeName?: string,
    cluster?: string
  ): [KubeNodeSummaryStats | null, ApiError | null] {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [summaryStats, setSummaryStats] = React.useState<KubeNodeSummaryStats | null>(null);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [error, setError] = useErrorState(setSummaryStats);

    function setStats(stats: KubeNodeSummaryStats) {
      setSummaryStats(stats);

      if (stats !== null) {
        setError(null);
      }
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useConnectApi(nodeSummaryStats.bind(null, nodeName || '', setStats, setError, cluster));

    return [summaryStats, error];
  }

  getExternalIP(): string {
    return this.status.addresses?.find(address => address.type === 'ExternalIP')?.address || '';
  }

  getInternalIP(): string {
    return this.status.addresses?.find(address => address.type === 'InternalIP')?.address || '';
  }

  /**
   * Roles derived from the conventional `node-role.kubernetes.io/<role>` labels.
   *
   * @see {@link https://kubernetes.io/docs/reference/labels-annotations-taints/#node-role-kubernetes-io}
   */
  getRoles(): string[] {
    const labels = this.metadata?.labels ?? {};
    const rolePrefix = 'node-role.kubernetes.io/';
    return Object.keys(labels)
      .filter(key => key.startsWith(rolePrefix))
      .map(key => key.slice(rolePrefix.length));
  }

  /**
   * Returns the node pool name from well-known cloud provider labels.
   * Supports GKE, AKS, EKS, kOps, and Cluster API.
   */
  getNodePool(): string {
    const labels = this.metadata.labels ?? {};
    for (const key of NODE_POOL_LABEL_KEYS) {
      if (labels[key] !== undefined) {
        return labels[key];
      }
    }
    return '';
  }
}

// Re-export for plugin compatibility. Import directly from nodeConstants.ts
// when only the label keys are needed to avoid loading the Node implementation.
export { NODE_POOL_LABEL_KEYS };

export default Node;
