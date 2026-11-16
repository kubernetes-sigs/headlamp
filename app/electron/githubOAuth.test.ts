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

import { EventEmitter } from 'node:events';
import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { handlers, openExternal, renderer } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  openExternal: vi.fn(),
  // Routes the real preload bridge to captured main-process handlers.
  renderer: {
    api: undefined as any,
    event: undefined as unknown,
    listeners: new Map<string, Set<(...args: unknown[]) => void>>(),
  },
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_key: string, api: unknown) => (renderer.api = api),
  },
  ipcRenderer: {
    invoke: async (channel: string, ...args: unknown[]) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler registered for '${channel}'`);
      return handler(renderer.event, ...args);
    },
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      if (!renderer.listeners.has(channel)) renderer.listeners.set(channel, new Set());
      renderer.listeners.get(channel)!.add(listener);
    },
    removeListener: (channel: string, listener: (...args: unknown[]) => void) =>
      renderer.listeners.get(channel)?.delete(listener),
    send: vi.fn(),
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      if (handlers.has(channel)) {
        throw new Error(`Handler already registered for ${channel}`);
      }
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => handlers.delete(channel),
  },
  shell: { openExternal },
}));

import './preload';
import crypto from 'node:crypto';
import {
  DEV_REDIRECT_URI,
  GITHUB_OAUTH_REFRESH,
  GITHUB_OAUTH_START,
  setupGitHubOAuth,
} from './githubOAuth';
import { dispatchOAuthCallback } from './oauthProvider';

const START_URL = 'http://localhost:4466/';
const SCHEME = 'example-app';
const CONFIG = { clientId: 'Iv1.testclient', clientSecret: 'test-secret' };
const CAPABILITY = 'a'.repeat(64);
const OTHER_CAPABILITY = 'b'.repeat(64);
const TOKENS = {
  access_token: 'ghu_access123',
  refresh_token: 'ghr_refresh456',
  expires_in: 28800,
  refresh_token_expires_in: 15897600,
  token_type: 'bearer',
};
const SUCCESS = {
  success: true,
  accessToken: TOKENS.access_token,
  refreshToken: TOKENS.refresh_token,
  expiresAt: expect.any(String),
};

class FakeWebContents extends EventEmitter {
  mainFrame = { url: START_URL };
  send = vi.fn();
}

function fakeWindow() {
  const webContents = new FakeWebContents();
  return {
    webContents,
    isDestroyed: () => false,
    focus: vi.fn(),
  };
}

type FakeWindow = ReturnType<typeof fakeWindow>;

function trustedEvent(window: FakeWindow) {
  return { sender: window.webContents, senderFrame: window.webContents.mainFrame };
}

function invoke(channel: string, event: unknown, ...args: unknown[]) {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler for ${channel}`);
  return handler(event, ...args) as Promise<any>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();
const cleanups: Array<() => void> = [];
/** Capabilities currently granted by the simulated command-capability registry. */
let granted: Set<string>;

function setup(window: FakeWindow, overrides: Record<string, unknown> = {}) {
  const cleanup = setupGitHubOAuth({
    mainWindow: window as never,
    trustedStartUrl: START_URL,
    protocolScheme: SCHEME,
    config: CONFIG,
    isDev: false,
    authorizeGitHubOAuth: (_event, capability) => granted.has(capability),
    isGitHubOAuthCapabilityLive: capability => granted.has(capability),
    ...overrides,
  });
  cleanups.push(cleanup);
  return cleanup;
}

function start(window: FakeWindow, capability = CAPABILITY): Promise<any> {
  return invoke(GITHUB_OAUTH_START, trustedEvent(window), capability);
}

/** Starts a flow and waits until the browser opens; the result stays pending. */
async function startAndGetUrl(
  window: FakeWindow
): Promise<{ url: URL; state: string; result: Promise<any> }> {
  const calls = openExternal.mock.calls.length;
  const result = start(window);
  await vi.waitFor(() => expect(openExternal.mock.calls.length).toBe(calls + 1));
  const url = new URL(openExternal.mock.calls.at(-1)![0]);
  return { url, state: url.searchParams.get('state')!, result };
}

function callbackUrl(params: Record<string, string>) {
  return new URL(`${SCHEME}://oauth/callback?${new URLSearchParams(params)}`);
}

async function flush() {
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
}

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });
}

