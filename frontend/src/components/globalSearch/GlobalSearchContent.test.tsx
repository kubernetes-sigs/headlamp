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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { setConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import { setTheme } from '../App/themeSlice';
import { GlobalSearchContent } from './GlobalSearchContent';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const PREFERRED_DARK_THEME_KEY = 'headlampPreferredDarkTheme';
const REMEMBER_THEME_CHOICES_KEY = 'headlampRememberThemeChoices';

function renderSearch() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TestContext>
        <GlobalSearchContent defaultValue="" maxWidth={500} onBlur={() => {}} />
      </TestContext>
    </QueryClientProvider>
  );
}

async function pickThemeFromSearch(name: string) {
  await userEvent.type(screen.getByRole('combobox'), name);
  await userEvent.click(await screen.findByRole('option', { name: `Theme ${name}` }));
}

describe('GlobalSearchContent theme actions', () => {
  beforeEach(() => {
    localStorage.clear();
    store.dispatch(setTheme('Light'));
  });

  afterEach(() => {
    localStorage.clear();
    store.dispatch(
      setConfig({ clusters: store.getState().config.clusters, forceTheme: undefined })
    );
  });

  it('remembers a theme picked from search as the quick swap preference', async () => {
    renderSearch();

    await pickThemeFromSearch('Lights Out');

    expect(store.getState().theme.name).toBe('Lights Out');
    expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBe('Lights Out');
  });

  it('does not store a preference when remember mode is off', async () => {
    localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, 'false');
    renderSearch();

    await pickThemeFromSearch('Lights Out');

    expect(store.getState().theme.name).toBe('Lights Out');
    expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBeNull();
  });

  it('does not offer to switch themes while a theme is forced', async () => {
    store.dispatch(setConfig({ clusters: store.getState().config.clusters, forceTheme: 'Dark' }));
    renderSearch();

    await userEvent.type(screen.getByRole('combobox'), 'Lights Out');

    await expect(
      screen.findByRole('option', { name: 'Theme Lights Out' }, { timeout: 500 })
    ).rejects.toThrow();
    expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBeNull();
  });
});
