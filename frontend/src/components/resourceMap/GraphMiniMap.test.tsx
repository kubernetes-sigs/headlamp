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

import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
  useLocalStorageState: vi.fn(),
  useTypedSelector: vi.fn(),
  useReactFlow: vi.fn(() => ({
    setCenter: vi.fn(),
    getZoom: vi.fn(() => 1.5),
  })),
  useMediaQuery: vi.fn((...args: any[]) => {
    void args;
    return false;
  }),
  MiniMap: vi.fn((props: any) => (
    <button
      type="button"
      data-testid="xyflow-minimap"
      aria-label={props.ariaLabel}
      style={props.style}
      data-style-right={props.style?.right}
      data-style-transition={props.style?.transition}
      onClick={e => props.onClick?.(e, { x: 50, y: 100 })}
    />
  )),
}));

vi.mock('@mui/material/useMediaQuery', () => ({
  default: (query: any) => mocks.useMediaQuery(query),
}));
vi.mock('@xyflow/react', () => ({
  MiniMap: (props: any) => mocks.MiniMap(props),
  MiniMapNode: () => null,
  useStore: (selector: any) => mocks.useStore(selector),
  useReactFlow: () => mocks.useReactFlow(),
}));
vi.mock('../../redux/hooks', () => ({
  useTypedSelector: (selector: any) => mocks.useTypedSelector(selector),
}));
vi.mock('../globalSearch/useLocalStorageState', () => ({
  useLocalStorageState: (key: string, defaultValue: any) =>
    mocks.useLocalStorageState(key, defaultValue),
}));
vi.mock('./nodes/KubeObjectStatus', () => ({
  getGraphNodeStatus: (node: any) => node.status ?? 'success',
}));
vi.mock('./graphViewContext', () => ({
  useFullGraphContext: () => ({ lookup: { getNode: () => undefined } }),
}));

import type { GraphNode } from './graph/graphModel';
import {
  getEffectiveGraphNodeStatus,
  getMinimapNodeColors,
  getMinimapNodeDimensions,
  GraphMiniMap,
} from './GraphMiniMap';

