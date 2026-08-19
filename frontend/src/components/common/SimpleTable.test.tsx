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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext, TestContextProps } from '../../test';
import SimpleTable, { SimpleTableProps } from './SimpleTable';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });
const columns: SimpleTableProps['columns'] = [{ label: 'Value', datum: 'value' }];

/**
 * Renders a SimpleTable with Headlamp's providers and theme.
 *
 * @param props - Properties passed to SimpleTable.
 * @param contextProps - Optional router properties passed to TestContext.
 * @returns The Testing Library render result.
 */
function renderTable(props: SimpleTableProps, contextProps: TestContextProps = {}) {
  return render(
    <TestContext {...contextProps}>
      <ThemeProvider theme={theme}>
        <SimpleTable {...props} />
      </ThemeProvider>
    </TestContext>
  );
}

/**
 * Reads body-cell text in visual row order.
 *
 * @returns The text content for each body cell.
 */
function getBodyCellText() {
  return screen.getAllByRole('cell').map(cell => cell.textContent);
}

describe('SimpleTable', () => {
  it('allows body-cell overflow while hiding column-header overflow', () => {
    renderTable({
      columns,
      data: [{ value: 'A long value that should wrap instead of being clipped' }],
      showPagination: false,
    });

    expect(getComputedStyle(screen.getByRole('cell')).overflow).not.toBe('hidden');
    expect(getComputedStyle(screen.getByRole('columnheader')).overflow).toBe('hidden');
  });

  it('renders loading, error, and custom empty states', () => {
    const { rerender } = renderTable({ columns, data: null });

    expect(screen.getByRole('progressbar', { name: 'Loading table data' })).toBeVisible();

    rerender(
      <TestContext>
        <ThemeProvider theme={theme}>
          <SimpleTable columns={columns} data={null} errorMessage="Unable to load values" />
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Unable to load values')).toBeVisible();

    rerender(
      <TestContext>
        <ThemeProvider theme={theme}>
          <SimpleTable columns={columns} data={[]} emptyMessage="No values configured" />
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getAllByText('No values configured')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('No values configured');
  });

  it('renders getter values, row colors, cell properties, and no header', () => {
    renderTable({
      columns: [
        {
          label: 'Value',
          getter: row => row.value.toUpperCase(),
          cellProps: { 'data-testid': 'value-cell' },
        },
      ],
      data: [{ value: 'ready', color: 'green' }],
      noTableHeader: true,
      showPagination: false,
    });

    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    expect(screen.getByTestId('value-cell')).toHaveTextContent('READY');
  });

  it('shows the no-match state when filtering removes every row', () => {
    renderTable({
      columns,
      data: [{ value: 'visible without filtering' }],
      filterFunction: () => false,
      showPagination: false,
    });

    expect(screen.getByText('No data matching the filter criteria.')).toBeVisible();
    expect(screen.getByRole('cell')).toHaveStyle({ gridColumn: 'span 1' });
  });

  it('sorts datum values in both directions', async () => {
    renderTable({
      columns: [{ label: 'Value', datum: 'value', sort: true }],
      data: [{ value: 'bravo' }, { value: 'alpha' }],
      defaultSortingColumn: 1,
      showPagination: false,
    });

    await waitFor(() => expect(getBodyCellText()).toEqual(['alpha', 'bravo']));
    fireEvent.click(screen.getByRole('button', { name: 'translation|Sort descending' }));
    await waitFor(() => expect(getBodyCellText()).toEqual(['bravo', 'alpha']));
  });

  it('sorts with getter and comparator functions', async () => {
    const { unmount } = renderTable({
      columns: [
        {
          label: 'Value',
          getter: row => row.value,
          sort: (row: { value: string }) => row.value,
        },
      ],
      data: [{ value: 'bravo' }, { value: 'alpha' }],
      defaultSortingColumn: 1,
      showPagination: false,
    });

    await waitFor(() => expect(getBodyCellText()).toEqual(['alpha', 'bravo']));
    unmount();

    renderTable({
      columns: [
        {
          label: 'Value',
          getter: row => row.value,
          sort: (left, right) => left.value.length - right.value.length,
        },
      ],
      data: [{ value: 'long' }, { value: 'x' }],
      defaultSortingColumn: -1,
      showPagination: false,
    });
    await waitFor(() => expect(getBodyCellText()).toEqual(['long', 'x']));

    fireEvent.click(screen.getByRole('button', { name: 'translation|Sort ascending' }));
    await waitFor(() => expect(getBodyCellText()).toEqual(['x', 'long']));
  });

  it('changes pages and rows per page', async () => {
    renderTable({
      columns,
      data: [{ value: 'first' }, { value: 'second' }, { value: 'third' }],
      rowsPerPage: [1, 2],
      showPagination: true,
    });

    expect(getBodyCellText()).toEqual(['first']);
    fireEvent.click(screen.getByRole('button', { name: 'next page' }));
    await waitFor(() => expect(getBodyCellText()).toEqual(['second']));

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: '2' }));
    await waitFor(() => expect(getBodyCellText()).toEqual(['first', 'second']));
  });

  it('returns to the first page when refreshing from a later page', async () => {
    const initialProps: SimpleTableProps = {
      columns,
      data: [{ value: 'old first' }, { value: 'old second' }],
      page: 1,
      rowsPerPage: [1],
      showPagination: true,
    };
    const { rerender } = renderTable(initialProps);
    expect(getBodyCellText()).toEqual(['old second']);

    rerender(
      <TestContext>
        <ThemeProvider theme={theme}>
          <SimpleTable {...initialProps} data={[{ value: 'new first' }, { value: 'new second' }]} />
        </ThemeProvider>
      </TestContext>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'translation|Refresh' }));
    await waitFor(() => expect(getBodyCellText()).toEqual(['old first']));
    expect(screen.queryByRole('button', { name: 'translation|Refresh' })).not.toBeInTheDocument();
  });

  it('reflects prefixed page state in the URL', () => {
    renderTable(
      {
        columns,
        data: [{ value: 'first' }, { value: 'second' }],
        reflectInURL: 'values',
        rowsPerPage: [1],
        showPagination: true,
      },
      { urlSearchParams: { 'values.p': '2' } }
    );

    const table = screen.getByRole('table');
    expect(within(table).getByRole('cell')).toHaveTextContent('second');
  });
});
