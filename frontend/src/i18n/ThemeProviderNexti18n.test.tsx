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
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ThemeProviderNexti18n from './ThemeProviderNexti18n';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');

  return {
    ...actual,
    useTranslation: () => ({
      i18n: {
        language: undefined,
        on: vi.fn(),
        off: vi.fn(),
      },
      ready: true,
    }),
  };
});

describe('ThemeProviderNexti18n', () => {
  it('renders children when i18n language is undefined', () => {
    render(
      <ThemeProviderNexti18n theme={createTheme()}>
        <div>content</div>
      </ThemeProviderNexti18n>
    );

    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
