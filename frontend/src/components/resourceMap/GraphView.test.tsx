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

import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import type { MockInstance } from 'vitest';
import ConfigMap from '../../lib/k8s/configMap';
import { createMuiTheme } from '../../lib/themes';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import { namespaceClusterKey } from './graph/graphFiltering';
import { GraphNode, GraphSource } from './graph/graphModel';
import { EXTREME_SIMPLIFIED_NODE_LIMIT, SIMPLIFIED_NODE_LIMIT } from './graph/graphSimplification';
import { GraphView, GraphViewProps } from './GraphView';

const mocks = vi.hoisted(() => ({ performanceFeatures: false }));

// The performance chips are behind a build-time flag that ./config reads once, when it loads.
// A getter lets each test choose the flag without reloading the modules.
vi.mock('./config', () => ({
  get MAP_PERFORMANCE_FEATURES_ENABLED() {
    return mocks.performanceFeatures;
  },
}));

const lightTheme = createMuiTheme({ base: 'light', name: 'light' });

function makeNodes(count: number, start = 0): GraphNode[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `node-${start + i}`,
    label: `Node ${start + i}`,
  }));
}

function makeConfigMapNode(name: string, resourceVersion = '1'): GraphNode {
  return {
    id: `uid-${name}`,
    kubeObject: new ConfigMap({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name,
        namespace: 'default',
        uid: `uid-${name}`,
        resourceVersion,
        creationTimestamp: '2025-01-01T00:00:00Z',
      },
    }),
  };
}

/** A graph source whose nodes can be replaced while the map is rendered. */
function makeSource(initialNodes: GraphNode[]) {
  let nodes = initialNodes;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const source: GraphSource = {
    id: 'test-source',
    label: 'Things',
    useData() {
      const current = useSyncExternalStore(subscribe, () => nodes);
      return useMemo(() => ({ nodes: current, edges: [] }), [current]);
    },
  };

  return {
    source,
    setNodes(next: GraphNode[]) {
      act(() => {
        nodes = next;
        listeners.forEach(listener => listener());
      });
    },
  };
}

/** GraphSourceManager passes source updates on at most once per second. */
function flushSourceUpdates() {
  act(() => {
    vi.advanceTimersByTime(1000);
  });
}

let queryClient: QueryClient;
let currentSearch = '';

/** Records the URL query, where the map keeps its selection and grouping. */
function LocationSpy() {
  const { search } = useLocation();
  useEffect(() => {
    currentSearch = search;
  }, [search]);
  return null;
}

const selectedNodeParam = () => new URLSearchParams(currentSearch).get('node');

function renderGraphView(
  props: GraphViewProps,
  {
    theme = lightTheme,
    urlSearchParams,
  }: { theme?: typeof lightTheme; urlSearchParams?: Record<string, string> } = {}
) {
  const store = configureStore({
    reducer: reducers,
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });

  const ui = (graphViewProps: GraphViewProps) => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <TestContext store={store} urlSearchParams={urlSearchParams}>
          <GraphView height="400px" defaultRelations={[]} {...graphViewProps} />
          <LocationSpy />
        </TestContext>
      </ThemeProvider>
    </QueryClientProvider>
  );

  const result = render(ui(props));
  return {
    ...result,
    rerenderGraphView: (newProps: GraphViewProps) => result.rerender(ui(newProps)),
  };
}

const chip = (name: string) => screen.getByRole('button', { name });

function expectActive(name: string, active: boolean) {
  if (active) {
    expect(chip(name)).toHaveClass('MuiChip-filled');
  } else {
    expect(chip(name)).toHaveClass('MuiChip-outlined');
  }
}

