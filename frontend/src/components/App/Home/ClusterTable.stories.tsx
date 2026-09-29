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
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
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

const Template: StoryFn<ClusterTableProps> = args => {
  // The table seeds its column visibility, sorting and filter state from
  // localStorage, so clear it to keep the snapshots independent of whatever
  // other stories or the browser left behind.
  localStorage.removeItem('table_settings.home-clusters');
  localStorage.removeItem('table_sorting.home-clusters');
  localStorage.removeItem('table_filters.home-clusters');

  return (
    <TestContext>
      <ClusterTable {...args} />
    </TestContext>
  );
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
