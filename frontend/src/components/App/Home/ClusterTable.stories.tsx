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

import { Meta, StoryFn } from '@storybook/react';
import { useEffect } from 'react';
import { ClusterLabels } from '../../../helpers/clusterLabels';
import { storeClusterSettings } from '../../../helpers/clusterSettings';
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import { Cluster } from '../../../lib/k8s/cluster';
import { TestContext } from '../../../test';
import ClusterTable, { ClusterTableProps } from './ClusterTable';
import {
  CLUSTERS,
  CLUSTERS_BY_NAME,
  makeError,
  UNHEALTHY_INVENTORY_CLUSTER,
  VERSIONS,
  WARNING_LABELS,
} from './storyHelper';

export default {
  title: 'home/ClusterTable',
  component: ClusterTable,
} as Meta;

const ALL_CONNECTED = new Set(CLUSTERS.map(cluster => cluster.name));

const ORGANIZATION_STORAGE_KEYS = [
  'table_group_by.home-clusters',
  'table_collapsed_groups.home-clusters',
];

function clearClusterOrganization() {
  ORGANIZATION_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
  Object.keys(localStorage)
    .filter(key => key.startsWith('cluster_settings.'))
    .forEach(key => localStorage.removeItem(key));
}

const Template: StoryFn<ClusterTableProps> = args => {
  // The table seeds its column visibility, sorting and filter state from
  // localStorage, so clear it to keep the snapshots independent of whatever
  // other stories or the browser left behind.
  localStorage.removeItem('table_settings.home-clusters');
  localStorage.removeItem('table_sorting.home-clusters');
  localStorage.removeItem('table_filters.home-clusters');
  clearClusterOrganization();

  return (
    <TestContext>
      <ClusterTable {...args} />
    </TestContext>
  );
};

interface OrganizationArgs {
  labels: Record<string, ClusterLabels>;
  labelFilter?: string;
  groupBy?: string;
}

/** Seeds cluster labels and Home organization choices, removing them again on unmount. */
function WithOrganization({
  labels,
  labelFilter,
  groupBy,
  ...args
}: ClusterTableProps & OrganizationArgs) {
  localStorage.removeItem('table_settings.home-clusters');
  localStorage.removeItem('table_sorting.home-clusters');
  localStorage.removeItem('table_filters.home-clusters');
  clearClusterOrganization();
  Object.entries(labels).forEach(([cluster, clusterLabels]) =>
    storeClusterSettings(cluster, { labels: clusterLabels })
  );
  if (labelFilter) {
    localStorage.setItem(
      'table_filters.home-clusters',
      JSON.stringify([{ id: 'labels', value: labelFilter }])
    );
  }
  if (groupBy) {
    localStorage.setItem('table_group_by.home-clusters', JSON.stringify(groupBy));
  }

  useEffect(() => clearClusterOrganization, []);

  return (
    <TestContext>
      <ClusterTable {...args} />
    </TestContext>
  );
}

const OrganizationTemplate: StoryFn<ClusterTableProps & OrganizationArgs> = args => (
  <WithOrganization {...args} />
);

const STORY_LABELS: Record<string, ClusterLabels> = {
  'aks-prod': { environment: 'production', region: 'eu-west' },
  'in-cluster': { environment: 'staging' },
  'plugin-cluster': { environment: 'production', region: 'us-east' },
};

const baseArgs: ClusterTableProps = {
  customNameClusters: CLUSTERS,
  clusters: CLUSTERS_BY_NAME,
  versions: VERSIONS,
  errors: Object.fromEntries(CLUSTERS.map(cluster => [cluster.name, null])),
  warningLabels: WARNING_LABELS,
  connectedClusterNames: ALL_CONNECTED,
  onConnectCluster: () => {},
};

// Connected and reachable clusters, one per origin kind, so the Origin column
// covers every branch of getOrigin.
export const Default = Template.bind({});
Default.args = baseArgs;

// Clusters with local labels: grouping is available in the table toolbar,
// and the labels column shows each cluster's labels as chips.
export const WithLabels = OrganizationTemplate.bind({});
WithLabels.args = { ...baseArgs, labels: STORY_LABELS };

// The existing Labels column filter narrows the table to matching clusters.
export const FilteredByLabels = OrganizationTemplate.bind({});
FilteredByLabels.args = {
  ...baseArgs,
  labels: STORY_LABELS,
  labelFilter: 'region=eu-west',
};

