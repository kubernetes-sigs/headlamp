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

/**
 * Storybook stories for SettingsClusters component.
 * Demonstrates various cluster configuration states including
 * normal cluster lists, empty states, single cluster, and many clusters.
 */

import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { Cluster } from '../../../lib/k8s/cluster';
import { initialState } from '../../../redux/configSlice';
import { TestContext } from '../../../test';
import SettingsClusters from './SettingsClusters';

/**
 * Helper to convert Cluster array to a name->cluster record.
 * @param clusters - Array of cluster objects
 * @returns Record mapping cluster names to cluster objects
 */
const clustersToRecord = (clusters: Cluster[]): Record<string, Cluster> =>
  clusters.reduce((acc, cluster) => {
    acc[cluster.name] = cluster;
    return acc;
  }, {} as Record<string, Cluster>);

/**
 * Creates mock state with cluster configuration.
 * @param clusters - Array of cluster objects to include in the state
 * @returns Mock Redux state object
 */
const getMockState = (clusters?: Cluster[] | null) => {
  const clusterRecord = clusters === null ? null : clusters ? clustersToRecord(clusters) : {};

  return {
    config: {
      ...initialState,
      clusters: clusterRecord,
      allClusters: clusterRecord,
    },
    filter: {
      search: '',
    },
    plugins: {
      loaded: true,
    },
    ui: {
      clusterChooserButtonComponent: null,
    },
    theme: {
      logo: null,
      name: 'light',
    },
  };
};

export default {
  title: 'Settings/SettingsClusters',
  component: SettingsClusters,
  parameters: {
    docs: {
      description: {
        component:
          'Displays a table of configured clusters with their names and server URLs. ' +
          'Each cluster name is a clickable link to the cluster settings page.',
      },
    },
  },
} as Meta<typeof SettingsClusters>;

/**
 * Args type for story template.
 */
interface StoryArgs {
  clusters: Cluster[] | null;
}

/**
 * Story template with Redux Provider and TestContext.
 */
const Template: StoryFn<StoryArgs> = args => {
  const { clusters } = args;

  return (
    <TestContext
      store={configureStore({
        reducer: (state = getMockState()) => state,
        preloadedState: getMockState(clusters),
      })}
    >
      <SettingsClusters />
    </TestContext>
  );
};

/**
 * Default story showing a typical cluster list with multiple clusters.
 * Displays three clusters with different server URLs.
 */
export const ClusterListDisplay = Template.bind({});
ClusterListDisplay.args = {
  clusters: [
    {
      name: 'production',
      server: 'https://prod-k8s.example.com:6443',
      auth_type: 'token',
    },
    {
      name: 'staging',
      server: 'https://staging-k8s.example.com:6443',
      auth_type: 'oidc',
    },
    {
      name: 'development',
      server: 'https://dev-k8s.example.com:6443',
      auth_type: 'token',
    },
  ],
};

/**
 * Empty state story showing when no clusters are configured.
 * This demonstrates the empty table state.
 */
export const EmptyClusterList = Template.bind({});
EmptyClusterList.args = {
  clusters: [],
};
EmptyClusterList.parameters = {
  docs: {
    description: {
      story: 'Shows the component state when no clusters are configured.',
    },
  },
};

/**
 * Single cluster story showing minimal configuration.
 * Useful for testing single-cluster environments.
 */
export const SingleCluster = Template.bind({});
SingleCluster.args = {
  clusters: [
    {
      name: 'my-cluster',
      server: 'https://kubernetes.default.svc.cluster.local:6443',
      auth_type: 'serviceAccount',
    },
  ],
};
SingleCluster.parameters = {
  docs: {
    description: {
      story: 'Displays a single cluster configuration.',
    },
  },
};

/**
 * Many clusters story for testing scrolling and performance.
 * Shows 15 clusters to demonstrate table behavior with many entries.
 */
export const ManyClusters = Template.bind({});
ManyClusters.args = {
  clusters: Array(15)
    .fill(0)
    .map((_, i) => ({
      name: `cluster-${i + 1}`,
      server: `https://cluster-${i + 1}.k8s.example.com:6443`,
      auth_type: i % 3 === 0 ? 'token' : i % 3 === 1 ? 'oidc' : 'serviceAccount',
    })),
};
ManyClusters.parameters = {
  docs: {
    description: {
      story: 'Demonstrates the component with many clusters to test scrolling and table behavior.',
    },
  },
};

/**
 * Clusters with various configurations and metadata.
 * Shows different auth types and server URL formats.
 */
export const VariousConfigurations = Template.bind({});
VariousConfigurations.args = {
  clusters: [
    {
      name: 'local-kind',
      server: 'https://127.0.0.1:6443',
      auth_type: 'token',
    },
    {
      name: 'minikube',
      server: 'https://192.168.49.2:8443',
      auth_type: 'certificate',
    },
    {
      name: 'eks-cluster',
      server: 'https://ABC123DEF456.gr7.us-west-2.eks.amazonaws.com',
      auth_type: 'oidc',
    },
    {
      name: 'gke-cluster',
      server: 'https://34.123.45.67',
      auth_type: 'oidc',
    },
    {
      name: 'aks-cluster',
      server: 'https://myaks-dns-12345678.hcp.eastus.azmk8s.io:443',
      auth_type: 'oidc',
    },
  ],
};
VariousConfigurations.parameters = {
  docs: {
    description: {
      story:
        'Shows clusters with various configurations including local development clusters ' +
        'and managed Kubernetes services (EKS, GKE, AKS).',
    },
  },
};

/**
 * Clusters with long names and URLs for testing text overflow.
 * Verifies that the component handles long strings gracefully.
 */
export const LongNamesAndURLs = Template.bind({});
LongNamesAndURLs.args = {
  clusters: [
    {
      name: 'very-long-production-cluster-name-for-enterprise-deployment',
      server:
        'https://very-long-subdomain-name-for-kubernetes-api-server.production.enterprise.example.com:6443',
      auth_type: 'oidc',
    },
    {
      name: 'another-extremely-long-cluster-identifier-with-multiple-hyphens',
      server: 'https://another-very-long-server-url.staging.corporate.example.org:8443',
      auth_type: 'token',
    },
  ],
};
LongNamesAndURLs.parameters = {
  docs: {
    description: {
      story:
        'Tests the component with very long cluster names and server URLs to verify proper text handling.',
    },
  },
};

/**
 * Null cluster state - equivalent to empty cluster list.
 * When clusters are null, SettingsClusters renders Object.values(clusterConf || {}),
 * which produces an empty array, resulting in the same display as EmptyClusterList.
 */
export const NullClusterState = Template.bind({});
NullClusterState.args = {
  clusters: null,
};
NullClusterState.parameters = {
  docs: {
    description: {
      story:
        'Shows the component when clusters are null. Note: This renders identically to EmptyClusterList ' +
        'because the component converts null to an empty array via Object.values(clusterConf || {}).',
    },
  },
};
