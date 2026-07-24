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

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { TestContext } from '../../test';

vi.mock('../../lib/k8s', () => ({
  useClustersConf: vi.fn(() => ({})),
  useSelectedClusters: vi.fn(() => []),
}));

import { useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { Cluster } from '../../lib/k8s/cluster';
import ClusterChooserPopup from './ClusterChooserPopup';

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    name: 'cluster-inventory-root-default-spoke-a--abc123',
    auth_type: '',
    ...overrides,
  } as Cluster;
}

function renderPopup() {
  const anchor = document.createElement('div');
  document.body.appendChild(anchor);

  return render(
    <TestContext>
      <ClusterChooserPopup anchor={anchor} />
    </TestContext>
  );
}

describe('ClusterChooserPopup', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders the Cluster Inventory displayName instead of the generated context name', () => {
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
    (useClustersConf as Mock).mockReturnValue({ [cluster.name]: cluster });

    renderPopup();

    expect(screen.getByText('Spoke A')).toBeInTheDocument();
    expect(screen.queryByText(cluster.name)).not.toBeInTheDocument();
  });

  it('keys identity (DOM id, current-cluster state) off the real name, not the display label', () => {
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
    (useClustersConf as Mock).mockReturnValue({ [cluster.name]: cluster });
    (useSelectedClusters as Mock).mockReturnValue([cluster.name]);

    renderPopup();

    // The rendered label is "Spoke A", but selection/current-cluster tracking,
    // and the option's DOM id, must still resolve through the real cluster name.
    const option = document.getElementById(cluster.name);
    expect(option).not.toBeNull();
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('finds a cluster when searching by its display label', () => {
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
    (useClustersConf as Mock).mockReturnValue({ [cluster.name]: cluster });

    renderPopup();

    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Spoke' } });

    expect(screen.getByText('Spoke A')).toBeInTheDocument();
  });

  it('still finds a cluster when searching by its real name', () => {
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
    (useClustersConf as Mock).mockReturnValue({ [cluster.name]: cluster });

    renderPopup();

    fireEvent.change(screen.getByPlaceholderText('Name'), {
      target: { value: 'cluster-inventory-root' },
    });

    expect(screen.getByText('Spoke A')).toBeInTheDocument();
  });
});
