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
import React from 'react';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { GlobalSearch } from './GlobalSearch';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function renderGlobalSearchWithNeighbors() {
  const theme = createMuiTheme({ name: 'light', base: 'light' });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={theme}>
        <TestContext>
          <button data-testid="before-btn">Before Search</button>
          <GlobalSearch />
          <button data-testid="after-btn">After Search</button>
        </TestContext>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe('GlobalSearch keyboard navigation and focus management', () => {
  it('allows tabbing through the search bar to adjacent controls without getting trapped', async () => {
    const user = userEvent.setup();
    renderGlobalSearchWithNeighbors();

    const beforeBtn = screen.getByTestId('before-btn');
    const afterBtn = screen.getByTestId('after-btn');

    beforeBtn.focus();
    expect(document.activeElement).toBe(beforeBtn);

    // Tab into search bar placeholder
    await user.tab();

    // Wait for lazy loaded GlobalSearchContent to finish loading
    await screen.findByLabelText('Clear');
    const input = screen.getByPlaceholderText('Search resources, pages, clusters by name');
    expect(document.activeElement).toBe(input);

    // Tab past search input: must land on the next sequential interactive element (after-btn)
    await user.tab();
    expect(document.activeElement).toBe(afterBtn);

    // Shift-Tab back into search input
    await user.tab({ shift: true });
    await screen.findByLabelText('Clear');
    const reopenedInput = screen.getByPlaceholderText('Search resources, pages, clusters by name');
    expect(document.activeElement).toBe(reopenedInput);

    // Shift-Tab back to before-btn
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(beforeBtn);
  });

  it('allows tabbing past search even after typing a query', async () => {
    const user = userEvent.setup();
    renderGlobalSearchWithNeighbors();

    const beforeBtn = screen.getByTestId('before-btn');
    const afterBtn = screen.getByTestId('after-btn');

    beforeBtn.focus();
    await user.tab();

    // Wait for lazy loaded GlobalSearchContent to finish loading
    await screen.findByLabelText('Clear');
    const input = screen.getByPlaceholderText('Search resources, pages, clusters by name');
    await user.type(input, 'my-deployment');
    expect((input as HTMLInputElement).value).toBe('my-deployment');

    // Tab must move to the next sequential element (after-btn), skipping the Clear button
    await user.tab();
    expect(document.activeElement).toBe(afterBtn);
  });
});
