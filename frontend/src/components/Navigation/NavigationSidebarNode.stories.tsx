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

import Box from '@mui/material/Box';
import List from '@mui/material/List';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { NavNode } from './navigationUtils';
import { NavigationSidebarNode } from './NavigationSidebarNode';

export default {
  title: 'Navigation/SidebarNode',
  component: NavigationSidebarNode,
  decorators: [
    (Story, context) => (
      <MemoryRouter initialEntries={[context.args.initialPath || '/']}>
        <Box
          sx={theme => ({
            width: context.args.isOpen ? 240 : 64,
            backgroundColor: theme.palette.sidebar.background,
            color: theme.palette.sidebar.color,
          })}
        >
          <List>
            <Story />
          </List>
        </Box>
      </MemoryRouter>
    ),
  ],
  argTypes: {
    isOpen: {
      control: 'boolean',
      description: 'Whether the sidebar is expanded',
    },
    initialPath: {
      control: 'text',
      description: 'Initial router path for simulating selection',
    },
  },
} as Meta;

interface StoryArgs {
  node: NavNode;
  isOpen: boolean;
  depth?: number;
  initialPath?: string;
}

const Template: StoryFn<StoryArgs> = args => (
  <NavigationSidebarNode node={args.node} isOpen={args.isOpen} depth={args.depth} />
);

//  Leaf node (no children)

export const LeafExpanded = Template.bind({});
LeafExpanded.args = {
  isOpen: true,
  node: {
    label: 'Map',
    url: '/map',
    icon: 'mdi:map',
  },
};
LeafExpanded.storyName = 'Leaf Node (Expanded)';

export const LeafCollapsed = Template.bind({});
LeafCollapsed.args = {
  isOpen: false,
  node: {
    label: 'Map',
    url: '/map',
    icon: 'mdi:map',
  },
};
LeafCollapsed.storyName = 'Leaf Node (Collapsed)';

export const LeafSelected = Template.bind({});
LeafSelected.args = {
  isOpen: true,
  initialPath: '/map',
  node: {
    label: 'Map',
    url: '/map',
    icon: 'mdi:map',
  },
};
LeafSelected.storyName = 'Leaf Node (Selected)';

//  Node with children, navigating URL

const clusterNode: NavNode = {
  label: 'Cluster',
  url: '/cluster',
  icon: 'mdi:hexagon-multiple-outline',
  children: [
    { label: 'Namespaces', url: '/namespaces' },
    { label: 'Nodes', url: '/nodes' },
    { label: 'Advanced Search', url: '/advanced-search' },
  ],
};

export const ParentWithChildrenExpanded = Template.bind({});
ParentWithChildrenExpanded.args = {
  isOpen: true,
  node: clusterNode,
};
ParentWithChildrenExpanded.storyName = 'Parent with Children (Expanded Sidebar)';

export const ParentWithChildrenCollapsed = Template.bind({});
ParentWithChildrenCollapsed.args = {
  isOpen: false,
  node: clusterNode,
};
ParentWithChildrenCollapsed.storyName = 'Parent with Children (Collapsed Sidebar)';

export const ParentWithChildSelected = Template.bind({});
ParentWithChildSelected.args = {
  isOpen: true,
  initialPath: '/namespaces',
  node: clusterNode,
};
ParentWithChildSelected.storyName = 'Parent with Child Selected';

//  Node with children, non-navigating (no own URL different from first child)

const workloadsNode: NavNode = {
  label: 'Workloads',
  url: '/workloads',
  icon: 'mdi:circle-slice-2',
  children: [
    { label: 'Pods', url: '/pods' },
    { label: 'Deployments', url: '/deployments' },
    { label: 'StatefulSets', url: '/statefulsets' },
    { label: 'DaemonSets', url: '/daemonsets' },
    { label: 'ReplicaSets', url: '/replicasets' },
    { label: 'Jobs', url: '/jobs' },
    { label: 'CronJobs', url: '/cronjobs' },
  ],
};

