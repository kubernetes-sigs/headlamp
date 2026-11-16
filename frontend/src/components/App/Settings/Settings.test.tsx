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
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import { createMuiTheme } from '../../../lib/themes';
import { setConfig } from '../../../redux/configSlice';
import { HeadlampEventType } from '../../../redux/headlampEventSlice';
import reducers from '../../../redux/reducers/reducers';
import store from '../../../redux/stores/store';
import { recordHeadlampEvents, TestContext } from '../../../test';
import ThemeToggleButton from '../../Sidebar/ThemeToggleButton/ThemeToggleButton';
import { applyBackendThemeConfig, setTheme } from '../themeSlice';
import Settings from './Settings';
import SettingsCluster from './SettingsCluster';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const theme = createMuiTheme({ name: 'Light', base: 'light' });
const originalDesktopApi = window.desktopApi;

function renderWithProviders(
  children: ReactNode,
  appStore?: ComponentProps<typeof TestContext>['store']
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TestContext store={appStore}>
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

// The persisted storage format, kept as literals so an accidental key rename fails these tests.
const PREFERRED_LIGHT_THEME_KEY = 'headlampPreferredLightTheme';
const PREFERRED_DARK_THEME_KEY = 'headlampPreferredDarkTheme';
const REMEMBER_THEME_CHOICES_KEY = 'headlampRememberThemeChoices';
const QUICK_SWAP_ENABLED_KEY = 'headlampQuickSwapEnabled';

// Mirrors `-default-light-theme="Monochrome Light" -default-dark-theme="Lights Out"`.
const CONFIGURED_DEFAULTS = {
  defaultLightTheme: 'Monochrome Light',
  defaultDarkTheme: 'Lights Out',
};

// These render the full Settings page and click through it many times, which can exceed the
// default 5s timeout when the whole suite runs in parallel.
const FULL_SETTINGS_FLOW_TIMEOUT = 20_000;

/** Theme swatches are the role="button" divs whose label is the theme name. */
function getSwatch(name: string): HTMLElement {
  const swatch = screen
    .getAllByRole('button')
    .find(el => el.tagName === 'DIV' && el.lastElementChild?.textContent === name);
  expect(swatch).toBeDefined();
  return swatch!;
}

/** Clicks the sidebar quick swap toggle, whichever direction it currently offers. */
function swapTheme() {
  return userEvent.click(screen.getByRole('button', { name: /switch to (light|dark) mode/i }));
}

async function pickInDropdown(dropdown: RegExp, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: dropdown }));
  await userEvent.click(screen.getByRole('option', { name: option }));
}

function selectCustomMode() {
  return userEvent.click(screen.getByRole('radio', { name: /custom quick theme choices/i }));
}

/** The global test setup reports no OS color scheme; this simulates one. */
function mockOsColorScheme(scheme: 'light' | 'dark') {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    query => ({ matches: query === `(prefers-color-scheme: ${scheme})`, media: query } as any)
  );
}

describe(
  'Settings theme swatches and quick swap remember mode',
  { timeout: FULL_SETTINGS_FLOW_TIMEOUT },
  () => {
    beforeEach(() => {
      localStorage.clear();
      store.dispatch(setTheme('Light'));
    });

    afterEach(() => {
      localStorage.clear();
    });

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
  }
);

describe(
  'quick swap priority: configured defaults until the user picks themes',
  { timeout: FULL_SETTINGS_FLOW_TIMEOUT },
  () => {
    function setConfiguredDefaults(defaults: Partial<typeof CONFIGURED_DEFAULTS>) {
      store.dispatch(setConfig({ clusters: store.getState().config.clusters, ...defaults }));
    }

    beforeEach(() => {
      localStorage.clear();
      setConfiguredDefaults(CONFIGURED_DEFAULTS);
      store.dispatch(setTheme('Monochrome Light'));
    });

    afterEach(() => {
      setConfiguredDefaults({});
      localStorage.clear();
    });

    const themeName = () => store.getState().theme.name;

    it('switches from the configured pair to the themes the user clicks (remember mode)', async () => {
      renderWithProviders(
        <>
          <ThemeToggleButton />
          <Settings />
        </>
      );

      // Nothing saved yet: quick swap uses the configured pair.
      await swapTheme();
      expect(themeName()).toBe('Lights Out');
      await swapTheme();
      expect(themeName()).toBe('Monochrome Light');

      // Picking a dark theme replaces only the configured dark default.
      await userEvent.click(getSwatch('Dark'));
      expect(themeName()).toBe('Dark');
      await swapTheme();
      expect(themeName()).toBe('Monochrome Light');
      await swapTheme();
      expect(themeName()).toBe('Dark');

      // Picking a light theme replaces the configured light default too.
      await userEvent.click(getSwatch('Light'));
      await swapTheme();
      expect(themeName()).toBe('Dark');
      await swapTheme();
      expect(themeName()).toBe('Light');
    });

    it('switches from the configured pair to the dropdown choices (custom mode)', async () => {
      localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, 'false');
      renderWithProviders(
        <>
          <ThemeToggleButton />
          <Settings />
        </>
      );

      expect(screen.getByRole('combobox', { name: /preferred light mode/i })).toHaveTextContent(
        'Monochrome Light'
      );
      expect(screen.getByRole('combobox', { name: /preferred dark mode/i })).toHaveTextContent(
        'Lights Out'
      );

      await pickInDropdown(/preferred dark mode/i, 'Dark');
      await pickInDropdown(/preferred light mode/i, 'Light');

      await swapTheme();
      expect(themeName()).toBe('Dark');
      await swapTheme();
      expect(themeName()).toBe('Light');
    });
  }
);

