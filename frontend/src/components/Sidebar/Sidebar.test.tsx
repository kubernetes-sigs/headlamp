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

// Load the router first so its Sidebar import cycle resolves before the test imports Sidebar.
import '../../lib/router';
import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import defaultAppThemes, { lightTheme } from '../App/defaultAppThemes';
import themeReducer, { initialState as themeInitialState } from '../App/themeSlice';
import { SidebarToggleButton } from './Sidebar';
import sidebarReducer, { initialState as sidebarInitialState } from './sidebarSlice';

const TEMPORARY_QUERY = '(max-width:599px)';
const NARROW_ONLY_QUERY = '(max-width:960px) and (min-width:600px)';
let matchingQueries = new Set<string>();

vi.mock('@mui/material/useMediaQuery', () => ({
  default: (query: string) => matchingQueries.has(query),
}));

function renderToggle({ forceTheme = '' } = {}) {
  const store = configureStore({
    reducer: {
      sidebar: sidebarReducer,
      theme: themeReducer,
      config: (state = { forceTheme }) => state,
    },
    preloadedState: {
      sidebar: { ...sidebarInitialState, isSidebarOpen: true, isSidebarOpenUserSelected: true },
      theme: { ...themeInitialState, name: lightTheme.name, appThemes: defaultAppThemes },
    },
  });
  return render(
    <TestContext store={store}>
      <ThemeProvider theme={createMuiTheme(lightTheme)}>
        <SidebarToggleButton />
      </ThemeProvider>
    </TestContext>
  );
}

describe('SidebarToggleButton', () => {
  afterEach(() => {
    matchingQueries = new Set();
    localStorage.clear();
  });

  it('shows the theme toggle and expand/collapse button on wide screens', () => {
    renderToggle();
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shrink sidebar' })).toBeInTheDocument();
  });

  it.each([
    ['narrow (600-960px)', NARROW_ONLY_QUERY],
    ['temporary mobile drawer', TEMPORARY_QUERY],
  ])('keeps the theme toggle but hides expand/collapse in the %s layout', (_label, query) => {
    matchingQueries = new Set([query]);
    renderToggle();
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sidebar/ })).not.toBeInTheDocument();
  });

  it('hides the theme toggle in the narrow layout when a theme is forced', () => {
    matchingQueries = new Set([NARROW_ONLY_QUERY]);
    renderToggle({ forceTheme: lightTheme.name });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
