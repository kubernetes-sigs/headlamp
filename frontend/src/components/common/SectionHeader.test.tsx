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
import { describe, expect, it } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import SectionHeader from './SectionHeader';

const theme = createMuiTheme({ name: 'test' });

describe('SectionHeader', () => {
  it('aligns title side actions in a centered row', () => {
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <SectionHeader
            title="Pods"
            titleSideActions={[
              <button key="create">Create</button>,
              <button key="load">Load more</button>,
            ]}
          />
        </ThemeProvider>
      </TestContext>
    );

    const actions = screen.getByRole('button', { name: 'Create' }).parentElement;
    expect(actions).toHaveStyle({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
    });
    expect(actions).toContainElement(screen.getByRole('button', { name: 'Load more' }));
  });
});
