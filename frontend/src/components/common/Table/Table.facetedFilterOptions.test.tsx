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
 * Regression cover for the undocumented MRT behavior the custom getFacetedUniqueValues in
 * Table.tsx relies on.
 * Caller options override MRT's `enableFacetedValues ? ... : undefined`, and the dropdown pipeline
 * reads faceted values even while faceting is turned off.
 * These tests run against the real material-react-table, Table.test.tsx mocks it away and would
 * not notice an MRT upgrade breaking either behavior.
 * Without them the select filters would just go back to empty dropdowns on large lists.
 */

import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import Table, { TableColumn, TableProps } from './Table';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Keys stand in for their translation, with the interpolation i18next would do.
    t: (key: string, values?: Record<string, unknown>) =>
      key.replace(/{{(\w+)}}/g, (_match, name) => String(values?.[name])),
    i18n: { language: 'en' },
  }),
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

interface StatusRow {
  status: unknown;
  tier?: string;
}

/** Enough rows that ResourceTable-style callers turn faceted values off. */
const largeData: StatusRow[] = Array.from({ length: 501 }, (_, index) => ({
  status: index % 2 === 0 ? 'Running' : 'Completed',
  tier: index % 2 === 0 ? 'gold' : 'silver',
}));

/** The page-size selector is a combobox too, so take the ones in the table head. */
function statusFilterInput(index = 0) {
  const comboboxes = screen
    .getAllByRole('combobox')
    .filter(element => element.closest('th') !== null);
  expect(comboboxes.length).toBeGreaterThan(index);
  return comboboxes[index];
}

function openStatusFilterDropdown(index = 0) {
  fireEvent.mouseDown(statusFilterInput(index));
}

/** One distinct value per row, far past MAX_FILTER_OPTIONS. */
const highCardinalityData: StatusRow[] = Array.from({ length: 1500 }, (_, index) => ({
  status: `node-${index}`,
}));

function statusTable({
  accessorFn = (row: StatusRow) => row.status,
  columns,
  data = largeData,
  enableColumnFilterModes,
  enableFacetedValues = false,
  filterVariant = 'multi-select' as 'multi-select' | 'select' | 'autocomplete',
  initialState,
  showColumnFilters = true,
}: {
  accessorFn?: (row: StatusRow) => unknown;
  columns?: TableColumn<StatusRow>[];
  data?: StatusRow[];
  enableColumnFilterModes?: boolean;
  enableFacetedValues?: boolean;
  filterVariant?: 'multi-select' | 'select' | 'autocomplete';
  initialState?: TableProps<StatusRow>['initialState'];
  showColumnFilters?: boolean;
} = {}) {
  return (
    <ThemeProvider theme={theme}>
      <Table<StatusRow>
        columns={
          columns ?? [
            {
              id: 'status',
              header: 'Status',
              filterVariant,
              accessorFn,
            },
          ]
        }
        data={data}
        enableColumnFilterModes={enableColumnFilterModes}
        enableFacetedValues={enableFacetedValues}
        initialState={{ ...(showColumnFilters ? { showColumnFilters } : {}), ...initialState }}
      />
    </ThemeProvider>
  );
}

function renderStatusTable(props: Parameters<typeof statusTable>[0] = {}) {
  return render(statusTable(props));
}

/** The options a viewer can actually pick, MRT's disabled placeholder excluded. */
function dropdownOptions() {
  return within(screen.getByRole('listbox'))
    .queryAllByRole('option')
    .map(option => option.textContent);
}

