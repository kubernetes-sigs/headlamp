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

import type { ApiResource } from './ApiResource';
import { clusterFetch } from './fetch';

/**
 * Maximum number of top-level keys retained when summarizing an aggregated
 * discovery payload that arrived in an unexpected shape. Exported so the
 * test suite can pin the contract without hard-coding the value in two
 * places.
 */
export const MAX_SUMMARY_KEYS = 10;
const MAX_STRING_PREVIEW = 200;

/**
 * Discriminated shape returned by `summarizeAggregatedPayload`. Documents the
 * contract for callers/tests so they can pattern-match instead of duck-typing.
 */
export type PayloadSummary =
  | { type: 'null' }
  | { type: 'array'; length: number }
  | { type: 'object'; keys: string[]; truncated: boolean }
  | { type: 'string'; length: number; preview: string }
  | { type: 'number' | 'boolean' | 'undefined' | 'bigint' | 'symbol' | 'function'; value: unknown };

/**
 * Produces a bounded representation of an aggregated-discovery payload for
 * fallback debug logs. A real discovery response can carry thousands of
 * entries; dumping it to the console slows devtools and buries the actual
 * "why was this unusable" signal. We log the value's type plus the first few
 * top-level keys, which is enough to tell a missing `items` array apart from
 * a wholly unexpected shape without flooding the log. `null` and arrays are
 * handled separately so the type tag matches what the body actually was
 * (`typeof null === 'object'` would otherwise mislead, and `Object.keys` on
 * an array returns its indices, which is not useful diagnostically).
 */
function summarizeAggregatedPayload(value: unknown): PayloadSummary {
  if (value === null) {
    return { type: 'null' };
  }
  if (Array.isArray(value)) {
    return { type: 'array', length: value.length };
  }
  if (typeof value === 'object') {
    // Iterate with `for...in` and break early rather than `Object.keys` or
    // `Object.getOwnPropertyNames`, both of which would materialize every
    // own key into an array first and undo the "bounded" promise on a
    // payload with thousands of entries. `truncated` signals to the reader
    // that more keys exist; we deliberately don't report a full keyCount
    // since computing it requires the same full enumeration we're avoiding.
    const keys: string[] = [];
    let truncated = false;
    for (const k in value) {
      if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
      if (keys.length < MAX_SUMMARY_KEYS) {
        keys.push(k);
      } else {
        truncated = true;
        break;
      }
    }
    return { type: 'object', keys, truncated };
  }
  if (typeof value === 'string') {
    // A successful JSON parse of a non-object body (e.g. a stray HTML proxy
    // page surfacing through `res.json()`) can produce an arbitrarily long
    // string; bound it so the log stays readable.
    return { type: 'string', length: value.length, preview: value.slice(0, MAX_STRING_PREVIEW) };
  }
  return {
    type: typeof value as 'number' | 'boolean' | 'undefined' | 'bigint' | 'symbol' | 'function',
    value,
  };
}

/**
 * Logs that one side of the aggregated discovery (`/api` or `/apis`) was
 * unusable. Failed fetches arrive as rejected results; missing or malformed
 * payloads arrive as fulfilled results whose `value` lacks an `items` array.
 * Bundled so the message format and summary behavior stay aligned between
 * the two paths.
 */
function logAggregatedUnusable(
  path: '/api' | '/apis',
  cluster: string,
  result: PromiseSettledResult<unknown>
): void {
  // Error rejections are small and useful as-is (stack, message). Anything
  // else might be a wrapped payload that is itself huge, so route it through
  // the same bounded summarizer used for fulfilled-but-malformed bodies.
  const detail =
    result.status === 'rejected'
      ? result.reason instanceof Error
        ? result.reason
        : summarizeAggregatedPayload(result.reason)
      : summarizeAggregatedPayload(result.value);
  console.debug(
    `Aggregated ${path} discovery unusable for cluster ${cluster}; falling back to legacy:`,
    detail
  );
}

/**
 * Fetches one side of legacy discovery and logs/swallows any failure.
 * `clusterFetch` is not bare `fetch`: it already throws an `ApiError` on any
 * non-ok response (see `fetch.ts`), so non-2xx HTTP responses surface as
 * rejected promises and reach this `.catch` the same way a network failure
 * does. A `res.json()` parse rejection lands here too, so the log says
 * "fetch or parse" rather than just "fetch".
 */
