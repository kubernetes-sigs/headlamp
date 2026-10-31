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

import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import drawerModeReducer, {
  DrawerModeState,
  setDetailDrawerWidth,
} from '../../../redux/drawerModeSlice';
import { TestContext } from '../../../test';
import DetailsDrawer from './DetailsDrawer';
import { MAX_DRAWER_WIDTH_RATIO, MIN_DRAWER_WIDTH } from './DrawerResizeHandle';

// The details content is not what is under test, and the real component pulls in
// every resource details view.
vi.mock('../../resourceMap/details/KubeNodeDetails', () => ({
  KubeObjectDetails: () => <div>details content</div>,
}));

// jsdom does not implement PointerEvent, and without it testing-library falls back to a plain
// Event that drops properties such as clientX and button. A MouseEvent subclass is enough here.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {}
  (window as any).PointerEvent = PointerEventShim;
}

const BODY_WIDTH = 1000;
const MIN_WIDTH = MIN_DRAWER_WIDTH;
const MAX_WIDTH = BODY_WIDTH * MAX_DRAWER_WIDTH_RATIO;

function makeStore(overrides: Partial<DrawerModeState> = {}) {
  const drawerMode: DrawerModeState = {
    isDetailDrawerEnabled: true,
    detailsDrawerLocation: 'split-right',
    selectedResource: {
      kind: 'Pod',
      metadata: { name: 'my-pod', namespace: 'default' },
      cluster: 'test',
    },
    ...overrides,
  };
  return configureStore({
    reducer: { drawerMode: drawerModeReducer },
    preloadedState: { drawerMode },
  });
}

function renderDrawer(store = makeStore()) {
  const { unmount } = render(
    <TestContext store={store as any}>
      <DetailsDrawer />
    </TestContext>
  );
  const drawer = screen.getByRole('dialog');
  // The resize handle is the first child of the drawer.
  const handle = drawer.firstElementChild as HTMLElement;
  return { store, drawer, handle, unmount };
}

const widthOf = (el: HTMLElement) => getComputedStyle(el).width;

