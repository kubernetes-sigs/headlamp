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
import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { setDetailDrawerWidth } from '../../../redux/drawerModeSlice';
import { useTypedSelector } from '../../../redux/hooks';

/** Smallest width, in pixels, a details drawer can be resized to. */
export const MIN_DRAWER_WIDTH = 400;
/** Largest width a details drawer can be resized to, as a fraction of the body width. */
export const MAX_DRAWER_WIDTH_RATIO = 0.9;
/** How many pixels one arrow key press resizes the drawer by. */
const KEYBOARD_RESIZE_STEP = 20;

/** The side of the drawer that the resize handle sits on. */
export type DrawerEdge = 'left' | 'right';

/** Constrains a width to the allowed range for the given body width. */
function clampDrawerWidth(width: number, bodyWidth: number) {
  return Math.max(MIN_DRAWER_WIDTH, Math.min(width, bodyWidth * MAX_DRAWER_WIDTH_RATIO));
}

/** The body width, kept up to date when the window is resized. */
function useBodyWidth() {
  const [bodyWidth, setBodyWidth] = useState(() => document.body.clientWidth);

  useEffect(() => {
    const update = () => setBodyWidth(document.body.clientWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return bodyWidth;
}

/**
 * Resizing of a details drawer by dragging or with the keyboard. The width is shared by all
 * details drawers, kept in the redux store and saved to localStorage when a resize ends.
 *
 * @param edge - The side of the drawer that the handle is on. A handle on the left edge is for
 * a drawer attached to the right, so moving it left makes the drawer wider.
 * @param defaultWidthRatio - Width of the drawer, as a fraction of the body width, while the user
 * has not resized it yet.
 * @param drawerRef - The drawer element.
 */
export function useDrawerResize({
  edge,
  defaultWidthRatio,
  drawerRef,
}: {
  edge: DrawerEdge;
  defaultWidthRatio: number;
  drawerRef: RefObject<HTMLElement>;
}) {
  const dispatch = useDispatch();
  const storedWidth = useTypedSelector(state => state?.drawerMode?.detailDrawerWidth);
  const bodyWidth = useBodyWidth();

  // Width while a drag is in progress. Outside of a drag the width comes from the store.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  // Mirrors dragWidth so the pointerup handler always saves the latest value.
  const dragWidthRef = useRef<number | null>(null);
  // Where the edge opposite to the handle is on the screen, which does not move while dragging.
  const anchorRef = useRef(0);
  const [isResizing, setIsResizing] = useState(false);

  /** The width in pixels, or undefined while the drawer has its default width. */
  const width = dragWidth ?? (storedWidth || undefined);

  // Derived from the current body width so it stays in step with the CSS bounds on the drawer
  // when the window is resized.
  const currentWidth = clampDrawerWidth(width ?? bodyWidth * defaultWidthRatio, bodyWidth);

  const startResizing = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      // Only the primary button (or a touch/pen contact) starts a resize.
      if (event.button !== 0) return;
      // Avoid selecting text while dragging.
      event.preventDefault();

      const rect = drawerRef.current?.getBoundingClientRect();
      anchorRef.current =
        edge === 'left' ? rect?.right || document.body.clientWidth : rect?.left ?? 0;
      setIsResizing(true);
    },
    [edge, drawerRef]
  );

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
      const newWidth =
        edge === 'left'
          ? anchorRef.current - pointerMoveEvent.clientX
          : pointerMoveEvent.clientX - anchorRef.current;
      const clamped = clampDrawerWidth(newWidth, bodyWidth);
      dragWidthRef.current = clamped;
      setDragWidth(clamped);
    },
    [edge, bodyWidth]
  );

  const resizeWithKeyboard = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const widenKey = edge === 'left' ? 'ArrowLeft' : 'ArrowRight';
      const narrowKey = edge === 'left' ? 'ArrowRight' : 'ArrowLeft';
      let delta = 0;
      if (event.key === widenKey) delta = KEYBOARD_RESIZE_STEP;
      else if (event.key === narrowKey) delta = -KEYBOARD_RESIZE_STEP;
      else return;

      event.preventDefault();
      // Until the user has resized the drawer its real width is whatever its CSS gives it.
      const startWidth =
        width ??
        (drawerRef.current?.getBoundingClientRect().width || bodyWidth * defaultWidthRatio);
      dispatch(
        setDetailDrawerWidth(
          clampDrawerWidth(clampDrawerWidth(startWidth, bodyWidth) + delta, bodyWidth)
        )
      );
    },
    [edge, width, drawerRef, bodyWidth, defaultWidthRatio, dispatch]
  );

  useEffect(() => {
    if (!isResizing) return;

    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);
    return () => {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return {
    /** Width in pixels, or undefined while the drawer has its default width. */
    width,
    /** Width in pixels the drawer is displayed at, within the current bounds. */
    currentWidth,
    bodyWidth,
    isResizing,
    startResizing,
    resizeWithKeyboard,
  };
}

/** A draggable and keyboard operable separator for resizing a details drawer. */
export function DrawerResizeHandle({
  edge,
  resize,
}: {
  edge: DrawerEdge;
  resize: ReturnType<typeof useDrawerResize>;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Resize details drawer')}
      aria-valuenow={Math.round(resize.currentWidth)}
      aria-valuemin={MIN_DRAWER_WIDTH}
      aria-valuemax={Math.round(resize.bodyWidth * MAX_DRAWER_WIDTH_RATIO)}
      tabIndex={0}
      onPointerDown={resize.startResizing}
      onKeyDown={resize.resizeWithKeyboard}
      sx={{
        position: 'absolute',
        [edge]: 0,
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
  );
}