function fetchLegacyOrLogFailure(
  path: '/api' | '/apis',
  cluster: string
): Promise<Record<string, unknown> | null> {
  return clusterFetch(path, { cluster })
    .then(res => res.json())
    .then(parsed => {
      // `res.json()` can return any JSON value (object, array, string,
      // number, boolean, null). Legacy discovery callers only care about
      // the `versions`/`groups` properties on an object body, so coerce
      // non-object bodies to null up front. We return a plain
      // `Record<string, unknown>` rather than typing `versions`/`groups` as
      // `unknown[]` so the type doesn't over-promise arrayness for fields
      // the helper itself never validates; callers `Array.isArray` to
      // narrow.
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    })
    .catch(err => {
      console.debug(`Legacy ${path} discovery fetch or parse failed for cluster ${cluster}:`, err);
      return null;
    });
}

/**
 * Processes the items from an aggregated API discovery response.
 * @param items - The array of discovery items from the Kubernetes API discovery endpoint
 * @param resultMap - Map to store the processed ApiResource objects
 */
function processAggregatedDiscoveryItems(items: any[], resultMap: Map<string, ApiResource>): void {
  items.forEach(
    (item: {
      metadata?: { name?: string };
      versions?: { resources?: any[]; version: string }[];
    }) => {
      const groupName = item.metadata?.name;
      if (item.versions && item.versions.length > 0) {
        const versionEntry = item.versions[0];
        if (versionEntry && typeof versionEntry.version === 'string') {
          const version = versionEntry.version;
          (versionEntry.resources || []).forEach(
            (resource: {
              verbs?: string[];
              resource?: string;
              singularResource?: string;
              responseKind?: { kind?: string };
              scope?: string;
            }) => {
              if (
                !resource.verbs ||
                !resource.verbs.includes('list') ||
                !resource.resource ||
                !resource.responseKind?.kind ||
                resource.responseKind?.kind.endsWith('List')
              ) {
                return;
              }

              const pluralName = resource.resource;
              const singularName = resource.singularResource || '';
              const kind = resource.responseKind.kind;
              const isNamespaced = resource.scope === 'Namespaced';
              const apiVersion = groupName ? `${groupName}/${version}` : version;

              const resourceObj: ApiResource = {
                apiVersion,
                version,
                groupName,
                pluralName,
                singularName,
                kind,
                isNamespaced,
              };
              resultMap.set(resourceObj.apiVersion + resourceObj.pluralName, resourceObj);
            }
          );
        }
      }
    }
  );
}

/**
 * Processes the items from a legacy (unaggregated) API discovery response.
 */
function processLegacyApiResourceList(
  resources: any[],
  groupName: string | undefined,
  version: string,
  resultMap: Map<string, ApiResource>
): void {
  resources.forEach(
    (resource: {
      name?: string;
      singularName?: string;
      namespaced?: boolean;
      kind?: string;
      verbs?: string[];
    }) => {
      if (
        !resource.verbs ||
        !resource.verbs.includes('list') ||
        !resource.name ||
        !resource.kind ||
        resource.kind.endsWith('List')
      ) {
        return;
      }

      const pluralName = resource.name;
      const singularName = resource.singularName || '';
      const kind = resource.kind;
      const isNamespaced = !!resource.namespaced;
      const apiVersion = groupName ? `${groupName}/${version}` : version;

      const resourceObj: ApiResource = {
        apiVersion,
        version,
        groupName,
        pluralName,
        singularName,
        kind,
        isNamespaced,
      };
      resultMap.set(resourceObj.apiVersion + resourceObj.pluralName, resourceObj);
    }
  );
}

/**
 * Discovers available API resources from Kubernetes clusters.
 * - Only resources that support the 'list' verb are included in the results
 *
 * @param clusters - An array of cluster names to discover API resources from
 * @returns list of API resources
 *
 */
