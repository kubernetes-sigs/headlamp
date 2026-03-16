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

import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha } from '@mui/system/colorManipulator';
import { lazy, Suspense, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { formatShortcutKey, useShortcut, useShortcutKey } from '../../lib/useShortcut';
import { Delayed } from './Delayed';

const LazySearchContent = lazy(async () => {
  return import('./GlobalSearchContent').then(it => ({ default: it.GlobalSearchContent }));
});

const SEARCH_MAX_WIDTH = 500;

/**
 * The `GlobalSearch` component provides a search functionality
 * It can be rendered as either an icon button or a text field based on the `isIconButton` prop.
 *
 * @param props.isIconButton - Determines if the search should be displayed as an icon button or a text field.
 */
export function GlobalSearch({ isIconButton }: { isIconButton?: boolean }) {
  const theme = useTheme();
  const smallBreakpoint = useMediaQuery(theme.breakpoints.down('md'));
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);

  const blur = () => {
    setFocused(false);
    setPlaceholderValue('');
  };

  const searchShortcutKey = useShortcutKey('GLOBAL_SEARCH');

  useShortcut('GLOBAL_SEARCH', e => {
    e.stopPropagation();
    setFocused(true);
  });

  // If search is not focused, display this placeholder
  const [placeholderValue, setPlaceholderValue] = useState('');
  const iconSize = isIconButton ? 24 : 18;
  const textFieldPlaceholder = smallBreakpoint ? (
    <IconButton
      size="medium"
      sx={
        isIconButton
          ? undefined
          : {
              borderRadius: '4px',
              fontSize: '1rem',
              border: '1px solid',
              borderColor: theme.palette.divider,
            }
      }
      onClick={() => setFocused(true)}
    >
      <Icon icon="mdi:search" width={iconSize} height={iconSize} />
      {!isIconButton && <Box mx={1}>{t('Search')}</Box>}
    </IconButton>
  ) : (
    <TextField
      fullWidth
      onFocus={() => setFocused(true)}
      size="small"
      variant="outlined"
      placeholder={t('Search')}
      InputProps={{
        sx: theme => ({
          background: alpha(theme.palette.background.default, 0.7),
        }),
        startAdornment: (
          <InputAdornment position="start" sx={{ pointerEvents: 'none' }}>
            <Icon icon="mdi:search" width={18} height={18} />
          </InputAdornment>
        ),
        endAdornment: (
          <Box display="flex" flexShrink={0} gap={0.5} sx={{ opacity: 0.7, pointerEvents: 'none' }}>
            <Trans>
              Press
              <Box
                component="kbd"
                sx={theme => ({
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  border: '1px solid',
                  borderRadius: '4px',
                  borderColor: theme.palette.divider,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '24px',
                  height: '24px',
                  px: 0.5,
                })}
              >
                {formatShortcutKey(searchShortcutKey)}
              </Box>
              to search
            </Trans>
          </Box>
        ),
      }}
    />
  );

  // Fallback while search is lazy loaded
  const searchFallback = (
    <TextField
      fullWidth
      size="small"
      variant="outlined"
      placeholder={t('Search resources, pages, clusters by name')}
      InputProps={{
        autoFocus: true,
        value: placeholderValue,
        onChange: e => {
          setPlaceholderValue(e.target.value);
        },
        endAdornment: (
          <>
            <Delayed display="flex" mr={1}>
              <CircularProgress size="16px" />
            </Delayed>
          </>
        ),
      }}
    />
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 1,
        px: 2,
        mx: 'auto',

        ...(isIconButton
          ? {
              // icon shouldn't grow and no paddings/margins
              flexGrow: undefined,
              px: undefined,
              mx: undefined,
            }
          : {}),

        ...(smallBreakpoint
          ? {
              // on small breakpoint we should center it instead of growing
              flexGrow: undefined,
            }
          : {}),

        ...(smallBreakpoint && focused
          ? {
              // display container that covers the whole top bar
              flexGrow: 1,
              position: 'absolute',
              height: '100%',
              width: '100%',
              left: 0,
              right: 0,
              background: theme.palette.background.default,
              zIndex: 1,
            }
          : {}),
      }}
    >
      <Box
        sx={{
          maxWidth: SEARCH_MAX_WIDTH + 'px',
          flexGrow: 1,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        {focused ? (
          <Suspense fallback={searchFallback}>
            <LazySearchContent
              onBlur={blur}
              defaultValue={placeholderValue}
              maxWidth={SEARCH_MAX_WIDTH}
            />
          </Suspense>
        ) : (
          textFieldPlaceholder
        )}
      </Box>
    </Box>
  );
}
