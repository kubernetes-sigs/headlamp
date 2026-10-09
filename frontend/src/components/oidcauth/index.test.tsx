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

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import OIDCAuth from './index';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('OIDCAuth component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders redirecting message correctly', () => {
    render(
      <MemoryRouter initialEntries={['/oidc']}>
        <OIDCAuth />
      </MemoryRouter>
    );

    expect(screen.getByText('Redirecting to main page…')).toBeInTheDocument();
  });

  it('sets auth_status in localStorage and closes window when cluster is present', async () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={['/oidc?cluster=test-cluster']}>
        <OIDCAuth />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(localStorage.getItem('auth_status')).toBe('success');
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  it('does not set auth_status in localStorage and does not close window when cluster is absent', () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
    localStorage.setItem('auth_status', 'previous');

    render(
      <MemoryRouter initialEntries={['/oidc']}>
        <OIDCAuth />
      </MemoryRouter>
    );

    expect(localStorage.getItem('auth_status')).toBe('previous');
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('catches error if window.close throws', async () => {
    vi.spyOn(window, 'close').mockImplementation(() => {
      throw new Error('Cannot close window');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={['/oidc?cluster=test-cluster']}>
        <OIDCAuth />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(localStorage.getItem('auth_status')).toBe('success');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error occurred while closing window',
        expect.any(Error)
      );
    });
  });
});