describe('GraphMiniMap component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useTypedSelector.mockReturnValue(false);
  });

  it('renders null when there are no nodes in the store', () => {
    mocks.useStore.mockImplementation(selector => selector({ nodes: [] }));
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);

    const { container } = render(<GraphMiniMap />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when the hidden preference is true', () => {
    mocks.useStore.mockImplementation(selector => selector({ nodes: [{ id: 'node-1' }] }));
    mocks.useLocalStorageState.mockReturnValue([true, vi.fn()]);

    const { container } = render(<GraphMiniMap />);
    expect(container.firstChild).toBeNull();
  });

  it('renders MiniMap when nodes exist and hidden preference is false', () => {
    mocks.useStore.mockImplementation(selector => selector({ nodes: [{ id: 'node-1' }] }));
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);

    const { getByTestId } = render(<GraphMiniMap />);
    const minimap = getByTestId('xyflow-minimap');
    expect(minimap).toBeTruthy();
    expect(minimap.getAttribute('data-style-right')).toBe('16');
  });

  it('hides minimap when DetailsDrawer is open', () => {
    mocks.useStore.mockImplementation(selector => selector({ nodes: [{ id: 'node-1' }] }));
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);
    mocks.useTypedSelector.mockImplementation((selector: any) => {
      const state = {
        drawerMode: { selectedResource: { id: 'pod-1' }, isDetailDrawerEnabled: true },
        activity: { activities: {} },
      };
      return selector(state);
    });

    const { container } = render(<GraphMiniMap />);
    expect(container.firstChild).toBeNull();
  });

  it('keeps minimap visible when DetailsDrawer state exists but screen is resized below md', () => {
    mocks.useStore.mockImplementation(selector =>
      selector({ nodes: [{ id: 'node-1' }], width: 600 })
    );
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);
    mocks.useMediaQuery.mockImplementation((query: any) => {
      if (typeof query === 'string' && query.includes('reduce')) return false;
      return true; // isSmallScreen is true (screen resized below md)
    });
    mocks.useTypedSelector.mockImplementation((selector: any) => {
      const state = {
        drawerMode: { selectedResource: { id: 'pod-1' }, isDetailDrawerEnabled: true },
        activity: { activities: {} },
      };
      return selector(state);
    });

    const { getByTestId } = render(<GraphMiniMap />);
    expect(getByTestId('xyflow-minimap')).toBeTruthy();
  });

  it('handles resize across the md breakpoint without hook order errors', () => {
    mocks.useStore.mockImplementation(selector =>
      selector({ nodes: [{ id: 'node-1' }], width: 1200 })
    );
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);
    mocks.useTypedSelector.mockImplementation((selector: any) => {
      const state = {
        drawerMode: { selectedResource: { id: 'pod-1' }, isDetailDrawerEnabled: true },
        activity: { activities: {} },
      };
      return selector(state);
    });

    // Start wide: drawer is open and visible -> minimap is hidden
    mocks.useMediaQuery.mockImplementation((query: any) => {
      if (typeof query === 'string' && query.includes('reduce')) return false;
      return false;
    });

    const { container, rerender, getByTestId } = render(<GraphMiniMap />);
    expect(container.firstChild).toBeNull();

    // Resize below md: drawer hides -> minimap becomes visible
    mocks.useMediaQuery.mockImplementation((query: any) => {
      if (typeof query === 'string' && query.includes('reduce')) return false;
      return true;
    });

    rerender(<GraphMiniMap />);
    expect(getByTestId('xyflow-minimap')).toBeTruthy();

    // Resize back to wide: drawer visible -> minimap hidden again
    mocks.useMediaQuery.mockImplementation((query: any) => {
      if (typeof query === 'string' && query.includes('reduce')) return false;
      return false;
    });

    rerender(<GraphMiniMap />);
    expect(container.firstChild).toBeNull();
  });

  it('docks minimap beside right activity when open', () => {
    mocks.useStore.mockImplementation(selector => selector({ nodes: [{ id: 'node-1' }] }));
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);
    mocks.useTypedSelector.mockImplementation((selector: any) => {
      const state = {
        drawerMode: { selectedResource: null, isDetailDrawerEnabled: false },
        activity: {
          activities: {
            act1: { minimized: false, location: 'split-right' },
          },
        },
      };
      return selector(state);
    });

    const { getByTestId } = render(<GraphMiniMap />);
    const minimap = getByTestId('xyflow-minimap');
    expect(minimap.getAttribute('data-style-right')).toBe('calc(50% + 16px)');
  });

  it('docks minimap beside wide right activity when open on wide screen', () => {
    mocks.useStore.mockImplementation(selector =>
      selector({ nodes: [{ id: 'node-1' }], width: 1400 })
    );
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);
    mocks.useMediaQuery.mockReturnValue(false);
    mocks.useTypedSelector.mockImplementation((selector: any) => {
      const state = {
        drawerMode: { selectedResource: null, isDetailDrawerEnabled: false },
        activity: {
          activities: {
            act1: { minimized: false, location: 'split-right-wide' },
          },
        },
      };
      return selector(state);
    });

    const { getByTestId } = render(<GraphMiniMap />);
    const minimap = getByTestId('xyflow-minimap');
    expect(minimap.getAttribute('data-style-right')).toBe('calc(max(50%, 1024px) + 16px)');
    expect(minimap.getAttribute('data-style-transition')).toBe(
      'right 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
    );
  });

  it('hides minimap when wide right activity is open and graph container width is too narrow', () => {
    // 1280px window with 240px sidebar yields 1040px canvas: insufficient room for 1024px wide panel + minimap
    mocks.useStore.mockImplementation(selector =>
      selector({ nodes: [{ id: 'node-1' }], width: 1040 })
    );
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);
    mocks.useTypedSelector.mockImplementation((selector: any) => {
      const state = {
        drawerMode: { selectedResource: null, isDetailDrawerEnabled: false },
        activity: {
          activities: {
            act1: { minimized: false, location: 'split-right-wide' },
          },
        },
      };
      return selector(state);
    });

    const { container } = render(<GraphMiniMap />);
    expect(container.firstChild).toBeNull();
  });

  it('hides minimap when split-right activity is open and container width is too narrow', () => {
    // 380px canvas with 50% split (190px remaining < 212px required)
    mocks.useStore.mockImplementation(selector =>
      selector({ nodes: [{ id: 'node-1' }], width: 380 })
    );
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);
    mocks.useTypedSelector.mockImplementation((selector: any) => {
      const state = {
        drawerMode: { selectedResource: null, isDetailDrawerEnabled: false },
        activity: {
          activities: {
            act1: { minimized: false, location: 'split-right' },
          },
        },
      };
      return selector(state);
    });

    const { container } = render(<GraphMiniMap />);
    expect(container.firstChild).toBeNull();
  });

  it('disables animation when prefers-reduced-motion is true', () => {
    mocks.useStore.mockImplementation(selector => selector({ nodes: [{ id: 'node-1' }] }));
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);
    mocks.useMediaQuery.mockImplementation(
      (query: string) => query === '(prefers-reduced-motion: reduce)'
    );

    const { getByTestId } = render(<GraphMiniMap />);
    const minimap = getByTestId('xyflow-minimap');
    expect(minimap.getAttribute('data-style-transition')).toBe('none');
  });

  it('centers the viewport on clicked coordinate preserving current zoom level', () => {
    const setCenterMock = vi.fn();
    mocks.useReactFlow.mockReturnValue({
      setCenter: setCenterMock,
      getZoom: vi.fn(() => 1.75),
    });
    mocks.useStore.mockImplementation(selector => selector({ nodes: [{ id: 'node-1' }] }));
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);

    const { getByTestId } = render(<GraphMiniMap />);
    const minimap = getByTestId('xyflow-minimap');
    minimap.click();

    expect(setCenterMock).toHaveBeenCalledWith(50, 100, { zoom: 1.75 });
  });

  it('notifies onInteraction during click, drag, or wheel navigation', () => {
    const onInteraction = vi.fn();
    mocks.useStore.mockImplementation(selector => selector({ nodes: [{ id: 'node-1' }] }));
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);

    const { getByTestId } = render(<GraphMiniMap onInteraction={onInteraction} />);
    const minimap = getByTestId('xyflow-minimap');

    // Click
    minimap.click();
    expect(onInteraction).toHaveBeenCalledTimes(1);

    // PointerDown (drag gesture start)
    minimap.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(onInteraction).toHaveBeenCalledTimes(2);

    // Wheel (zoom gesture)
    minimap.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    expect(onInteraction).toHaveBeenCalledTimes(3);
  });
});

