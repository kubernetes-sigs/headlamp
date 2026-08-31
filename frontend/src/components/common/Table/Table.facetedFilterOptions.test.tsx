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
import Table from './Table';

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

interface StatusRow {
  status: unknown;
}

/** Enough rows that ResourceTable-style callers turn faceted values off. */
const largeData: StatusRow[] = Array.from({ length: 501 }, (_, index) => ({
  status: index % 2 === 0 ? 'Running' : 'Completed',
}));

/** The page-size selector is a combobox too, so take the one in the table head. */
function statusFilterInput() {
  const combobox = screen.getAllByRole('combobox').find(element => element.closest('th') !== null);
  expect(combobox).toBeDefined();
  return combobox!;
}

function openStatusFilterDropdown() {
  fireEvent.mouseDown(statusFilterInput());
}

/** One distinct value per row, far past MAX_FILTER_OPTIONS. */
const highCardinalityData: StatusRow[] = Array.from({ length: 1500 }, (_, index) => ({
  status: `node-${index}`,
}));

function statusTable({
  accessorFn = (row: StatusRow) => row.status,
  data = largeData,
  enableColumnFilterModes,
  filterVariant = 'multi-select' as 'multi-select' | 'select' | 'autocomplete',
  showColumnFilters = true,
}: {
  accessorFn?: (row: StatusRow) => unknown;
  data?: StatusRow[];
  enableColumnFilterModes?: boolean;
  filterVariant?: 'multi-select' | 'select' | 'autocomplete';
  showColumnFilters?: boolean;
} = {}) {
  return (
    <ThemeProvider theme={theme}>
      <Table<StatusRow>
        columns={[
          {
            id: 'status',
            header: 'Status',
            filterVariant,
            accessorFn,
          },
        ]}
        data={data}
        enableColumnFilterModes={enableColumnFilterModes}
        enableFacetedValues={false}
        initialState={showColumnFilters ? { showColumnFilters } : undefined}
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

  it('explains the empty dropdown of a column above the option cap', () => {
    // Rendering a menu item per value is what would freeze the tab, so the values
    // are replaced by a notice.
    renderStatusTable({ data: highCardinalityData });

    openStatusFilterDropdown();

    const listbox = screen.getByRole('listbox');
    expect(listbox.textContent).not.toContain('node-');

    // The notice replaces the values and cannot be picked as a filter.
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Too many values to filter');
    expect(options[0]).toHaveAttribute('aria-disabled', 'true');
  });

  it('follows the data while the dropdown stays open', () => {
    const rendered = renderStatusTable();
    openStatusFilterDropdown();
    expect(dropdownOptions()).toEqual(['Completed (250)', 'Running (251)']);

    // A background refresh pushes the column past the cap while the viewer is looking at it.
    rendered.rerender(statusTable({ data: highCardinalityData }));

    expect(dropdownOptions()).toEqual(['Too many values to filter']);
  });

  it('restores the options when the data drops back under the cap', () => {
    const rendered = renderStatusTable({ data: highCardinalityData });
    openStatusFilterDropdown();
    expect(dropdownOptions()).toEqual(['Too many values to filter']);

    rendered.rerender(statusTable({ data: largeData }));

    expect(dropdownOptions()).toEqual(['Completed (250)', 'Running (251)']);
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

  it('tells an autocomplete filter why it has no options, and takes it back', () => {
    // The autocomplete variant renders a MUI Autocomplete, whose no-options popup stays
    // hidden under freeSolo, so the notice belongs under the input.
    const rendered = renderStatusTable({
      data: highCardinalityData,
      filterVariant: 'autocomplete',
    });

    expect(screen.getByText('Too many values to filter')).toBeVisible();

    rendered.rerender(statusTable({ data: largeData, filterVariant: 'autocomplete' }));

    expect(screen.queryByText('Too many values to filter')).not.toBeInTheDocument();
    fireEvent.keyDown(statusFilterInput(), { key: 'ArrowDown' });
    expect(dropdownOptions()).toEqual(['Completed', 'Running']);
  });

  it('yields the input to MRT filter mode label on a capped autocomplete column', () => {
    renderStatusTable({
      data: highCardinalityData,
      filterVariant: 'autocomplete',
      enableColumnFilterModes: true,
    });

    // MRT owns the helper text with filter modes enabled; the notice must not replace it.
    expect(screen.queryByText('Too many values to filter')).not.toBeInTheDocument();
    expect(screen.getByText(/Filter Mode:/i)).toBeVisible();
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
