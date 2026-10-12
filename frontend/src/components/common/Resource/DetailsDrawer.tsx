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
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { setDetailDrawerWidth, setSelectedResource } from '../../../redux/drawerModeSlice';
import { useTypedSelector } from '../../../redux/hooks';
import { KubeObjectDetails } from '../../resourceMap/details/KubeNodeDetails';
import { ActionButton } from '..';

/** Smallest width, in pixels, the drawer can be resized to. */
export const MIN_DRAWER_WIDTH = 400;
/** Largest width the drawer can be resized to, as a fraction of the body width. */
export const MAX_DRAWER_WIDTH_RATIO = 0.9;
/** Width the drawer has when the user has not resized it yet, as a fraction of the body width. */
const DEFAULT_DRAWER_WIDTH_RATIO = 0.6;
/** How many pixels one arrow key press resizes the drawer by. */
const KEYBOARD_RESIZE_STEP = 20;

/** Constrains a width to the allowed range for the current body width. */
function clampDrawerWidth(width: number) {
  const maxWidth = document.body.clientWidth * MAX_DRAWER_WIDTH_RATIO;
  return Math.max(MIN_DRAWER_WIDTH, Math.min(width, maxWidth));
}

export default function DetailsDrawer() {
  const { t } = useTranslation();
  const selectedResource = useTypedSelector(state => state.drawerMode.selectedResource);
  const dispatch = useDispatch();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const isDetailDrawerEnabled = useTypedSelector(state => state?.drawerMode?.isDetailDrawerEnabled);
  const detailDrawerWidth = useTypedSelector(state => state?.drawerMode?.detailDrawerWidth);

  const drawerRef = useRef<HTMLDivElement>(null);
  // Width while a drag is in progress. Outside of a drag the width comes from the store.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  // Mirrors dragWidth so the pointerup handler always saves the latest value.
  const dragWidthRef = useRef<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const width = dragWidth ?? (detailDrawerWidth || `${DEFAULT_DRAWER_WIDTH_RATIO * 100}vw`);

  // The drawer's width in pixels, used for the keyboard resizing and the separator's ARIA values.
  const currentWidth = clampDrawerWidth(
    typeof width === 'number' ? width : document.body.clientWidth * DEFAULT_DRAWER_WIDTH_RATIO
  );

  const startResizing = useCallback((event: PointerEvent<HTMLDivElement>) => {
    // Only the primary button (or a touch/pen contact) starts a resize.
    if (event.button !== 0) return;
    // Avoid selecting text while dragging.
    event.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    if (dragWidthRef.current !== null) {
      dispatch(setDetailDrawerWidth(dragWidthRef.current));
    }
    dragWidthRef.current = null;
    setDragWidth(null);
  }, [dispatch]);

  const resize = useCallback(
    (pointerMoveEvent: globalThis.PointerEvent) => {
      if (isResizing) {
        const newWidth = clampDrawerWidth(document.body.clientWidth - pointerMoveEvent.clientX);
        dragWidthRef.current = newWidth;
        setDragWidth(newWidth);
      }
    },
    [isResizing]
  );

  const resizeWithKeyboard = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // The handle is on the left edge of the drawer, so moving it left makes the drawer wider.
      let delta = 0;
      if (event.key === 'ArrowLeft') delta = KEYBOARD_RESIZE_STEP;
      else if (event.key === 'ArrowRight') delta = -KEYBOARD_RESIZE_STEP;
      else return;

      event.preventDefault();
      dispatch(setDetailDrawerWidth(clampDrawerWidth(currentWidth + delta)));
    },
    [dispatch, currentWidth]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('pointermove', resize);
      window.addEventListener('pointerup', stopResizing);
      window.addEventListener('pointercancel', stopResizing);
    }
    return () => {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
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
        width,
        // Keep restored widths within bounds when the viewport changes after they were saved.
        minWidth: `${MIN_DRAWER_WIDTH}px`,
        maxWidth: `${MAX_DRAWER_WIDTH_RATIO * 100}vw`,
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
        role="separator"
        aria-orientation="vertical"
        aria-label={t('Resize details drawer')}
        aria-valuenow={Math.round(currentWidth)}
        aria-valuemin={MIN_DRAWER_WIDTH}
        aria-valuemax={Math.round(document.body.clientWidth * MAX_DRAWER_WIDTH_RATIO)}
        tabIndex={0}
        onPointerDown={startResizing}
        onKeyDown={resizeWithKeyboard}
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '5px',
          cursor: 'col-resize',
          // Stop touch scrolling from taking over the gesture.
          touchAction: 'none',
          zIndex: 10,
          '&:hover, &:focus-visible': {
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
