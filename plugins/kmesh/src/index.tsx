import { registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
import React from 'react';
import { KmeshOverview } from './components/KmeshOverview';

/**
 * Kmesh Plugin Entry Point
 * 
 * This file registers the Headlamp plugin extensions.
 * We are following the pattern from `plugins/examples/sidebar` to add a new 
 * navigation item and map it to our custom Kmesh overview route.
 */

// 1. Register a new Sidebar Entry under the main cluster context
registerSidebarEntry({
  parent: null,
  name: 'kmesh',
  label: 'Kmesh',
  url: '/kmesh',
  // Iconify icon name. See https://icon-sets.iconify.design/mdi/
  icon: 'mdi:network-outline', 
});

// 2. Register the route that the sidebar entry points to
registerRoute({
  path: '/kmesh',
  sidebar: 'kmesh',
  name: 'KmeshOverview',
  exact: true,
  component: () => <KmeshOverview />,
});

// TODO (Phase 2): Register Details View sections or Action items for 
// standard K8s resources (like Pods or Deployments) to show Kmesh-specific status.
