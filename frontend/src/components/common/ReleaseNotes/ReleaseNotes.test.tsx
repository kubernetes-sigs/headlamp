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

import { act, render, screen, waitFor, within } from '@testing-library/react';
import ReleaseNotes from './ReleaseNotes';

function mockDesktopApi(config: { appVersion: string; checkForUpdates: boolean }) {
  (window as any).desktopApi = {
    receive: (_channel: string, cb: (cfg: typeof config) => void) => cb(config),
    send: vi.fn(),
  };
}

describe('ReleaseNotes', () => {
  afterEach(() => {
    delete (window as any).desktopApi;
    vi.unstubAllGlobals();
  });

  // Regression test for https://github.com/kubernetes-sigs/headlamp/issues/6966:
  // the desktop e2e suite seeds localStorage['disable_update_check'] = 'true'
  // (see app/e2e-tests/tests/releaseNotesTestUtils.ts) specifically so this
  // modal never opens and blocks clicks on the page underneath. If this
  // check regresses, the update flow would run unconditionally again.
  it('does not check for updates when disable_update_check is set', async () => {
    localStorage.setItem('disable_update_check', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockDesktopApi({ appVersion: '1.9.9', checkForUpdates: true });

    render(<ReleaseNotes />);

    // Let any microtask/effect that would have kicked off a fetch run.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not check for updates when checkForUpdates is false', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockDesktopApi({ appVersion: '1.9.9', checkForUpdates: false });

    render(<ReleaseNotes />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks for updates when neither is disabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ name: 'v1.9.9', html_url: 'https://example.com', body: 'notes' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    mockDesktopApi({ appVersion: '1.9.9', checkForUpdates: true });

    render(<ReleaseNotes />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  // Complements app/e2e-tests/tests/releaseNotes.spec.ts, which only covers
  // the dismissed side end-to-end: mocking the GitHub API from an Electron
  // e2e test doesn't work (a route.fulfill() response to a cross-origin
  // fetch from a file:// page comes back as an opaque, `ok: false` response
  // no matter what headers it carries), so the "storage is wiped, the real
  // modal renders" path is covered here instead, where fetch is trivial to
  // mock directly.
  it('renders the fetched release notes when app_version is stale', async () => {
    localStorage.setItem('app_version', '1.0.0');
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/releases')) {
        return {
          ok: true,
          json: async () => [{ name: 'v1.9.9', html_url: 'https://example.com', body: '' }],
        };
      }
      if (url.endsWith('/releases/tags/v1.9.9')) {
        return {
          ok: true,
          json: async () => ({
            body: '## Test release\n\nSomething worth mentioning changed.<!-- end-release-notes -->',
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    mockDesktopApi({ appVersion: '1.9.9', checkForUpdates: true });

    render(<ReleaseNotes />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Release Notes/)).toBeInTheDocument();
    expect(screen.getByText(/Something worth mentioning changed/)).toBeInTheDocument();
  });

  // Regression test: releaseDownloadURL (UpdatePopup's "update available"
  // Snackbar) and releaseNotes (the ReleaseNotesModal dialog) can both be set
  // from the same fetch. MUI's default z-index puts Snackbars (1400) above
  // Dialogs (1300), so without suppressing the Snackbar, it would render on
  // top of — and remain mouse-clickable through — a dialog that's supposed
  // to be exclusive.
  it('does not show the update Snackbar while the release notes dialog is open', async () => {
    localStorage.setItem('app_version', '1.0.0');
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/releases')) {
        return {
          ok: true,
          json: async () => [{ name: 'v2.0.0', html_url: 'https://example.com', body: '' }],
        };
      }
      if (url.endsWith('/releases/tags/v1.9.9')) {
        return { ok: true, json: async () => ({ body: '## Test release\n\nSomething new.' }) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    mockDesktopApi({ appVersion: '1.9.9', checkForUpdates: true });

    render(<ReleaseNotes />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // 'alert' covers the Snackbar's default role; 'status' covers the
    // update-available variant's role="status" override.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // Regression test: skipUpdateHandler used to call setSkipFetch(false)
  // instead of setSkipFetch(true) — a no-op, since skipFetch already
  // defaults to false. Clicking "Skip" would abort the in-flight fetch via
  // setFetchingRelease(false), which re-triggers the effect (fetchingRelease
  // is in its dependency array), and since skipFetch was never actually set,
  // the guard would immediately let a new fetchRelease() through — silently
  // restarting the exact thing the user just tried to stop.
  it('actually stops the update check when Skip is clicked', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
      vi.stubGlobal('fetch', fetchMock);
      mockDesktopApi({ appVersion: '1.9.9', checkForUpdates: true });

      render(<ReleaseNotes />);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // fetchingRelease only flips true after 5s, which is when the "Skip"
      // action becomes visible. The extra 300ms lets the Snackbar's Grow
      // transition settle so it doesn't warn about an unflushed update.
      await vi.advanceTimersByTimeAsync(5300);
      const skipButton = screen.getByRole('button', { name: /skip/i });

      act(() => {
        skipButton.click();
      });
      await vi.advanceTimersByTimeAsync(300);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // Regression test: `const controller = new AbortController()` used to be
  // created directly in the component body, so it was re-created every
  // render. By the time a user actually clicks Skip (after the 5s timeout
  // has already triggered a re-render), skipUpdateHandler's `controller`
  // closure pointed at a controller that was never passed to fetch() at
  // all — abort() on it silently did nothing to the real in-flight
  // request's signal.
  it('actually aborts the in-flight fetch when Skip is clicked', async () => {
    vi.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal ?? undefined;
        return new Promise(() => {}); // never resolves
      });
      vi.stubGlobal('fetch', fetchMock);
      mockDesktopApi({ appVersion: '1.9.9', checkForUpdates: true });

      render(<ReleaseNotes />);
      expect(capturedSignal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(5300);
      const skipButton = screen.getByRole('button', { name: /skip/i });

      act(() => {
        skipButton.click();
      });
      await vi.advanceTimersByTimeAsync(300);

      expect(capturedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // Regression test: ReleaseNotesModal previously tracked its own open/
  // closed state with no way to tell its parent. Closing the dialog (via
  // the close button, Escape, or backdrop) only flipped that internal
  // state, so ReleaseNotes.tsx's `releaseNotes` stayed truthy forever and
  // the update-available Snackbar (suppressed while the dialog is open)
  // never came back for the rest of the session.
  it('lets the update Snackbar show again after the dialog is closed', async () => {
    localStorage.setItem('app_version', '1.0.0');
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/releases')) {
        return {
          ok: true,
          json: async () => [{ name: 'v2.0.0', html_url: 'https://example.com', body: '' }],
        };
      }
      if (url.endsWith('/releases/tags/v1.9.9')) {
        return { ok: true, json: async () => ({ body: '## Test release\n\nSomething new.' }) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    mockDesktopApi({ appVersion: '1.9.9', checkForUpdates: true });

    render(<ReleaseNotes />);

    const dialog = await screen.findByRole('dialog');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    const closeButton = within(dialog).getByRole('button', { name: /close/i });
    await act(async () => {
      closeButton.click();
    });

    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});
