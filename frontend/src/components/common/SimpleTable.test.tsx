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
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import SimpleTable from './SimpleTable';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|')[1] || key,
    i18n: { language: 'en' },
  }),
}));
const theme = createMuiTheme({ name: 'light', base: 'light' });

describe('SimpleTable Component', () => {
  it('correctly handles page boundaries and prevents empty pages', async () => {
    const columns = [{ label: 'Name', datum: 'name' }];
    const data = Array.from({ length: 10 }, (_, i) => ({ name: `Item ${i + 1}` }));

    render(
      <ThemeProvider theme={theme}>
        <TestContext>
          <SimpleTable columns={columns} data={data} page={1} rowsPerPage={[10]} />
        </TestContext>
      </ThemeProvider>
    );

    // If it corrected the page to 0, we should see "Item 1".
    expect(await screen.findByText('Item 1')).toBeInTheDocument();
    expect(await screen.findByText('Item 10')).toBeInTheDocument();
  });
});
