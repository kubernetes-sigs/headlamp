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

import Paper from '@mui/material/Paper';
import { ThemeProvider } from '@mui/material/styles';
import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import React, { useEffect, useRef } from 'react';
import { AppTheme } from '../../lib/AppTheme';
import { createMuiTheme } from '../../lib/themes';
import { initialState as CONFIG_INITIAL_STATE } from '../../redux/configSlice';
import { TestContext } from '../../test';
import defaultAppThemes, { darkTheme, lightTheme } from '../App/defaultAppThemes';
import ThemeToggleButton from './ThemeToggleButton';

const PREFERRED_LIGHT_THEME_KEY = 'headlampPreferredLightTheme';
const PREFERRED_DARK_THEME_KEY = 'headlampPreferredDarkTheme';
const REMEMBER_THEME_CHOICES_KEY = 'headlampRememberThemeChoices';
const QUICK_SWAP_ENABLED_KEY = 'headlampQuickSwapEnabled';

const ALL_KEYS = [
  PREFERRED_LIGHT_THEME_KEY,
  PREFERRED_DARK_THEME_KEY,
  REMEMBER_THEME_CHOICES_KEY,
  QUICK_SWAP_ENABLED_KEY,
];

/**
 * Seeds the quick-swap localStorage keys before render so snapshots stay
 * independent of whatever the user has stored, and restores them on unmount.
 */
function WithQuickSwapStorage({
  values,
  children,
}: {
  values: Partial<Record<(typeof ALL_KEYS)[number], string>>;
  children: React.ReactNode;
}) {
  const previous = useRef<Record<string, string | null> | undefined>(undefined);
  if (previous.current === undefined) {
    const snapshot: Record<string, string | null> = {};
    for (const key of ALL_KEYS) {
      snapshot[key] = localStorage.getItem(key);
      const next = values[key];
      if (next === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, next);
      }
    }
    previous.current = snapshot;
  }
  useEffect(
    () => () => {
      const snap = previous.current ?? {};
      for (const key of ALL_KEYS) {
        const original = snap[key];
        if (original === null || original === undefined) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, original);
        }
      }
    },
    []
  );
  return <>{children}</>;
}

interface StoryArgs {
  currentTheme: AppTheme;
  forceTheme?: string;
  storage?: Partial<Record<(typeof ALL_KEYS)[number], string>>;
}

const Template: StoryFn<StoryArgs> = ({ currentTheme, forceTheme, storage = {} }) => {
  const muiTheme = createMuiTheme(currentTheme);
  const store = configureStore({
    reducer: (state = {}) => state,
    preloadedState: {
      theme: {
        logo: null,
        name: currentTheme.name,
        appThemes: defaultAppThemes,
      },
      config: {
        ...CONFIG_INITIAL_STATE,
        forceTheme: forceTheme ?? '',
      },
    },
  });

  return (
    <TestContext store={store}>
      <WithQuickSwapStorage values={storage}>
        <ThemeProvider theme={muiTheme}>
          <Paper
            elevation={0}
            sx={{
              padding: 2,
              display: 'inline-block',
              backgroundColor: 'sidebar.background',
            }}
          >
            <ThemeToggleButton />
          </Paper>
        </ThemeProvider>
      </WithQuickSwapStorage>
    </TestContext>
  );
};

export default {
  title: 'Sidebar/ThemeToggleButton',
  component: ThemeToggleButton,
} as Meta<typeof ThemeToggleButton>;

export const LightMode = Template.bind({});
LightMode.args = {
  currentTheme: lightTheme,
};
LightMode.storyName = 'Light mode (offers dark)';

export const DarkMode = Template.bind({});
DarkMode.args = {
  currentTheme: darkTheme,
};
DarkMode.storyName = 'Dark mode (offers light)';

export const CustomPreferredThemes = Template.bind({});
CustomPreferredThemes.args = {
  currentTheme: lightTheme,
  storage: {
    [PREFERRED_LIGHT_THEME_KEY]: 'Monochrome Light',
    [PREFERRED_DARK_THEME_KEY]: 'Lights Out',
    [REMEMBER_THEME_CHOICES_KEY]: 'false',
  },
};

export const ForceThemeHidesButton = Template.bind({});
ForceThemeHidesButton.args = {
  currentTheme: lightTheme,
  forceTheme: 'Light',
};

export const QuickSwapDisabled = Template.bind({});
QuickSwapDisabled.args = {
  currentTheme: lightTheme,
  storage: {
    [QUICK_SWAP_ENABLED_KEY]: 'false',
  },
};
