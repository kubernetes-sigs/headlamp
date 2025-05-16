import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LumosDocsViewer } from './LumosDocsViewer';
import { getContextKeyword } from './Util';

export function ContextTab() {
  const [inputWord, setInputWord] = useState<string>('');

  const location = useLocation();
  const currentLocation = location.pathname;
  const contextKind = getContextKeyword(currentLocation);

  const theme = useTheme();

  useEffect(() => {
    if (contextKind && contextKind !== inputWord) {
      setInputWord(contextKind);
    }
  }, [inputWord, currentLocation]);

  return (
    <Box
      sx={{
        marginTop: '0.5rem',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
      }}
    >
      {/* This is the top bar of the content box */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          borderBottom: '2px solid black',
        }}
      >
        <Typography
          component="h3"
          variant="h6"
          sx={{
            color: theme.palette.text.primary,
            margin: '0.5rem',
          }}
        >
          Context
        </Typography>
      </Box>
      {/* <DrawerContent /> */}

      {!contextKind ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          <Typography variant="h5">No documentation found for current page context.</Typography>
          <Typography variant="h5">Please visit a resource page.</Typography>
        </Box>
      ) : (
        <>{contextKind === inputWord && <LumosDocsViewer keyword={contextKind} />}</>
      )}
    </Box>
  );
}
