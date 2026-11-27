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
import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadTableSettings, storeTableSettings } from '../../../helpers/tableSettings';
import { useSelectedClusters } from '../../../lib/k8s';
import { createMuiTheme } from '../../../lib/themes';
import { HeadlampEventType } from '../../../redux/headlampEventSlice';
import reducers from '../../../redux/reducers/reducers';
import { TestContext } from '../../../test';
import ResourceTable, { useThrottle } from './ResourceTable';
import { addResourceTableColumnsProcessor } from './resourceTableSlice';

function createStoreWithNamespaces(namespaces: string[]) {
  return configureStore({
    reducer: reducers,
    preloadedState: {
      filter: { namespaces: new Set(namespaces) },
    },
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: false,
        thunk: true,
      }),
  });
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../../lib/k8s', () => ({
  useSelectedClusters: vi.fn(() => ['test-cluster']),
}));

// Capture the props passed to Table using a hoisted holder object
const { lastTablePropsHolder } = vi.hoisted(() => ({
  lastTablePropsHolder: { current: null as any },
}));

vi.mock('../Table', () => {
  return {
    default: (props: any) => {
      lastTablePropsHolder.current = props;
      return <div data-testid="mock-table" />;
    },
  };
});

const theme = createMuiTheme({ base: 'light', name: 'light' });

const mockData = [
  {
    kind: 'Pod',
    metadata: {
      name: 'mypod1',
      namespace: 'namespace1',
      uid: 'uid1',
      creationTimestamp: '2021-12-15T14:57:13Z',
    },
  },
];

