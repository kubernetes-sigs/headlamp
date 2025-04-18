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
import { Box, Button, ButtonGroup } from '@mui/material';
import { useReactFlow, useStore } from '@xyflow/react';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function GraphControlButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children?: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const sx = {
    width: '32px',
    height: '32px',
    padding: 0,
    minWidth: '32px',
    borderRadius: '50%',
    '> svg': {
      width: '14px',
      height: '14px',
    },
    fontSize: 'x-small',
  };

  return (
    <Button
      disabled={disabled}
      sx={sx}
      color="primary"
      variant="contained"
      title={title}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function GraphControls({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation();
  const minZoomReached = useStore(it => it.transform[2] <= it.minZoom);
  const maxZoomReached = useStore(it => it.transform[2] >= it.maxZoom);
  const { zoomIn, zoomOut } = useReactFlow();

  return (
    <Box display="flex" gap={1} flexDirection="column">
      <ButtonGroup
        sx={{
          borderRadius: '40px',
          '> .MuiButtonGroup-grouped': {
            minWidth: '32px',
          },
        }}
        orientation="vertical"
        aria-label="Vertical button group"
        variant="contained"
      >
        <GraphControlButton disabled={maxZoomReached} title={t('Zoom in')} onClick={() => zoomIn()}>
          <Icon icon="mdi:plus" />
        </GraphControlButton>
        <GraphControlButton
          disabled={minZoomReached}
          title={t('Zoom out')}
          onClick={() => zoomOut()}
        >
          <Icon icon="mdi:minus" />
        </GraphControlButton>
      </ButtonGroup>
      {children}
    </Box>
  );
}
