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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { GlobalSearch } from './GlobalSearch';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const theme = createMuiTheme({ name: 'light', base: 'light' });

describe('GlobalSearch', () => {
  it('dismisses search on Escape after tabbing from the input to the Clear button', async () => {
    render(
      <ThemeProvider theme={theme}>
        <QueryClientProvider client={new QueryClient()}>
          <TestContext>
            <GlobalSearch />
          </TestContext>
        </QueryClientProvider>
      </ThemeProvider>
    );

    await userEvent.click(screen.getByPlaceholderText('Search'));

    const input = await screen.findByRole('combobox');
    await userEvent.type(input, 'test');

    await userEvent.tab();
    const clearButton = screen.getByRole('button', { name: /clear/i });
    expect(clearButton).toHaveFocus();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
  });
});
