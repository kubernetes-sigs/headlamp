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

import { configureStore } from '@reduxjs/toolkit';
import { composeStories } from '@storybook/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import i18n from '../../../i18n/config';
import configReducer, { initialState } from '../../../redux/configSlice';
import ActionDelayInput from './ActionDelayInput';
import * as stories from './ActionDelayInput.stories';

function renderInput(actionDelay = 5000) {
  const store = configureStore({
    reducer: { config: configReducer },
    preloadedState: {
      config: { ...initialState, settings: { ...initialState.settings, actionDelay } },
    },
  });
  const view = render(
    <I18nextProvider i18n={i18n}>
      <Provider store={store}>
        <span id="action-delay-label">Action Delay</span>
        <ActionDelayInput nameLabelID="action-delay-label" />
      </Provider>
    </I18nextProvider>
  );
  return { store, ...view };
}

function openCustom() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Action Delay' }));
  fireEvent.click(screen.getByRole('option', { name: 'Custom value' }));
}

describe('ActionDelayInput', () => {
  beforeEach(() => localStorage.clear());

  it('completes the invalid custom value story interaction', async () => {
    const { InvalidCustomValue } = composeStories(stories, { testingLibraryRender: render });
    await InvalidCustomValue.run();
    expect(screen.getByRole('spinbutton')).toHaveValue(-1);
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it.each([0, 1, 5, 10, 30])('selects and persists %s seconds', seconds => {
    const { store } = renderInput(seconds === 10 ? 0 : 10000);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Action Delay' }));
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
      '0 (immediately)',
      '1 second',
      '5 seconds',
      '10 seconds',
      '30 seconds',
      'Custom value',
    ]);
    fireEvent.click(
      screen.getByRole('option', {
        name: seconds === 0 ? '0 (immediately)' : seconds === 1 ? '1 second' : seconds + ' seconds',
      })
    );
    expect(store.getState().config.settings.actionDelay).toBe(seconds * 1000);
    expect(JSON.parse(localStorage.getItem('settings')!).actionDelay).toBe(seconds * 1000);
  });

  it('keeps the setting controls untranslated when the UI language changes', async () => {
    const previousLanguage = i18n.language;
    await i18n.changeLanguage('ko');
    try {
      renderInput();
      expect(screen.getByRole('combobox', { name: 'Action Delay' })).toHaveTextContent('5 seconds');
      openCustom();
      expect(screen.getByText('Enter a whole number of seconds between 0 and 600.')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Apply' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    } finally {
      await i18n.changeLanguage(previousLanguage);
    }
  });

  it('applies a custom value and restores it after remounting', () => {
    const { store, unmount } = renderInput();
    openCustom();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } });
    expect(store.getState().config.settings.actionDelay).toBe(5000);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('combobox')).toHaveTextContent('7 seconds');
    const saved = JSON.parse(localStorage.getItem('settings')!).actionDelay;
    expect(saved).toBe(7000);
    unmount();
    renderInput(saved);
    expect(screen.getByRole('combobox')).toHaveTextContent('7 seconds');
  });

  it.each(['', '-1', '1.5', '601'])('rejects invalid custom input %s', value => {
    const { store } = renderInput();
    openCustom();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value } });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(store.getState().config.settings.actionDelay).toBe(5000);
  });

  it('cancels a custom edit without changing the saved value', () => {
    const { store } = renderInput(3000);
    openCustom();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('combobox')).toHaveTextContent('3 seconds');
    expect(store.getState().config.settings.actionDelay).toBe(3000);
  });
});
