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
import { alpha, Box, Button, useTheme } from '@mui/material';
import React, { ReactNode } from 'react';
import { Trans } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { setDetailDrawerEnabled } from '../../../redux/drawerModeSlice';
import { useTypedSelector } from '../../../redux/hooks';

function OverlayPreview({ variant }: { variant: 'full-page' | 'overlay' }) {
  const theme = useTheme();
  const size = '150px';

  return (
    <Box
      sx={{
        width: size,
        height: size,
        border: '1px solid',
        borderColor: theme.palette.divider,
        position: 'relative',
        borderRadius: theme.shape.borderRadius + 'px',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '10%',
          borderBottom: '1px solid',
          borderColor: theme.palette.divider,
        }}
      ></Box>
      <Box
        sx={{
          position: 'absolute',
          width: '20%',
          height: '90%',
          top: '10%',
          left: 0,
          borderRight: '1px solid',
          borderColor: theme.palette.divider,
        }}
      />
      {variant === 'overlay' && (
        <Box
          sx={{
            position: 'absolute',
            background: theme.palette.background.muted,
            width: '50%',
            height: '90%',
            top: '10%',
            left: '50%',
            border: '1px solid',
            borderColor: theme.palette.divider,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.shape.borderRadius + 'px',
          }}
        >
          <Box sx={{ position: 'absolute', top: 0, right: 0, padding: '3px' }}>
            <Icon icon="mdi:close" />
          </Box>
        </Box>
      )}
      {variant === 'full-page' && (
        <Box
          sx={{
            position: 'absolute',
            background: theme.palette.background.muted,
            width: '80%',
            height: '90%',
            top: '10%',
            left: '20%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              padding: '3px',
            }}
          >
            <Icon icon="mdi:chevron-left" />
          </Box>
        </Box>
      )}
    </Box>
  );
}

const OptionButton = ({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) => (
  <Button
    aria-pressed={active}
    onClick={onClick}
    sx={theme => ({
      display: 'flex',
      flexDirection: 'column',
      color: 'unset',
      textTransform: 'none',
      gap: 1,
      border: '2px solid',
      borderColor: active
        ? alpha(theme.palette.action.active, theme.palette.action.activatedOpacity)
        : 'transparent',
    })}
  >
    {children}
  </Button>
);

export default function DrawerModeSettings() {
  const dispatch = useDispatch();

  const isDrawerEnabled = useTypedSelector(state => state?.drawerMode?.isDetailDrawerEnabled);

  return (
    <Box sx={{ display: 'flex' }}>
      <OptionButton active={isDrawerEnabled} onClick={() => dispatch(setDetailDrawerEnabled(true))}>
        <OverlayPreview variant="overlay" />
        <Trans>Window</Trans>
      </OptionButton>
      <OptionButton
        active={!isDrawerEnabled}
        onClick={() => dispatch(setDetailDrawerEnabled(false))}
      >
        <OverlayPreview variant="full-page" />
        <Trans>Full page</Trans>
      </OptionButton>
    </Box>
  );
}