describe('DetailsDrawer resizing', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(document.body, 'clientWidth', {
      configurable: true,
      value: BODY_WIDTH,
    });
  });

  afterEach(() => {
    delete (document.body as any).clientWidth;
    localStorage.clear();
  });

  it('defaults to 60vw when no width has been saved', () => {
    const { drawer } = renderDrawer();
    expect(widthOf(drawer)).toBe('60vw');
  });

  it('uses the width restored in the store', () => {
    const { drawer } = renderDrawer(makeStore({ detailDrawerWidth: 700 }));
    expect(widthOf(drawer)).toBe('700px');
  });

  it('resizes from the mouse position while dragging the handle', () => {
    const { drawer, handle } = renderDrawer();

    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(window, { clientX: 300 });
    expect(widthOf(drawer)).toBe(`${BODY_WIDTH - 300}px`);

    fireEvent.pointerMove(window, { clientX: 500 });
    expect(widthOf(drawer)).toBe(`${BODY_WIDTH - 500}px`);
  });

  it('ignores mouse movement when the drag did not start on the handle', () => {
    const { drawer } = renderDrawer();

    fireEvent.pointerMove(window, { clientX: 300 });
    expect(widthOf(drawer)).toBe('60vw');
  });

  it('clamps to the minimum width when dragged too far right', () => {
    const { drawer, handle } = renderDrawer();

    fireEvent.pointerDown(handle);
    // Would be 200px wide: below the minimum.
    fireEvent.pointerMove(window, { clientX: BODY_WIDTH - 200 });
    expect(widthOf(drawer)).toBe(`${MIN_WIDTH}px`);

    // The minimum itself is allowed.
    fireEvent.pointerMove(window, { clientX: BODY_WIDTH - MIN_WIDTH });
    expect(widthOf(drawer)).toBe(`${MIN_WIDTH}px`);
  });

  it('clamps to 90% of the body width when dragged too far left', () => {
    const { drawer, handle } = renderDrawer();

    fireEvent.pointerDown(handle);
    // Would be 950px wide: above the maximum.
    fireEvent.pointerMove(window, { clientX: BODY_WIDTH - 950 });
    expect(widthOf(drawer)).toBe(`${MAX_WIDTH}px`);

    // Even when the very first move is at the left edge of the screen.
    fireEvent.pointerMove(window, { clientX: 0 });
    expect(widthOf(drawer)).toBe(`${MAX_WIDTH}px`);

    // The maximum itself is allowed.
    fireEvent.pointerMove(window, { clientX: BODY_WIDTH - MAX_WIDTH });
    expect(widthOf(drawer)).toBe(`${MAX_WIDTH}px`);
  });

  it('saves the clamped width when the drag ends out of range', () => {
    const { store, handle } = renderDrawer();

    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(window, { clientX: 0 });
    fireEvent.pointerUp(window);

    expect(store.getState().drawerMode.detailDrawerWidth).toBe(MAX_WIDTH);
    expect(localStorage.getItem('detailDrawerWidth')).toBe(`${MAX_WIDTH}`);
  });

  it('keeps restored widths within responsive CSS bounds', () => {
    const { drawer } = renderDrawer(makeStore({ detailDrawerWidth: 5000 }));

    expect(getComputedStyle(drawer).minWidth).toBe(`${MIN_WIDTH}px`);
    expect(getComputedStyle(drawer).maxWidth).toBe(`${MAX_DRAWER_WIDTH_RATIO * 100}vw`);
  });

  it('ignores non-primary buttons on the handle', () => {
    const { drawer, handle } = renderDrawer();

    fireEvent.pointerDown(handle, { button: 2 });
    fireEvent.pointerMove(window, { clientX: 300 });
    expect(widthOf(drawer)).toBe('60vw');
  });

  it('stops resizing and saves when the pointer is cancelled', () => {
    const { store, handle } = renderDrawer();

    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(window, { clientX: 400 });
    fireEvent.pointerCancel(window);

    expect(store.getState().drawerMode.detailDrawerWidth).toBe(600);
  });

  it('saves the width to the store and localStorage when the drag ends', () => {
    const { store, handle } = renderDrawer();

    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(window, { clientX: 400 });
    // Nothing is persisted while the drag is still in progress.
    expect(store.getState().drawerMode.detailDrawerWidth).toBeUndefined();
    expect(localStorage.getItem('detailDrawerWidth')).toBeNull();

    fireEvent.pointerUp(window);
    expect(store.getState().drawerMode.detailDrawerWidth).toBe(600);
    expect(localStorage.getItem('detailDrawerWidth')).toBe('600');
  });

  it('stops resizing after the mouse is released', () => {
    const { drawer, handle } = renderDrawer();

    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(window, { clientX: 400 });
    fireEvent.pointerUp(window);

    fireEvent.pointerMove(window, { clientX: 200 });
    expect(widthOf(drawer)).toBe('600px');
  });

  it('does not persist anything when released without a valid drag', () => {
    const { store, handle } = renderDrawer();

    fireEvent.pointerDown(handle);
    fireEvent.pointerUp(window);

    expect(store.getState().drawerMode.detailDrawerWidth).toBeUndefined();
    expect(localStorage.getItem('detailDrawerWidth')).toBeNull();
  });

  it('keeps the saved width when the drawer is reopened for another resource', () => {
    const { store, handle, unmount } = renderDrawer();

    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(window, { clientX: 400 });
    fireEvent.pointerUp(window);
    unmount();

    const reopened = renderDrawer(store);
    expect(widthOf(reopened.drawer)).toBe('600px');
  });

  it('follows width changes dispatched to the store', () => {
    const { store, drawer } = renderDrawer();

    act(() => {
      store.dispatch(setDetailDrawerWidth(800));
    });
    expect(widthOf(drawer)).toBe('800px');
  });

  it('shows the in-progress drag width over the store width until the drag ends', () => {
    const { store, drawer, handle } = renderDrawer(makeStore({ detailDrawerWidth: 700 }));

    fireEvent.pointerDown(handle);
    fireEvent.pointerMove(window, { clientX: 500 });
    expect(widthOf(drawer)).toBe('500px');

    act(() => {
      store.dispatch(setDetailDrawerWidth(800));
    });
    expect(widthOf(drawer)).toBe('500px');

    fireEvent.pointerUp(window);
    expect(store.getState().drawerMode.detailDrawerWidth).toBe(500);
    expect(widthOf(drawer)).toBe('500px');
  });
});