function isSettled(promise: Promise<unknown>): Promise<boolean> {
  const marker = Symbol();
  return Promise.race([promise.then(() => true), flush().then(() => marker)]).then(
    value => value === true
  );
}

beforeEach(() => {
  handlers.clear();
  granted = new Set([CAPABILITY]);
  openExternal.mockReset();
  openExternal.mockResolvedValue(undefined);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GitHub browser OAuth start', () => {
  it('opens the fixed GitHub authorize URL with client, protocol redirect, state, and PKCE', async () => {
    const window = fakeWindow();
    setup(window);

    const { url, state } = await startAndGetUrl(window);
    expect(`${url.origin}${url.pathname}`).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe(CONFIG.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(`${SCHEME}://oauth/callback`);
    expect(url.searchParams.has('scope')).toBe(false);
    expect(state).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(url.searchParams.has('client_secret')).toBe(false);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.has('code_verifier')).toBe(false);

    const second = await startAndGetUrl(window);
    expect(second.state).not.toBe(state);
    expect(second.url.searchParams.get('code_challenge')).not.toBe(
      url.searchParams.get('code_challenge')
    );
  });

  it('never opens the development loopback server in packaged mode', async () => {
    const blocker = http.createServer();
    await new Promise<void>(resolve => blocker.listen(48321, '127.0.0.1', resolve));
    try {
      const window = fakeWindow();
      setup(window);
      fetchMock.mockResolvedValue(jsonResponse(TOKENS));
      const { state, result } = await startAndGetUrl(window);
      dispatchOAuthCallback(callbackUrl({ code: 'auth-code', state }), SCHEME);
      await expect(result).resolves.toEqual(SUCCESS);
    } finally {
      await new Promise<void>((resolve, reject) =>
        blocker.close(error => (error ? reject(error) : resolve()))
      );
    }
  });

  it('reports unavailability through IPC when no client is configured', async () => {
    const window = fakeWindow();
    setup(window, { config: undefined });

    await expect(start(window)).resolves.toEqual({
      success: false,
      error: expect.stringMatching(/not available/i),
    });
    await expect(
      invoke(GITHUB_OAUTH_REFRESH, trustedEvent(window), {
        capability: CAPABILITY,
        refreshToken: 'ghr_x',
      })
    ).resolves.toEqual({ success: false, error: expect.stringMatching(/not available/i) });
    expect(dispatchOAuthCallback(callbackUrl({ code: 'c', state: 's' }), SCHEME)).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it.each([
    ['another sender', (w: FakeWindow) => ({ sender: {}, senderFrame: w.webContents.mainFrame })],
    ['a subframe', (w: FakeWindow) => ({ sender: w.webContents, senderFrame: { url: START_URL } })],
    [
      'an untrusted document',
      (w: FakeWindow) => {
        w.webContents.mainFrame.url = 'https://attacker.example/';
        return trustedEvent(w);
      },
    ],
  ])('rejects start and refresh from %s', async (_name, makeEvent) => {
    const window = fakeWindow();
    setup(window);
    const event = makeEvent(window);

    await expect(invoke(GITHUB_OAUTH_START, event, CAPABILITY)).resolves.toMatchObject({
      success: false,
    });
    await expect(
      invoke(GITHUB_OAUTH_REFRESH, event, { capability: CAPABILITY, refreshToken: 'ghr_r' })
    ).resolves.toMatchObject({ success: false });
    expect(openExternal).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['non-string', 42],
    ['ungranted', OTHER_CAPABILITY],
  ])('denies start and refresh with a %s capability', async (_name, capability) => {
    const window = fakeWindow();
    setup(window);
    fetchMock.mockResolvedValue(jsonResponse(TOKENS));

    await expect(invoke(GITHUB_OAUTH_START, trustedEvent(window), capability)).resolves.toEqual({
      success: false,
      error: 'Unauthorized request',
    });
    await expect(
      invoke(GITHUB_OAUTH_REFRESH, trustedEvent(window), { capability, refreshToken: 'ghr_r' })
    ).resolves.toEqual({ success: false, error: 'Unauthorized request' });
    expect(openExternal).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the private capability authorizer is absent', async () => {
    const window = fakeWindow();
    setup(window, { authorizeGitHubOAuth: undefined, isGitHubOAuthCapabilityLive: undefined });

    await expect(start(window)).resolves.toEqual({
      success: false,
      error: 'Unauthorized request',
    });
    await expect(
      invoke(GITHUB_OAUTH_REFRESH, trustedEvent(window), {
        capability: CAPABILITY,
        refreshToken: 'ghr_r',
      })
    ).resolves.toEqual({ success: false, error: 'Unauthorized request' });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('fails start and clears state when the browser cannot be opened', async () => {
    const window = fakeWindow();
    setup(window);
    openExternal.mockRejectedValueOnce(new Error('no browser'));

    await expect(start(window)).resolves.toEqual({
      success: false,
      error: 'Could not start GitHub sign-in: start failed',
    });
    const state = new URL(openExternal.mock.calls[0][0]).searchParams.get('state')!;
    expect(dispatchOAuthCallback(callbackUrl({ code: 'c', state }), SCHEME)).toBe(true);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'cleanup'] as const)(
    'settles %s independently of a stalled browser launch',
    async cancellation => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      let finishLaunch!: () => void;
      openExternal.mockReturnValueOnce(
        new Promise<void>(resolve => {
          finishLaunch = resolve;
        })
      );
      const window = fakeWindow();
      const cleanup = setup(window);
      try {
        let delivered: unknown;
        void start(window).then(result => {
          delivered = result;
        });
        await flush();
        if (cancellation === 'timeout') vi.advanceTimersByTime(11 * 60 * 1000);
        else cleanup();
        await flush();
        expect(delivered).toMatchObject({
          success: false,
          error: expect.stringMatching(cancellation === 'timeout' ? /timed out/i : /cancelled/i),
        });
        if (cancellation === 'timeout') {
          const retry = await startAndGetUrl(window);
          cleanup();
          await expect(retry.result).resolves.toMatchObject({ success: false });
        }
      } finally {
        finishLaunch();
        vi.useRealTimers();
      }
    }
  );

  it('never broadcasts OAuth results through renderer events', async () => {
    const window = fakeWindow();
    setup(window);
    fetchMock.mockResolvedValue(jsonResponse(TOKENS));
    const { state, result } = await startAndGetUrl(window);
    dispatchOAuthCallback(callbackUrl({ code: 'auth-code', state }), SCHEME);

    await expect(result).resolves.toEqual(SUCCESS);
    expect(window.webContents.send).not.toHaveBeenCalled();
  });
});

describe('GitHub browser OAuth protocol callback', () => {
  it('exchanges a matching callback once with its PKCE verifier and resolves the start request', async () => {
    const window = fakeWindow();
    setup(window);
    fetchMock.mockResolvedValue(jsonResponse(TOKENS));
    const { url, state, result } = await startAndGetUrl(window);

    expect(dispatchOAuthCallback(callbackUrl({ code: 'auth-code', state }), SCHEME)).toBe(true);
    const delivered = await result;

    expect(fetchMock).toHaveBeenCalledOnce();
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://github.com/login/oauth/access_token');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = Object.fromEntries(new URLSearchParams(init.body));
    expect(body).toEqual({
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
      code: 'auth-code',
      redirect_uri: `${SCHEME}://oauth/callback`,
      code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(crypto.createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(
      url.searchParams.get('code_challenge')
    );
    expect(url.toString()).not.toContain(body.code_verifier);
    expect(delivered).toEqual(SUCCESS);
    expect(JSON.stringify(delivered)).not.toContain(body.code_verifier);
    const expiresIn = (Date.parse(delivered.expiresAt) - Date.now()) / 1000;
    expect(expiresIn).toBeGreaterThan(28700);
    expect(expiresIn).toBeLessThanOrEqual(28800);
    expect(window.focus).toHaveBeenCalled();
  });

  it('binds each flow to its own verifier', async () => {
    const window = fakeWindow();
    setup(window);
    fetchMock.mockImplementation(async () => jsonResponse(TOKENS));
    const challenges: string[] = [];
    const verifiers: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { url, state, result } = await startAndGetUrl(window);
      challenges.push(url.searchParams.get('code_challenge')!);
      dispatchOAuthCallback(callbackUrl({ code: `code-${i}`, state }), SCHEME);
      await expect(result).resolves.toEqual(SUCCESS);
      verifiers.push(new URLSearchParams(fetchMock.mock.calls[i][1].body).get('code_verifier')!);
    }
    expect(verifiers[0]).not.toBe(verifiers[1]);
    expect(
      verifiers.map(verifier => crypto.createHash('sha256').update(verifier).digest('base64url'))
    ).toEqual(challenges);
  });

  it('rejects a wrong state without consuming the pending flow', async () => {
    const window = fakeWindow();
    setup(window);
    fetchMock.mockResolvedValue(jsonResponse(TOKENS));
    const { state, result } = await startAndGetUrl(window);
    const reportError = vi.fn();

    expect(
      dispatchOAuthCallback(callbackUrl({ code: 'x', state: `${state}x` }), SCHEME, reportError)
    ).toBe(true);
    await flush();
    expect(reportError).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await isSettled(result)).toBe(false);

    dispatchOAuthCallback(callbackUrl({ code: 'auth-code', state }), SCHEME);
    await expect(result).resolves.toEqual(SUCCESS);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects replayed and concurrent callbacks after the state is consumed', async () => {
    const window = fakeWindow();
    setup(window);
    let resolveFetch!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => (resolveFetch = resolve)));
    const { state, result } = await startAndGetUrl(window);
    const reportError = vi.fn();

    dispatchOAuthCallback(callbackUrl({ code: 'one', state }), SCHEME, reportError);
    dispatchOAuthCallback(callbackUrl({ code: 'two', state }), SCHEME, reportError);
    await flush();
    resolveFetch(jsonResponse(TOKENS));
    await expect(result).resolves.toEqual(SUCCESS);
    dispatchOAuthCallback(callbackUrl({ code: 'three', state }), SCHEME, reportError);
    await flush();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledTimes(2);
  });

  it('settles the start request and rejects callbacks after the pending flow expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      const window = fakeWindow();
      setup(window);
      const { state, result } = await startAndGetUrl(window);
      vi.advanceTimersByTime(11 * 60 * 1000);
      await expect(result).resolves.toEqual({
        success: false,
        error: expect.stringMatching(/timed out/i),
      });
      const reportError = vi.fn();
      dispatchOAuthCallback(callbackUrl({ code: 'late', state }), SCHEME, reportError);
      await vi.waitFor(() => expect(reportError).toHaveBeenCalledOnce());
      expect(fetchMock).not.toHaveBeenCalled();
      await startAndGetUrl(window);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves a sanitized failure when GitHub denies authorization', async () => {
    const window = fakeWindow();
    setup(window);
    const { state, result } = await startAndGetUrl(window);

    dispatchOAuthCallback(
      callbackUrl({ error: 'access_denied', error_description: '<script>', state }),
      SCHEME
    );
    const delivered = await result;

    expect(fetchMock).not.toHaveBeenCalled();
    expect(delivered).toEqual({ success: false, error: expect.stringContaining('access_denied') });
    expect(delivered.error).not.toContain('<script>');
  });

  it('cancels without tokens when the main frame navigates during the exchange', async () => {
    const window = fakeWindow();
    setup(window);
    let resolveFetch!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => (resolveFetch = resolve)));
    const { state, result } = await startAndGetUrl(window);

    dispatchOAuthCallback(callbackUrl({ code: 'one', state }), SCHEME);
    await flush();
    window.webContents.emit('did-start-navigation', {}, START_URL, false, true);
    await expect(result).resolves.toEqual({ success: false, error: expect.any(String) });
    resolveFetch(jsonResponse(TOKENS));
    await flush();
    expect(JSON.stringify(await result)).not.toContain(TOKENS.access_token);
  });

  it('cancels a pending flow on main-frame navigation', async () => {
    const window = fakeWindow();
    setup(window);
    const { state, result } = await startAndGetUrl(window);

    window.webContents.emit('did-start-navigation', {}, START_URL, false, true);
    await expect(result).resolves.toMatchObject({ success: false });
    const reportError = vi.fn();
    dispatchOAuthCallback(callbackUrl({ code: 'late', state }), SCHEME, reportError);
    await flush();
    expect(reportError).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('withholds tokens when the capability is revoked during the exchange', async () => {
    const window = fakeWindow();
    setup(window);
    let resolveFetch!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => (resolveFetch = resolve)));
    const { state, result } = await startAndGetUrl(window);

    dispatchOAuthCallback(callbackUrl({ code: 'one', state }), SCHEME);
    await flush();
    granted.delete(CAPABILITY);
    resolveFetch(jsonResponse(TOKENS));

    const delivered = await result;
    expect(delivered).toEqual({ success: false, error: expect.any(String) });
    expect(JSON.stringify(delivered)).not.toContain(TOKENS.access_token);
  });

  it('settles an older exchange as replaced when another sign-in starts', async () => {
    const window = fakeWindow();
    setup(window);
    let resolveFetch!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>(resolve => (resolveFetch = resolve)));
    const first = await startAndGetUrl(window);
    dispatchOAuthCallback(callbackUrl({ code: 'old-code', state: first.state }), SCHEME);
    await flush();
    const second = await startAndGetUrl(window);
    await expect(first.result).resolves.toEqual({
      success: false,
      error: expect.stringMatching(/replaced/i),
    });
    resolveFetch(jsonResponse(TOKENS));
    await flush();
    expect(await isSettled(second.result)).toBe(false);

    fetchMock.mockResolvedValueOnce(jsonResponse(TOKENS));
    dispatchOAuthCallback(callbackUrl({ code: 'new-code', state: second.state }), SCHEME);
    await expect(second.result).resolves.toEqual(SUCCESS);
  });

  it('rejects overlapping starts while browser launch is pending', async () => {
    const window = fakeWindow();
    setup(window);
    let rejectOpen!: (error: Error) => void;
    openExternal.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOpen = reject;
        })
    );
    const first = start(window);
    await flush();
    const second = await start(window);
    expect(second).toMatchObject({ success: false, error: expect.stringMatching(/starting/i) });
    rejectOpen(new Error('browser unavailable'));
    await expect(first).resolves.toMatchObject({ success: false });
    await startAndGetUrl(window);
  });

  it('replaces handlers, pending state, and the provider when the window is recreated', async () => {
    const first = fakeWindow();
    const staleCleanup = setup(first);
    const old = await startAndGetUrl(first);
    const second = fakeWindow();
    setup(second);
    staleCleanup();
    await expect(old.result).resolves.toMatchObject({ success: false });
    fetchMock.mockResolvedValue(jsonResponse(TOKENS));
    const reportError = vi.fn();

    await expect(start(first)).resolves.toMatchObject({ success: false });
    dispatchOAuthCallback(callbackUrl({ code: 'old', state: old.state }), SCHEME, reportError);
    await flush();
    expect(reportError).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();

    const { state, result } = await startAndGetUrl(second);
    dispatchOAuthCallback(callbackUrl({ code: 'new', state }), SCHEME);
    await expect(result).resolves.toEqual(SUCCESS);
  });

  it('removes IPC handlers and the provider and settles pending starts on cleanup', async () => {
    const window = fakeWindow();
    const cleanup = setup(window);
    const { result } = await startAndGetUrl(window);
    cleanup();
    cleanup();

    await expect(result).resolves.toMatchObject({ success: false });
    expect(handlers.has(GITHUB_OAUTH_START)).toBe(false);
    expect(handlers.has(GITHUB_OAUTH_REFRESH)).toBe(false);
    expect(dispatchOAuthCallback(callbackUrl({ code: 'c', state: 's' }), SCHEME)).toBe(false);
  });
});

