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

import Box from '@mui/material/Box';
import { type SxProps, type Theme, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { type DetailDrawerSide, setSelectedResource } from '../../../redux/drawerModeSlice';
import { useTypedSelector } from '../../../redux/hooks';
import { KubeObjectDetails } from '../../resourceMap/details/KubeNodeDetails';
import { ActionButton } from '..';

const drawerPositionStyles = {
  right: {
    top: 0,
    right: 0,
    width: '60vw',
    height: '100%',
    boxShadow: '-5px 0 20px rgba(0,0,0,0.08)',
    borderRadius: '10px 0 0 10px',
  },
  left: {
    top: 0,
    left: 0,
    width: '60vw',
    height: '100%',
    boxShadow: '5px 0 20px rgba(0,0,0,0.08)',
    borderRadius: '0 10px 10px 0',
  },
  bottom: {
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '60vh',
    boxShadow: '0 -5px 20px rgba(0,0,0,0.08)',
    borderRadius: '10px 10px 0 0',
  },
} as const satisfies Record<DetailDrawerSide, SxProps<Theme>>;

export default function DetailsDrawer() {
  const { t } = useTranslation();
  const selectedResource = useTypedSelector(state => state.drawerMode.selectedResource);
  const dispatch = useDispatch();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const isDetailDrawerEnabled = useTypedSelector(state => state?.drawerMode?.isDetailDrawerEnabled);
  const detailDrawerSide = useTypedSelector(state => state.drawerMode.detailDrawerSide);

  const drawerRef = useRef<HTMLDivElement>(null);

  const closeDrawer = useCallback(() => {
    dispatch(setSelectedResource(undefined));
  }, [dispatch]);

  useEffect(() => {
    if (selectedResource && !isSmallScreen && isDetailDrawerEnabled && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [selectedResource, isSmallScreen, isDetailDrawerEnabled]);

  useEffect(() => {
    const mainElement = document.getElementById('main');
    if (!mainElement) return;

    if (selectedResource && !isSmallScreen && isDetailDrawerEnabled) {
      mainElement.setAttribute('inert', '');
      return () => {
        mainElement.removeAttribute('inert');
      };
    }
  }, [selectedResource, isSmallScreen, isDetailDrawerEnabled]);

  if (!selectedResource || isSmallScreen || !isDetailDrawerEnabled) {
    return null;
  }

  const positionSx = drawerPositionStyles[detailDrawerSide] ?? drawerPositionStyles.right;

  return (
    <Box
      ref={drawerRef}
      tabIndex={-1}
      sx={{
        position: 'absolute',
        ...positionSx,
        backgroundColor: 'background.paper',
        overflowY: 'auto',
        zIndex: 1,
        border: '1px solid',
        borderColor: theme.palette.divider,
        outline: 'none',
      }}
      role="dialog"
      aria-label={t('Resource details')}
      aria-describedby="resource-details-content"
      aria-modal="true"
      data-details-drawer="true"
      data-details-drawer-side={detailDrawerSide}
    >
      <Box
        sx={{
          display: 'flex',
          padding: '1rem',
          justifyContent: 'right',
        }}
      >
        <ActionButton onClick={() => closeDrawer()} icon="mdi:close" description={t('Close')} />
      </Box>
      <Box id="resource-details-content">
        {selectedResource && (
          <KubeObjectDetails
            resource={{
              kind: selectedResource.kind,
              metadata: selectedResource.metadata,
              cluster: selectedResource.cluster,
            }}
            customResourceDefinition={selectedResource.customResourceDefinition}
          />
        )}
      </Box>
    </Box>
  );
}
