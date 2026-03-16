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

import {
  registerRoute,
  registerRouteFilter,
  registerSidebarEntry,
  registerSidebarEntryFilter,
} from '@kinvolk/headlamp-plugin/lib';
import { SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Typography from '@mui/material/Typography';
import React from 'react';

// A top level item in the sidebar.
// The sidebar link URL is: /c/mycluster/feedback
registerSidebarEntry({
  parent: null,
  name: 'feedback',
  label: 'Feedback',
  url: '/feedback',
  icon: 'mdi:comment-quote',
});

// A component to go along with the URL path.
// This component rendered at URL: /c/mycluster/feedback
//    (your URL might be /c/minikube/feedback if your cluster name is minikube)
registerRoute({
  path: '/feedback',
  sidebar: 'feedback',
  name: 'feedback',
  exact: true,
  component: () => (
    <SectionBox title="Feedback" textAlign="center" paddingTop={2}>
      <Typography>Embed your feedback forms here</Typography>
    </SectionBox>
  ),
});

// Add an entry to the home sidebar (not in cluster).
registerSidebarEntry({
  name: 'mypluginsidebar',
  label: 'Special Plugin Area',
  url: '/mypluginarea',
  icon: 'mdi:comment-quote',
  sidebar: 'HOME',
});

registerRoute({
  path: '/mypluginarea',
  sidebar: {
    item: 'mypluginarea',
    sidebar: 'myplugin',
  },
  useClusterURL: false,
  noAuthRequired: true, // No authentication is required to see the view
  name: 'mypluginarea',
  exact: true,
  component: () => (
    <SectionBox title="Special Plugin Area" textAlign="center" paddingTop={2}>
      <Typography>See how the home sidebar is completely new?</Typography>
    </SectionBox>
  ),
});
// Adds a completely new sidebar + entry because the sidebar "myplugin" does not exist.
registerSidebarEntry({
  name: 'backtoclusters',
  label: 'Back to Clusters',
  url: '/',
  icon: 'mdi:hexagon',
  sidebar: 'myplugin',
});
// Adds a entry to the recently created sidebar "myplugin".
registerSidebarEntry({
  name: 'mypluginarea',
  label: 'Special Area',
  url: '/mypluginarea',
  icon: 'mdi:comment-quote',
  sidebar: 'myplugin',
});

// Another top level sidebar menu item.
// The sidebar link URL is: /c/mycluster/feedback2
registerSidebarEntry({
  parent: null,
  name: 'feedback2',
  label: 'Diff Feedback',
  url: '/feedback2',
  icon: 'mdi:comment-quote',
});

// Sub-level sidebar entry, under cluster but without a cluster link.
// The sidebar link URL is: /no-cluster-link
registerSidebarEntry({
  parent: 'cluster',
  name: 'no-cluster-sublevel-link',
  label: 'No cluster link',
  url: '/no-cluster-link',
  icon: 'mdi:airplane',
  useClusterURL: false,
});

// Please see https://icon-sets.iconify.design/mdi/ for icons.

// Here we have some sub menus.
// The sidebar link URL is: /c/mycluster/feedback3
registerSidebarEntry({
  parent: 'feedback2',
  name: 'feedback3',
  label: 'More Feedback',
  url: '/feedback3',
});
// The sidebar link URL is: /c/mycluster/feedback4
registerSidebarEntry({
  parent: 'feedback2',
  name: 'feedback4',
  label: 'Other Feedback',
  url: '/feedback4',
});

registerSidebarEntry({
  parent: null,
  name: 'nothing-to-see-here',
  label: 'Click me and I will disappear',
  url: '/feedback2',
  icon: 'mdi:glasses',
});

// Add components and routes for the three different side bar items.
// This component rendered at URL: /c/mycluster/feedback2
registerRoute({
  path: '/feedback2',
  sidebar: 'feedback2',
  name: 'feedback2',
  exact: true,
  component: () => {
    React.useEffect(() => {
      // This filter removes the "Click me and I will disappear" sidebar entry.
      registerSidebarEntryFilter(entry => (entry.name === 'nothing-to-see-here' ? null : entry));
    }, []);

    return (
      <SectionBox title="Diff Feedback" textAlign="center" paddingTop={2}>
        <Typography>Different feedback forms go here.</Typography>
      </SectionBox>
    );
  },
});

// This component rendered at URL: /c/mycluster/feedback3
registerRoute({
  path: '/feedback3',
  sidebar: 'feedback3',
  name: 'feedback3',
  exact: true,
  component: () => (
    <SectionBox title="More Feedback" textAlign="center" paddingTop={2}>
      <Typography>More feedback forms go here.</Typography>
    </SectionBox>
  ),
});

// This component rendered at URL: /c/mycluster/feedback4
registerRoute({
  path: '/feedback4',
  sidebar: 'feedback4',
  name: 'feedback4',
  exact: true,
  component: () => (
    <SectionBox title="Other Feedback" textAlign="center" paddingTop={2}>
      <Typography>Other feedback forms go here.</Typography>
    </SectionBox>
  ),
  hideAppBar: true, // hide the top AppBar with this.
});

// The sidebar link URL is: /no-cluster-link
registerSidebarEntry({
  parent: null,
  name: 'no-sidebar-link',
  label: 'No Sidebar Link',
  url: '/no-sidebar-link',
  icon: 'mdi:comment-quote',
  useClusterURL: false, // Do not put "/c/mycluster/" in the URL
});

// This component rendered at URL: /no-cluster-link
// The AppBar at the top of the screen will not be shown for this route.
registerRoute({
  path: '/no-cluster-link',
  sidebar: null,
  name: 'no-cluster-link',
  exact: true,
  useClusterURL: false, // This one does not have a "/c/mycluster/" in the URL
  noAuthRequired: true, // No authentication is required to see the view
  component: () => (
    <SectionBox title="No Cluster Link" textAlign="center" paddingTop={2}>
      <Typography>Your component here</Typography>
    </SectionBox>
  ),
  hideAppBar: true, // hide the top AppBar with this.
});

// Remove "Workloads" top level sidebar menu item
registerSidebarEntryFilter(entry => (entry.name === 'workloads' ? null : entry));
// Remove "/workloads" route
registerRouteFilter(route => (route.path === '/workloads' ? null : route));

// Remove "Namespaces" second level sidebar menu item
registerSidebarEntryFilter(entry => (entry.name === 'namespaces' ? null : entry));
// Remove "/namespaces" route
registerRouteFilter(route => (route.path === '/namespaces' ? null : route));
