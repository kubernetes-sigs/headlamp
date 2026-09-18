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

import { createTheme } from '@mui/material/styles';
import { act, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ThemeProviderNexti18n from './ThemeProviderNexti18n';

const mockI18n = vi.hoisted(() => ({
  language: undefined as string | undefined,
  on: vi.fn(),
  off: vi.fn(),
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');

  return {
    ...actual,
    useTranslation: () => ({
      i18n: mockI18n,
      ready: true,
    }),
  };
});

describe('ThemeProviderNexti18n', () => {
  beforeEach(() => {
    mockI18n.language = undefined;
    mockI18n.on.mockReset();
    mockI18n.off.mockReset();
    document.documentElement.lang = '';
    document.documentElement.dir = '';
    document.body.dir = '';
  });

  it('renders children when i18n language is undefined', () => {
    render(
      <ThemeProviderNexti18n theme={createTheme()}>
        <div>content</div>
      </ThemeProviderNexti18n>
    );

    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('applies the initial language and direction', () => {
    mockI18n.language = 'ar';

    render(
      <ThemeProviderNexti18n theme={createTheme()}>
        <div>content</div>
      </ThemeProviderNexti18n>
    );

    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(document.body).toHaveAttribute('dir', 'rtl');
  });

  it('updates the document for language changes and removes its listener', () => {
    const { unmount } = render(
      <ThemeProviderNexti18n theme={createTheme()}>
        <div>content</div>
      </ThemeProviderNexti18n>
    );
    const languageChanged = mockI18n.on.mock.calls.find(
      ([eventName]) => eventName === 'languageChanged'
    )?.[1];

    act(() => languageChanged('unknown'));

    expect(document.documentElement).toHaveAttribute('lang', 'unknown');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(document.body).toHaveAttribute('dir', 'ltr');

    unmount();
    expect(mockI18n.off).toHaveBeenCalledWith('languageChanged', languageChanged);
  });
});
