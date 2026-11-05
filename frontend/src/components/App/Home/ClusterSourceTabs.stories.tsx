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
import { ClusterSourceView, getClusterSource } from '../../../helpers/clusterPresentation';
import { Cluster } from '../../../lib/k8s/cluster';
import { TestContext } from '../../../test';
import ClusterSourceTabs from './ClusterSourceTabs';
import ClusterTable from './ClusterTable';

const sources: ClusterSourceView[] = [
  {
    id: 'cluster_inventory',
    label: 'Cluster Inventory API',
    nameLabel: 'ClusterProfile',
    configured: true,
    columns: [
      { key: 'namespace', label: 'Resource namespace' },
      { key: 'provider', label: 'Access provider' },
    ],
    summaryFields: ['namespace', 'provider'],
  },
  {
    id: 'cluster_api',
    label: 'Cluster API',
    nameLabel: 'Cluster',
    configured: true,
    columns: [
      { key: 'namespace', label: 'Resource namespace' },
      { key: 'root', label: 'Management context' },
    ],
    detailFields: [{ key: 'secret', label: 'Kubeconfig Secret' }],
    summaryFields: ['namespace', 'root'],
  },
];
const clusters: Cluster[] = ['direct', 'gateway'].map(provider => ({
  name: `inventory-production-${provider}`,
  auth_type: 'oidc',
  meta_data: {
    source: 'cluster_inventory',
    presentation: {
      displayName: 'production',
      fields: { namespace: 'team-a', provider, root: 'in-cluster' },
    },
  },
}));

export default { title: 'home/ClusterSourceTabs', component: ClusterSourceTabs } as Meta;
const Template: StoryFn<{ loading?: boolean; error?: boolean; empty?: boolean }> = args => {
  const rows = args.empty ? [] : clusters;
  return (
    <TestContext>
      <ClusterSourceTabs clusters={rows} sources={sources} loading={args.loading}>
        {source => (
          <ClusterTable
            key={source?.id || 'all'}
            source={source}
            sourceViews={sources}
            clusters={
              args.loading ? null : Object.fromEntries(rows.map(cluster => [cluster.name, cluster]))
            }
            customNameClusters={rows.filter(
              cluster => !source || getClusterSource(cluster) === source.id
            )}
            versions={{}}
            warningLabels={{}}
            errors={
              args.error
                ? Object.fromEntries(
                    rows.map(cluster => [
                      cluster.name,
                      { status: 401, message: 'Unauthorized' } as any,
                    ])
                  )
                : {}
            }
            connectedClusterNames={new Set(args.error ? rows.map(cluster => cluster.name) : [])}
          />
        )}
      </ClusterSourceTabs>
    </TestContext>
  );
};
export const Connections = Template.bind({});
export const Loading = Template.bind({});
Loading.args = { loading: true };
export const AuthenticationRequired = Template.bind({});
AuthenticationRequired.args = { error: true };
export const Empty = Template.bind({});
Empty.args = { empty: true };
