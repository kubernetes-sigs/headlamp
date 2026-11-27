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

/**
 * Regression tests for Table pagination and URL synchronization (Issue #8392).
 * These tests run against real `useURLState` and real router navigation, verifying
 * that URL parsing, 1-indexed URL parameters, 0-indexed Material React Table state,
 * and page navigation remain in sync.
 */

import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory, History } from 'history';
import { Provider } from 'react-redux';
import { Router } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import defaultStore from '../../../redux/stores/store';
import Table, { TableProps } from './Table';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key.replace(/{{(\w+)}}/g, (_match, name) => String(values?.[name])),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

vi.mock('../../../lib/useShortcut', () => ({ useShortcut: vi.fn() }));

const theme = createMuiTheme({ base: 'light', name: 'light' });

interface Item {
  id: number;
  name: string;
}

// 30 test items:
// Page size 10:
// Page 1: Item 1 .. Item 10
// Page 2: Item 11 .. Item 20
// Page 3: Item 21 .. Item 30
const testData: Item[] = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  name: `Item ${i + 1}`,
}));

const testColumns = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
];

function renderTableWithHistory(history: History, props: Partial<TableProps<Item>> = {}) {
  return render(
    <Provider store={defaultStore}>
      <Router history={history}>
        <ThemeProvider theme={theme}>
          <Table
            columns={testColumns}
            data={testData}
            rowsPerPage={[10, 20, 50]}
            reflectInURL
            {...props}
          />
        </ThemeProvider>
      </Router>
    </Provider>
  );
}

function getVisibleItemNames(): string[] {
  const cells = screen.queryAllByRole('cell');
  return cells.map(c => c.textContent?.trim()).filter((text): text is string => Boolean(text));
}

