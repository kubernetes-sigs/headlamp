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
import { Trans, useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import {
  DetailsDrawerLocation,
  setDetailDrawerEnabled,
  setDetailsDrawerLocation,
} from '../../../redux/drawerModeSlice';
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

function LocationPreview({ location }: { location: DetailsDrawerLocation }) {
  const theme = useTheme();
  const size = '80px';
  const panel = {
    'split-right': { top: '10%', left: '55%', width: '45%', height: '90%' },
    'split-left': { top: '10%', left: 0, width: '45%', height: '90%' },
    'split-bottom': { top: '55%', left: '20%', width: '80%', height: '45%' },
  }[location];

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
      />
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
      <Box
        sx={{
          position: 'absolute',
          background: theme.palette.background.muted,
          border: '1px solid',
          borderColor: theme.palette.divider,
          borderRadius: theme.shape.borderRadius + 'px',
          ...panel,
        }}
      />
    </Box>
  );
}

export default function DrawerModeSettings() {
  const dispatch = useDispatch();
  const { t } = useTranslation();

  const isDrawerEnabled = useTypedSelector(state => state?.drawerMode?.isDetailDrawerEnabled);
  const drawerLocation = useTypedSelector(
    state => state?.drawerMode?.detailsDrawerLocation ?? 'split-right'
  );

  const locationOptions: { value: DetailsDrawerLocation; label: string }[] = [
    { value: 'split-right', label: t('translation|Right') },
    { value: 'split-left', label: t('translation|Left') },
    { value: 'split-bottom', label: t('translation|Bottom') },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex' }}>
        <OptionButton
          active={isDrawerEnabled}
          onClick={() => dispatch(setDetailDrawerEnabled(true))}
        >
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
      {isDrawerEnabled && (
        <Box
          role="group"
          aria-label={t('translation|Details window position')}
          sx={{ display: 'flex' }}
        >
          {locationOptions.map(opt => (
            <OptionButton
              key={opt.value}
              active={drawerLocation === opt.value}
              onClick={() => dispatch(setDetailsDrawerLocation(opt.value))}
            >
              <LocationPreview location={opt.value} />
              {opt.label}
            </OptionButton>
          ))}
        </Box>
      )}
    </Box>
  );
}
