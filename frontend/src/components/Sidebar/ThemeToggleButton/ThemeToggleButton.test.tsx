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
import { configureStore } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppTheme } from '../../../lib/AppTheme';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import defaultAppThemes, { darkTheme, lightTheme } from '../../App/defaultAppThemes';
import themeReducer, { initialState as themeInitialState } from '../../App/themeSlice';
import { PreferredThemeSelectors } from './PreferredThemeSelectors';
import ThemeToggleButton, {
  getPreferredDarkThemeName,
  getRememberThemeChoices,
  setPreferredLightThemeName,
} from './ThemeToggleButton';

const PREFERRED_LIGHT_THEME_KEY = 'headlampPreferredLightTheme';
const REMEMBER_THEME_CHOICES_KEY = 'headlampRememberThemeChoices';
const QUICK_SWAP_ENABLED_KEY = 'headlampQuickSwapEnabled';

/** Builds a store with the real theme reducer so dispatched `setTheme` updates state. */
function makeStore(themeName: string, forceTheme = '') {
  return configureStore({
    reducer: {
      theme: themeReducer,
      config: (state = { forceTheme }) => state,
    },
    preloadedState: {
      theme: { ...themeInitialState, name: themeName, appThemes: defaultAppThemes },
    },
  });
}

/** Renders `children` under the Redux + MUI providers, using `currentTheme` for the MUI palette. */
function renderWithProviders(
  children: ReactNode,
  currentTheme: AppTheme,
  store: ReturnType<typeof makeStore>
) {
  return render(
    <TestContext store={store}>
      <ThemeProvider theme={createMuiTheme(currentTheme)}>{children}</ThemeProvider>
    </TestContext>
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('ThemeToggleButton', () => {
  it('dispatches the preferred light theme when toggling from a dark theme', async () => {
    const store = makeStore('Dark');
    renderWithProviders(<ThemeToggleButton />, darkTheme, store);

    await userEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));

    expect(store.getState().theme.name).toBe('Light');
  });

  it('dispatches the preferred dark theme when toggling from a light theme', async () => {
    const store = makeStore('Light');
    renderWithProviders(<ThemeToggleButton />, lightTheme, store);

    await userEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }));

    expect(store.getState().theme.name).toBe('Dark');
  });

  it('reflects a preferred-theme change made while mounted', async () => {
    const store = makeStore('Dark');
    renderWithProviders(<ThemeToggleButton />, darkTheme, store);

    const toggle = () => screen.getByRole('button', { name: /switch to light mode/i });

    await userEvent.click(toggle());
    expect(store.getState().theme.name).toBe('Light');

    // Change the preferred light theme from elsewhere while the button stays mounted.
    act(() => {
      setPreferredLightThemeName('Monochrome Light');
    });

    await userEvent.click(toggle());
    expect(store.getState().theme.name).toBe('Monochrome Light');
  });

  it('falls back to a valid light theme when the stored preference is unknown', async () => {
    localStorage.setItem(PREFERRED_LIGHT_THEME_KEY, 'NoSuchTheme');
    const store = makeStore('Dark');
    renderWithProviders(<ThemeToggleButton />, darkTheme, store);

    await userEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));

    // Not the missing name, but a real light theme from the registered set.
    expect(store.getState().theme.name).toBe('Light');
  });

  it('renders nothing when a theme is forced', () => {
    const store = makeStore('Light', 'Light');
    const { container } = renderWithProviders(<ThemeToggleButton />, lightTheme, store);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when quick swap is disabled', () => {
    localStorage.setItem(QUICK_SWAP_ENABLED_KEY, 'false');
    const store = makeStore('Light');
    const { container } = renderWithProviders(<ThemeToggleButton />, lightTheme, store);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('PreferredThemeSelectors', () => {
  it('switching to custom mode persists the flag and enables the dropdowns', async () => {
    const store = makeStore('Light');
    renderWithProviders(<PreferredThemeSelectors />, lightTheme, store);

    expect(getRememberThemeChoices()).toBe(true);

    await userEvent.click(screen.getByRole('radio', { name: /custom quick theme choices/i }));

    expect(getRememberThemeChoices()).toBe(false);
    expect(screen.getByRole('combobox', { name: /preferred dark mode/i })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('selecting a preferred dark theme persists it', async () => {
    localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, 'false');
    const store = makeStore('Light');
    renderWithProviders(<PreferredThemeSelectors />, lightTheme, store);

    await userEvent.click(screen.getByRole('combobox', { name: /preferred dark mode/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Lights Out' }));

    expect(getPreferredDarkThemeName()).toBe('Lights Out');
  });

  it('selects remember mode via the radio group', async () => {
    localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, 'false');
    const store = makeStore('Light');
    renderWithProviders(<PreferredThemeSelectors />, lightTheme, store);

    expect(getRememberThemeChoices()).toBe(false);

    await userEvent.click(screen.getByRole('radio', { name: /remember theme choices/i }));

    expect(getRememberThemeChoices()).toBe(true);
  });
});
