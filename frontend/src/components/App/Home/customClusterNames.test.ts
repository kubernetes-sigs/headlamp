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

import { describe, expect, it } from 'vitest';
import { Cluster } from '../../../lib/k8s/cluster';
import { getClusterDisplayLabel, getCustomClusterNames } from './customClusterNames';

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    name: 'cluster-inventory-root-default-spoke-a--abc123',
    auth_type: '',
    ...overrides,
  } as Cluster;
}

describe('getClusterDisplayLabel', () => {
  it('falls back to the real name when there is no custom name or displayName', () => {
    const cluster = makeCluster();

    expect(getClusterDisplayLabel(cluster)).toBe(cluster.name);
  });

  it('prefers the Cluster Inventory displayName over the generated context name', () => {
    const cluster = makeCluster({
      meta_data: {
        source: 'cluster_inventory',
        clusterInventory: {
          profile: {
            namespace: 'default',
            name: 'spoke-a',
            key: 'root/default/spoke-a',
            displayName: 'Spoke A',
          },
        },
      },
    });

    expect(getClusterDisplayLabel(cluster)).toBe('Spoke A');
  });

  it('prefers an explicit custom name over the Cluster Inventory displayName', () => {
    const cluster = makeCluster({
      meta_data: {
        source: 'cluster_inventory',
        extensions: { headlamp_info: { customName: 'My Custom Name' } },
        clusterInventory: {
          profile: {
            namespace: 'default',
            name: 'spoke-a',
            key: 'root/default/spoke-a',
            displayName: 'Spoke A',
          },
        },
      },
    });

    expect(getClusterDisplayLabel(cluster)).toBe('My Custom Name');
  });

  it('ignores displayName for clusters not sourced from Cluster Inventory', () => {
    const cluster = makeCluster({
      name: 'kubeconfig-cluster',
      meta_data: {
        source: 'kubeconfig',
        clusterInventory: {
          profile: { namespace: 'default', name: 'spoke-a', key: 'k', displayName: 'Spoke A' },
        },
      },
    });

    expect(getClusterDisplayLabel(cluster)).toBe('kubeconfig-cluster');
  });
});

describe('getCustomClusterNames', () => {
  it('returns an empty array when clusters is null', () => {
    expect(getCustomClusterNames(null)).toEqual([]);
  });

  it('never rewrites Cluster.name, even when a display label is available', () => {
    // Cluster.name is the canonical identifier used for routing, recent-cluster
    // storage, and connection tracking, and must survive untouched -- unlike a
    // custom name, a ClusterProfile displayName is not guaranteed unique.
    const cluster = makeCluster({
      meta_data: {
        source: 'cluster_inventory',
        extensions: { headlamp_info: { customName: 'My Custom Name' } },
        clusterInventory: {
          profile: {
            namespace: 'default',
            name: 'spoke-a',
            key: 'root/default/spoke-a',
            displayName: 'Spoke A',
          },
        },
      },
    });

    const result = getCustomClusterNames({ [cluster.name]: cluster });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe(cluster.name);
  });

  it('sorts clusters by their display label rather than their real name', () => {
    const zebra = makeCluster({
      name: 'cluster-inventory-root-default-zebra--zzz999',
      meta_data: {
        source: 'cluster_inventory',
        clusterInventory: {
          profile: { namespace: 'default', name: 'zebra', key: 'k1', displayName: 'Alpha' },
        },
      },
    });
    const apple = makeCluster({
      name: 'cluster-inventory-root-default-apple--aaa111',
      meta_data: {
        source: 'cluster_inventory',
        clusterInventory: {
          profile: { namespace: 'default', name: 'apple', key: 'k2', displayName: 'Zulu' },
        },
      },
    });

    const result = getCustomClusterNames({ [zebra.name]: zebra, [apple.name]: apple });

    // "Alpha" (on the zebra-named cluster) sorts before "Zulu" (on the apple-named
    // cluster) -- sorting follows the label, not the underlying real name.
    expect(result.map(c => c.name)).toEqual([zebra.name, apple.name]);
  });
});