// Grouped by a label key, with clusters missing the label listed under "Ungrouped".
export const GroupedByLabel = OrganizationTemplate.bind({});
GroupedByLabel.args = { ...baseArgs, labels: STORY_LABELS, groupBy: 'environment' };

const LARGE_INVENTORY_GROUPS: [environment: string, count: number][] = [
  ['production', 18],
  ['staging', 9],
  ['development', 13],
];

const LARGE_INVENTORY: Cluster[] = LARGE_INVENTORY_GROUPS.flatMap(([environment, count]) =>
  Array.from({ length: count }, (_, index) => ({
    name: `${environment}-${String(index + 1).padStart(2, '0')}`,
    auth_type: '',
    meta_data: { source: 'kubeconfig', origin: { kubeconfig: '/home/user/.kube/config' } },
  }))
).sort((a, b) => a.name.localeCompare(b.name));

// More clusters than fit on a page, grouped: a group running onto the next page shows its
// heading again there, and selecting all only selects the clusters on screen.
export const GroupedLargeInventory = OrganizationTemplate.bind({});
GroupedLargeInventory.args = {
  ...baseArgs,
  customNameClusters: LARGE_INVENTORY,
  clusters: Object.fromEntries(LARGE_INVENTORY.map(cluster => [cluster.name, cluster])),
  versions: Object.fromEntries(
    LARGE_INVENTORY.map(cluster => [cluster.name, { gitVersion: 'v1.31.2' }])
  ),
  errors: Object.fromEntries(LARGE_INVENTORY.map(cluster => [cluster.name, null])),
  warningLabels: Object.fromEntries(LARGE_INVENTORY.map(cluster => [cluster.name, '0'])),
  connectedClusterNames: new Set(LARGE_INVENTORY.map(cluster => cluster.name)),
  labels: Object.fromEntries(
    LARGE_INVENTORY.map(cluster => [cluster.name, { environment: cluster.name.split('-')[0] }])
  ),
  groupBy: 'environment',
};

// Clusters outside the auto-connect set and without an error yet: the status
// cell offers a Connect action and the warnings/version cells stay blank.
export const NotConnected = Template.bind({});
NotConnected.args = {
  ...baseArgs,
  errors: {},
  versions: {},
  connectedClusterNames: new Set<string>(),
};

// In the auto-connect set but no response yet, so the status cell shows the
// connecting indicator instead of a resolved status.
export const Connecting = Template.bind({});
Connecting.args = {
  ...baseArgs,
  errors: {},
  versions: {},
};

// The error statuses coming out of getClusterStatusInfo.
export const WithErrors = Template.bind({});
WithErrors.args = {
  ...baseArgs,
  versions: {},
  errors: {
    'aks-prod': makeError(401, 'Unauthorized'),
    'in-cluster': makeError(403, 'Forbidden'),
    'plugin-cluster': makeError(500, 'dial tcp: i/o timeout'),
    'spoke-a': null,
  } as { [cluster: string]: ApiError | null },
};

// A Cluster Inventory cluster whose control plane condition reports False takes
// precedence over the reachability status and adds the condition tooltip.
export const UnhealthyControlPlane = Template.bind({});
UnhealthyControlPlane.args = {
  ...baseArgs,
  customNameClusters: [UNHEALTHY_INVENTORY_CLUSTER],
  clusters: { [UNHEALTHY_INVENTORY_CLUSTER.name]: UNHEALTHY_INVENTORY_CLUSTER },
  versions: {},
  errors: { [UNHEALTHY_INVENTORY_CLUSTER.name]: null },
  warningLabels: {},
  connectedClusterNames: new Set([UNHEALTHY_INVENTORY_CLUSTER.name]),
};

export const Empty = Template.bind({});
Empty.args = {
  ...baseArgs,
  customNameClusters: [],
  clusters: {},
  versions: {},
  errors: {},
  warningLabels: {},
  connectedClusterNames: new Set<string>(),
};

export const Loading = Template.bind({});
Loading.args = {
  ...baseArgs,
  customNameClusters: [],
  clusters: null,
  versions: {},
  errors: {},
  warningLabels: {},
  connectedClusterNames: new Set<string>(),
};