describe('Table select filter options with real MRT', () => {
  it.each(['multi-select', 'select'] as const)(
    'fills the %s dropdown although faceted values are disabled',
    filterVariant => {
      renderStatusTable({ filterVariant });

      // MRT renders both dropdown variants as a MUI Select, open it.
      openStatusFilterDropdown();

      const listbox = screen.getByRole('listbox');
      expect(within(listbox).getByRole('option', { name: /Completed/ })).toBeInTheDocument();
      expect(within(listbox).getByRole('option', { name: /Running/ })).toBeInTheDocument();
    }
  );

  it('filters the rows when a dropdown option is selected', async () => {
    renderStatusTable();

    openStatusFilterDropdown();
    const listbox = screen.getByRole('listbox');
    fireEvent.click(within(listbox).getByRole('option', { name: /Completed/ }));
    // Close the menu, MUI's modal hides the table from the accessibility tree while it is open.
    fireEvent.keyDown(listbox, { key: 'Escape' });

    // MRT debounces filter updates, so wait for the rows to settle.
    await waitFor(() => {
      const cells = screen.getAllByRole('cell').map(cell => cell.textContent);
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.every(text => text === 'Completed')).toBe(true);
    });
  });

  it('serves only the most common options for a column past the cap', () => {
    // Ported from #7226 by @simonepri. Plain DOM queries: computing accessible names for
    // 1000 options is too slow for jsdom, and the "value (count)" shape drops MRT's
    // placeholder item.
    // The common value comes last, so keeping it proves the list is cut by frequency.
    const data: StatusRow[] = [
      ...Array.from({ length: 1000 }, (_, index) => ({ status: `rare-${index}` })),
      ...Array.from({ length: 500 }, () => ({ status: 'common' })),
    ];
    renderStatusTable({ data });

    openStatusFilterDropdown();

    const options = Array.from(
      screen.getByRole('listbox').querySelectorAll('[role="option"]'),
      option => option.textContent?.trim()
    ).filter(text => / \(\d+\)$/.test(text ?? ''));
    expect(options).toHaveLength(1000);
    expect(options).toContain('common (500)');
    expect(options).not.toContain('rare-999 (1)');
    // The shortened list says so, so nobody hunts for a value that is not offered.
    expect(screen.getByText('Showing the 1000 most common values')).toBeVisible();
  });

  it('follows the data while the dropdown stays open', () => {
    const rendered = renderStatusTable();
    openStatusFilterDropdown();
    expect(dropdownOptions()).toEqual(['Completed (250)', 'Running (251)']);

    // A background refresh pushes the column past the cap while the viewer is looking at it.
    rendered.rerender(statusTable({ data: highCardinalityData }));

    expect(dropdownOptions()).toHaveLength(1000);
    expect(screen.getByText('Showing the 1000 most common values')).toBeVisible();
  });

  it('restores the options when the data drops back under the cap', () => {
    const rendered = renderStatusTable({ data: highCardinalityData });
    openStatusFilterDropdown();
    expect(dropdownOptions()).toHaveLength(1000);

    rendered.rerender(statusTable({ data: largeData }));

    expect(dropdownOptions()).toEqual(['Completed (250)', 'Running (251)']);
    expect(screen.queryByText('Showing the 1000 most common values')).not.toBeInTheDocument();
  });

  it('serves no options for a column MRT cannot sort', () => {
    // MRT sorts the options with localeCompare, so a numeric column would throw during the
    // header render. It keeps the empty dropdown it had before instead.
    renderStatusTable({
      data: [{ status: 1 }, { status: 2 }, { status: 3 }],
      accessorFn: row => row.status,
    });

    openStatusFilterDropdown();

    expect(dropdownOptions()).toEqual([]);
    expect(screen.getByRole('listbox').textContent).not.toContain('Too many values');
  });

  it('tells an autocomplete filter that its list is shortened, and takes it back', () => {
    // The autocomplete variant renders a MUI Autocomplete, whose no-options popup stays
    // hidden under freeSolo, so the note belongs under the input for every variant.
    const rendered = renderStatusTable({
      data: highCardinalityData,
      filterVariant: 'autocomplete',
    });

    expect(screen.getByText('Showing the 1000 most common values')).toBeVisible();

    rendered.rerender(statusTable({ data: largeData, filterVariant: 'autocomplete' }));

    expect(screen.queryByText('Showing the 1000 most common values')).not.toBeInTheDocument();
    fireEvent.keyDown(statusFilterInput(), { key: 'ArrowDown' });
    expect(dropdownOptions()).toEqual(['Completed', 'Running']);
  });

  it('yields the input to MRT filter mode label on a truncated autocomplete column', () => {
    renderStatusTable({
      data: highCardinalityData,
      filterVariant: 'autocomplete',
      enableColumnFilterModes: true,
    });

    // MRT owns the helper text with filter modes enabled; the note must not replace it.
    expect(screen.queryByText('Showing the 1000 most common values')).not.toBeInTheDocument();
    expect(screen.getByText(/Filter Mode:/i)).toBeVisible();
  });

  it('keeps the full faceting contract for non-dropdown columns while faceting is on', () => {
    // Ported from #7226 by @simonepri.
    let uniqueCount = -1;
    renderStatusTable({
      data: largeData.slice(0, 100),
      enableFacetedValues: true,
      columns: [
        {
          id: 'status',
          header: 'Status',
          filterVariant: 'multi-select',
          accessorFn: r => r.status,
        },
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
    });

    // Faceting is on, so a text column still gets its full unique-value map.
    expect(uniqueCount).toBe(2);
  });

  it('keeps small-list options narrowing with other active filters', () => {
    // Ported from #7226 by @simonepri.
    renderStatusTable({
      data: largeData.slice(0, 100),
      enableFacetedValues: true,
      columns: [
        {
          id: 'status',
          header: 'Status',
          filterVariant: 'multi-select',
          accessorFn: r => r.status,
        },
        { id: 'tier', header: 'Tier', filterVariant: 'multi-select', accessorFn: row => row.tier },
      ],
      initialState: { columnFilters: [{ id: 'status', value: ['Running'] }] },
    });

    // Faceting is on, so the tier options should only reflect the Running rows.
    openStatusFilterDropdown(1);
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByRole('option', { name: /gold \(50\)/ })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: /silver/ })).toBeNull();
  });

  it('walks the rows only once the filter UI becomes visible', () => {
    const accessorFn = vi.fn((row: StatusRow) => row.status);
    renderStatusTable({ accessorFn, showColumnFilters: false });

    // MRT's header filter label reads the faceted values on every render even
    // while the filter row is hidden. Only the visible page's cells may have
    // resolved the accessor at this point, not the full 501-row data set.
    const callsWhileHidden = accessorFn.mock.calls.length;
    expect(callsWhileHidden).toBeLessThanOrEqual(10);

    fireEvent.click(screen.getByRole('button', { name: /filter/i }));

    openStatusFilterDropdown();
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByRole('option', { name: /Completed/ })).toBeInTheDocument();
    expect(accessorFn.mock.calls.length).toBeGreaterThan(callsWhileHidden);
  });
});
