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

import { ApiResource } from './ApiResource';
import { clusterFetch } from './fetch';

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

      if (!apiAggregatedOk || !apisAggregatedOk) {
        useFallback = true;
      }
    } catch (error) {
      useFallback = true;
    }

    if (useFallback) {
      try {
        const coreApiVersionsPromise = clusterFetch('/api', { cluster })
          .then(res => res.json())
          .catch(() => null);
        const apiGroupsPromise = clusterFetch('/apis', { cluster })
          .then(res => res.json())
          .catch(() => null);

        const [coreApiVersionsData, apiGroupsData] = await Promise.all([
          coreApiVersionsPromise,
          apiGroupsPromise,
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
              // This catch block intentionally left blank.
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
            } catch (e) {}
          });
          await Promise.allSettled(groupResourceFetchPromises);
        }
      } catch (legacyError) {}
    }
  }

  return Array.from(resultMap.values());
}