describe('Table pagination URL synchronization (Issue #8392)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('renders page 1 when no query parameter is provided and keeps URL clean', () => {
    const history = createMemoryHistory({ initialEntries: ['/items'] });
    renderTableWithHistory(history);

    const items = getVisibleItemNames();
    expect(items[0]).toBe('Item 1');
    expect(items[items.length - 1]).toBe('Item 10');
    expect(history.location.search).toBe('');
    expect(screen.queryByText('No results found')).toBeNull();
  });

  it('renders page 1 on direct navigation to ?p=1 without rendering an empty table', () => {
    const history = createMemoryHistory({ initialEntries: ['/items?p=1'] });
    renderTableWithHistory(history);

    const items = getVisibleItemNames();
    expect(screen.queryByText('No results found')).toBeNull();
    expect(items.length).toBe(10);
    expect(items[0]).toBe('Item 1');
    expect(items[items.length - 1]).toBe('Item 10');
  });

  it('renders page 2 on direct navigation to ?p=2', () => {
    const history = createMemoryHistory({ initialEntries: ['/items?p=2'] });
    renderTableWithHistory(history);

    const items = getVisibleItemNames();
    expect(items.length).toBe(10);
    expect(items[0]).toBe('Item 11');
    expect(items[items.length - 1]).toBe('Item 20');
  });

  it('renders page 3 on direct navigation to ?p=3', () => {
    const history = createMemoryHistory({ initialEntries: ['/items?p=3'] });
    renderTableWithHistory(history);

    const items = getVisibleItemNames();
    expect(items.length).toBe(10);
    expect(items[0]).toBe('Item 21');
    expect(items[items.length - 1]).toBe('Item 30');
  });

  it('navigates with Next and Previous buttons, synchronizing URL without skipping pages', async () => {
    const history = createMemoryHistory({ initialEntries: ['/items'] });
    renderTableWithHistory(history);

    // Initial load: page 1, clean URL
    expect(history.location.search).toBe('');
    expect(getVisibleItemNames()[0]).toBe('Item 1');

    // Click Next -> moves to page 2 and updates URL to ?p=2 (not ?p=3!)
    const nextButton = screen.getByRole('button', { name: /next page/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(history.location.search).toBe('?p=2');
    });
    let items = getVisibleItemNames();
    expect(items[0]).toBe('Item 11');
    expect(items[items.length - 1]).toBe('Item 20');

    // Click Next again -> moves to page 3 and updates URL to ?p=3
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(history.location.search).toBe('?p=3');
    });
    items = getVisibleItemNames();
    expect(items[0]).toBe('Item 21');
    expect(items[items.length - 1]).toBe('Item 30');

    // Click Previous -> moves back to page 2 and updates URL to ?p=2
    const prevButton = screen.getByRole('button', { name: /previous page/i });
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(history.location.search).toBe('?p=2');
    });
    items = getVisibleItemNames();
    expect(items[0]).toBe('Item 11');
    expect(items[items.length - 1]).toBe('Item 20');

    // Click Previous again -> moves back to page 1 and removes parameter from URL
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(history.location.search).toBe('');
    });
    items = getVisibleItemNames();
    expect(items[0]).toBe('Item 1');
    expect(items[items.length - 1]).toBe('Item 10');
  });

  it('respects perPage parameter in the URL', () => {
    const history = createMemoryHistory({ initialEntries: ['/items?perPage=20'] });
    renderTableWithHistory(history);

    const items = getVisibleItemNames();
    expect(items.length).toBe(20);
    expect(items[0]).toBe('Item 1');
    expect(items[items.length - 1]).toBe('Item 20');
  });

  it('updates page size and displayed rows when changing rows per page', async () => {
    const history = createMemoryHistory({ initialEntries: ['/items'] });
    renderTableWithHistory(history);

    // Initial state: 10 items shown
    expect(getVisibleItemNames().length).toBe(10);

    // Open rows-per-page select and choose 20
    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    const option20 = await screen.findByRole('option', { name: '20' });
    fireEvent.click(option20);

    await waitFor(() => {
      expect(getVisibleItemNames().length).toBe(20);
    });

    const items = getVisibleItemNames();
    expect(items[0]).toBe('Item 1');
    expect(items[items.length - 1]).toBe('Item 20');
  });

  it('resets page to 1 and keeps changed page size when changing rows per page from page 2', async () => {
    const history = createMemoryHistory({ initialEntries: ['/items?p=2&perPage=10'] });
    renderTableWithHistory(history);

    // Initial state on page 2 with page size 10
    expect(getVisibleItemNames().length).toBe(10);
    expect(getVisibleItemNames()[0]).toBe('Item 11');
    expect(getVisibleItemNames()[9]).toBe('Item 20');
    expect(history.location.search).toBe('?p=2&perPage=10');

    // Change rows per page to 20
    const select = screen.getByRole('combobox');
    fireEvent.mouseDown(select);

    const option20 = await screen.findByRole('option', { name: '20' });
    fireEvent.click(option20);

    // Should remove p=2, keep perPage=20, and show page 1 (Item 1 .. Item 20)
    await waitFor(() => {
      expect(history.location.search).toBe('?perPage=20');
    });

    const items = getVisibleItemNames();
    expect(items.length).toBe(20);
    expect(items[0]).toBe('Item 1');
    expect(items[items.length - 1]).toBe('Item 20');
  });

  it('handles prefixed URL parameters correctly when prefix is provided', async () => {
    const history = createMemoryHistory({ initialEntries: ['/items?sub.p=2'] });
    renderTableWithHistory(history, { reflectInURL: 'sub' });

    const items = getVisibleItemNames();
    expect(items[0]).toBe('Item 11');
    expect(items[items.length - 1]).toBe('Item 20');

    // Clicking Previous should return to page 1 and remove the prefixed parameter
    const prevButton = screen.getByRole('button', { name: /previous page/i });
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(history.location.search).toBe('');
    });
    expect(getVisibleItemNames()[0]).toBe('Item 1');
  });

  it('uses replace for URL updates so pagination does not pollute browser history stack', async () => {
    const history = createMemoryHistory({ initialEntries: ['/items'] });
    renderTableWithHistory(history);

    const initialHistoryLength = history.length;

    const nextButton = screen.getByRole('button', { name: /next page/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(history.location.search).toBe('?p=2');
    });

    // Clicking pagination controls uses history.replace, preserving browser history stack length
    expect(history.length).toBe(initialHistoryLength);
    expect(history.action).toBe('REPLACE');
  });

  it('functions normally in-memory when reflectInURL is false', async () => {
    const history = createMemoryHistory({ initialEntries: ['/items'] });
    renderTableWithHistory(history, { reflectInURL: false });

    expect(getVisibleItemNames()[0]).toBe('Item 1');

    const nextButton = screen.getByRole('button', { name: /next page/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(getVisibleItemNames()[0]).toBe('Item 11');
    });

    // URL must not be touched
    expect(history.location.search).toBe('');
  });

  it('synchronizes table page with browser Back and Forward navigation', async () => {
    const history = createMemoryHistory({ initialEntries: ['/items'] });
    renderTableWithHistory(history);

    // Initial page 1
    expect(getVisibleItemNames()[0]).toBe('Item 1');

    // Simulate browser navigation to page 2 (e.g. user navigation or bookmark/link)
    act(() => {
      history.push('/items?p=2');
    });
    await waitFor(() => {
      expect(getVisibleItemNames()[0]).toBe('Item 11');
      expect(getVisibleItemNames()[9]).toBe('Item 20');
    });

    // Simulate browser navigation to page 3
    act(() => {
      history.push('/items?p=3');
    });
    await waitFor(() => {
      expect(getVisibleItemNames()[0]).toBe('Item 21');
      expect(getVisibleItemNames()[9]).toBe('Item 30');
    });

    // Browser Back -> page 2
    act(() => {
      history.goBack();
    });
    await waitFor(() => {
      expect(history.location.search).toBe('?p=2');
      expect(getVisibleItemNames()[0]).toBe('Item 11');
      expect(getVisibleItemNames()[9]).toBe('Item 20');
    });

    // Browser Back -> page 1 (URL parameter removed / clean)
    act(() => {
      history.goBack();
    });
    await waitFor(() => {
      expect(history.location.search).toBe('');
      expect(getVisibleItemNames()[0]).toBe('Item 1');
      expect(getVisibleItemNames()[9]).toBe('Item 10');
    });

    // Browser Forward -> page 2
    act(() => {
      history.goForward();
    });
    await waitFor(() => {
      expect(history.location.search).toBe('?p=2');
      expect(getVisibleItemNames()[0]).toBe('Item 11');
      expect(getVisibleItemNames()[9]).toBe('Item 20');
    });

    // Browser Forward -> page 3
    act(() => {
      history.goForward();
    });
    await waitFor(() => {
      expect(history.location.search).toBe('?p=3');
      expect(getVisibleItemNames()[0]).toBe('Item 21');
      expect(getVisibleItemNames()[9]).toBe('Item 30');
    });
  });

  it('supports bidirectional synchronization between UI clicks and URL changes', async () => {
    const history = createMemoryHistory({ initialEntries: ['/items'] });
    renderTableWithHistory(history);

    // 1. UI click Next -> updates URL to ?p=2 and shows page 2
    const nextButton = screen.getByRole('button', { name: /next page/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(history.location.search).toBe('?p=2');
      expect(getVisibleItemNames()[0]).toBe('Item 11');
    });

    // 2. External URL change to page 3 -> table updates to page 3
    act(() => {
      history.push('/items?p=3');
    });
    await waitFor(() => {
      expect(getVisibleItemNames()[0]).toBe('Item 21');
    });

    // 3. UI click Previous -> updates URL to ?p=2 and shows page 2
    const prevButton = screen.getByRole('button', { name: /previous page/i });
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(history.location.search).toBe('?p=2');
      expect(getVisibleItemNames()[0]).toBe('Item 11');
    });

    // 4. UI click Previous -> updates URL to clean (no ?p) and shows page 1
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(history.location.search).toBe('');
      expect(getVisibleItemNames()[0]).toBe('Item 1');
    });
  });

  it('advances correctly across sequential pagination updates using latest state', async () => {
    const history = createMemoryHistory({ initialEntries: ['/items'] });
    renderTableWithHistory(history);

    expect(getVisibleItemNames()[0]).toBe('Item 1');

    // Rapid successive next clicks to ensure each step uses the latest page state
    const nextButton = screen.getByRole('button', { name: /next page/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(history.location.search).toBe('?p=2');
      expect(getVisibleItemNames()[0]).toBe('Item 11');
    });

    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(history.location.search).toBe('?p=3');
      expect(getVisibleItemNames()[0]).toBe('Item 21');
    });

    const prevButton = screen.getByRole('button', { name: /previous page/i });
    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(history.location.search).toBe('?p=2');
      expect(getVisibleItemNames()[0]).toBe('Item 11');
    });
  });
});