describe('GitHub OAuth token refresh', () => {
  function refresh(window: FakeWindow, refreshToken: unknown, capability: unknown = CAPABILITY) {
    return invoke(GITHUB_OAUTH_REFRESH, trustedEvent(window), { capability, refreshToken });
  }

  it('refreshes through the fixed endpoint and returns the token shape', async () => {
    const window = fakeWindow();
    setup(window);
    fetchMock.mockResolvedValue(jsonResponse(TOKENS));

    const result = await refresh(window, 'ghr_old');

    expect(result).toEqual(SUCCESS);
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://github.com/login/oauth/access_token');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: 'ghr_old',
    });
  });

  it('withholds refreshed tokens when the trusted document navigates mid-request', async () => {
    const window = fakeWindow();
    setup(window);
    let resolveFetch!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => (resolveFetch = resolve)));

    const pending = refresh(window, 'ghr_old');
    await flush();
    window.webContents.mainFrame.url = 'https://attacker.example/';
    window.webContents.emit('did-start-navigation', {}, 'https://attacker.example/', false, true);
    resolveFetch(jsonResponse(TOKENS));

    await expect(pending).resolves.toEqual({ success: false, error: expect.any(String) });
  });

  it('withholds refreshed tokens when the capability is revoked mid-request', async () => {
    const window = fakeWindow();
    setup(window);
    let resolveFetch!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => (resolveFetch = resolve)));

    const pending = refresh(window, 'ghr_old');
    await flush();
    granted.delete(CAPABILITY);
    resolveFetch(jsonResponse(TOKENS));

    const result = await pending;
    expect(result).toEqual({ success: false, error: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain(TOKENS.access_token);
  });

  it.each([[undefined], [42], [''], ['x'.repeat(5000)], ['has space']])(
    'rejects invalid refresh input %#',
    async refreshToken => {
      const window = fakeWindow();
      setup(window);

      await expect(refresh(window, refreshToken)).resolves.toEqual({
        success: false,
        error: expect.any(String),
      });
      await expect(
        invoke(GITHUB_OAUTH_REFRESH, trustedEvent(window), undefined)
      ).resolves.toMatchObject({ success: false });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['HTTP failure', () => new Response('ghr_secret leaked body', { status: 500 }), /HTTP 500/],
    [
      'OAuth error',
      () => jsonResponse({ error: 'bad_refresh_token', error_description: 'ghr_secret leaked' }),
      /bad_refresh_token/,
    ],
    ['malformed JSON', () => new Response('not json', { status: 200 }), /invalid/i],
    [
      'missing access token',
      () => jsonResponse({ ...TOKENS, access_token: undefined }),
      /invalid/i,
    ],
    ['non-string token', () => jsonResponse({ ...TOKENS, refresh_token: 7 }), /invalid/i],
    ['missing expiry', () => jsonResponse({ ...TOKENS, expires_in: undefined }), /expir/i],
    ['zero expiry', () => jsonResponse({ ...TOKENS, expires_in: 0 }), /expir/i],
    [
      'unrepresentable expiry',
      () => jsonResponse({ ...TOKENS, expires_in: Number.MAX_VALUE }),
      /expir/i,
    ],
    ['missing refresh token', () => jsonResponse({ access_token: 'ghu_a' }), /expir/i],
  ])('returns a sanitized failure for %s', async (_name, makeResponse, message) => {
    const window = fakeWindow();
    setup(window);
    fetchMock.mockImplementation(async () => makeResponse());

    const result = await refresh(window, 'ghr_secret');

    expect(result).toEqual({ success: false, error: expect.stringMatching(message) });
    expect(JSON.stringify(result)).not.toContain('ghr_secret');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('ghr_secret');
  });

  it('reports network failures and timeouts without raw errors', async () => {
    const window = fakeWindow();
    setup(window);
    fetchMock.mockRejectedValueOnce(new Error('connect to https://x?code=ghr_secret failed'));
    fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));

    const network = await refresh(window, 'ghr_secret');
    const timeout = await refresh(window, 'ghr_secret');

    expect(network).toEqual({ success: false, error: expect.any(String) });
    expect(timeout).toEqual({ success: false, error: expect.stringMatching(/timed out/i) });
    expect(JSON.stringify([network, vi.mocked(console.error).mock.calls])).not.toContain(
      'ghr_secret'
    );
  });
});

