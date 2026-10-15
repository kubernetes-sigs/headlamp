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

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import { createMuiTheme } from '../../../lib/themes';
import { HeadlampEventType } from '../../../redux/headlampEventSlice';
import store from '../../../redux/stores/store';
import { recordHeadlampEvents, TestContext } from '../../../test';
import { setTheme } from '../themeSlice';
import Settings from './Settings';
import SettingsCluster from './SettingsCluster';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const theme = createMuiTheme({ name: 'Light', base: 'light' });
const originalDesktopApi = window.desktopApi;

function renderWithProviders(children: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TestContext>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </TestContext>
    </QueryClientProvider>
  );
}

describe('Settings theme', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
    window.desktopApi = originalDesktopApi;
    vi.restoreAllMocks();
  });

  it('resolves the theme-picker grid breakpoint from the live theme, not a static import', async () => {
    // TestHelpers/theme.ts and lib/themes.ts's createMuiTheme both default `sm` to
    // 600px, so a regression here (reading a hardcoded theme instead of the one
    // from context) can't be caught by comparing against the *default* theme -
    // both would render identically. Using a theme with a distinctive `sm` value
    // makes a hardcoded-theme regression visible: only the live theme has 733.
    const distinctiveSm = 733;
    const liveTheme = createTheme({
      ...createMuiTheme({ name: 'Light', base: 'light' }),
      breakpoints: { values: { xs: 0, sm: distinctiveSm, md: 960, lg: 1280, xl: 1920 } },
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <TestContext>
          <ThemeProvider theme={liveTheme}>
            <Settings />
          </ThemeProvider>
        </TestContext>
      </QueryClientProvider>
    );

    // The theme swatches are the only "button" role divs in this view; their
    // parent is the responsive grid whose breakpoint is under test.
    const swatch = screen.getAllByRole('button').find(el => el.tagName === 'DIV');
    const grid = swatch!.parentElement!;
    const gridClass = Array.from(grid.classList).find(className => className.startsWith('css-'));

    const emittedCss = Array.from(document.querySelectorAll('style'))
      .map(styleTag => styleTag.textContent)
      .join('\n');
    // Match just the single @media rule scoped to the grid's own class, e.g.
    // "@media (max-width:732.95px){.css-abc123{grid-template-columns:...}}" -
    // not the substring-anywhere-after check a plain split('@media') would give.
    const gridMediaQueryMatch = emittedCss.match(
      new RegExp(`@media \\([^)]*\\)\\{\\.${gridClass}\\{[^}]*\\}\\}`)
    );

    expect(gridMediaQueryMatch?.[0]).toContain(`${distinctiveSm - 0.05}px`);
  });

  it('dispatches SETTINGS_VIEW with the active theme', async () => {
    store.dispatch(setTheme('light'));
    const events = recordHeadlampEvents();

    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(events.filter(e => e.type === HeadlampEventType.SETTINGS_VIEW)).toEqual([
        { type: HeadlampEventType.SETTINGS_VIEW, data: { theme: 'light' } },
      ]);
    });
  });

  it('dispatches CLUSTER_SETTINGS_VIEW with the cluster from the URL', async () => {
    // SettingsCluster resolves the cluster from window.location, not from the router.
    window.history.pushState({}, '', '/c/cluster-1/settings');
    const events = recordHeadlampEvents();

    renderWithProviders(<SettingsCluster />);

    await waitFor(() => {
      expect(events.filter(e => e.type === HeadlampEventType.CLUSTER_SETTINGS_VIEW)).toEqual([
        { type: HeadlampEventType.CLUSTER_SETTINGS_VIEW, data: { cluster: 'cluster-1' } },
      ]);
    });
  });
});

describe('Settings theme swatches and quick swap remember mode', () => {
  const PREFERRED_LIGHT_THEME_KEY = 'headlampPreferredLightTheme';
  const PREFERRED_DARK_THEME_KEY = 'headlampPreferredDarkTheme';
  const REMEMBER_THEME_CHOICES_KEY = 'headlampRememberThemeChoices';
  const QUICK_SWAP_ENABLED_KEY = 'headlampQuickSwapEnabled';

  beforeEach(() => {
    localStorage.clear();
    store.dispatch(setTheme('Light'));
  });

  afterEach(() => {
    localStorage.clear();
  });

  /** Theme swatches are the role="button" divs whose label is the theme name. */
  function getSwatch(name: string): HTMLElement {
    const swatch = screen
      .getAllByRole('button')
      .find(el => el.tagName === 'DIV' && el.lastElementChild?.textContent === name);
    expect(swatch).toBeDefined();
    return swatch!;
  }

  type Activate = (swatch: HTMLElement) => Promise<void>;
  const activations: [string, Activate][] = [
    ['click', swatch => userEvent.click(swatch)],
    [
      'Enter key',
      async swatch => {
        swatch.focus();
        await userEvent.keyboard('{Enter}');
      },
    ],
    [
      'Space key',
      async swatch => {
        swatch.focus();
        await userEvent.keyboard(' ');
      },
    ],
  ];

  it.each(activations)(
    'stores light and dark preferences via %s when remember mode is on',
    async (_, activate) => {
      renderWithProviders(<Settings />);

      await activate(getSwatch('Lights Out'));
      expect(store.getState().theme.name).toBe('Lights Out');
      expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBe('Lights Out');
      expect(localStorage.getItem(PREFERRED_LIGHT_THEME_KEY)).toBeNull();

      await activate(getSwatch('Monochrome Light'));
      expect(store.getState().theme.name).toBe('Monochrome Light');
      expect(localStorage.getItem(PREFERRED_LIGHT_THEME_KEY)).toBe('Monochrome Light');
      expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBe('Lights Out');
    }
  );

  it.each([
    ['remember mode is off', REMEMBER_THEME_CHOICES_KEY],
    ['quick swap is disabled', QUICK_SWAP_ENABLED_KEY],
  ])('applies the theme without storing preferences when %s', async (_, disabledKey) => {
    localStorage.setItem(disabledKey, 'false');
    renderWithProviders(<Settings />);

    for (const [, activate] of activations) {
      await activate(getSwatch('Lights Out'));
      expect(store.getState().theme.name).toBe('Lights Out');
      await activate(getSwatch('Monochrome Light'));
      expect(store.getState().theme.name).toBe('Monochrome Light');
    }

    expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBeNull();
    expect(localStorage.getItem(PREFERRED_LIGHT_THEME_KEY)).toBeNull();
  });
});
