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
import themeReducer, { initialState as themeInitialState, themeSlice } from '../../App/themeSlice';
import { PreferredThemeSelectors } from './PreferredThemeSelectors';
import ThemeToggleButton, {
  AZURE_THEME_NAME,
  getPreferredDarkThemeName,
  getRememberThemeChoices,
  isDarkTheme,
  setPreferredLightThemeName,
} from './ThemeToggleButton';

const PREFERRED_LIGHT_THEME_KEY = 'headlampPreferredLightTheme';
const PREFERRED_DARK_THEME_KEY = 'headlampPreferredDarkTheme';
const REMEMBER_THEME_CHOICES_KEY = 'headlampRememberThemeChoices';
const QUICK_SWAP_ENABLED_KEY = 'headlampQuickSwapEnabled';

/** Builds a store with the real theme reducer so dispatched `setTheme` updates state. */
function makeStore(themeName: string, forceTheme = '', appThemes: AppTheme[] = defaultAppThemes) {
  return configureStore({
    reducer: {
      theme: themeReducer,
      config: (state = { forceTheme }) => state,
    },
    preloadedState: {
      theme: { ...themeInitialState, name: themeName, appThemes },
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

/** Simulates another tab writing to storage; the browser fires `storage` only in other tabs. */
function fireStorageEvent(key: string | null, storageArea: Storage = localStorage) {
  // The test env's localStorage isn't a jsdom Storage, so the init dict rejects it.
  const event = new StorageEvent('storage', { key });
  Object.defineProperty(event, 'storageArea', { value: storageArea });
  act(() => {
    window.dispatchEvent(event);
  });
}

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

    const toLight = () => screen.getByRole('button', { name: /switch to light mode/i });
    const toDark = () => screen.getByRole('button', { name: /switch to dark mode/i });

    await userEvent.click(toLight());
    expect(store.getState().theme.name).toBe('Light');

    // The mode follows the selected app theme in the store, not the MUI palette.
    await userEvent.click(toDark());
    expect(store.getState().theme.name).toBe('Dark');

    // Change the preferred light theme from elsewhere while the button stays mounted.
    act(() => {
      setPreferredLightThemeName('Monochrome Light');
    });

    await userEvent.click(toLight());
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

describe('Azure Theme quick swap default', () => {
  const azureTheme: AppTheme = { name: AZURE_THEME_NAME, base: 'dark', primary: '#0078d4' };
  const withAzure = [...defaultAppThemes, azureTheme];

  it('treats the Azure theme as light regardless of its base', () => {
    expect(isDarkTheme(azureTheme)).toBe(false);
  });

  it('uses the Azure theme as the default light theme when registered', async () => {
    const store = makeStore('Dark', '', withAzure);
    renderWithProviders(<ThemeToggleButton />, darkTheme, store);

    await userEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));

    expect(store.getState().theme.name).toBe(AZURE_THEME_NAME);
  });

  it('falls back to the Azure theme when the stored preference is unknown', async () => {
    localStorage.setItem(PREFERRED_LIGHT_THEME_KEY, 'NoSuchTheme');
    const store = makeStore('Dark', '', withAzure);
    renderWithProviders(<ThemeToggleButton />, darkTheme, store);

    await userEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));

    expect(store.getState().theme.name).toBe(AZURE_THEME_NAME);
  });

  it('keeps an explicitly stored light preference over the Azure default', async () => {
    localStorage.setItem(PREFERRED_LIGHT_THEME_KEY, 'Monochrome Light');
    const store = makeStore('Dark', '', withAzure);
    renderWithProviders(<ThemeToggleButton />, darkTheme, store);

    await userEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));

    expect(store.getState().theme.name).toBe('Monochrome Light');
  });

  it('lists the Azure theme as the selected preferred light theme in settings', () => {
    localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, 'false');
    const store = makeStore('Light', '', withAzure);
    renderWithProviders(<PreferredThemeSelectors />, lightTheme, store);

    expect(screen.getByRole('combobox', { name: /preferred light mode/i })).toHaveTextContent(
      AZURE_THEME_NAME
    );
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

  it('keeps stored plugin theme preferences until those themes register', () => {
    const pluginLight: AppTheme = { name: 'Plugin Light', base: 'light' };
    const pluginDark: AppTheme = { name: 'Plugin Dark', base: 'dark' };
    localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, 'false');
    localStorage.setItem(PREFERRED_LIGHT_THEME_KEY, pluginLight.name);
    localStorage.setItem(PREFERRED_DARK_THEME_KEY, pluginDark.name);
    const store = makeStore('Light');
    renderWithProviders(<PreferredThemeSelectors />, lightTheme, store);

    const lightSelect = () => screen.getByRole('combobox', { name: /preferred light mode/i });
    const darkSelect = () => screen.getByRole('combobox', { name: /preferred dark mode/i });

    // Before registration a valid fallback is shown, but storage is left untouched.
    expect(lightSelect()).toHaveTextContent(/^Light$/);
    expect(darkSelect()).toHaveTextContent(/^Dark$/);
    expect(localStorage.getItem(PREFERRED_LIGHT_THEME_KEY)).toBe(pluginLight.name);
    expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBe(pluginDark.name);

    act(() => {
      store.dispatch(themeSlice.actions.addCustomAppTheme(pluginLight));
      store.dispatch(themeSlice.actions.addCustomAppTheme(pluginDark));
    });

    expect(lightSelect()).toHaveTextContent(pluginLight.name);
    expect(darkSelect()).toHaveTextContent(pluginDark.name);
  });

  it('shows the same dark fallback the toggle button switches to', async () => {
    localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, 'false');
    localStorage.setItem(PREFERRED_DARK_THEME_KEY, 'NoSuchTheme');
    // Put another dark theme first so a naive "first dark theme" fallback would differ.
    const isLightsOut = (t: AppTheme) => t.name === 'Lights Out';
    const themes = [
      ...defaultAppThemes.filter(isLightsOut),
      ...defaultAppThemes.filter(t => !isLightsOut(t)),
    ];
    const store = makeStore('Light', '', themes);
    renderWithProviders(
      <>
        <PreferredThemeSelectors />
        <ThemeToggleButton />
      </>,
      lightTheme,
      store
    );

    expect(screen.getByRole('combobox', { name: /preferred dark mode/i })).toHaveTextContent(
      /^Dark$/
    );

    await userEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }));

    expect(store.getState().theme.name).toBe('Dark');
  });
});