describe('GitHub OAuth preload bridge to host handlers', () => {
  function connectRenderer(window: FakeWindow) {
    renderer.event = trustedEvent(window);
  }

  it('runs capability-bound start and refresh through the real preload API', async () => {
    const window = fakeWindow();
    setup(window);
    connectRenderer(window);
    fetchMock.mockImplementation(async () => jsonResponse(TOKENS));

    expect(renderer.api.startGitHubOAuth).toBeUndefined();
    expect(renderer.api.onGitHubOAuthCallback).toBeUndefined();
    expect(renderer.api.refreshGitHubOAuth).toBeUndefined();
    const started = renderer.api.githubOAuth.start(CAPABILITY);
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledOnce());
    const state = new URL(openExternal.mock.calls[0][0]).searchParams.get('state')!;
    dispatchOAuthCallback(callbackUrl({ code: 'auth-code', state }), SCHEME);
    await expect(started).resolves.toEqual(SUCCESS);
    expect(renderer.listeners.size).toBe(0);

    await expect(renderer.api.githubOAuth.refresh(CAPABILITY, 'ghr_old')).resolves.toMatchObject({
      success: true,
      accessToken: TOKENS.access_token,
    });
    expect(new URLSearchParams(fetchMock.mock.calls[1][1].body).get('refresh_token')).toBe(
      'ghr_old'
    );
    await expect(renderer.api.githubOAuth.start(OTHER_CAPABILITY)).resolves.toEqual({
      success: false,
      error: 'Unauthorized request',
    });
    await expect(renderer.api.githubOAuth.refresh(OTHER_CAPABILITY, 'ghr_old')).resolves.toEqual({
      success: false,
      error: 'Unauthorized request',
    });
  });

  it('returns not-available results through the preload API when unconfigured', async () => {
    const window = fakeWindow();
    setup(window, { config: undefined });
    connectRenderer(window);

    await expect(renderer.api.githubOAuth.start(CAPABILITY)).resolves.toMatchObject({
      success: false,
    });
    await expect(renderer.api.githubOAuth.refresh(CAPABILITY, 'ghr_old')).resolves.toMatchObject({
      success: false,
    });
  });
});

