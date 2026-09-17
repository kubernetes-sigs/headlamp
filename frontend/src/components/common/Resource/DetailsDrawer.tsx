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
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { setDetailDrawerWidth, setSelectedResource } from '../../../redux/drawerModeSlice';
import { useTypedSelector } from '../../../redux/hooks';
import { KubeObjectDetails } from '../../resourceMap/details/KubeNodeDetails';
import { ActionButton } from '..';

export default function DetailsDrawer() {
  const { t } = useTranslation();
  const selectedResource = useTypedSelector(state => state.drawerMode.selectedResource);
  const dispatch = useDispatch();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const isDetailDrawerEnabled = useTypedSelector(state => state?.drawerMode?.isDetailDrawerEnabled);
  const detailDrawerWidth = useTypedSelector(state => state?.drawerMode?.detailDrawerWidth);

  const drawerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | string>(detailDrawerWidth || '60vw');
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (detailDrawerWidth) {
      setWidth(detailDrawerWidth);
    }
  }, [detailDrawerWidth]);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    if (typeof width === 'number') {
      dispatch(setDetailDrawerWidth(width));
    }
  }, [dispatch, width]);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing) {
        const newWidth = document.body.clientWidth - mouseMoveEvent.clientX;
        const maxWidth = document.body.clientWidth * 0.9;
        const minWidth = 400;

        if (newWidth > minWidth && newWidth < maxWidth) {
          setWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

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

  return (
    <Box
      ref={drawerRef}
      tabIndex={-1}
      sx={{
        position: 'absolute',
        backgroundColor: 'background.paper',
        width: width,
        right: 0,
        height: '100%',
        overflowY: 'auto',
        boxShadow: '-5px 0 20px rgba(0,0,0,0.08)',
        borderRadius: '10px 0 0 10px',
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
    >
      <Box
        onMouseDown={startResizing}
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '5px',
          cursor: 'col-resize',
          zIndex: 10,
          '&:hover': {
            backgroundColor: theme.palette.primary.main,
          },
        }}
      />
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
