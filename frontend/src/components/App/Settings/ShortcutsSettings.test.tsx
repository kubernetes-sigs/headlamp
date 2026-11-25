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

import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { resetAllShortcuts, setShortcutsDialogOpen } from '../../../redux/shortcutsSlice';
import defaultStore from '../../../redux/stores/store';
import { TestContext } from '../../../test';
import ShortcutsSettings from './ShortcutsSettings';

let mockLang = 'en';
let changeLanguageMock: (lang: string) => void;

vi.mock('react-i18next', async () => {
  return {
    useTranslation: () => {
      const [, setTick] = React.useState(0);

      React.useEffect(() => {
        changeLanguageMock = (lang: string) => {
          mockLang = lang;
          setTick(t => t + 1);
        };
      }, []);

      return {
        t: (key: string) => (mockLang === 'en' ? key : `[${mockLang}] ${key}`),
        i18n: {
          changeLanguage: (lang: string) => {
            if (changeLanguageMock) {
              changeLanguageMock(lang);
            }
          },
          language: mockLang,
        },
      };
    },
  };
});

vi.mock('../../common/NameValueTable', () => ({
  default: ({ rows }: any) => (
    <div data-testid="mock-name-value-table">
      {rows.map((r: any, i: number) => (
        <div key={i}>
          {r.name}
          {r.value}
        </div>
      ))}
    </div>
  ),
  __esModule: true,
}));

describe('ShortcutsSettings Localization', () => {
  beforeEach(() => {
    mockLang = 'en';
  });

  it('updates translated shortcut labels and descriptions when language changes', async () => {
    // Open the shortcuts dialog so it renders
    defaultStore.dispatch(setShortcutsDialogOpen(true));

    render(
      <TestContext store={defaultStore}>
        <ShortcutsSettings />
      </TestContext>
    );

    // Initial render in English
    expect(screen.getByText('Global Search')).toBeInTheDocument();

    // Simulate language change to Russian (ru)
    act(() => {
      if (changeLanguageMock) {
        changeLanguageMock('ru');
      }
    });

    // Verify the label correctly updates to the new locale string
    expect(screen.getByText('[ru] Global Search')).toBeInTheDocument();
    // Verify the description correctly updates as well
    expect(screen.getByText('[ru] Open the global search dialog')).toBeInTheDocument();
  });
});

describe('ShortcutsSettings Editing and Controls', () => {
  beforeEach(() => {
    mockLang = 'en';
    defaultStore.dispatch(resetAllShortcuts());
    defaultStore.dispatch(setShortcutsDialogOpen(true));
  });

  it('records, saves, detects conflicts, and resets shortcuts', () => {
    render(
      <TestContext store={defaultStore}>
        <ShortcutsSettings />
      </TestContext>
    );

    const shortcuts = defaultStore.getState().shortcuts.shortcuts;
    const allIds = Object.keys(shortcuts);
    const firstId = allIds[0];
    const secondId = allIds[1];

    // Click the first shortcut button to enter edit mode
    const buttons = screen
      .getAllByRole('button')
      .filter(b => b.textContent && !['Reset All to Defaults', 'Close'].includes(b.textContent));
    fireEvent.click(buttons[0]);

    const input = screen.getByPlaceholderText('Press keys...');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    // Modifier-only key is ignored
    fireEvent.keyDown(input, { key: 'Control', ctrlKey: true });
    expect(input).toHaveValue('');

    // Conflict with second shortcut's key
    const secondKey = shortcuts[secondId].key;
    fireEvent.keyDown(input, { key: secondKey });
    expect(screen.getByText(/Conflicts with:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    // Re-enable recording by clicking input, then Escape cancels editing
    fireEvent.click(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    // Re-enter edit mode and record ctrl+shift+k
    fireEvent.click(
      screen
        .getAllByRole('button')
        .filter(
          b => b.textContent && !['Reset All to Defaults', 'Close'].includes(b.textContent)
        )[0]
    );
    const input2 = screen.getByPlaceholderText('Press keys...');
    fireEvent.keyDown(input2, { key: 'k', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(defaultStore.getState().shortcuts.shortcuts[firstId].key).toBe('ctrl+shift+k');

    // Reset individual modified shortcut
    const resetButtons = screen.getAllByRole('button', { name: 'Reset to default' });
    fireEvent.click(resetButtons[0]);
    expect(defaultStore.getState().shortcuts.shortcuts[firstId].key).toBe(
      shortcuts[firstId].defaultKey
    );

    // Modify again, then Reset All to Defaults
    fireEvent.click(
      screen
        .getAllByRole('button')
        .filter(
          b => b.textContent && !['Reset All to Defaults', 'Close'].includes(b.textContent)
        )[0]
    );
    const input3 = screen.getByPlaceholderText('Press keys...');
    fireEvent.keyDown(input3, { key: 'ArrowUp', altKey: true, metaKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(defaultStore.getState().shortcuts.shortcuts[firstId].key).toBe('alt+meta+ArrowUp');

    fireEvent.click(screen.getByRole('button', { name: 'Reset All to Defaults' }));
    expect(defaultStore.getState().shortcuts.shortcuts[firstId].key).toBe(
      shortcuts[firstId].defaultKey
    );

    // Close dialog (use the text 'Close' button in DialogActions)
    fireEvent.click(screen.getByText('Close'));
    expect(defaultStore.getState().shortcuts.isShortcutsDialogOpen).toBe(false);
  });

  it('cancels editing with Cancel button and handles special keys', () => {
    render(
      <TestContext store={defaultStore}>
        <ShortcutsSettings />
      </TestContext>
    );

    const buttons = screen
      .getAllByRole('button')
      .filter(b => b.textContent && !['Reset All to Defaults', 'Close'].includes(b.textContent));
    fireEvent.click(buttons[0]);
    const input = screen.getByPlaceholderText('Press keys...');

    fireEvent.keyDown(input, { key: ' ' });
    expect(input).toHaveValue('Space');
    fireEvent.click(input); // re-enable recording
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveValue('↓');
    fireEvent.click(input);
    fireEvent.keyDown(input, { key: 'ArrowLeft' });
    expect(input).toHaveValue('←');
    fireEvent.click(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(input).toHaveValue('→');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('Press keys...')).not.toBeInTheDocument();
  });
});