export async function apiDiscovery(clusters: string[]): Promise<ApiResource[]> {
  const resultMap = new Map<string, ApiResource>();

  for (const cluster of clusters) {
    let useFallback = false;

    try {
      const apiAggregatedPromise = clusterFetch('/api', {
        cluster,
        headers: { Accept: 'application/json;v=v2;g=apidiscovery.k8s.io;as=APIGroupDiscoveryList' },
      }).then(res => res.json());

      const apisAggregatedPromise = clusterFetch('/apis', {
        cluster,
        headers: { Accept: 'application/json;v=v2;g=apidiscovery.k8s.io;as=APIGroupDiscoveryList' },
      }).then(res => res.json());

      const [apiAggregatedResult, apisAggregatedResult] = await Promise.allSettled([
        apiAggregatedPromise,
        apisAggregatedPromise,
      ]);

      let apiAggregatedOk = false;
      if (
        apiAggregatedResult.status === 'fulfilled' &&
        apiAggregatedResult.value &&
        Array.isArray(apiAggregatedResult.value.items)
      ) {
        processAggregatedDiscoveryItems(apiAggregatedResult.value.items, resultMap);
        apiAggregatedOk = true;
      }

      let apisAggregatedOk = false;
      if (
        apisAggregatedResult.status === 'fulfilled' &&
        apisAggregatedResult.value &&
        Array.isArray(apisAggregatedResult.value.items)
      ) {
        processAggregatedDiscoveryItems(apisAggregatedResult.value.items, resultMap);
        apisAggregatedOk = true;
      }

      if (!apiAggregatedOk) {
        logAggregatedUnusable('/api', cluster, apiAggregatedResult);
      }
      if (!apisAggregatedOk) {
        logAggregatedUnusable('/apis', cluster, apisAggregatedResult);
      }
      if (!apiAggregatedOk || !apisAggregatedOk) {
        useFallback = true;
      }
    } catch (error) {
      console.debug(
        `Aggregated API discovery threw for cluster ${cluster}; falling back to legacy:`,
        error
      );
      useFallback = true;
    }

    if (useFallback) {
      try {
        const [coreApiVersionsData, apiGroupsData] = await Promise.all([
          fetchLegacyOrLogFailure('/api', cluster),
          fetchLegacyOrLogFailure('/apis', cluster),
        ]);

        if (coreApiVersionsData && Array.isArray(coreApiVersionsData.versions)) {
          const coreResourceFetchPromises = coreApiVersionsData.versions.map(async (v: any) => {
            try {
              if (typeof v === 'string' && v.length > 0) {
                const coreResourcesResponse = await clusterFetch(`/api/${v}`, { cluster });
                const coreResources = await coreResourcesResponse.json();
                if (coreResources && Array.isArray(coreResources.resources)) {
                  processLegacyApiResourceList(coreResources.resources, undefined, v, resultMap);
                }
              }
            } catch (e) {
              // Log failure to fetch core API resources for better observability.
              console.debug(
                `Failed to fetch core API resources for cluster ${cluster}:`,
                { version: v },
                e
              );
            }
          });
          await Promise.allSettled(coreResourceFetchPromises);
        }

        if (apiGroupsData && Array.isArray(apiGroupsData.groups)) {
          const groupResourceFetchPromises = apiGroupsData.groups.map(async (group: any) => {
            try {
              const groupName = group?.name;
              let version = group?.preferredVersion?.version;
              if (
                !version &&
                group?.versions &&
                group.versions.length > 0 &&
                group.versions[0]?.version
              ) {
                version = group.versions[0].version;
              }

              if (
                typeof groupName === 'string' &&
                groupName.length > 0 &&
                typeof version === 'string' &&
                version.length > 0
              ) {
                const groupResourcesResponse = await clusterFetch(`/apis/${groupName}/${version}`, {
                  cluster,
                });
                const groupResources = await groupResourcesResponse.json();
                if (groupResources && Array.isArray(groupResources.resources)) {
                  processLegacyApiResourceList(
                    groupResources.resources,
                    groupName,
                    version,
                    resultMap
                  );
                }
              }
            } catch (e) {
              console.debug(
                `Failed to fetch group API resources for cluster ${cluster}:`,
                { group: group?.name, version: group?.preferredVersion?.version },
                e
              );
            }
          });
          await Promise.allSettled(groupResourceFetchPromises);
        }
      } catch (legacyError) {
        console.debug(`Failed to fetch legacy API resources for cluster ${cluster}:`, legacyError);
      }
    }
  }

  return Array.from(resultMap.values());
}
