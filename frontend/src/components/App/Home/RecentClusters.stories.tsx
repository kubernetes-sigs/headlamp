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
import React from 'react';
import { getRecentClusters, setRecentCluster } from '../../../helpers/recentClusters';
import { Cluster } from '../../../lib/k8s/cluster';
import RecentClusters, { RecentClustersProps } from './RecentClusters';

const clusters: Cluster[] = [
  {
    name: 'cluster0',
    auth_type: '',
  },
  {
    name: 'cluster1',
    auth_type: '',
  },
  {
    name: 'cluster2',
    auth_type: '',
  },
  {
    name: 'cluster3',
    auth_type: '',
  },
];

export default {
  title: 'home/RecentClusters',
  component: RecentClusters,
  argTypes: {},
} as Meta;

interface RecentClusterStoryProps extends RecentClustersProps {
  getRecentClusters: typeof getRecentClusters;
}

const Template: StoryFn<RecentClusterStoryProps> = args => {
  const { getRecentClusters, ...props } = args;

  React.useEffect(() => {
    const clusters = getRecentClusters();
    localStorage.setItem('recent_clusters', '[]');
    for (const clusterName of clusters) {
      setRecentCluster(clusterName);
    }
  });

  return <RecentClusters {...props} />;
};

export const NoClusters = Template.bind({});
NoClusters.args = {
  clusters: [],
  getRecentClusters: () => [],
};

export const OneExistingCluster = Template.bind({});
OneExistingCluster.args = {
  clusters: [clusters[0]],
  getRecentClusters: () => [clusters[0].name],
};

export const OneRecentCluster = Template.bind({});
OneRecentCluster.args = {
  clusters,
  getRecentClusters: () => [clusters[0].name],
};

export const TwoExistingClusters = Template.bind({});
TwoExistingClusters.args = {
  clusters: clusters.slice(0, 2),
  getRecentClusters: () => [clusters[0].name, clusters[1].name],
};

export const TwoRecentClusters = Template.bind({});
TwoRecentClusters.args = {
  clusters,
  getRecentClusters: () => [clusters[0].name, clusters[1].name],
};

export const ThreeClusters = Template.bind({});
ThreeClusters.args = {
  clusters,
  getRecentClusters: () => [clusters[0].name, clusters[1].name, clusters[2].name],
};

export const MoreThanThreeClusters = Template.bind({});
MoreThanThreeClusters.args = {
  clusters,
  getRecentClusters: () => clusters.map(c => c.name),
};

export const WithObsoleteClusters = Template.bind({});
WithObsoleteClusters.args = {
  clusters,
  getRecentClusters: () => ['idonotexist', clusters[0].name],
};