describe(
  'theme choices persist across app relaunches',
  { timeout: FULL_SETTINGS_FLOW_TIMEOUT },
  () => {
    /**
     * Builds a brand-new store the way the app boots: fresh reducers, then the backend
     * config (with the configured default pair) is applied. Only localStorage carries over.
     */
    function relaunch() {
      const freshStore = configureStore({ reducer: reducers });
      freshStore.dispatch(setConfig({ clusters: null, ...CONFIGURED_DEFAULTS }));
      freshStore.dispatch(applyBackendThemeConfig(CONFIGURED_DEFAULTS));
      return freshStore;
    }

    function renderApp(appStore: ReturnType<typeof relaunch>) {
      return renderWithProviders(
        <>
          <ThemeToggleButton />
          <Settings />
        </>,
        appStore
      );
    }

    beforeEach(() => {
      localStorage.clear();
      // An OS that prefers light, so the configured light default applies unless a saved
      // choice overrides it.
      mockOsColorScheme('light');
    });

    afterEach(() => {
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('starts from the configured pair on first launch', () => {
      expect(relaunch().getState().theme.name).toBe('Monochrome Light');
    });

    it('keeps clicked themes as the active theme and quick swap pair after relaunch', async () => {
      const firstSession = relaunch();
      const { unmount } = renderApp(firstSession);
      await userEvent.click(getSwatch('Dark'));
      await userEvent.click(getSwatch('Light'));
      unmount();

      const secondSession = relaunch();
      // The last clicked theme wins over the configured default on launch.
      expect(secondSession.getState().theme.name).toBe('Light');
      renderApp(secondSession);

      await swapTheme();
      expect(secondSession.getState().theme.name).toBe('Dark');
      await swapTheme();
      expect(secondSession.getState().theme.name).toBe('Light');
    });

    it('keeps custom mode and dropdown choices after relaunch', async () => {
      const { unmount } = renderApp(relaunch());
      await selectCustomMode();
      await pickInDropdown(/preferred dark mode/i, 'Dark');
      await pickInDropdown(/preferred light mode/i, 'Light');
      unmount();

      const secondSession = relaunch();
      renderApp(secondSession);

      expect(screen.getByRole('radio', { name: /custom quick theme choices/i })).toBeChecked();
      expect(screen.getByRole('combobox', { name: /preferred dark mode/i })).toHaveTextContent(
        /^Dark$/
      );
      expect(screen.getByRole('combobox', { name: /preferred light mode/i })).toHaveTextContent(
        /^Light$/
      );
      await swapTheme();
      expect(secondSession.getState().theme.name).toBe('Dark');
    });

    it('opens in the dark theme picked in the custom dropdown instead of the flag', async () => {
      mockOsColorScheme('dark');
      const firstSession = relaunch();
      expect(firstSession.getState().theme.name).toBe('Lights Out');
      const { unmount } = renderApp(firstSession);

      await selectCustomMode();
      await pickInDropdown(/preferred dark mode/i, 'Dark');
      // Applied right away, not only after the next relaunch.
      expect(firstSession.getState().theme.name).toBe('Dark');
      unmount();

      const secondSession = relaunch();
      expect(secondSession.getState().theme.name).toBe('Dark');
      renderApp(secondSession);

      await swapTheme();
      expect(secondSession.getState().theme.name).toBe('Monochrome Light');
      await swapTheme();
      expect(secondSession.getState().theme.name).toBe('Dark');
    });

    it('keeps the last theme switched to over a later dropdown pick', async () => {
      mockOsColorScheme('dark');
      const firstSession = relaunch();
      const { unmount } = renderApp(firstSession);

      await selectCustomMode();
      await userEvent.click(getSwatch('Headlamp Classic'));
      await pickInDropdown(/preferred dark mode/i, 'Dark');
      expect(firstSession.getState().theme.name).toBe('Headlamp Classic');
      unmount();

      expect(relaunch().getState().theme.name).toBe('Headlamp Classic');
    });

    it('keeps quick swap disabled after relaunch', async () => {
      const { unmount } = renderApp(relaunch());
      await userEvent.click(screen.getByLabelText(/quick swap theme/i));
      unmount();

      renderApp(relaunch());

      expect(screen.getByLabelText(/quick swap theme/i)).not.toBeChecked();
      expect(
        screen.queryByRole('button', { name: /switch to (light|dark) mode/i })
      ).not.toBeInTheDocument();
    });
  }
);