describe('getEffectiveGraphNodeStatus', () => {
  it('returns success for healthy leaf node', () => {
    const node: GraphNode = { id: 'leaf-1', status: 'success' };
    expect(getEffectiveGraphNodeStatus(node)).toBe('success');
  });

  it('returns error for failed leaf node', () => {
    const node: GraphNode = { id: 'leaf-2', status: 'error' };
    expect(getEffectiveGraphNodeStatus(node)).toBe('error');
  });

  it('returns warning for group node with a warning child', () => {
    const group: GraphNode = {
      id: 'group-1',
      nodes: [
        { id: 'child-1', status: 'success' },
        { id: 'child-2', status: 'warning' },
      ],
    };
    expect(getEffectiveGraphNodeStatus(group)).toBe('warning');
  });

  it('returns error for group node with error child even if other child has warning', () => {
    const group: GraphNode = {
      id: 'group-2',
      nodes: [
        { id: 'child-1', status: 'warning' },
        { id: 'child-2', status: 'error' },
      ],
    };
    expect(getEffectiveGraphNodeStatus(group)).toBe('error');
  });

  it('does not downgrade an error on the group itself when a child has warning', () => {
    const group: GraphNode = {
      id: 'group-own-error',
      status: 'error',
      nodes: [{ id: 'child-1', status: 'warning' }],
    };
    expect(getEffectiveGraphNodeStatus(group)).toBe('error');
  });

  it('recursively detects errors in nested groups', () => {
    const nestedGroup: GraphNode = {
      id: 'ns-group',
      nodes: [
        {
          id: 'workload-group',
          nodes: [{ id: 'pod-1', status: 'error' }],
        },
      ],
    };
    expect(getEffectiveGraphNodeStatus(nestedGroup)).toBe('error');
  });
});

