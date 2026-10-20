import React from 'react';
import { registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
import { getCluster } from '@kinvolk/headlamp-plugin/lib/Utils';
import { useTheme } from '@mui/material';
import { App } from './App';

function FleetPage() {
  const theme = useTheme();
  return <App embedded hostTheme={theme.palette.mode} />;
}
function ClusterPage() {
  const theme = useTheme();
  return <App embedded singleClusterContext={getCluster() ?? 'No cluster selected'} hostTheme={theme.palette.mode} />;
}
registerSidebarEntry({
  parent: null, name: 'aks-upgrade-fleet', label: 'Upgrade readiness',
  url: '/aks-upgrade-fleet', icon: 'mdi:shield-check-outline',
  sidebar: 'HOME', useClusterURL: false,
});
registerRoute({
  name: 'aks-upgrade-fleet', path: '/aks-upgrade-fleet',
  sidebar: { item: 'aks-upgrade-fleet', sidebar: 'HOME' },
  useClusterURL: false, noAuthRequired: true, exact: true, component: FleetPage,
});
registerSidebarEntry({
  parent: null, name: 'aks-upgrade-insights', label: 'Upgrade Insights',
  url: '/aks-upgrade-insights', icon: 'mdi:shield-check-outline',
});
registerRoute({
  name: 'aks-upgrade-insights', path: '/aks-upgrade-insights',
  sidebar: 'aks-upgrade-insights', exact: true, component: ClusterPage,
});
