import {
  registerAppBarAction,
  registerRoute,
  registerSidebarEntry,
} from '@kinvolk/headlamp-plugin/lib';
import { Button } from '@mui/material';
import React from 'react';
import { KueueDashboard } from './components/KueueDashboard';

// TEST: Add a simple button to the AppBar
registerAppBarAction(() => (
  <Button
    color="inherit"
    onClick={() => alert('Kueue Plugin is working!')}
    style={{ textTransform: 'none', marginRight: '10px' }}
  >
    🧪 Kueue Test
  </Button>
));

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

function HelloButton() {
  const handleClick = () => {
    alert('Hello from your Headlamp plugin!');
  };

  return (
    <Button
      variant="outlined"
      size="small"
      onClick={handleClick}
      sx={{ mx: 2 }} // Add some horizontal margin
    >
      Hello Headlamp!
    </Button>
  );
}

registerAppBarAction(<HelloButton />);
