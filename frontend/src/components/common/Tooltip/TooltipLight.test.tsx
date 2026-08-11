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
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import TooltipLight from './TooltipLight';

const lightTheme = createMuiTheme({ name: 'light', base: 'light' });
const darkTheme = createMuiTheme({ name: 'dark', base: 'dark' });

describe('TooltipLight', () => {
  it('does not forward sx to the anchor element', () => {
    render(
      <ThemeProvider theme={lightTheme}>
        <TooltipLight title="tip">
          <button data-testid="trigger">hover</button>
        </TooltipLight>
      </ThemeProvider>
    );

    // The bug: sx was passed directly to <Tooltip>, which spread it onto the
    // child <button> as a DOM attribute. React dropped it, so the tooltip
    // surface styles were never applied.
    expect(screen.getByTestId('trigger')).not.toHaveAttribute('sx');
  });

  it('renders newline-separated text preserving each line', async () => {
    const user = userEvent.setup();
    const multiLine = 'nginx\ncoredns\nistio-proxy';

    render(
      <ThemeProvider theme={lightTheme}>
        <TooltipLight title={multiLine}>
          <button data-testid="trigger">containers</button>
        </TooltipLight>
      </ThemeProvider>
    );

    await user.hover(screen.getByTestId('trigger'));

    const tooltip = await screen.findByRole('tooltip');

    // The tooltip text must preserve the newlines that the deployment
    // container list builds with containers.join('\n').
    expect(tooltip.textContent).toBe(multiLine);
  });

  it('renders the tooltip under the dark theme without leaking sx', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider theme={darkTheme}>
        <TooltipLight title="dark tip">
          <button data-testid="trigger">hover</button>
        </TooltipLight>
      </ThemeProvider>
    );

    expect(screen.getByTestId('trigger')).not.toHaveAttribute('sx');

    await user.hover(screen.getByTestId('trigger'));

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('dark tip');
  });
});
