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

import { act, renderHook } from '@testing-library/react';
import { Node } from '@xyflow/react';
import { maxZoom, minZoom, viewportPaddingPx } from './graphConstants';
import { useGraphViewport } from './useGraphViewport';

const mocks = vi.hoisted(() => ({
  getNodes: vi.fn(),
  getNodesBounds: vi.fn(),
  getViewportForBounds: vi.fn(),
  setViewport: vi.fn(),
  setZoomMode: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  getViewportForBounds: mocks.getViewportForBounds,
  useReactFlow: () => ({
    getNodes: mocks.getNodes,
    getNodesBounds: mocks.getNodesBounds,
    setViewport: mocks.setViewport,
  }),
  useStore: (selector: (state: { width: number; height: number }) => unknown) =>
    selector({ width: 800, height: 400 }),
}));

vi.mock('../globalSearch/useLocalStorageState', () => ({
  useLocalStorageState: () => ['100%', mocks.setZoomMode],
}));

describe('useGraphViewport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses current nodes and the stored 100% mode by default', () => {
    const nodes = [{ id: 'current-node' }] as Node[];
    mocks.getNodes.mockReturnValue(nodes);
    mocks.getNodesBounds.mockReturnValue({ x: 10, y: 20, width: 300, height: 100 });

    const { result } = renderHook(() => useGraphViewport());

    act(() => result.current.updateViewport({}));

    expect(result.current.aspectRatio).toBe(2);
    expect(mocks.getNodesBounds).toHaveBeenCalledWith(nodes);
    expect(mocks.setZoomMode).not.toHaveBeenCalled();
    expect(mocks.setViewport).toHaveBeenCalledWith({ x: 250, y: 150, zoom: 1 });
  });

  it('uses top-left padding independently for dimensions that do not fit at 100%', () => {
    mocks.getNodesBounds.mockReturnValue({ x: 0, y: 0, width: 750, height: 200 });
    const { result } = renderHook(() => useGraphViewport());

    act(() => result.current.updateViewport({ nodes: [], mode: '100%' }));

    expect(mocks.setViewport).toHaveBeenCalledWith({
      x: viewportPaddingPx,
      y: 100,
      zoom: 1,
    });

    mocks.getNodesBounds.mockReturnValue({ x: 0, y: 0, width: 200, height: 350 });
    act(() => result.current.updateViewport({ nodes: [], mode: '100%' }));

    expect(mocks.setViewport).toHaveBeenLastCalledWith({
      x: 300,
      y: viewportPaddingPx,
      zoom: 1,
    });
  });

  it('fits padded bounds and persists a changed fit mode', () => {
    const bounds = { x: 25, y: 40, width: 500, height: 250 };
    const fittedViewport = { x: 12, y: 18, zoom: 0.75 };
    mocks.getNodesBounds.mockReturnValue(bounds);
    mocks.getViewportForBounds.mockReturnValue(fittedViewport);
    const { result } = renderHook(() => useGraphViewport());

    act(() => result.current.updateViewport({ nodes: [], mode: 'fit' }));

    expect(mocks.setZoomMode).toHaveBeenCalledTimes(1);
    expect(mocks.setZoomMode.mock.calls[0][0]('100%')).toBe('fit');
    expect(mocks.getViewportForBounds).toHaveBeenCalledWith(
      {
        x: bounds.x - viewportPaddingPx,
        y: bounds.y - viewportPaddingPx,
        width: bounds.width + viewportPaddingPx * 2,
        height: bounds.height + viewportPaddingPx * 2,
      },
      800,
      400,
      minZoom,
      maxZoom,
      0
    );
    expect(mocks.setViewport).toHaveBeenCalledWith(fittedViewport);
  });

  it('reports an unknown mode without changing the viewport', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getNodesBounds.mockReturnValue({ x: 0, y: 0, width: 1, height: 1 });
    const { result } = renderHook(() => useGraphViewport());

    act(() => result.current.updateViewport({ nodes: [], mode: 'unsupported' as 'fit' | '100%' }));

    expect(consoleError).toHaveBeenCalledWith('Unknown zoom mode', 'unsupported');
    expect(mocks.setViewport).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
