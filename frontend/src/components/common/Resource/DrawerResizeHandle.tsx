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
/** Largest width a details drawer can be resized to, as a fraction of its container width. */
export const MAX_DRAWER_WIDTH_RATIO = 0.9;
/**
 * CSS bounds for a details drawer, relative to the area the drawer is positioned in. They match
 * the bounds the resize hook applies: the minimum never exceeds the maximum, so a narrow area
 * cannot make the drawer wider than itself.
 */
export const DRAWER_WIDTH_BOUNDS_CSS = {
  minWidth: `min(${MIN_DRAWER_WIDTH}px, ${MAX_DRAWER_WIDTH_RATIO * 100}%)`,
  maxWidth: `${MAX_DRAWER_WIDTH_RATIO * 100}%`,
};
/** How many pixels one arrow key press resizes the drawer by. */
const KEYBOARD_RESIZE_STEP = 20;

/** The side of the drawer that the resize handle sits on. */
export type DrawerEdge = 'left' | 'right';

/** The smallest and largest width, in pixels, of a drawer in a container of the given width. */
function getDrawerWidthBounds(containerWidth: number) {
  const max = containerWidth * MAX_DRAWER_WIDTH_RATIO;
  return { min: Math.min(MIN_DRAWER_WIDTH, max), max };
}

/** Constrains a width to the allowed range for the given container width. */
function clampDrawerWidth(width: number, containerWidth: number) {
  const { min, max } = getDrawerWidthBounds(containerWidth);
  return Math.max(min, Math.min(width, max));
}

/** Width of the element, or of the body when it cannot be measured. */
function measureWidth(element: HTMLElement | null) {
  return element?.getBoundingClientRect().width || document.body.clientWidth;
}

/**
 * Keeps track of the width of the drawer as rendered and of the area it is positioned in, which
 * changes with the window size and when, for example, the sidebar is toggled.
 */
function useDrawerMeasurements(
  drawerRef: RefObject<HTMLElement>,
  getContainer: (() => HTMLElement | null) | undefined
) {
  const [containerWidth, setContainerWidth] = useState(() => document.body.clientWidth);
  // 0 while the drawer is not rendered or its size is unknown.
  const [renderedWidth, setRenderedWidth] = useState(0);
  const observed = useRef<{ drawer: HTMLElement | null; container: HTMLElement | null }>({
    drawer: null,
    container: null,
  });
  const observerRef = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    setContainerWidth(measureWidth(observed.current.container));
    setRenderedWidth(observed.current.drawer?.getBoundingClientRect().width ?? 0);
  }, []);

  // The drawer element can appear after the first render, so check after every render whether
  // the observed elements are still the right ones. Running after every render, the effect always
  // sees the latest getContainer.
  useEffect(() => {
    const drawer = drawerRef.current;
    const container =
      getContainer?.() ?? (drawer?.offsetParent as HTMLElement | null) ?? document.body;
    if (observed.current.drawer === drawer && observed.current.container === container) return;

    observed.current = { drawer, container };
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      if (drawer) observer.observe(drawer);
      observer.observe(container);
      observerRef.current = observer;
    }
    measure();
  });

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [measure]);

  return { containerWidth, renderedWidth };
}

/**
 * Resizing of a details drawer by dragging or with the keyboard. The width is shared by all
 * details drawers, kept in the redux store and saved to localStorage when a resize ends.
 *
 * @param edge - The side of the drawer that the handle is on. A handle on the left edge is for
 * a drawer attached to the right, so moving it left makes the drawer wider.
 * @param defaultWidthRatio - Width of the drawer, as a fraction of its container width, while the
 * user has not resized it yet.
 * @param drawerRef - The drawer element.
 * @param getContainer - Returns the element whose width the percentage based CSS bounds of the
 * drawer are relative to. Defaults to the offset parent of the drawer.
 */
export function useDrawerResize({
  edge,
  defaultWidthRatio,
  drawerRef,
  getContainer,
}: {
  edge: DrawerEdge;
  defaultWidthRatio: number;
  drawerRef: RefObject<HTMLElement>;
  getContainer?: () => HTMLElement | null;
}) {
  const dispatch = useDispatch();
  const storedWidth = useTypedSelector(state => state?.drawerMode?.detailDrawerWidth);
  const { containerWidth, renderedWidth } = useDrawerMeasurements(drawerRef, getContainer);

  // Width while a drag is in progress. Outside of a drag the width comes from the store.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  // Mirrors dragWidth so the pointerup handler always saves the latest value.
  const dragWidthRef = useRef<number | null>(null);
  // Where the edge opposite to the handle is on the screen, which does not move while dragging.
  const anchorRef = useRef(0);
  // The pointer that started the current drag, or null when not dragging. Other pointers, such
  // as a second finger on a touchscreen, are ignored until it is released.
  const activePointerRef = useRef<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  /** The width in pixels, or undefined while the drawer has its default width. */
  const width = dragWidth ?? (storedWidth || undefined);

  // The same bounds as the CSS ones on the drawer, so they stay in step when the area changes.
  const bounds = getDrawerWidthBounds(containerWidth);
  // What the drawer is displayed at. Its rendered width is used when known, because the layout
  // decides the default width and the CSS bounds may differ from the stored width.
  const currentWidth =
    renderedWidth > 0
      ? renderedWidth
      : clampDrawerWidth(width ?? containerWidth * defaultWidthRatio, containerWidth);

  const startResizing = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      // Only the primary button (or a touch/pen contact) starts a resize.
      if (event.button !== 0) return;
      // Avoid selecting text while dragging.
      event.preventDefault();
      // Another pointer is already dragging the handle.
      if (activePointerRef.current !== null) return;

      activePointerRef.current = event.pointerId;
      const rect = drawerRef.current?.getBoundingClientRect();
      anchorRef.current =
        edge === 'left' ? rect?.right || document.body.clientWidth : rect?.left ?? 0;
      setIsResizing(true);
    },
    [edge, drawerRef]
  );

  const stopResizing = useCallback(
    (event: globalThis.PointerEvent) => {
      if (event.pointerId !== activePointerRef.current) return;
      activePointerRef.current = null;
      setIsResizing(false);
      if (dragWidthRef.current !== null) {
        dispatch(setDetailDrawerWidth(dragWidthRef.current));
      }
      dragWidthRef.current = null;
      setDragWidth(null);
    },
    [dispatch]
  );

  const resize = useCallback(
    (pointerMoveEvent: globalThis.PointerEvent) => {
      if (pointerMoveEvent.pointerId !== activePointerRef.current) return;
      const newWidth =
        edge === 'left'
          ? anchorRef.current - pointerMoveEvent.clientX
          : pointerMoveEvent.clientX - anchorRef.current;
      const clamped = clampDrawerWidth(newWidth, containerWidth);
      dragWidthRef.current = clamped;
      setDragWidth(clamped);
    },
    [edge, containerWidth]
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
        (drawerRef.current?.getBoundingClientRect().width || containerWidth * defaultWidthRatio);
      dispatch(
        setDetailDrawerWidth(
          clampDrawerWidth(clampDrawerWidth(startWidth, containerWidth) + delta, containerWidth)
        )
      );
    },
    [edge, width, drawerRef, containerWidth, defaultWidthRatio, dispatch]
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
    /** Smallest width in pixels the drawer can currently have. */
    minWidth: bounds.min,
    /** Largest width in pixels the drawer can currently have. */
    maxWidth: bounds.max,
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
      aria-valuemin={Math.round(resize.minWidth)}
      aria-valuemax={Math.round(resize.maxWidth)}
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
