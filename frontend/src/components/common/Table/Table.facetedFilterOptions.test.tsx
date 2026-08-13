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
 * Regression cover for the undocumented MRT behaviors getDropdownFacetedUniqueValues in
 * Table.tsx relies on: a caller-provided getFacetedUniqueValues wins over MRT's
 * `enableFacetedValues ? ... : undefined`, and the dropdown pipeline reads faceted values
 * even while faceting is off. These tests run against the real material-react-table;
 * Table.test.tsx mocks it away and would not notice an MRT upgrade breaking either
 * behavior. Without these, the select filters would go back to empty dropdowns on
 * large lists.
 */

import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import Table, { TableColumn } from './Table';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('../../../lib/useShortcut', () => ({ useShortcut: vi.fn() }));
vi.mock('../../../lib/util', () => ({
  useURLState: (_key: string, options: { defaultValue: number }) => [options.defaultValue, vi.fn()],
}));
vi.mock('../../../helpers/tablesRowsPerPage', () => ({
  getTablesRowsPerPage: () => 10,
  setTablesRowsPerPage: vi.fn(),
}));
vi.mock('../../App/Settings/hook', () => ({ useSettings: () => [10] }));
vi.mock('../../resourceMap/useQueryParamsState', () => ({
  useQueryParamsState: (_key: string, initialValue: unknown) => [initialValue, vi.fn()],
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

interface Row {
  status: string;
  tier: string;
}

/** Enough rows that ResourceTable-style callers turn faceted values off. */
const largeData: Row[] = Array.from({ length: 501 }, (_, index) => ({
  status: index % 2 === 0 ? 'Running' : 'Completed',
  tier: index % 2 === 0 ? 'gold' : 'silver',
}));

function renderTable({
  columns,
  data,
  initialState,
}: {
  columns: TableColumn<Row>[];
  data: Row[];
  initialState?: object;
}) {
  return render(
    <ThemeProvider theme={theme}>
      <Table<Row>
        columns={columns}
        data={data}
        enableFacetedValues={data.length <= 500}
        initialState={{ showColumnFilters: true, ...initialState }}
      />
    </ThemeProvider>
  );
}

/** Opens the nth select-filter dropdown in the table head and returns its listbox. */
function openDropdown(index = 0) {
  // The page-size selector is a combobox too, so only take the ones in the table head.
  const combobox = screen.getAllByRole('combobox').filter(el => el.closest('th') !== null)[index];
  expect(combobox).toBeDefined();
  fireEvent.mouseDown(combobox);
  return screen.getByRole('listbox');
}

const statusColumn: TableColumn<Row> = {
  id: 'status',
  header: 'Status',
  filterVariant: 'multi-select',
  accessorFn: row => row.status,
};

describe('Table select filter options with real MRT', () => {
  it('fills the dropdown with value counts although faceted values are disabled', () => {
    renderTable({ columns: [statusColumn], data: largeData });

    const listbox = openDropdown();
    expect(within(listbox).getByRole('option', { name: /Completed \(250\)/ })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: /Running \(251\)/ })).toBeInTheDocument();
  });

  it('filters the rows when a dropdown option is selected', async () => {
    renderTable({ columns: [statusColumn], data: largeData });

    const listbox = openDropdown();
    fireEvent.click(within(listbox).getByRole('option', { name: /Completed/ }));
    // Close the menu, MUI's modal hides the table from the accessibility tree while open.
    fireEvent.keyDown(listbox, { key: 'Escape' });

    // MRT debounces filter updates, so wait for the rows to settle.
    await waitFor(() => {
      const cells = screen.getAllByRole('cell').map(cell => cell.textContent);
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.every(cell => cell === 'Completed')).toBe(true);
    });
  });

  it('serves only the most frequent options for a column past the cap', () => {
    const data: Row[] = [
      ...Array.from({ length: 500 }, () => ({ status: 'common', tier: 'gold' })),
      ...Array.from({ length: 1000 }, (_, index) => ({ status: `rare-${index}`, tier: 'gold' })),
    ];
    renderTable({ columns: [statusColumn], data });

    const listbox = openDropdown();
    // Plain DOM queries: computing accessible names for 1000 options is too slow for jsdom.
    // The "value (count)" shape also drops MRT's placeholder item.
    const options = Array.from(listbox.querySelectorAll('[role="option"]'), o =>
      o.textContent?.trim()
    ).filter(text => / \(\d+\)$/.test(text ?? ''));
    // 1001 distinct values, truncated to the MAX_FILTER_OPTIONS most frequent.
    expect(options).toHaveLength(1000);
    expect(options).toContain('common (500)');
    expect(options).not.toContain('rare-999 (1)');
  });

  it('does not walk the rows of non-dropdown columns', () => {
    const accessorFn = vi.fn((row: Row) => row.tier);
    renderTable({
      columns: [statusColumn, { id: 'tier', header: 'Tier', accessorFn }],
      data: largeData,
    });

    openDropdown();
    // Only the visible page's cells read the text column, not the faceted walk.
    expect(accessorFn.mock.calls.length).toBeLessThan(100);
  });

  it('prefers caller-provided filterSelectOptions over the computed values', () => {
    renderTable({
      columns: [{ ...statusColumn, filterSelectOptions: ['custom-a', 'custom-b'] }],
      data: largeData,
    });

    const listbox = openDropdown();
    expect(within(listbox).getByRole('option', { name: /custom-a/ })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: /Running/ })).toBeNull();
  });

  it('keeps the full faceting contract for non-dropdown columns while faceting is on', () => {
    let uniqueCount = -1;
    renderTable({
      columns: [
        statusColumn,
        {
          id: 'tier',
          header: 'Tier',
          accessorFn: row => row.tier,
          // A custom filter reading the faceted values directly, like a plugin could.
          Filter: ({ column }) => {
            uniqueCount = column.getFacetedUniqueValues().size;
            return null;
          },
        },
      ],
      data: largeData.slice(0, 100),
    });

    // Faceting is on, so a text column still gets its full unique-value map.
    expect(uniqueCount).toBe(2);
  });

  it('keeps small-list options narrowing with other active filters', () => {
    const tierColumn: TableColumn<Row> = {
      id: 'tier',
      header: 'Tier',
      filterVariant: 'multi-select',
      accessorFn: row => row.tier,
    };
    renderTable({
      columns: [statusColumn, tierColumn],
      data: largeData.slice(0, 100),
      initialState: { columnFilters: [{ id: 'status', value: ['Running'] }] },
    });

    // Faceting is on, so the tier options should only reflect the Running rows.
    const listbox = openDropdown(1);
    expect(within(listbox).getByRole('option', { name: /gold \(50\)/ })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: /silver/ })).toBeNull();
  });
});
