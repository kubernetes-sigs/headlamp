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

import type { UseQueryResult } from '@tanstack/react-query';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getCluster } from '../cluster';
import { apiFactory, apiFactoryWithNamespace } from './api/v1/factories';
import { useSelectedClusters } from './api/v1/hooks';
import { discoverClusterApiResources } from './api/v2/apiDiscovery';
import type { ApiError } from './api/v2/ApiError';
import type { ApiResource } from './api/v2/ApiResource';
import type { useKubeObject } from './api/v2/hooks';
import type { QueryListResponse } from './api/v2/hooks';
import type { useKubeObjectList } from './api/v2/useKubeObjectList';
import {
  buildSyntheticCRDsFromDiscovery,
  findSyntheticCRDFromDiscovery,
  isForbiddenError,
} from './crdDiscovery';
import {
  describeMissingField,
  resolveCRDApiGroup,
  selectMainAPIGroup,
  validateCRDSpec,
} from './crdSpec';
import type { KubeObjectClass, KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import { ResourceClasses } from './resourceClasses';

export interface KubeCRD extends KubeObjectInterface {
  spec: {
    group: string;
    version: string;
    names: {
      plural: string;
      singular: string;
      kind: string;
      listKind: string;
      categories?: string[];
    };
    versions: {
      name: string;
      served: boolean;
      storage: boolean;
      additionalPrinterColumns: {
        name: string;
        type: string;
        jsonPath: string;
        description?: string;
        priority?: number;
        format?: string;
      }[];
    }[];
    scope: string;
    [other: string]: any;
  };
  status?: {
    acceptedNames?: {
      kind: string;
      plural: string;
      shortNames: string[];
      categories?: string[];
    };
    conditions?: {
      type: string;
      status: string;
      lastTransitionTime: string;
      reason: string;
      message: string;
    }[];
    storedVersions?: string[];
  };
}

class CustomResourceDefinition extends KubeObject<KubeCRD> {
  static kind = 'CustomResourceDefinition';
  static apiName = 'customresourcedefinitions';
  static apiVersion = ['apiextensions.k8s.io/v1'];
  static isNamespaced = false;

  static readOnlyFields = ['metadata.managedFields'];

  static get listRoute(): string {
    return 'crds';
  }

  static get detailsRoute(): string {
    return 'crd';
  }

  static useList<K extends KubeObject>(
    this: (new (...args: any) => K) & typeof KubeObject<any>,
    params: Parameters<typeof KubeObject.useList<K>>[0] = {}
  ): ReturnType<typeof useKubeObjectList<K>> {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useCRDListFallback(this, params);
  }

  static useGet<K extends KubeObject>(
    this: new (...args: any) => K,
    name: string,
    namespace?: string,
    opts?: Parameters<typeof KubeObject.useGet<K>>[2]
  ): ReturnType<typeof useKubeObject<K>> {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useCRDGetFallback(this, name, namespace, opts);
  }

  get spec(): KubeCRD['spec'] {
    return this.jsonData.spec;
  }

  get status(): KubeCRD['status'] {
    return this.jsonData.status;
  }

  /**
   * Returns the CRD's plural name. Falls back to `''` when the spec hasn't
   * fully arrived yet (#4824) to preserve backward compatibility with callers
   * that treat it as a required `string`. For an explicit "incomplete CRD"
   * signal, prefer `getMainAPIGroupOrNull()` which returns `null` in that case.
   */
  get plural(): string {
    return this.spec?.names?.plural ?? '';
  }

  /**
   * Returns [group, version, plural] for this CRD. Preserves the original
   * non-nullable signature for plugin/library consumers; returns `['', '', '']`
   * when the spec is incomplete. New callers should prefer
   * `getMainAPIGroupOrNull()` which signals the incomplete state explicitly.
   */
  getMainAPIGroup(): [string, string, string] {
    return selectMainAPIGroup(this.spec) ?? ['', '', ''];
  }

  /**
   * Returns [group, version, plural] for this CRD, or `null` when the spec is
   * incomplete (missing group, plural, or any usable version). Use this in
   * preference to `getMainAPIGroup()` when the caller needs to distinguish
   * "incomplete CRD" from a CRD that genuinely has empty fields (#4824).
   */
  getMainAPIGroupOrNull(): [string, string, string] | null {
    return selectMainAPIGroup(this.spec);
  }

  get isNamespacedScope(): boolean {
    return this.spec?.scope === 'Namespaced';
  }

  /**
   * Constructs the dynamic class for this CRD's custom resources. Preserves
   * the original non-nullable signature for plugin/library consumers; throws
   * a clear error when the spec is incomplete so callers see the same kind of
   * failure they'd see before #4824 instead of an unexpected `null`.
   * New callers should prefer `makeCRClassOrNull()`, which signals the
   * incomplete state without throwing.
   */
  makeCRClass(): typeof KubeObject<KubeCRD> {
    const spec = (this.jsonData as KubeCRD)?.spec;
    const validation = validateCRDSpec(spec);
    if (!validation.ok || !spec) {
      // Defensive fallback in case `validation.missing` is somehow empty
      // (e.g. a future change to `validateCRDSpec` skips the per-field
      // pushes for an `undefined` spec): an empty list in the rendered
      // message reads as a bug, so substitute a generic description.
      const issues =
        validation.missing.length === 0
          ? 'spec is missing'
          : validation.missing.map(describeMissingField).join(', ');
      throw new Error(
        `CustomResourceDefinition "${
          this.metadata?.name ?? '<unknown>'
        }" has an incomplete spec (missing or invalid: ${issues}). ` +
          `Use makeCRClassOrNull() if a null return is expected.`
      );
    }
    return this.buildCRClass(spec, validation.usableVersions);
  }

  /**
   * Same construction logic as `makeCRClass()` but returns `null` instead of
   * throwing when the CRD spec is incomplete. Prefer this in any code path
   * that wants to render a non-error UI state for partially-loaded or
   * malformed CRDs (#4824). Pure: no logging side effect, safe to call from
   * render paths (`useMemo`, etc).
   */
  makeCRClassOrNull(): typeof KubeObject<KubeCRD> | null {
    const spec = (this.jsonData as KubeCRD)?.spec;
    const validation = validateCRDSpec(spec);
    if (!validation.ok || !spec) {
      return null;
    }
    return this.buildCRClass(spec, validation.usableVersions);
  }

  /**
   * Internal: constructs the dynamic class from an already-validated spec.
   * Both `makeCRClass()` and `makeCRClassOrNull()` validate once and route
   * through this helper, so the construction logic isn't duplicated and
   * validation isn't repeated on the error path.
   */
  private buildCRClass(
    spec: KubeCRD['spec'],
    usableVersions: ReturnType<typeof validateCRDSpec>['usableVersions']
  ): typeof KubeObject<KubeCRD> {
    const apiInfo: CRClassArgs['apiInfo'] = usableVersions.length
      ? usableVersions.map(versionInfo => ({ group: spec.group, version: versionInfo.name }))
      : [{ group: spec.group, version: spec.version }];

    return makeCustomResourceClass({
      apiInfo,
      isNamespaced: spec.scope === 'Namespaced',
      singularName: spec.names.singular || spec.names.kind.toLowerCase(),
      pluralName: spec.names.plural,
      customResourceDefinition: this,
      kind: spec.names.kind,
    });
  }

  getCategories() {
    return this.status?.acceptedNames?.categories ?? [];
  }
}

const EMPTY_CLUSTERS: string[] = [];
const EMPTY_ITEMS: any[] = [];
const EMPTY_ERRORS: ApiError[] = [];
const EMPTY_DISCOVERY_QUERIES: Array<{
  queryKey: [string, string];
  queryFn: () => Promise<ApiResource[]>;
}> = [];

interface CombinedDiscoveryState {
  dataList: Array<ApiResource[] | undefined>;
  results: Array<{
    data: ApiResource[] | undefined;
    error: ApiError | null;
    isLoading: boolean;
    isFetching: boolean;
    isSuccess: boolean;
    dataUpdatedAt: number;
  }>;
  errors: ApiError[];
  isLoading: boolean;
  isFetching: boolean;
  isSuccess: boolean;
  latestDataUpdatedAt: number;
}

function combineDiscoveryQueries(
  results: Array<
    Pick<
      UseQueryResult<ApiResource[], Error>,
      'data' | 'error' | 'isLoading' | 'isFetching' | 'isSuccess' | 'dataUpdatedAt'
    >
  >
): CombinedDiscoveryState {
  const dataList: Array<ApiResource[] | undefined> = [];
  const errors: ApiError[] = [];
  let isLoading = false;
  let isFetching = false;
  let isSuccess = true;
  let latestDataUpdatedAt = 0;

  const mappedResults = results.map(q => {
    const err = (q.error as ApiError | null) ?? null;
    dataList.push(err ? undefined : q.data);
    if (err) {
      errors.push(err);
    }
    if (q.isLoading) {
      isLoading = true;
    }
    if (q.isFetching) {
      isFetching = true;
    }
    if (!q.isSuccess) {
      isSuccess = false;
    }
    if ((q.dataUpdatedAt || 0) > latestDataUpdatedAt) {
      latestDataUpdatedAt = q.dataUpdatedAt || 0;
    }
    return {
      data: q.data,
      error: err,
      isLoading: q.isLoading,
      isFetching: q.isFetching,
      isSuccess: q.isSuccess,
      dataUpdatedAt: q.dataUpdatedAt,
    };
  });

  return {
    dataList,
    results: mappedResults,
    errors,
    isLoading,
    isFetching,
    isSuccess,
    latestDataUpdatedAt,
  };
}

function createSyntheticCRD(data: KubeCRD, cluster?: string): CustomResourceDefinition {
  const item = new CustomResourceDefinition(data);
  if (cluster) {
    item.cluster = cluster;
  }
  return item;
}

function useCRDListFallback<K extends KubeObject>(
  targetClass: (new (...args: any) => K) & typeof KubeObject<any>,
  params: Parameters<typeof KubeObject.useList<K>>[0] = {}
): ReturnType<typeof useKubeObjectList<K>> {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const listResult = KubeObject.useList.call(targetClass, params) as any;
  const fallbackClusters = useSelectedClusters();

  const activeClusterKey = useMemo(() => {
    let raw: string[];
    if (params?.requests && params.requests.length > 0) {
      raw = Array.from(new Set(params.requests.map((r: any) => r.cluster)));
    } else if (params?.cluster) {
      raw = [params.cluster];
    } else if (params?.clusters && params.clusters.length > 0) {
      raw = params.clusters;
    } else {
      raw = fallbackClusters.length > 0 ? fallbackClusters : getCluster() ? [getCluster()!] : [''];
    }
    return raw.filter(Boolean).join('\0');
  }, [params?.cluster, params?.clusters, params?.requests, fallbackClusters]);

  const activeClusters = useMemo(
    () => (activeClusterKey ? activeClusterKey.split('\0') : EMPTY_CLUSTERS),
    [activeClusterKey]
  );

  const rawErrors = useMemo<ApiError[]>(() => {
    if (Array.isArray(listResult.errors) && listResult.errors.length > 0) {
      return listResult.errors;
    }
    return listResult.error ? [listResult.error] : EMPTY_ERRORS;
  }, [listResult.errors, listResult.error]);

  // Derive a primitive key so an un-memoized `listResult.errors` array does not
  // invalidate forbiddenClusterSet or forbiddenClusters across renders.
  const forbiddenClusterKey = (() => {
    const set = new Set<string>();
    let sawUntaggedForbidden = false;

    for (const err of rawErrors as any[]) {
      if (isForbiddenError(err)) {
        if (err?.cluster) {
          set.add(err.cluster);
        } else {
          sawUntaggedForbidden = true;
        }
      }
    }

    for (const [cluster, cr] of Object.entries(listResult.clusterResults ?? {}) as [
      string,
      any
    ][]) {
      const crErrors: any[] = [
        ...(Array.isArray(cr?.errors) ? cr.errors : []),
        ...(cr?.error ? [cr.error] : []),
      ];
      if (crErrors.some(isForbiddenError)) {
        set.add(cluster);
      }
    }

    if (set.size === 0 && sawUntaggedForbidden) {
      activeClusters.forEach(c => set.add(c));
    }

    return activeClusters.filter(c => set.has(c)).join('\0');
  })();

  const forbiddenClusters = useMemo(
    () => (forbiddenClusterKey ? forbiddenClusterKey.split('\0') : EMPTY_CLUSTERS),
    [forbiddenClusterKey]
  );

  const forbiddenClusterSet = useMemo(() => new Set(forbiddenClusters), [forbiddenClusters]);

  const discoveryQueries = useMemo(
    () =>
      forbiddenClusters.map(cluster => ({
        queryKey: ['api-discovery-crd-fallback', cluster],
        queryFn: () => discoverClusterApiResources(cluster),
      })),
    [forbiddenClusters]
  );

  const discovery = useQueries({
    queries: discoveryQueries,
    combine: combineDiscoveryQueries,
  });

  const syntheticByCluster = useMemo(() => {
    const map = new Map<string, CustomResourceDefinition[]>();
    forbiddenClusters.forEach((cluster, index) => {
      const resources = discovery.dataList[index];
      if (resources) {
        map.set(cluster, buildSyntheticCRDsFromDiscovery(resources, [cluster], createSyntheticCRD));
      }
    });
    return map;
  }, [forbiddenClusters, discovery.dataList]);

  const normalizedListItems = useMemo(() => {
    if (Array.isArray(listResult.items) && listResult.items.length === 0) {
      return EMPTY_ITEMS;
    }
    return listResult.items;
  }, [listResult.items]);

  const nonForbiddenItems = useMemo<any[]>(() => {
    if (forbiddenClusters.length === 0 || !Array.isArray(normalizedListItems)) {
      return EMPTY_ITEMS;
    }
    const filtered = normalizedListItems.filter(
      (item: any) => !item?.cluster || !forbiddenClusterSet.has(item.cluster)
    );
    return filtered.length > 0 ? filtered : EMPTY_ITEMS;
  }, [forbiddenClusters.length, normalizedListItems, forbiddenClusterSet]);

  const syntheticItems = useMemo(() => {
    if (syntheticByCluster.size === 0) {
      return EMPTY_ITEMS;
    }
    return Array.from(syntheticByCluster.values()).flat();
  }, [syntheticByCluster]);

  const hasAnyDiscoveryData = syntheticByCluster.size > 0;

  const mergedItems = useMemo(() => {
    if (forbiddenClusters.length === 0) {
      return normalizedListItems;
    }
    if (nonForbiddenItems.length === 0 && !hasAnyDiscoveryData) {
      return normalizedListItems;
    }
    return [...nonForbiddenItems, ...syntheticItems];
  }, [
    forbiddenClusters.length,
    nonForbiddenItems,
    hasAnyDiscoveryData,
    normalizedListItems,
    syntheticItems,
  ]);

  const nonForbiddenErrors = useMemo(() => {
    if (forbiddenClusters.length === 0 || rawErrors.length === 0) {
      return EMPTY_ERRORS;
    }
    const filtered = rawErrors.filter(err => !isForbiddenError(err));
    return filtered.length > 0 ? filtered : EMPTY_ERRORS;
  }, [forbiddenClusters.length, rawErrors]);

  const mergedErrorsList = useMemo(() => {
    if (nonForbiddenErrors.length === 0 && discovery.errors.length === 0) {
      return EMPTY_ERRORS;
    }
    return [...nonForbiddenErrors, ...discovery.errors];
  }, [nonForbiddenErrors, discovery.errors]);

  const clusterResults = useMemo(() => {
    if (forbiddenClusters.length === 0) {
      return listResult.clusterResults;
    }
    const next: Record<string, QueryListResponse<any, any, any>> = {
      ...(listResult.clusterResults ?? {}),
    };
    forbiddenClusters.forEach((cluster, index) => {
      const q = discovery.results[index];
      const clusterErr = q?.error ?? null;
      const clusterItems = syntheticByCluster.get(cluster) ?? null;
      next[cluster] = {
        data: null,
        error: clusterErr,
        errors: clusterErr ? [clusterErr] : null,
        isError: !!clusterErr,
        isFetching: !!q?.isFetching,
        isLoading: !!q?.isLoading,
        isSuccess: !!q?.isSuccess,
        items: clusterItems,
        status: clusterErr ? 'error' : q?.isSuccess ? 'success' : 'pending',
      };
    });
    return next;
  }, [forbiddenClusters, listResult.clusterResults, discovery.results, syntheticByCluster]);

  const fallbackResult = useMemo(() => {
    const error = mergedErrorsList[0] ?? null;
    const errors = mergedErrorsList.length > 0 ? mergedErrorsList : null;
    const isLoading = listResult.isLoading || discovery.isLoading;
    const isFetching = listResult.isFetching || discovery.isFetching;
    const isSuccess = !isLoading && mergedErrorsList.length === 0 && discovery.isSuccess;

    return {
      items: mergedItems,
      data: listResult.data,
      dataUpdatedAt: discovery.latestDataUpdatedAt || listResult.dataUpdatedAt,
      errors,
      error,
      clusterResults,
      isError: mergedErrorsList.length > 0,
      isLoading,
      isFetching,
      isSuccess,
      hasMore: listResult.hasMore ?? false,
      remainingItemCount: listResult.remainingItemCount,
      loadMore: listResult.loadMore,
      *[Symbol.iterator](): ArrayIterator<any> {
        yield mergedItems;
        yield error;
      },
    } as any;
  }, [
    mergedItems,
    mergedErrorsList,
    clusterResults,
    listResult.data,
    listResult.dataUpdatedAt,
    listResult.isLoading,
    listResult.isFetching,
    listResult.hasMore,
    listResult.remainingItemCount,
    listResult.loadMore,
    discovery.isLoading,
    discovery.isFetching,
    discovery.isSuccess,
    discovery.latestDataUpdatedAt,
  ]);

  if (forbiddenClusters.length === 0) {
    return listResult;
  }

  return fallbackResult;
}

function useCRDGetFallback<K extends KubeObject>(
  targetClass: new (...args: any) => K,
  name: string,
  namespace?: string,
  opts?: Parameters<typeof KubeObject.useGet<K>>[2]
): ReturnType<typeof useKubeObject<K>> {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const getResult = KubeObject.useGet.call(targetClass, name, namespace, opts) as any;
  const fallbackClusters = useSelectedClusters();
  const isForbidden = isForbiddenError(getResult.error);

  const targetCluster = opts?.cluster ?? getCluster() ?? '';
  const activeClusterKey = useMemo(() => {
    const raw = targetCluster
      ? [targetCluster]
      : fallbackClusters.length > 0
      ? fallbackClusters
      : [''];
    return raw.filter(Boolean).join('\0');
  }, [targetCluster, fallbackClusters]);

  const activeClusters = useMemo(
    () => (activeClusterKey ? activeClusterKey.split('\0') : EMPTY_CLUSTERS),
    [activeClusterKey]
  );

  const discoveryQueries = useMemo(
    () =>
      isForbidden
        ? activeClusters.map(cluster => ({
            queryKey: ['api-discovery-crd-fallback', cluster] as [string, string],
            queryFn: () => discoverClusterApiResources(cluster),
          }))
        : EMPTY_DISCOVERY_QUERIES,
    [isForbidden, activeClusters]
  );

  const discovery = useQueries({
    queries: discoveryQueries,
    combine: combineDiscoveryQueries,
  });

  const fallbackItem = useMemo(() => {
    if (!isForbidden) return null;
    for (let i = 0; i < activeClusters.length; i++) {
      const resources = discovery.dataList[i];
      if (!resources) continue;
      const found = findSyntheticCRDFromDiscovery(
        resources,
        name,
        activeClusters[i],
        createSyntheticCRD
      );
      if (found) {
        return found;
      }
    }
    return null;
  }, [isForbidden, activeClusters, discovery.dataList, name]);

  if (!isForbidden) {
    return getResult;
  }

  const discoveryLoading = discovery.isLoading;
  const discoveryFetching = discovery.isFetching;
  const discoveryError = discovery.errors[0] ?? null;
  const data = discoveryError ? null : fallbackItem;

  const error = discoveryError
    ? discoveryError
    : data
    ? null
    : discoveryLoading
    ? null
    : (getResult.error as ApiError | null) ?? null;
  const isLoading = getResult.isLoading || (!discoveryError && !data && discoveryLoading);
  const isFetching = getResult.isFetching || discoveryFetching;
  const isSuccess = !error && !!data;

  return {
    data,
    error,
    isError: !!error,
    isLoading,
    isFetching,
    isSuccess,
    status: error ? 'error' : isSuccess ? 'success' : 'pending',
    *[Symbol.iterator](): ArrayIterator<any> {
      yield data;
      yield error;
    },
  } as any;
}

export interface CRClassArgs {
  apiInfo: {
    group: string;
    version: string;
  }[];
  kind: string;
  pluralName: string;
  singularName: string;
  isNamespaced: boolean;
  customResourceDefinition?: CustomResourceDefinition;
}

/** @deprecated Use the version of the function that receives an object as its argument. */
export function makeCustomResourceClass(
  args: [group: string, version: string, pluralName: string][],
  isNamespaced: boolean
): KubeObjectClass;
export function makeCustomResourceClass(args: CRClassArgs): KubeObjectClass;
export function makeCustomResourceClass(
  args: [group: string, version: string, pluralName: string][] | CRClassArgs,
  isNamespaced?: boolean
): KubeObjectClass {
  let apiInfoArgs: [group: string, version: string, pluralName: string][] = [];

  if (Array.isArray(args)) {
    apiInfoArgs = args;
  } else {
    apiInfoArgs = args.apiInfo.map(info => [info.group, info.version, args.pluralName]);
  }

  // Used for tests
  if (import.meta.env.UNDER_TEST || import.meta.env.STORYBOOK) {
    const knownClass = (ResourceClasses as Record<string, KubeObjectClass>)[apiInfoArgs[0][2]];
    if (!!knownClass) {
      return knownClass;
    }
  }

  const crClassArgs = args as CRClassArgs;
  const objArgs = {
    isNamespaced: !!isNamespaced || crClassArgs.isNamespaced,
    singleName: crClassArgs.singularName || 'crd',
  };

  const apiFunc = !!objArgs.isNamespaced ? apiFactoryWithNamespace : apiFactory;
  return class CRClass extends KubeObject<any> {
    static kind = crClassArgs.kind;
    static apiName = crClassArgs.pluralName;
    static apiVersion = apiInfoArgs.map(([group, version]) =>
      group ? `${group}/${version}` : version
    );
    static isNamespaced = objArgs.isNamespaced;
    static apiEndpoint = apiFunc(...apiInfoArgs);
    static customResourceDefinition = crClassArgs.customResourceDefinition;

    static getBaseObject(): Omit<KubeObjectInterface, 'metadata'> & {
      metadata: Partial<import('./KubeMetadata').KubeMetadata>;
    } {
      // For custom resources - use the storage version from the CRD if available,
      // otherwise fall back to the first apiInfo entry
      let group: string;
      let version: string;
      const apiGroup = resolveCRDApiGroup(crClassArgs.customResourceDefinition);
      if (apiGroup) {
        [group, version] = apiGroup;
      } else {
        if (!apiInfoArgs.length) {
          throw new Error(
            'makeCustomResourceClass requires at least one apiInfo entry when customResourceDefinition is not provided'
          );
        }
        [group, version] = apiInfoArgs[0];
      }
      const apiVersion = group ? `${group}/${version}` : version;

      return {
        apiVersion,
        kind: this.kind,
        metadata: {
          name: '',
        },
      };
    }
  };
}

export default CustomResourceDefinition;
