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

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OIDCAuth, { OIDCAuthFallbackDelayMs } from './index';

// Stub i18n hook to avoid loading the full i18n setup in this unit test.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

describe('OIDCAuth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sets auth_status=success when cluster is present', () => {
    render(
      <MemoryRouter initialEntries={['/auth?cluster=main&returnTo=%2Fc%2Fmain%2Fpods']}>
        <OIDCAuth />
      </MemoryRouter>
    );

    expect(localStorage.getItem('auth_status')).toBe('success');
  });

  it('falls back to navigating to returnTo after the configured delay', () => {
    // Verify the setTimeout is scheduled with the correct delay.
    // Navigation verification is covered by e2e tests.
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    render(
      <MemoryRouter initialEntries={['/auth?cluster=main&returnTo=%2Fc%2Fmain%2Fpods']}>
        <OIDCAuth />
      </MemoryRouter>
    );

    const calls = setTimeoutSpy.mock.calls.filter(c => c[1] === OIDCAuthFallbackDelayMs);
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('does not schedule a fallback when returnTo is absent', () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    render(
      <MemoryRouter initialEntries={['/auth?cluster=main']}>
        <OIDCAuth />
      </MemoryRouter>
    );

    const calls = setTimeoutSpy.mock.calls.filter(c => c[1] === OIDCAuthFallbackDelayMs);
    expect(calls).toHaveLength(0);
  });

  it('cancels the fallback on unmount', () => {
    const clearSpy = vi.spyOn(window, 'clearTimeout');
    const { unmount } = render(
      <MemoryRouter initialEntries={['/auth?cluster=main&returnTo=%2Fc%2Fmain%2Fpods']}>
        <OIDCAuth />
      </MemoryRouter>
    );

    unmount();

    expect(clearSpy).toHaveBeenCalled();
  });

  it.each([
    ['absolute URL', 'https://evil.example/'],
    ['scheme-relative', '//evil.example/'],
    ['embedded scheme via path', '/foo://bar'],
    ['traversal', '/c/main/../../etc/passwd'],
    ['empty', ''],
    ['relative', 'foo/bar'],
  ])('does not schedule a fallback for unsafe returnTo (%s)', (_label, value) => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    const search = new URLSearchParams({ cluster: 'main', returnTo: value }).toString();
    render(
      <MemoryRouter initialEntries={[`/auth?${search}`]}>
        <OIDCAuth />
      </MemoryRouter>
    );

    const calls = setTimeoutSpy.mock.calls.filter(c => c[1] === OIDCAuthFallbackDelayMs);
    expect(calls).toHaveLength(0);
  });
});
