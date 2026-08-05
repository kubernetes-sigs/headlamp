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
import { alpha, Box, Button, ToggleButton, ToggleButtonGroup, useTheme } from '@mui/material';
import React, { ReactNode, useId } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import {
  DETAIL_DRAWER_SIDES,
  type DetailDrawerSide,
  setDetailDrawerEnabled,
  setDetailDrawerSide,
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

// Preview geometry uses percentages relative to the 80x80 tile. It is
// approximate on purpose: right/left panels take half the tile (the real
// drawer is 60vw), and the bottom panel spans the full width and ~60% of
// the tile height (the real drawer is `bottom: 0; height: 60vh`). Adjust
// these together with drawerPositionStyles in DetailsDrawer.tsx.
const sidePreviewGeometry: Record<
  DetailDrawerSide,
  { width: string; height: string; top?: string; bottom?: string; left: string }
> = {
  left: { width: '50%', height: '90%', top: '10%', left: '20%' },
  right: { width: '50%', height: '90%', top: '10%', left: '50%' },
  bottom: { width: '80%', height: '60%', bottom: '0', left: '20%' },
};

function SidePreview({ side }: { side: DetailDrawerSide }) {
  const theme = useTheme();
  const size = '80px';
  const geometry = sidePreviewGeometry[side];

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
          ...geometry,
        }}
      />
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
  const detailDrawerSide = useTypedSelector(state => state.drawerMode.detailDrawerSide);

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
      {isDrawerEnabled && <DrawerSidePicker active={detailDrawerSide} />}
    </Box>
  );
}

function DrawerSidePicker({ active }: { active: DetailDrawerSide }) {
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const labelId = useId();

  const sideLabels: Record<DetailDrawerSide, string> = {
    left: t('translation|Left'),
    right: t('translation|Right'),
    bottom: t('translation|Bottom'),
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box id={labelId} sx={{ minWidth: '9rem', fontSize: '0.875rem' }}>
        {t('translation|Drawer position')}
      </Box>
      {/*
        Uses MUI's ToggleButtonGroup with `exclusive`: renders as
        role="group" with aria-pressed toggle buttons, each a Tab stop,
        activated with Space/Enter. This is the standard toggle-button-group
        pattern (not a radiogroup, which would need arrow-key navigation).
        `onChange` fires with `null` when the user clicks the already-active
        button; ignore that so a side is always chosen once selected.
      */}
      <ToggleButtonGroup
        value={active}
        exclusive
        aria-labelledby={labelId}
        onChange={(_event, next: DetailDrawerSide | null) => {
          if (next !== null) dispatch(setDetailDrawerSide(next));
        }}
        sx={{ gap: 1, '& .MuiToggleButtonGroup-grouped': { border: 'none', borderRadius: 1 } }}
      >
        {DETAIL_DRAWER_SIDES.map(side => (
          <ToggleButton
            key={side}
            value={side}
            aria-label={t('translation|Drawer position: {{side}}', { side: sideLabels[side] })}
            sx={theme => ({
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              textTransform: 'none',
              color: 'unset',
              border: '2px solid transparent',
              '&.Mui-selected': {
                borderColor: alpha(
                  theme.palette.action.active,
                  theme.palette.action.activatedOpacity
                ),
                backgroundColor: 'transparent',
              },
              '&.Mui-selected:hover': {
                backgroundColor: theme.palette.action.hover,
              },
            })}
          >
            <SidePreview side={side} />
            {sideLabels[side]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );
}
