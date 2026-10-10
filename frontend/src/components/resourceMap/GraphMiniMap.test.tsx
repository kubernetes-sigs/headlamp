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
  MiniMap: vi.fn((props: any) => (
    <div
      data-testid="xyflow-minimap"
      aria-label={props.ariaLabel}
      style={props.style}
      data-style-right={props.style?.right}
    />
  )),
}));

vi.mock('@xyflow/react', () => ({
  MiniMap: (props: any) => mocks.MiniMap(props),
  MiniMapNode: () => null,
  useStore: (selector: any) => mocks.useStore(selector),
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

  it('docks minimap beside DetailsDrawer when open', () => {
    mocks.useStore.mockImplementation(selector => selector({ nodes: [{ id: 'node-1' }] }));
    mocks.useLocalStorageState.mockReturnValue([false, vi.fn()]);
    mocks.useTypedSelector.mockImplementation((selector: any) => {
      const state = {
        drawerMode: { selectedResource: { id: 'pod-1' }, isDetailDrawerEnabled: true },
        activity: { activities: {} },
      };
      return selector(state);
    });

    const { getByTestId } = render(<GraphMiniMap />);
    const minimap = getByTestId('xyflow-minimap');
    expect(minimap.getAttribute('data-style-right')).toBe('calc(60vw + 16px)');
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

  it('docks minimap beside wide right activity when open', () => {
    mocks.useStore.mockImplementation(selector => selector({ nodes: [{ id: 'node-1' }] }));
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

    const { getByTestId } = render(<GraphMiniMap />);
    const minimap = getByTestId('xyflow-minimap');
    expect(minimap.getAttribute('data-style-right')).toBe('calc(max(50%, 1024px) + 16px)');
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
