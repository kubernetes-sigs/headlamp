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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import Table, { TableColumn } from './Table';

const theme = createMuiTheme({ base: 'light', name: 'light' });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

type Row = { name: string; namespace: string; labels: string; age: string };

const rows: Row[] = [{ name: 'pod-a', namespace: 'default', labels: 'app=a', age: '1d' }];

const columns: TableColumn<Row>[] = [
  { id: 'name', header: 'Name', accessorFn: (r: Row) => r.name },
  {
    id: 'namespace',
    header: 'Namespace',
    accessorFn: (r: Row) => r.namespace,
    responsivePriority: -2,
  },
  { id: 'labels', header: 'Labels', accessorFn: (r: Row) => r.labels, responsivePriority: -2 },
  { id: 'age', header: 'Age', accessorFn: (r: Row) => r.age, responsivePriority: 1 },
];

/**
 * Drives the ResizeObserver that Table uses to measure available width, so the
 * responsive hiding path runs in jsdom (which reports every element as 0 wide).
 */
function mockContainerWidth(width: number) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() {
        this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as any);
      }
      unobserve() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
}

function renderTable(props: Partial<React.ComponentProps<typeof Table>> = {}) {
  return render(
    <TestContext>
      <ThemeProvider theme={theme}>
        <Table columns={columns as any} data={rows} {...(props as any)} />
      </ThemeProvider>
    </TestContext>
  );
}

/**
 * Toggles a column through the "Show/Hide columns" menu, then closes the menu so
 * assertions see the table rather than the menu (both render the column name).
 */
async function toggleColumnFromChooser(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('button', { name: /show\/hide columns/i }));
  await user.click(await screen.findByRole('checkbox', { name }));
  await user.keyboard('{Escape}');
}

const columnHeader = (name: RegExp) => screen.queryByRole('columnheader', { name });

describe('Table responsive column hiding', () => {
  beforeAll(() => {
    // jsdom has no layout engine; Table only hides columns once it measures a width.
    mockContainerWidth(240);
  });

  it('hides low priority columns that do not fit', async () => {
    renderTable();

    await waitFor(() => expect(columnHeader(/name/i)).toBeInTheDocument());
    expect(columnHeader(/labels/i)).not.toBeInTheDocument();
  });

  it('keeps a column visible after the user turns it back on', async () => {
    const user = userEvent.setup();
    renderTable();

    await waitFor(() => expect(columnHeader(/labels/i)).not.toBeInTheDocument());

    await toggleColumnFromChooser(user, /labels/i);

    await waitFor(() => expect(columnHeader(/labels/i)).toBeInTheDocument());
  });

  // Labels is hidden by default in ResourceTable, so it is never picked by the
  // responsive pass. Turning it on has to cost another column rather than overflow.
  it('counts a default hidden column once the user turns it on', async () => {
    const user = userEvent.setup();
    renderTable({ state: { columnVisibility: { labels: false } } } as any);

    await waitFor(() => expect(columnHeader(/name/i)).toBeInTheDocument());
    const before = screen.getAllByRole('columnheader').length;

    await toggleColumnFromChooser(user, /labels/i);

    await waitFor(() => expect(columnHeader(/labels/i)).toBeInTheDocument());
    expect(screen.getAllByRole('columnheader')).toHaveLength(before);
  });

  // The actions column trails the data columns rather than competing with them for
  // space, so the responsive pass must never pick it.
  it('keeps an actions column while any data column is visible', async () => {
    const withActions: TableColumn<Row>[] = [
      ...columns,
      { id: 'actions', header: 'Actions', accessorFn: () => '' },
    ];

    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <Table columns={withActions as any} data={rows} />
        </ThemeProvider>
      </TestContext>
    );

    await waitFor(() => expect(columnHeader(/name/i)).toBeInTheDocument());
    expect(columnHeader(/actions/i)).toBeInTheDocument();
  });

  it('hides an actions column once every data column is hidden', async () => {
    const withActions: TableColumn<Row>[] = [
      { id: 'name', header: 'Name', accessorFn: (r: Row) => r.name },
      { id: 'actions', header: 'Actions', accessorFn: () => '' },
    ];

    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <Table
            columns={withActions as any}
            data={rows}
            state={{ columnVisibility: { name: false } }}
          />
        </ThemeProvider>
      </TestContext>
    );

    await waitFor(() => expect(columnHeader(/name/i)).not.toBeInTheDocument());
    expect(columnHeader(/actions/i)).not.toBeInTheDocument();
  });

  it('forwards only the user change to a caller supplied handler', async () => {
    const user = userEvent.setup();
    const onColumnVisibilityChange = vi.fn();

    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <Table
            columns={columns as any}
            data={rows}
            onColumnVisibilityChange={onColumnVisibilityChange}
          />
        </ThemeProvider>
      </TestContext>
    );

    await waitFor(() => expect(columnHeader(/labels/i)).not.toBeInTheDocument());

    await toggleColumnFromChooser(user, /labels/i);

    await waitFor(() => expect(columnHeader(/labels/i)).toBeInTheDocument());

    expect(onColumnVisibilityChange).toHaveBeenCalled();

    const updater = onColumnVisibilityChange.mock.calls.at(-1)![0];
    expect(typeof updater).toBe('function');
    expect(updater({ name: true })).toEqual({ name: true, labels: true });
  });
});