export const WorkloadsExpanded = Template.bind({});
WorkloadsExpanded.args = {
  isOpen: true,
  node: workloadsNode,
};
WorkloadsExpanded.storyName = 'Workloads (Expanded)';

export const WorkloadsWithChildSelected = Template.bind({});
WorkloadsWithChildSelected.args = {
  isOpen: true,
  initialPath: '/pods',
  node: workloadsNode,
};
WorkloadsWithChildSelected.storyName = 'Workloads with Child Selected';

//  Nested groups (like Custom Resources > API Group > Resource)

const customResourcesNode: NavNode = {
  label: 'Custom Resources',
  url: '/customresources/certificates.cert-manager.io',
  icon: 'mdi:puzzle-outline',
  children: [
    {
      label: 'cert-manager.io',
      url: '/customresources/certificates.cert-manager.io',
      children: [
        { label: 'Certificate', url: '/customresources/certificates.cert-manager.io' },
        { label: 'Issuer', url: '/customresources/issuers.cert-manager.io' },
        { label: 'ClusterIssuer', url: '/customresources/clusterissuers.cert-manager.io' },
      ],
    },
    {
      label: 'monitoring.coreos.com',
      url: '/customresources/servicemonitors.monitoring.coreos.com',
      children: [
        {
          label: 'ServiceMonitor',
          url: '/customresources/servicemonitors.monitoring.coreos.com',
        },
        {
          label: 'PrometheusRule',
          url: '/customresources/prometheusrules.monitoring.coreos.com',
        },
      ],
    },
  ],
};

export const NestedGroups = Template.bind({});
NestedGroups.args = {
  isOpen: true,
  node: customResourcesNode,
};
NestedGroups.storyName = 'Nested Groups (Custom Resources)';

export const NestedGroupsWithSelection = Template.bind({});
NestedGroupsWithSelection.args = {
  isOpen: true,
  initialPath: '/customresources/certificates.cert-manager.io',
  node: customResourcesNode,
};
NestedGroupsWithSelection.storyName = 'Nested Groups with Selection';

//  Node with subtitle

const clusterWithSubtitle: NavNode = {
  label: 'Cluster',
  url: '/cluster',
  icon: 'mdi:hexagon-multiple-outline',
  subtitle: 'my-cluster',
  children: [
    { label: 'Namespaces', url: '/namespaces' },
    { label: 'Nodes', url: '/nodes' },
  ],
};

export const NodeWithSubtitle = Template.bind({});
NodeWithSubtitle.args = {
  isOpen: true,
  node: clusterWithSubtitle,
};
NodeWithSubtitle.storyName = 'Node with Subtitle';

//  Multiple nodes together

const MultipleTemplate: StoryFn<{
  nodes: NavNode[];
  isOpen: boolean;
  initialPath?: string;
}> = args => (
  <>
    {args.nodes.map(node => (
      <NavigationSidebarNode key={node.label} node={node} isOpen={args.isOpen} />
    ))}
  </>
);

export const FullSidebarExpanded = MultipleTemplate.bind({});
FullSidebarExpanded.args = {
  isOpen: true,
  nodes: [
    { label: 'Home', url: '/', icon: 'mdi:home' },
    clusterNode,
    { label: 'Map', url: '/map', icon: 'mdi:map' },
    workloadsNode,
    customResourcesNode,
  ],
};
FullSidebarExpanded.storyName = 'Full Sidebar (Expanded)';

export const FullSidebarCollapsed = MultipleTemplate.bind({});
FullSidebarCollapsed.args = {
  isOpen: false,
  nodes: [
    { label: 'Home', url: '/', icon: 'mdi:home' },
    clusterNode,
    { label: 'Map', url: '/map', icon: 'mdi:map' },
    workloadsNode,
    customResourcesNode,
  ],
};
FullSidebarCollapsed.storyName = 'Full Sidebar (Collapsed)';