describe('getMinimapNodeColors', () => {
  const darkTheme = {
    palette: {
      mode: 'dark',
      divider: '#333333',
      success: { main: '#4caf50' },
      warning: { main: '#ff9800' },
      error: { main: '#f44336' },
    },
  };

  const lightTheme = {
    palette: {
      mode: 'light',
      divider: '#e0e0e0',
      success: { main: '#4caf50' },
      warning: { main: '#ff9800' },
      error: { main: '#f44336' },
    },
  };

  it('renders healthy expanded groups with a translucent tint and subtle border', () => {
    const expandedGroup: GraphNode = {
      id: 'group-1',
      collapsed: false,
      nodes: [{ id: 'child-1', status: 'success' }],
    };
    expect(getMinimapNodeColors(expandedGroup, darkTheme)).toEqual({
      color: 'rgba(255, 255, 255, 0.05)',
      strokeColor: 'rgba(255, 255, 255, 0.35)',
    });
    expect(getMinimapNodeColors(expandedGroup, lightTheme)).toEqual({
      color: 'rgba(0, 0, 0, 0.03)',
      strokeColor: 'rgba(0, 0, 0, 0.25)',
    });
  });

  it('highlights unhealthy expanded groups with their status stroke color', () => {
    const errorGroup: GraphNode = {
      id: 'group-err',
      collapsed: false,
      nodes: [{ id: 'child-1', status: 'error' }],
    };
    expect(getMinimapNodeColors(errorGroup, darkTheme)).toEqual({
      color: 'rgba(255, 255, 255, 0.05)',
      strokeColor: '#f44336',
    });
  });

  it('renders collapsed groups with solid status color and transparent stroke', () => {
    const collapsedGroup: GraphNode = {
      id: 'group-2',
      collapsed: true,
      nodes: [{ id: 'child-1', status: 'error' }],
    };
    expect(getMinimapNodeColors(collapsedGroup, darkTheme)).toEqual({
      color: '#f44336',
      strokeColor: 'transparent',
    });
  });

  it('renders leaf nodes with solid status color and transparent stroke', () => {
    const leafNode: GraphNode = {
      id: 'pod-1',
      status: 'success',
    };
    expect(getMinimapNodeColors(leafNode, darkTheme)).toEqual({
      color: '#4caf50',
      strokeColor: 'transparent',
    });
  });
});

describe('getMinimapNodeDimensions', () => {
  it('insets expanded groups by the specified padding to create breathing room', () => {
    const groupRect = { x: 100, y: 50, width: 200, height: 120 };
    expect(getMinimapNodeDimensions(groupRect, true, 8)).toEqual({
      x: 108,
      y: 58,
      width: 184,
      height: 104,
    });
  });

  it('leaves leaf nodes and collapsed groups at their exact bounds', () => {
    const leafRect = { x: 120, y: 70, width: 60, height: 30 };
    expect(getMinimapNodeDimensions(leafRect, false, 8)).toEqual({
      x: 120,
      y: 70,
      width: 60,
      height: 30,
    });
  });
});
