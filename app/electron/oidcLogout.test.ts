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

/*
 * Copyright 2026 The Kubernetes Authors
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

import { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isOIDCLogoutNavigation, openOIDCLogout } from './oidcLogout';

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }));

describe('desktop OIDC logout', () => {
  const origin = 'http://127.0.0.1:4466';
  const transition = `${origin}/encoded-clusters/bWFpbg/oidc-logout/redirect?state=signed`;
  const fetch = vi.fn();
  const on = vi.fn();
  const close = vi.fn();
  const loadURL = vi.fn();
  const setWindowOpenHandler = vi.fn();
  const session = { fetch };
  const parent = { webContents: { session } } as unknown as BrowserWindow;

  beforeEach(() => {
    vi.clearAllMocks();
    loadURL.mockResolvedValue(undefined);
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ redirectURL: transition }),
    });
    vi.mocked(BrowserWindow).mockImplementation(function () {
      return {
        webContents: { on, setWindowOpenHandler },
        on: vi.fn(),
        close,
        loadURL,
        isDestroyed: () => false,
      } as unknown as BrowserWindow;
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('authenticates only backend initiation and follows navigation in an isolated shared-session window', async () => {
    await openOIDCLogout(parent, origin, 'backend-secret', 'main');
    expect(fetch).toHaveBeenCalledWith(`${origin}/encoded-clusters/bWFpbg/oidc-logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HEADLAMP_BACKEND-TOKEN': 'backend-secret',
      },
      credentials: 'include',
      redirect: 'error',
    });
    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        webPreferences: {
          session,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      })
    );
    expect(loadURL).toHaveBeenCalledWith(transition);
    const navigate = on.mock.calls.find(([name]) => name === 'will-redirect')![1];
    const event = { preventDefault: vi.fn() };
    navigate(event, 'https://provider.example/logout');
    expect(event.preventDefault).not.toHaveBeenCalled();
    navigate(event, `${origin}/encoded-clusters/bWFpbg/login`);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    const windowHandler = setWindowOpenHandler.mock.calls[0][0];
    expect(windowHandler({ url: 'https://provider.example' })).toEqual({ action: 'deny' });
    vi.useRealTimers();
  });

  it('resolves backend-relative transitions', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        redirectURL: '/encoded-clusters/bWFpbg/oidc-logout/redirect?state=signed',
      }),
    });
    await openOIDCLogout(parent, origin, 'secret', 'main');
    expect(loadURL).toHaveBeenCalledWith(transition);
    vi.useRealTimers();
  });

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'http://evil.example/logout',
    'https://user:pass@provider.example',
  ])('rejects unsafe initial navigation %s', async redirectURL => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ redirectURL }) });
    await expect(openOIDCLogout(parent, origin, 'secret', 'main')).rejects.toThrow();
    expect(BrowserWindow).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('surfaces backend failures without opening a window', async () => {
    fetch.mockResolvedValue({ ok: false, status: 403 });
    await expect(openOIDCLogout(parent, origin, 'secret', 'main')).rejects.toThrow('HTTP 403');
    expect(BrowserWindow).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not open another application page for a local-only logout fallback', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ redirectURL: '/' }) });
    await openOIDCLogout(parent, origin, 'secret', 'main');
    expect(BrowserWindow).not.toHaveBeenCalled();
  });

  it('blocks an unsafe redirect after provider navigation begins', async () => {
    await openOIDCLogout(parent, origin, 'secret', 'main');
    const navigate = on.mock.calls.find(([name]) => name === 'will-redirect')![1];
    const event = { preventDefault: vi.fn() };
    navigate(event, 'file:///tmp/attacker');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('closes the unprivileged window after a bounded timeout', async () => {
    await openOIDCLogout(parent, origin, 'secret', 'main');
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(close).toHaveBeenCalled();
  });

  it('accepts the load cancellation caused by closing on the trusted return route', async () => {
    loadURL.mockImplementationOnce(async () => {
      const navigate = on.mock.calls.find(([name]) => name === 'will-redirect')![1];
      navigate({ preventDefault: vi.fn() }, `${origin}/encoded-clusters/bWFpbg/login`);
      throw new Error('ERR_FAILED loading the completed redirect chain');
    });
    await expect(openOIDCLogout(parent, origin, 'secret', 'main')).resolves.toBeUndefined();
    expect(close).toHaveBeenCalled();
  });

  it.each(['file:///tmp/a', 'headlamp://danger', 'http://provider.example'])(
    'blocks unsafe redirect protocols %s',
    target => {
      expect(isOIDCLogoutNavigation(new URL(target), origin)).toBe(false);
      vi.useRealTimers();
    }
  );
});