describe('ResourceTable Column Visibility', () => {
  beforeEach(() => {
    localStorage.clear();
    lastTablePropsHolder.current = null;

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderTable = (props: any) => {
    return render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <ResourceTable {...props} />
        </ThemeProvider>
      </TestContext>
    );
  };

  it('initializes column visibility with default settings if none stored', async () => {
    const columns = [
      {
        id: 'name',
        label: 'Name',
        getValue: (item: any) => item.metadata.name,
      },
      {
        id: 'namespace',
        label: 'Namespace',
        getValue: (item: any) => item.metadata.namespace,
        show: false,
      },
      {
        id: 'status',
        label: 'Status',
        getValue: () => '',
        show: true,
      },
    ];

    renderTable({
      id: 'test-table-id',
      columns,
      data: mockData,
    });

    expect(lastTablePropsHolder.current).not.toBeNull();
    // Only columns hidden by default are present, so the others can still hide responsively
    expect(lastTablePropsHolder.current.state.columnVisibility).toEqual({
      namespace: false,
    });
  });

  it('loads and applies persisted settings from localStorage', async () => {
    // Save settings: name hidden (show: false), namespace shown (show: true)
    storeTableSettings('test-table-id', [
      { id: 'name', show: false },
      { id: 'namespace', show: true },
    ]);

    const columns = [
      {
        id: 'name',
        label: 'Name',
        getValue: (item: any) => item.metadata.name,
      },
      {
        id: 'namespace',
        label: 'Namespace',
        getValue: (item: any) => item.metadata.namespace,
      },
    ];

    renderTable({
      id: 'test-table-id',
      columns,
      data: mockData,
    });

    expect(lastTablePropsHolder.current).not.toBeNull();
    expect(lastTablePropsHolder.current.state.columnVisibility).toEqual({
      name: false,
      namespace: true,
    });
  });

  it('persists column visibility changes to localStorage and updates state', async () => {
    const columns = [
      {
        id: 'name',
        label: 'Name',
        getValue: (item: any) => item.metadata.name,
      },
      {
        id: 'namespace',
        label: 'Namespace',
        getValue: (item: any) => item.metadata.namespace,
      },
    ];

    renderTable({
      id: 'test-table-id',
      columns,
      data: mockData,
    });

    expect(lastTablePropsHolder.current).not.toBeNull();

    // Simulate MRT calling onColumnVisibilityChange
    act(() => {
      lastTablePropsHolder.current.onColumnVisibilityChange({
        name: false,
        namespace: true,
      });
    });

    // Check that settings are persisted in local storage
    const storedSettings = loadTableSettings('test-table-id');
    expect(storedSettings).toEqual([
      { id: 'name', show: false },
      { id: 'namespace', show: true },
    ]);

    // Check that state has updated on the next render
    expect(lastTablePropsHolder.current.state.columnVisibility).toEqual({
      name: false,
      namespace: true,
    });
  });

  it('disables faceted values when more than 500 rows are loaded', () => {
    const columns = [
      {
        id: 'name',
        label: 'Name',
        getValue: (item: any) => item.metadata.name,
      },
    ];
    const data = Array.from({ length: 501 }, (_, index) => ({
      metadata: { name: `pod-${index}` },
    })) as any[];

    const result = renderTable({ id: 'large-table', columns, data });

    expect(lastTablePropsHolder.current.enableFacetedValues).toBe(false);

    result.rerender(
      <TestContext>
        <ThemeProvider theme={theme}>
          <ResourceTable id="large-table" columns={columns} data={data.slice(0, 500)} />
        </ThemeProvider>
      </TestContext>
    );

    expect(lastTablePropsHolder.current.enableFacetedValues).toBe(true);
  });

  it('shows an empty table instead of loading when asked to list from no cluster', () => {
    const useList = vi.fn(() => ({ items: null, errors: null }));
    const resourceClass = { pluralName: 'deviceclasses', className: 'DeviceClass', useList };

    renderTable({ resourceClass, columns: ['name'], clusters: [] });

    expect(useList).toHaveBeenCalledWith(expect.objectContaining({ clusters: [] }));
    expect(lastTablePropsHolder.current.loading).toBe(false);
    expect(lastTablePropsHolder.current.data).toEqual([]);
  });

  it('settles when asked to list from no cluster instead of updating again', () => {
    vi.useFakeTimers();
    try {
      const useList = vi.fn(() => ({ items: null, errors: null }));
      const resourceClass = { pluralName: 'deviceclasses', className: 'DeviceClass', useList };

      const props = { resourceClass, columns: ['name'], clusters: [] };
      const result = renderTable(props);
      result.rerender(
        <TestContext>
          <ThemeProvider theme={theme}>
            <ResourceTable {...(props as any)} />
          </ThemeProvider>
        </TestContext>
      );
      const rendersSoFar = useList.mock.calls.length;
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(useList).toHaveBeenCalledTimes(rendersSoFar);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes sortDescFirst to the table columns', () => {
    renderTable({
      id: 'sort-desc-first-table',
      columns: [
        { id: 'usage', label: 'Usage', getValue: () => '1', sortDescFirst: true },
        { id: 'name', label: 'Name', getValue: (item: any) => item.metadata.name },
      ],
      data: mockData,
    });

    const columns = lastTablePropsHolder.current.columns;
    expect(columns.find((column: any) => column.id === 'usage').sortDescFirst).toBe(true);
    expect(columns.find((column: any) => column.id === 'name').sortDescFirst).toBeUndefined();
  });

  it('uses searchFilter boolean result directly in kubeObjectSearch to bypass fuzzy matching', () => {
    const columns = [
      {
        id: 'name',
        label: 'Name',
        getValue: (item: any) => item.metadata.name,
      },
    ];

    const mockSearchFilter = vi.fn((item: any, search: string) => {
      if (search === 'Ready') {
        return item.isReady === true;
      }
      return undefined;
    });

    renderTable({
      id: 'structured-filter-table',
      columns,
      data: mockData,
      searchFilter: mockSearchFilter,
    });

    const kubeObjectSearch = lastTablePropsHolder.current.filterFns.kubeObjectSearch;

    // Row contains "ready" in name/column, but searchFilter returned false (item is not ready)
    const mockRowNotReady = {
      original: { metadata: { name: 'ready-worker' }, isReady: false },
      getValue: () => 'ready-worker',
      _valuesCache: { name: 'ready-worker' },
    };

    // When structured query returns false, it should bypass fuzzy matching and return false
    expect(kubeObjectSearch(mockRowNotReady, 'name', 'Ready')).toBe(false);

    // When structured query returns true, it should return true
    const mockRowReady = {
      original: { metadata: { name: 'unready-named-pod' }, isReady: true },
      getValue: () => 'unready-named-pod',
      _valuesCache: { name: 'unready-named-pod' },
    };
    expect(kubeObjectSearch(mockRowReady, 'name', 'Ready')).toBe(true);

    // When searchFilter returns undefined (non-structured query), it falls back to fuzzy match
    expect(kubeObjectSearch(mockRowNotReady, 'name', 'ready-worker')).toBe(true);
    expect(kubeObjectSearch(mockRowNotReady, 'name', 'non-existent')).toBe(false);
  });

  it('keeps fuzzy column matching when a legacy filterFunction returns false', () => {
    const columns = [
      {
        id: 'name',
        label: 'Name',
        getValue: (item: any) => item.metadata.name,
      },
    ];

    renderTable({
      id: 'legacy-filter-table',
      columns,
      data: mockData,
      filterFunction: () => false,
    });

    const kubeObjectSearch = lastTablePropsHolder.current.filterFns.kubeObjectSearch;
    const mockRow = {
      original: { metadata: { name: 'ready-worker' } },
      getValue: () => 'ready-worker',
      _valuesCache: { name: 'ready-worker' },
    };
    expect(kubeObjectSearch(mockRow, 'name', 'worker')).toBe(true);
    expect(kubeObjectSearch(mockRow, 'name', 'non-existent')).toBe(false);
    expect(kubeObjectSearch(mockRow, 'name', 'non-existent')).toBe(false);
  });

  describe('emptyActions suppression on error', () => {
    const columns = [
      {
        id: 'name',
        label: 'Name',
        getValue: (item: any) => item.metadata.name,
      },
    ];
    const actions = <span data-testid="ea" />;

    it('forwards emptyActions when there is no error', () => {
      renderTable({ columns, data: [], emptyActions: actions });
      expect(lastTablePropsHolder.current.emptyActions).toBe(actions);
    });

    it('drops emptyActions when errorMessage is set', () => {
      renderTable({ columns, data: [], emptyActions: actions, errorMessage: 'Resource not found' });
      expect(lastTablePropsHolder.current.emptyActions).toBeUndefined();
    });

    it('drops emptyActions when errors array is non-empty', () => {
      renderTable({
        columns,
        data: [],
        emptyActions: actions,
        errors: [{ cluster: 'test-cluster', error: new Error('boom') }],
      });
      expect(lastTablePropsHolder.current.emptyActions).toBeUndefined();
    });
  });
});

describe('ResourceTable noNamespaceFilter row filtering', () => {
  beforeEach(() => {
    lastTablePropsHolder.current = null;

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A pod from a namespace other than the one selected in the global filter.
  const otherNamespacePod = {
    kind: 'Pod',
    apiVersion: 'v1',
    metadata: { name: 'other-ns-pod', namespace: 'namespace-b', uid: 'uid-2' },
  } as any;

  it('ignores the stale global namespace filter when noNamespaceFilter is true', () => {
    const store = createStoreWithNamespaces(['namespace-a']);

    render(
      <TestContext store={store}>
        <ThemeProvider theme={theme}>
          <ResourceTable
            id="ns-scoped-table"
            columns={[]}
            data={[otherNamespacePod]}
            noNamespaceFilter
          />
        </ThemeProvider>
      </TestContext>
    );

    expect(lastTablePropsHolder.current.filterFunction(otherNamespacePod)).toBe(true);
  });

  it('still applies the global namespace filter when noNamespaceFilter is false', () => {
    const store = createStoreWithNamespaces(['namespace-a']);

    render(
      <TestContext store={store}>
        <ThemeProvider theme={theme}>
          <ResourceTable id="ns-filtered-table" columns={[]} data={[otherNamespacePod]} />
        </ThemeProvider>
      </TestContext>
    );

    expect(lastTablePropsHolder.current.filterFunction(otherNamespacePod)).toBe(false);
  });

  it('does not mutate the global namespace filter when mounted with noNamespaceFilter', () => {
    const store = createStoreWithNamespaces(['namespace-a']);

    render(
      <TestContext store={store}>
        <ThemeProvider theme={theme}>
          <ResourceTable
            id="ns-scoped-table"
            columns={[]}
            data={[otherNamespacePod]}
            noNamespaceFilter
          />
        </ThemeProvider>
      </TestContext>
    );

    expect([...store.getState().filter.namespaces]).toEqual(['namespace-a']);
  });
});

describe('ResourceTable columns, actions, sorting, and throttling', () => {
  beforeEach(() => {
    localStorage.clear();
    lastTablePropsHolder.current = null;
    vi.mocked(useSelectedClusters).mockReturnValue(['test-cluster']);

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports standard string columns, custom column variants, and cluster column hiding', () => {
    const customSort = vi.fn((a: any, b: any) => a.metadata.name.localeCompare(b.metadata.name));
    const item = {
      kind: 'Pod',
      cluster: 'cluster-1',
      metadata: {
        name: 'pod-a',
        namespace: 'ns-1',
        uid: 'u1',
        creationTimestamp: '2021-12-15T14:57:13Z',
        labels: { app: 'web' },
      },
      getNamespace: () => 'ns-1',
    };

    // Single cluster drops 'cluster' column
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <ResourceTable
            id="all-cols"
            columns={[
              'name',
              'age',
              'labels',
              'namespace',
              'cluster',
              'kind',
              { id: 'datum-col', label: 'Kind', datum: 'kind' },
              { id: 'getter-col', label: 'UID', getter: (r: any) => r.metadata.uid },
              {
                id: 'copy-col',
                label: 'Copy',
                getValue: (r: any) => r.metadata.name,
                copyable: true,
              },
              {
                id: 'render-copy-col',
                label: 'RenderCopy',
                getValue: (r: any) => r.metadata.name,
                render: (r: any) => <span>{r.metadata.name}</span>,
                copyable: true,
                sort: customSort,
              },
              {
                id: 'render-only-col',
                label: 'RenderOnly',
                getValue: (r: any) => r.metadata.name,
                render: (r: any) => <span>{r.metadata.name}</span>,
              },
            ]}
            hideColumns={['datum-col']}
            data={[item as any]}
            defaultSortingColumn={{ id: 'name', desc: true }}
            defaultGlobalFilter="pod"
          />
        </ThemeProvider>
      </TestContext>
    );

    const cols = lastTablePropsHolder.current.columns;
    expect(cols.find((c: any) => c.id === 'cluster')).toBeUndefined();
    expect(cols.find((c: any) => c.id === 'datum-col')).toBeUndefined();
    expect(lastTablePropsHolder.current.initialState).toEqual({
      globalFilter: 'pod',
      showGlobalFilter: true,
    });
    expect(lastTablePropsHolder.current.state.sorting).toEqual([{ id: 'name', desc: true }]);

    // Verify accessorFn and Cell renderers
    const nameCol = cols.find((c: any) => c.id === 'name');
    expect(nameCol.accessorFn(item)).toBe('pod-a');
    const ageCol = cols.find((c: any) => c.id === 'age');
    expect(typeof ageCol.accessorFn(item)).toBe('number');
    const labelsCol = cols.find((c: any) => c.id === 'labels');
    expect(labelsCol.accessorFn(item)).toBe('app=web');
    const nsCol = cols.find((c: any) => c.id === 'namespace');
    expect(nsCol.accessorFn(item)).toBe('ns-1');
    const kindCol = cols.find((c: any) => c.id === 'kind');
    expect(kindCol.accessorFn(item)).toBe('Pod');

    const renderCopyCol = cols.find((c: any) => c.id === 'render-copy-col');
    expect(renderCopyCol.sortingFn({ original: item }, { original: item })).toBe(0);
    expect(customSort).toHaveBeenCalled();

    // Multi-cluster keeps 'cluster' column
    vi.mocked(useSelectedClusters).mockReturnValue(['cluster-1', 'cluster-2']);
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <ResourceTable id="multi-cluster" columns={['cluster', 'name']} data={[item as any]} />
        </ThemeProvider>
      </TestContext>
    );
    expect(lastTablePropsHolder.current.columns.find((c: any) => c.id === 'cluster')).toBeDefined();
  });

  it('throws on unknown string column', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <TestContext>
          <ThemeProvider theme={theme}>
            <ResourceTable columns={['unknown-col' as any]} data={[]} />
          </ThemeProvider>
        </TestContext>
      )
    ).toThrow('Unknown column: unknown-col');
    errorSpy.mockRestore();
  });

  it('inserts a8r-owner column, runs tableProcessors unless noProcessing, and builds row actions/selection', () => {
    const store = createStoreWithNamespaces([]);
    store.dispatch(
      addResourceTableColumnsProcessor({
        id: 'custom-proc',
        processor: ({ columns }) => [
          ...columns,
          { id: 'proc-col', label: 'Processed', getValue: () => 'ok' },
        ],
      })
    );

    const a8rItem = {
      kind: 'Deployment',
      metadata: {
        name: 'web',
        namespace: 'default',
        uid: 'u2',
        creationTimestamp: '2021-12-15T14:57:13Z',
        annotations: {
          'a8r.io/owner': 'team-platform',
          'a8r.io/repository': 'https://github.com/example/repo',
        },
      },
    };

    const { rerender } = render(
      <TestContext store={store}>
        <ThemeProvider theme={theme}>
          <ResourceTable
            columns={['name']}
            data={[a8rItem as any]}
            enableRowActions
            enableRowSelection
            actions={[{ id: 'empty-action', action: undefined }]}
          />
        </ThemeProvider>
      </TestContext>
    );

    const cols = lastTablePropsHolder.current.columns;
    expect(cols.find((c: any) => c.id === 'a8r-owner')).toBeDefined();
    expect(cols.find((c: any) => c.id === 'proc-col')).toBeDefined();
    expect(lastTablePropsHolder.current.enableRowSelection).toBe(true);
    expect(lastTablePropsHolder.current.renderRowSelectionToolbar).toBeDefined();

    // Test row action menu items (empty-action + a8r-actions) & a8r link click
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const closeMenu = vi.fn();
    const menuItems = lastTablePropsHolder.current.renderRowActionMenuItems({
      closeMenu,
      row: { original: a8rItem },
    });
    const a8rRendered = render(
      <TestContext store={store}>
        <ThemeProvider theme={theme}>{menuItems.slice(0, 2)}</ThemeProvider>
      </TestContext>
    );
    const repoMenuItem = a8rRendered.getByText('Repository');
    repoMenuItem.click();
    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://github.com/example/repo',
      '_blank',
      'noopener,noreferrer'
    );
    expect(closeMenu).toHaveBeenCalled();

    // Test updater function for columnVisibility and sorting
    act(() => {
      lastTablePropsHolder.current.onColumnVisibilityChange((prev: any) => ({
        ...prev,
        name: false,
      }));
      lastTablePropsHolder.current.onSortingChange([{ id: 'name', desc: false }]);
      lastTablePropsHolder.current.onSortingChange((prev: any) => [...prev]);
    });
    expect(lastTablePropsHolder.current.state.sorting).toEqual([{ id: 'name', desc: false }]);

    // noProcessing skips processors
    rerender(
      <TestContext store={store}>
        <ThemeProvider theme={theme}>
          <ResourceTable columns={['name']} data={[a8rItem as any]} noProcessing />
        </ThemeProvider>
      </TestContext>
    );
    expect(
      lastTablePropsHolder.current.columns.find((c: any) => c.id === 'proc-col')
    ).toBeUndefined();
  });

  it('dispatches LIST_VIEW event from TableFromResourceClass and throttles updates', () => {
    vi.useFakeTimers();
    try {
      const store = createStoreWithNamespaces([]);
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const useList = vi.fn(() => ({ items: mockData, errors: null }));
      const resourceClass = { pluralName: 'pods', className: 'Pod', useList };

      render(
        <TestContext store={store}>
          <ThemeProvider theme={theme}>
            <ResourceTable resourceClass={resourceClass as any} columns={['name']} />
          </ThemeProvider>
        </TestContext>
      );

      expect(lastTablePropsHolder.current.data).toEqual(mockData);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            type: HeadlampEventType.LIST_VIEW,
          }),
        })
      );

      // Test useThrottle delayed update branch
      function ThrottleProbe({ value }: { value: string }) {
        const throttled = useThrottle(value, 1000);
        return <span data-testid="throttled">{throttled}</span>;
      }
      const { getByTestId, rerender } = render(<ThrottleProbe value="v1" />);
      rerender(<ThrottleProbe value="v2" />);
      rerender(<ThrottleProbe value="v3" />);
      expect(getByTestId('throttled').textContent).toBe('v2');
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(getByTestId('throttled').textContent).toBe('v3');
    } finally {
      vi.useRealTimers();
    }
  });
});