describe('GitHub OAuth development loopback callback', () => {
  it('uses the historical localhost redirect and handles one callback over HTTP', async () => {
    const window = fakeWindow();
    setup(window, { isDev: true });
    fetchMock.mockResolvedValue(jsonResponse(TOKENS));

    const { url, state, result } = await startAndGetUrl(window);
    expect(url.searchParams.get('redirect_uri')).toBe(DEV_REDIRECT_URI);
    expect(DEV_REDIRECT_URI).toBe('http://localhost:48321/oauth/callback');

    expect((await get('http://127.0.0.1:48321/other')).status).toBe(404);
    expect((await get(`http://127.0.0.1:48321/oauth/callback?code=c&state=bad`)).status).toBe(400);
    const ok = await get(`http://127.0.0.1:48321/oauth/callback?code=c&state=${state}`);
    expect(ok.status).toBe(200);
    expect(ok.body).not.toContain(TOKENS.access_token);
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get('redirect_uri')).toBe(DEV_REDIRECT_URI);
    expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(result).resolves.toEqual(SUCCESS);
    await flush();
    await expect(get('http://127.0.0.1:48321/oauth/callback')).rejects.toThrow();
  });

  it('rejects a malformed HTTP target without losing the pending sign-in', async () => {
    const window = fakeWindow();
    setup(window, { isDev: true });
    fetchMock.mockResolvedValue(jsonResponse(TOKENS));
    const { state, result } = await startAndGetUrl(window);
    const status = await new Promise<number>((resolve, reject) => {
      const request = http.get({ host: '127.0.0.1', port: 48321, path: '//[' }, response => {
        response.resume();
        resolve(response.statusCode!);
      });
      request.setTimeout(1000, () => request.destroy(new Error('No response to malformed URL')));
      request.on('error', reject);
    });
    expect(status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await get(`http://127.0.0.1:48321/oauth/callback?code=c&state=${state}`)).status).toBe(
      200
    );
    await expect(result).resolves.toEqual(SUCCESS);
  });

  it('does not accept the protocol callback for a development flow', async () => {
    const window = fakeWindow();
    setup(window, { isDev: true });
    const { state } = await startAndGetUrl(window);
    const reportError = vi.fn();

    dispatchOAuthCallback(callbackUrl({ code: 'c', state }), SCHEME, reportError);
    await flush();
    expect(reportError).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails start when the loopback port cannot be bound', async () => {
    const blocker = http.createServer();
    await new Promise<void>(resolve => blocker.listen(48321, '127.0.0.1', resolve));
    try {
      const window = fakeWindow();
      setup(window, { isDev: true });

      await expect(start(window)).resolves.toEqual({
        success: false,
        error: expect.any(String),
      });
      expect(openExternal).not.toHaveBeenCalled();
    } finally {
      await new Promise(resolve => blocker.close(resolve));
    }
  });

  it('stops the loopback server and settles the start request on cleanup', async () => {
    const window = fakeWindow();
    const cleanup = setup(window, { isDev: true });
    const { result } = await startAndGetUrl(window);

    cleanup();
    await expect(result).resolves.toMatchObject({ success: false });
    await flush();
    await expect(get('http://127.0.0.1:48321/oauth/callback')).rejects.toThrow();
  });
});
