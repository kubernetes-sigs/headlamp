// import { DocsViewer } from '@kinvolk/headlamp-plugin/lib/components/common/index';
import { Icon } from '@iconify/react';
import { Box, Button, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ContextTab } from './ContextTab';
import { SearchTab } from './SearchTab';

interface DocsContentProps {
  // This prop is always needed for each content component in order to open and close drawer from top button
  toggleDisplayDrawer: (currentDisplay: boolean) => void;
}

export function DocsContent({ toggleDisplayDrawer }: DocsContentProps) {
  const location = useLocation();

  const [docsAvailable, setDocsAvailable] = useState(true);
  const [currentTab, setCurrentTab] = useState<string>('');

  const theme = useTheme();

  const localCurrentTab = localStorage.getItem('currentTab');

  if (!localCurrentTab) {
    localStorage.setItem('currentTab', 'Context');
    setCurrentTab('Context');
  }

  function handleChangeTab(tabLabel: string) {
    localStorage.setItem('currentTab', tabLabel);
    setCurrentTab(tabLabel);
  }

  useEffect(() => {
    if (!location.pathname.includes('/c/')) {
      setCurrentTab('Unavailable');
      setDocsAvailable(false);
    } else {
      setDocsAvailable(true);
      setCurrentTab(localCurrentTab);
    }
  }, [location.pathname, currentTab]);

  function RenderLumosTab(currentTab: string) {
    switch (currentTab) {
      case 'Search':
        return <SearchTab />;
      case 'Context':
        return <ContextTab />;
      case 'Unavailable':
        return (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'start',
              alignItems: 'center',
              margin: '1rem',
              width: '100%',
            }}
          >
            <Typography variant="h5">
              Documentation is only available within cluster view.
            </Typography>
            <Typography variant="h5">Please enter a cluster.</Typography>
          </Box>
        );
      default:
        return <SearchTab />;
    }
  }

  function createButtonTabs(tabLabel: string) {
    return (
      <Button
        onClick={() => handleChangeTab(tabLabel)}
        size="small"
        variant="contained"
        sx={{
          margin: '0 0.5rem',
          textTransform: 'none',
          color: 'white',
          background: theme.palette.mode === 'dark' ? '#2a89d1' : '#1976d2',
        }}
      >
        <Typography sx={{ marginTop: '0.2rem' }}>{tabLabel}</Typography>
      </Button>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '1rem',
      }}
    >
      {/* This is the top bar of the box */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          paddingBottom: '0.5rem',
          // borderBottom: '2px solid black',
        }}
      >
        <Typography
          component="h2"
          variant="h5"
          sx={{
            fontWeight: 'bold',
            color: theme.palette.text.primary,
            margin: '0.5rem',
          }}
        >
          <Icon icon="mdi:book-open" /> Documentation
        </Typography>
        <Button
          variant="contained"
          onClick={toggleDisplayDrawer}
          size="small"
          sx={{
            backgroundColor: '#000',
            color: 'white',
            textTransform: 'none',
            '&:hover': {
              background: '#605e5c',
            },
          }}
        >
          <Typography>Close</Typography>
        </Button>
      </Box>

      {/* Tab controls */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          width: '100%',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
          borderBottom: '2px solid black',
        }}
      >
        {docsAvailable && (
          <Box>
            {createButtonTabs('Search')}
            {createButtonTabs('Context')}
          </Box>
        )}
      </Box>
      {/* This is the content of the box */}
      {RenderLumosTab(currentTab)}
    </Box>
  );
}