describe('GraphView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    queryClient = new QueryClient();
    mocks.performanceFeatures = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    queryClient.clear();
    delete (window as any).__HEADLAMP_DEBUG_PERFORMANCE__;
    vi.restoreAllMocks();
  });

  it('groups by namespace by default and toggles each grouping chip', () => {
    const { source } = makeSource(makeNodes(3));
    renderGraphView({ defaultSources: [source] });

    expectActive('Namespace', true);
    expectActive('Instance', false);
    expectActive('Node', false);
    expect(screen.queryByRole('button', { name: 'Incremental Updates' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Performance Stats' })).toBeNull();

    fireEvent.click(chip('Namespace'));
    expectActive('Namespace', false);
    fireEvent.click(chip('Namespace'));
    expectActive('Namespace', true);

    fireEvent.click(chip('Instance'));
    expectActive('Instance', true);
    expectActive('Namespace', false);
    fireEvent.click(chip('Instance'));
    expectActive('Instance', false);

    fireEvent.click(chip('Node'));
    expectActive('Node', true);
    fireEvent.click(chip('Node'));
    expectActive('Node', false);
  });

  it('hides the Namespace grouping chip when exactly one namespace is selected', () => {
    const { source } = makeSource(makeNodes(3));
    renderGraphView({ defaultSources: [source] }, { urlSearchParams: { namespace: 'default' } });

    expect(screen.queryByRole('button', { name: 'Namespace' })).toBeNull();
    expect(chip('Instance')).toBeInTheDocument();
  });

  it('keeps the Namespace grouping chip when several namespaces are selected', () => {
    const { source } = makeSource(makeNodes(3));
    renderGraphView(
      { defaultSources: [source] },
      { urlSearchParams: { namespace: 'default kube-system' } }
    );

    expect(chip('Namespace')).toBeInTheDocument();
  });

  it('selects from the breadcrumbs and clears the selection from Home', () => {
    const { source } = makeSource([makeConfigMapNode('settings'), makeConfigMapNode('flags')]);
    renderGraphView({ defaultSources: [source], defaultNodeSelection: 'uid-settings' });
    flushSourceUpdates();

    const breadcrumbs = screen.getByRole('navigation');
    expect(within(breadcrumbs).getByLabelText('ConfigMap settings')).toBeInTheDocument();
    expect(selectedNodeParam()).toBe('uid-settings');

    fireEvent.click(within(breadcrumbs).getByLabelText('Namespace default'));
    expect(within(breadcrumbs).queryByLabelText('ConfigMap settings')).toBeNull();
    expect(within(breadcrumbs).getByLabelText('Namespace default')).toBeInTheDocument();
    expect(selectedNodeParam()).toBe('Namespace-default');

    // Home is the graph root: choosing it removes the selection instead of selecting "root".
    fireEvent.click(within(breadcrumbs).getByLabelText('Home'));
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(selectedNodeParam()).toBeNull();
  });

  it('shows only resources with errors or warnings while the status filter is on', () => {
    const { source } = makeSource([
      { id: 'healthy', label: 'Healthy' },
      { id: 'failing', label: 'Failing', status: 'error' },
    ]);
    renderGraphView({ defaultSources: [source], defaultNodeSelection: 'healthy' });
    flushSourceUpdates();
    expect(within(screen.getByRole('navigation')).getByText('Healthy')).toBeInTheDocument();

    fireEvent.click(chip('Status: Error or Warning'));
    expectActive('Status: Error or Warning', true);
    expect(screen.queryByRole('navigation')).toBeNull();

    fireEvent.click(chip('Status: Error or Warning'));
    expectActive('Status: Error or Warning', false);
    expect(within(screen.getByRole('navigation')).getByText('Healthy')).toBeInTheDocument();
  });

  it('remembers the zoom mode chosen with the viewport buttons', () => {
    const { source } = makeSource(makeNodes(3));
    renderGraphView({ defaultSources: [source] });

    fireEvent.click(chip('Fit to screen'));
    expect(localStorage.getItem('map-zoom-mode')).toBe(JSON.stringify('fit'));

    fireEvent.click(chip('100%'));
    expect(localStorage.getItem('map-zoom-mode')).toBe(JSON.stringify('100%'));
  });

  it('resets Expand All when the graph grows past 50 nodes', () => {
    const { source, setNodes } = makeSource(makeNodes(3));
    renderGraphView({ defaultSources: [source] });
    flushSourceUpdates();

    fireEvent.click(chip('Expand All'));
    expectActive('Expand All', true);

    setNodes(makeNodes(60));
    flushSourceUpdates();
    setNodes(makeNodes(3));
    flushSourceUpdates();
    expectActive('Expand All', false);
  });

  it.each([
    [1001, SIMPLIFIED_NODE_LIMIT],
    [10001, EXTREME_SIMPLIFIED_NODE_LIMIT],
  ])('offers to simplify a graph of %i nodes to %i nodes', (count, limit) => {
    const { source } = makeSource(makeNodes(count));
    renderGraphView({ defaultSources: [source] });
    flushSourceUpdates();

    const simplify = `Simplify (${limit} most important)`;
    const warning = `Showing ${limit} of ${count} nodes`;
    expectActive(simplify, true);
    expect(screen.getByText(warning)).toBeInTheDocument();

    fireEvent.click(chip(simplify));
    expectActive(simplify, false);
    expect(screen.queryByText(warning)).toBeNull();
  });

  it.each([
    ['light', 'rgb(85, 85, 85)'],
    ['dark', 'rgb(250, 250, 250)'],
  ] as const)('gives active chips the map colors in the %s theme', (base, background) => {
    const { source } = makeSource(makeNodes(3));
    renderGraphView({ defaultSources: [source] }, { theme: createMuiTheme({ base, name: base }) });

    expect(getComputedStyle(chip('Namespace')).backgroundColor).toBe(background);
  });

  describe('performance debug logging', () => {
    let log: MockInstance<typeof console.log>;

    beforeEach(() => {
      log = vi.spyOn(console, 'log');
    });

    /** Debug lines logged since the last call, optionally only those containing `text`. */
    function takeLogs(text = '') {
      const lines = log.mock.calls.map(([message]) => String(message));
      log.mockClear();
      return lines.filter(line => line.includes(text));
    }

    it('logs nothing unless the debug flag is set', () => {
      const { source } = makeSource(makeNodes(10));
      renderGraphView({ defaultSources: [source] });
      flushSourceUpdates();

      expect(takeLogs('[ResourceMap Performance]')).toEqual([]);
    });

    it('processes small additions incrementally and filter changes in full', () => {
      (window as any).__HEADLAMP_DEBUG_PERFORMANCE__ = true;
      const { source, setNodes } = makeSource(makeNodes(10));
      renderGraphView({ defaultSources: [source] });
      flushSourceUpdates();
      expect(takeLogs('filteredGraph useMemo').at(-1)).toContain('(FULL processing)');

      setNodes(makeNodes(11));
      flushSourceUpdates();
      expect(takeLogs('filteredGraph useMemo').at(-1)).toContain('(INCREMENTAL processing)');

      // Same graph, new filter: reusing the previous result would be wrong.
      fireEvent.click(chip('Status: Error or Warning'));
      expect(takeLogs('filteredGraph useMemo').at(-1)).toContain('(FULL processing)');
    });

    it('processes the whole graph again when a node is deleted', () => {
      (window as any).__HEADLAMP_DEBUG_PERFORMANCE__ = true;
      const { source, setNodes } = makeSource(makeNodes(10));
      renderGraphView({ defaultSources: [source] });
      flushSourceUpdates();
      takeLogs();

      setNodes(makeNodes(9));
      flushSourceUpdates();
      const logs = takeLogs();
      expect(logs.some(line => line.includes('% changed: +0 ~0 -1)'))).toBe(true);
      expect(logs.filter(line => line.includes('filteredGraph useMemo')).at(-1)).toContain(
        '(FULL processing)'
      );
    });

    it('processes the whole graph again when the namespaces of a default filter change', () => {
      (window as any).__HEADLAMP_DEBUG_PERFORMANCE__ = true;
      const { source } = makeSource(makeNodes(10));
      const filterFor = (namespace: string) => ({
        defaultSources: [source],
        defaultFilters: [
          {
            type: 'namespaceCluster' as const,
            namespaceRefs: new Set([namespaceClusterKey('cluster-a', namespace)]),
          },
        ],
      });
      const { rerenderGraphView } = renderGraphView(filterFor('default'));
      flushSourceUpdates();

      rerenderGraphView(filterFor('default'));
      expect(takeLogs('filteredGraph useMemo').at(-1)).toContain('(INCREMENTAL processing)');

      // A Set serializes to {} in JSON, so the filter signature must list its members.
      rerenderGraphView(filterFor('kube-system'));
      expect(takeLogs('filteredGraph useMemo').at(-1)).toContain('(FULL processing)');
    });

    it('processes the whole graph when incremental updates are turned off', () => {
      mocks.performanceFeatures = true;
      (window as any).__HEADLAMP_DEBUG_PERFORMANCE__ = true;
      const { source, setNodes } = makeSource(makeNodes(10));
      renderGraphView({ defaultSources: [source] });
      flushSourceUpdates();

      expectActive('Incremental Updates', true);
      fireEvent.click(chip('Incremental Updates'));
      expectActive('Incremental Updates', false);
      takeLogs();

      setNodes(makeNodes(11));
      flushSourceUpdates();
      expect(takeLogs('filteredGraph useMemo').at(-1)).toContain('(FULL processing)');
    });
  });

  it('opens and closes the performance stats panel', () => {
    mocks.performanceFeatures = true;
    const { source } = makeSource(makeNodes(3));
    renderGraphView({ defaultSources: [source] });

    expect(screen.queryByRole('heading', { name: 'Performance Stats' })).toBeNull();
    fireEvent.click(chip('Performance Stats'));
    expectActive('Performance Stats', true);
    expect(screen.getByRole('heading', { name: 'Performance Stats' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: 'Performance Stats' })).toBeNull();
    expectActive('Performance Stats', false);
  });
});
