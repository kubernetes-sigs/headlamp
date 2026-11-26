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

import type { ApiResource } from './api/v2/ApiResource';
import type { KubeCRD } from './crd';

/**
 * Standard Kubernetes built-in API groups. Resources in these groups are
 * core Kubernetes primitives rather than CustomResourceDefinitions.
 */
export const BUILTIN_API_GROUPS = new Set<string>([
  '',
  'admissionregistration.k8s.io',
  'apiextensions.k8s.io',
  'apiregistration.k8s.io',
  'apps',
  'authentication.k8s.io',
  'authorization.k8s.io',
  'autoscaling',
  'batch',
  'certificates.k8s.io',
  'coordination.k8s.io',
  'discovery.k8s.io',
  'events.k8s.io',
  'flowcontrol.apiserver.k8s.io',
  'imagepolicy.k8s.io',
  'internal.apiserver.k8s.io',
  'metrics.k8s.io',
  'networking.k8s.io',
  'node.k8s.io',
  'policy',
  'rbac.authorization.k8s.io',
  'resource.k8s.io',
  'scheduling.k8s.io',
  'storage.k8s.io',
  'storagemigration.k8s.io',
]);

/**
 * Returns true if the CRD was synthesized from API discovery rather than fetched from the CRD API.
 */
export function isDiscoveryBackedCRD(crd?: KubeCRD): boolean {
  return Boolean(crd?.metadata?.uid?.startsWith('synthetic-crd-'));
}

/**
 * Determines whether an ApiResource discovered from the cluster represents
 * a Custom Resource rather than a built-in Kubernetes resource or subresource.
 */
export function isCustomApiResource(resource: ApiResource): boolean {
  if (!resource.groupName) {
    return false;
  }
  if (!resource.pluralName || !resource.kind) {
    return false;
  }
  // Subresources (e.g. pods/status, crds/status) contain slashes and are not top-level CRs.
  if (resource.pluralName.includes('/')) {
    return false;
  }
  return !BUILTIN_API_GROUPS.has(resource.groupName);
}

/**
 * Checks if an error indicates a forbidden / 403 permission error
 * (e.g. when a namespace-scoped user cannot list or get cluster-scoped CRDs).
 */
export function isForbiddenError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object') {
    const errObj = error as Record<string, any>;
    const status = [errObj.status, errObj.statusCode, errObj.code].find(
      value => typeof value === 'number' && Number.isFinite(value)
    );
    if (status !== undefined) {
      return status === 403;
    }
    if (typeof errObj.message === 'string') {
      const lower = errObj.message.toLowerCase();
      if (
        lower.includes('forbidden') ||
        lower.includes('403') ||
        lower.includes('cannot list resource') ||
        lower.includes('cannot get resource')
      ) {
        return true;
      }
    }
  }
  if (typeof error === 'string') {
    const lower = error.toLowerCase();
    if (
      lower.includes('forbidden') ||
      lower.includes('403') ||
      lower.includes('cannot list resource') ||
      lower.includes('cannot get resource')
    ) {
      return true;
    }
  }
  return false;
}

function synthesizeCRD<T>(
  resList: ApiResource[],
  cluster: string | undefined,
  crdFactory: (data: KubeCRD, cluster?: string) => T
): T {
  const primary = resList[0];
  const seenVersions = new Set<string>();
  const versions: KubeCRD['spec']['versions'] = [];

  for (const r of resList) {
    if (!r.version || seenVersions.has(r.version)) {
      continue;
    }
    seenVersions.add(r.version);
    versions.push({
      name: r.version,
      served: true,
      storage: false,
      additionalPrinterColumns: [],
    });
  }

  const crdName = `${primary.pluralName}.${primary.groupName}`;
  const rawCrd: KubeCRD = {
    kind: 'CustomResourceDefinition',
    apiVersion: 'apiextensions.k8s.io/v1',
    metadata: {
      name: crdName,
      uid: `synthetic-crd-${cluster ? `${cluster}-` : ''}${crdName}`,
      creationTimestamp: '',
      ...(cluster ? { cluster } : {}),
    },
    spec: {
      group: primary.groupName!,
      version: primary.version,
      names: {
        plural: primary.pluralName,
        singular: primary.singularName || primary.kind.toLowerCase(),
        kind: primary.kind,
        listKind: `${primary.kind}List`,
      },
      versions,
      scope: primary.isNamespaced ? 'Namespaced' : 'Cluster',
    },
  };

  return crdFactory(rawCrd, cluster);
}

/**
 * Builds synthetic CustomResourceDefinition instances from discovered API resources
 * when cluster-level CRD listing is forbidden.
 */
export function buildSyntheticCRDsFromDiscovery<T>(
  resources: ApiResource[],
  targetClusters: string[],
  crdFactory: (data: KubeCRD, cluster?: string) => T
): T[] {
  const customResources = resources.filter(isCustomApiResource);
  if (customResources.length === 0) {
    return [];
  }

  const clusters = targetClusters.length > 0 ? targetClusters : [''];
  const syntheticCrds: T[] = [];

  for (const cluster of clusters) {
    const crdMap = new Map<string, ApiResource[]>();

    for (const res of customResources) {
      const crdName = `${res.pluralName}.${res.groupName}`;
      const existing = crdMap.get(crdName) || [];
      existing.push(res);
      crdMap.set(crdName, existing);
    }

    for (const resList of crdMap.values()) {
      syntheticCrds.push(synthesizeCRD(resList, cluster || undefined, crdFactory));
    }
  }

  return syntheticCrds;
}

/**
 * Finds and synthesizes a CustomResourceDefinition from discovered API resources
 * matching the given name (plural.group, plural, singular, or kind).
 */
export function findSyntheticCRDFromDiscovery<T>(
  resources: ApiResource[],
  name: string,
  targetCluster: string | undefined,
  crdFactory: (data: KubeCRD, cluster?: string) => T
): T | null {
  const customResources = resources.filter(isCustomApiResource);
  if (customResources.length === 0) {
    return null;
  }

  const searchName = name.toLowerCase();

  let matching = customResources.filter(
    r => `${r.pluralName}.${r.groupName}`.toLowerCase() === searchName
  );

  if (matching.length === 0) {
    matching = customResources.filter(
      r =>
        r.pluralName.toLowerCase() === searchName ||
        r.kind.toLowerCase() === searchName ||
        r.singularName.toLowerCase() === searchName
    );
  }

  if (matching.length === 0) {
    return null;
  }

  // Keep only versions belonging to the first matched CRD group so bare kind/plural
  // lookups never mix versions from distinct API groups.
  const firstCrdName = `${matching[0].pluralName}.${matching[0].groupName}`;
  const groupMatches = matching.filter(r => `${r.pluralName}.${r.groupName}` === firstCrdName);

  return synthesizeCRD(groupMatches, targetCluster, crdFactory);
}