describe('DetailsDrawer resize handle accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(document.body, 'clientWidth', {
      configurable: true,
      value: BODY_WIDTH,
    });
  });

  afterEach(() => {
    delete (document.body as any).clientWidth;
    localStorage.clear();
  });

  it('is exposed as a focusable, labelled vertical separator with value range', () => {
    const { handle } = renderDrawer();

    expect(screen.getByRole('separator', { name: 'Resize details drawer' })).toBe(handle);
    expect(handle).toHaveAttribute('tabindex', '0');
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    // The default width is 60% of the body.
    expect(handle).toHaveAttribute('aria-valuenow', '600');
    expect(handle).toHaveAttribute('aria-valuemin', `${MIN_WIDTH}`);
    expect(handle).toHaveAttribute('aria-valuemax', `${MAX_WIDTH}`);
  });

  it('reports the stored width as the current value', () => {
    const { handle } = renderDrawer(makeStore({ detailDrawerWidth: 700 }));
    expect(handle).toHaveAttribute('aria-valuenow', '700');
  });

  it('widens the drawer with ArrowLeft and narrows it with ArrowRight', () => {
    const { store, drawer, handle } = renderDrawer(makeStore({ detailDrawerWidth: 700 }));

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(widthOf(drawer)).toBe('720px');
    expect(handle).toHaveAttribute('aria-valuenow', '720');

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(widthOf(drawer)).toBe('680px');
    expect(store.getState().drawerMode.detailDrawerWidth).toBe(680);
    expect(localStorage.getItem('detailDrawerWidth')).toBe('680');
  });

  it('starts keyboard resizing from the default width', () => {
    const { store, handle } = renderDrawer();

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(store.getState().drawerMode.detailDrawerWidth).toBe(620);
  });

  it('keeps keyboard resizing within the minimum and maximum width', () => {
    const narrow = renderDrawer(makeStore({ detailDrawerWidth: MIN_WIDTH }));
    fireEvent.keyDown(narrow.handle, { key: 'ArrowRight' });
    expect(narrow.store.getState().drawerMode.detailDrawerWidth).toBe(MIN_WIDTH);
    narrow.unmount();

    const wide = renderDrawer(makeStore({ detailDrawerWidth: MAX_WIDTH }));
    fireEvent.keyDown(wide.handle, { key: 'ArrowLeft' });
    expect(wide.store.getState().drawerMode.detailDrawerWidth).toBe(MAX_WIDTH);
  });

  it('updates the ARIA values and keyboard resizing when the viewport is resized', () => {
    const { store, drawer, handle } = renderDrawer(makeStore({ detailDrawerWidth: 880 }));
    expect(handle).toHaveAttribute('aria-valuenow', '880');
    expect(handle).toHaveAttribute('aria-valuemax', '900');

    // The stored width no longer fits: the CSS max-width now limits the drawer to 810px.
    act(() => {
      Object.defineProperty(document.body, 'clientWidth', { configurable: true, value: 900 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(handle).toHaveAttribute('aria-valuenow', '810');
    expect(handle).toHaveAttribute('aria-valuemax', '810');
    expect(getComputedStyle(drawer).maxWidth).toBe(`${MAX_DRAWER_WIDTH_RATIO * 100}vw`);

    // The first key press moves from the width that is actually shown.
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(store.getState().drawerMode.detailDrawerWidth).toBe(790);
    expect(handle).toHaveAttribute('aria-valuenow', '790');
  });

  it('ignores other keys', () => {
    const { store, handle } = renderDrawer();

    fireEvent.keyDown(handle, { key: 'Enter' });
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(store.getState().drawerMode.detailDrawerWidth).toBeUndefined();
  });
});

describe('drawerModeSlice detailDrawerWidth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('is undefined initially when nothing is saved', async () => {
    const { default: reducer } = await import('../../../redux/drawerModeSlice');
    expect(reducer(undefined, { type: 'init' }).detailDrawerWidth).toBeUndefined();
  });

  it('is restored from localStorage', async () => {
    localStorage.setItem('detailDrawerWidth', '720');
    const { default: reducer } = await import('../../../redux/drawerModeSlice');
    expect(reducer(undefined, { type: 'init' }).detailDrawerWidth).toBe(720);
  });

  it('setDetailDrawerWidth updates the state and localStorage', () => {
    const state = drawerModeReducer(undefined, setDetailDrawerWidth(555));
    expect(state.detailDrawerWidth).toBe(555);
    expect(localStorage.getItem('detailDrawerWidth')).toBe('555');
  });
});
