import {
  registerRoute,
  registerSidebarEntry,
} from '@kinvolk/headlamp-plugin/lib';
import React from 'react';
import { KueueDashboard } from './components/KueueDashboard';

// A top level item in the sidebar (cluster-scoped)
registerSidebarEntry({
  parent: null,
  name: 'kueue',
  label: 'Kueue Batch',
  url: '/kueue',
  icon: 'mdi:chart-bar-stacked',
});

// The route for the sidebar entry (cluster-scoped)
registerRoute({
  path: '/kueue',
  sidebar: 'kueue',
  name: 'Kueue',
  exact: true,
  component: () => <KueueDashboard />,
});
