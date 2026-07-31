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
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import Table from './Table';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').at(-1) ?? key,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('../../App/Settings/hook', () => ({
  useSettings: () => [15, 25, 50],
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

function makeRows(count: number, namePrefix = 'item') {
  return Array.from({ length: count }, (_, i) => ({
    id: `${namePrefix}-${i}`,
    name: `${namePrefix}-${i}`,
  }));
}

let refreshData: ((rows: ReturnType<typeof makeRows>) => void) | null = null;

function Harness({ initialRows }: { initialRows: ReturnType<typeof makeRows> }) {
  const [data, setData] = useState(initialRows);
  refreshData = setData;

  return (
    <TestContext>
      <ThemeProvider theme={theme}>
        <Table
          columns={[
            {
              id: 'name',
              header: 'Name',
              accessorKey: 'name',
            },
          ]}
          data={data}
          getRowId={row => row.id}
          initialState={{ showGlobalFilter: true, globalFilter: 'item' }}
        />
      </ThemeProvider>
    </TestContext>
  );
}

describe('Table search focus across refresh', () => {
  it('keeps the global search field mounted and focused after a data refresh', async () => {
    const user = userEvent.setup();
    render(<Harness initialRows={makeRows(20)} />);

    const search = await screen.findByRole('textbox');
    await user.clear(search);
    await user.type(search, 'item-1');
    expect(search).toHaveFocus();

    // Simulate the throttled auto-refresh handing down a new data array whose
    // length crosses the pagination threshold (would previously remount the
    // toolbar and steal focus — #5702).
    act(() => {
      refreshData?.(makeRows(5, 'item'));
    });

    const searchAfterRefresh = screen.getByRole('textbox');
    expect(searchAfterRefresh).toBeInTheDocument();
    expect(searchAfterRefresh).toHaveValue('item-1');
    expect(searchAfterRefresh).toHaveFocus();
  });
});
