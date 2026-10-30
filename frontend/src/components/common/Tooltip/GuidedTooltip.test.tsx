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
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMuiTheme } from '../../../lib/themes';
import configReducer, { initialState, setAppSettings } from '../../../redux/configSlice';
import { TestContext } from '../../../test';
import GuidedTooltip from './GuidedTooltip';

const theme = createMuiTheme({ name: 'Light', base: 'light' });

function renderGuidedTooltip(tutorialTooltips: boolean, recommendation?: string) {
  const store = configureStore({
    reducer: { config: configReducer },
    preloadedState: {
      config: { ...initialState, settings: { ...initialState.settings, tutorialTooltips } },
    },
  });
  render(
    <TestContext store={store}>
      <ThemeProvider theme={theme}>
        <GuidedTooltip
          label="About this"
          description="What it does."
          recommendation={recommendation}
        />
      </ThemeProvider>
    </TestContext>
  );
  return store;
}

describe('GuidedTooltip', () => {
  it('shows the description and recommendation on hover', async () => {
    renderGuidedTooltip(true, 'If you are using X, use this option.');

    fireEvent.mouseOver(screen.getByRole('button', { name: 'About this' }));

    expect(await screen.findByText('What it does.')).toBeInTheDocument();
    expect(screen.getByText('If you are using X, use this option.')).toBeInTheDocument();
  });

  it('omits the recommendation line when none is given', async () => {
    renderGuidedTooltip(true);

    fireEvent.mouseOver(screen.getByRole('button', { name: 'About this' }));

    const description = await screen.findByText('What it does.');
    expect(description.parentElement?.children).toHaveLength(1);
  });

  it('follows the guided tooltips setting', () => {
    const store = renderGuidedTooltip(false);

    expect(screen.queryByRole('button', { name: 'About this' })).not.toBeInTheDocument();

    act(() => {
      store.dispatch(setAppSettings({ tutorialTooltips: true }));
    });

    expect(screen.getByRole('button', { name: 'About this' })).toBeInTheDocument();
  });
});
