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

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { setShortcutsDialogOpen } from '../../../redux/shortcutsSlice';
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
