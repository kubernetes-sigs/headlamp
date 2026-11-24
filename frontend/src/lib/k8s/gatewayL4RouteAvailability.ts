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

import { useQuery } from '@tanstack/react-query';
import { useSelectedClusters } from './api/v1/hooks';
import { clusterFetch } from './api/v2/fetch';

const GATEWAY_API_GROUP = 'gateway.networking.k8s.io';
const GATEWAY_L4_VERSIONS = ['v1', 'v1alpha2'] as const;
const GATEWAY_L4_KINDS = ['TCPRoute', 'UDPRoute'] as const;

export type GatewayL4RouteKind = (typeof GATEWAY_L4_KINDS)[number];

const normalizeClusters = (clusters: string[]) => [...new Set(clusters)].sort();

export const gatewayL4RouteAvailabilityQueryKey = (clusters: string[]) => [
  'gateway-l4-route-availability',
  ...normalizeClusters(clusters),
];

async function getVersionKinds(cluster: string, version: string): Promise<Set<GatewayL4RouteKind>> {
  try {
    const response = await clusterFetch(`/apis/${GATEWAY_API_GROUP}/${version}`, { cluster });
    const body = await response.json();
    if (!body || !Array.isArray(body.resources)) {
      return new Set();
    }

    return new Set(
      body.resources
        .filter(
          (resource: unknown): resource is { kind: GatewayL4RouteKind; verbs: string[] } =>
            !!resource &&
            typeof resource === 'object' &&
            GATEWAY_L4_KINDS.includes((resource as { kind?: GatewayL4RouteKind }).kind!) &&
            Array.isArray((resource as { verbs?: unknown }).verbs) &&
            (resource as { verbs: unknown[] }).verbs.includes('list')
        )
        .map((resource: { kind: GatewayL4RouteKind }) => resource.kind)
    );
  } catch {
    return new Set();
  }
}

export async function gatewayL4RouteAvailability(
  selectedClusters: string[]
): Promise<GatewayL4RouteKind[]> {
  const clusters = normalizeClusters(selectedClusters);
  if (clusters.length === 0) {
    return [];
  }

  const availability = await Promise.all(
    clusters.map(async cluster => {
      const versionKinds = await Promise.all(
        GATEWAY_L4_VERSIONS.map(version => getVersionKinds(cluster, version))
      );
      return new Map(
        GATEWAY_L4_KINDS.map(kind => [
          kind,
          GATEWAY_L4_VERSIONS.filter((_version, index) => versionKinds[index].has(kind)),
        ])
      );
    })
  );

  return GATEWAY_L4_KINDS.filter(kind => {
    const firstVersions = availability[0].get(kind) || [];
    return (
      firstVersions.length > 0 &&
      availability.every(clusterAvailability => {
        const versions = clusterAvailability.get(kind) || [];
        return (
          versions.length === firstVersions.length &&
          versions.every((version, index) => version === firstVersions[index])
        );
      })
    );
  });
}

export function useGatewayL4RouteAvailability() {
  const clusters = normalizeClusters(useSelectedClusters());
  return useQuery({
    queryKey: gatewayL4RouteAvailabilityQueryKey(clusters),
    queryFn: () => gatewayL4RouteAvailability(clusters),
  });
}
