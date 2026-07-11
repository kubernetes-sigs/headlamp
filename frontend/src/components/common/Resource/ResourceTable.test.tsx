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
import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadTableSettings, storeTableSettings } from '../../../helpers/tableSettings';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import ResourceTable from './ResourceTable';

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
    ];

    renderTable({
      id: 'test-table-id',
      columns,
      data: mockData,
    });

    expect(lastTablePropsHolder.current).not.toBeNull();
    // Only columns with explicit show parameter or labels column default are present
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
});
