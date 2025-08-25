import { Icon } from '@iconify/react';
import { Box, Button, InputAdornment, TextField, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import React, { useState } from 'react';
import { LumosDocsViewer } from './LumosDocsViewer';

export function SearchTab() {
  const [placeholderValue, setPlaceholderValue] = useState<string>('');

  const theme = useTheme();

  function LumosSearchBar() {
    function handleDocsSearch() {
      setPlaceholderValue(placeholderValue);
    }

    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          margin: '1rem',
          width: '100%',
        }}
      >
        <Box>
          <Typography
            component="h3"
            variant="h6"
            sx={{
              color: theme.palette.text.primary,
            }}
          >
            Search
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <TextField
            id="outlined-basic"
            label="Search"
            variant="outlined"
            size="small"
            placeholder={'Search keyword'}
            InputProps={{
              autoFocus: true,
              value: placeholderValue,
              onChange: e => {
                setPlaceholderValue(e.target.value);
              },
              startAdornment: (
                <InputAdornment position="start" sx={{ pointerEvents: 'none' }}>
                  <Icon icon="mdi:search" width={18} height={18} />
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="contained"
            size="small"
            sx={{
              marginLeft: '1rem',
              color: 'white',
              background: theme.palette.mode === 'dark' ? '#2a89d1' : '#1976d2',
            }}
            onClick={() => handleDocsSearch()}
          >
            {' '}
            SEARCH
          </Button>
        </Box>
      </Box>
    );
  }

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
        <LumosSearchBar />
      </Box>
      {/* <DrawerContent /> */}
      <LumosDocsViewer keyword={placeholderValue} />
    </Box>
  );
}