describe('quick swap cross-tab sync', () => {
  function renderBoth() {
    const store = makeStore('Light');
    renderWithProviders(
      <>
        <PreferredThemeSelectors />
        <ThemeToggleButton />
      </>,
      lightTheme,
      store
    );
  }

  const toggleButton = () => screen.queryByRole('button', { name: /switch to dark mode/i });
  const quickSwapSwitch = () => screen.getByLabelText(/quick swap theme/i);
  const rememberRadio = () => screen.getByRole('radio', { name: /remember theme choices/i });
  const customRadio = () => screen.getByRole('radio', { name: /custom quick theme choices/i });

  it('updates the button and settings when the enabled flag changes in another tab', () => {
    renderBoth();
    expect(toggleButton()).toBeInTheDocument();
    expect(quickSwapSwitch()).toBeChecked();

    localStorage.setItem(QUICK_SWAP_ENABLED_KEY, 'false');
    fireStorageEvent(QUICK_SWAP_ENABLED_KEY);

    expect(toggleButton()).not.toBeInTheDocument();
    expect(quickSwapSwitch()).not.toBeChecked();

    localStorage.setItem(QUICK_SWAP_ENABLED_KEY, 'true');
    fireStorageEvent(QUICK_SWAP_ENABLED_KEY);

    expect(toggleButton()).toBeInTheDocument();
    expect(quickSwapSwitch()).toBeChecked();
  });

  it('updates the settings mode when remember mode changes in another tab', () => {
    renderBoth();
    expect(rememberRadio()).toBeChecked();

    localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, 'false');
    fireStorageEvent(REMEMBER_THEME_CHOICES_KEY);

    expect(customRadio()).toBeChecked();
    expect(rememberRadio()).not.toBeChecked();
  });

  it('restores defaults when another tab clears storage', () => {
    localStorage.setItem(QUICK_SWAP_ENABLED_KEY, 'false');
    localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, 'false');
    renderBoth();
    expect(toggleButton()).not.toBeInTheDocument();
    expect(customRadio()).toBeChecked();

    localStorage.clear();
    fireStorageEvent(null);

    expect(toggleButton()).toBeInTheDocument();
    expect(quickSwapSwitch()).toBeChecked();
    expect(rememberRadio()).toBeChecked();
  });

  it('ignores storage events for unrelated keys or other storage areas', () => {
    renderWithProviders(<ThemeToggleButton />, lightTheme, makeStore('Light'));
    expect(toggleButton()).toBeInTheDocument();

    // Written without a matching event, so only a qualifying event should re-render.
    localStorage.setItem(QUICK_SWAP_ENABLED_KEY, 'false');

    fireStorageEvent('someUnrelatedKey');
    expect(toggleButton()).toBeInTheDocument();

    fireStorageEvent(QUICK_SWAP_ENABLED_KEY, sessionStorage);
    expect(toggleButton()).toBeInTheDocument();

    fireStorageEvent(QUICK_SWAP_ENABLED_KEY);
    expect(toggleButton()).not.toBeInTheDocument();
  });
});
