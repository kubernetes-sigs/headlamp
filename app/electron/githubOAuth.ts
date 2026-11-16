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

// GitHub App browser OAuth (web application flow) for desktop products that
// configure `githubOAuth` in their build manifest. The main process opens the
// browser, receives the callback, and exchanges or refreshes tokens so the
// renderer avoids CORS. Every request carries a plugin command capability with
// the product's githubOAuth grant. Tokens are returned only as the response to
// that capability's own start or refresh request, never broadcast as renderer
// events; the consuming plugin owns persistence through its scoped secure storage.
//
// The client secret is supplied by the product manifest and is not
// confidential: distributed native apps are public clients (RFC 8252 §8.5).
// Protection relies on the registered redirect URI, the single-use state, and a
// per-flow PKCE verifier (RFC 7636) that never leaves the main process.

import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { ipcMain, shell } from 'electron';
import crypto from 'node:crypto';
import http from 'node:http';
import { registerOAuthProvider } from './oauthProvider';
import { isTrustedDocumentUrl } from './secureStorage';

export const GITHUB_OAUTH_START = 'github-oauth-start';
export const GITHUB_OAUTH_REFRESH = 'github-oauth-refresh';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const DEV_CALLBACK_PORT = 48321;
/** Historical development redirect registered for loopback callbacks. */
export const DEV_REDIRECT_URI = `http://localhost:${DEV_CALLBACK_PORT}/oauth/callback`;
const CALLBACK_HOSTNAME = 'oauth';
const CALLBACK_PATHNAME = '/callback';
const PENDING_FLOW_LIFETIME_MS = 10 * 60 * 1000;
const TOKEN_REQUEST_TIMEOUT_MS = 30 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_.~+/=-]{1,4096}$/;
const CODE_PATTERN = /^[A-Za-z0-9_.~-]{1,512}$/;
const OAUTH_ERROR_PATTERN = /^[a-z0-9_]{1,64}$/;
const NOT_AVAILABLE = 'GitHub browser authentication is not available in this build.';
const UNAUTHORIZED = 'Unauthorized request';
const CANCELLED = 'GitHub sign-in was cancelled';

/** Product-supplied GitHub App OAuth client identity. */
export interface GitHubOAuthConfig {
  /** GitHub App client ID. */
  clientId: string;
  /** GitHub App client secret embedded in the public desktop client. */
  clientSecret: string;
}

/** Options for one main window's GitHub OAuth integration. */
export interface GitHubOAuthOptions {
  /** Window whose trusted main frame may start flows and receive tokens. */
  mainWindow: BrowserWindow;
  /** Exact Headlamp document URL allowed to use the integration. */
  trustedStartUrl: string;
  /** Product protocol scheme used for packaged callbacks. */
  protocolScheme: string;
  /** Client identity; when absent every request reports unavailability. */
  config?: GitHubOAuthConfig;
  /** Whether to receive callbacks on the historical localhost redirect. */
  isDev: boolean;
  /**
   * Authenticates an IPC request for a capability holding the githubOAuth grant.
   * When absent every request is denied.
   */
  authorizeGitHubOAuth?: (event: IpcMainInvokeEvent, capability: string) => boolean;
  /**
   * Reports whether a capability still holds the grant for the current trusted
   * document, used before asynchronous results are delivered. When absent no
   * result is delivered.
   */
  isGitHubOAuthCapabilityLive?: (capability: string) => boolean;
}

/** Result returned to the requesting capability for sign-in and refresh. */
export interface GitHubOAuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  error?: string;
}

type CallbackSource = 'protocol' | 'loopback';

interface PendingFlow {
  state: string;
  /** PKCE verifier sent only in this flow's code exchange. */
  codeVerifier: string;
  /** Capability whose start request receives this flow's result. */
  capability: string;
  source: CallbackSource;
  redirectUri: string;
  timer?: ReturnType<typeof setTimeout>;
  /** Whether a callback has consumed the state and an exchange is in progress. */
  consumed: boolean;
  settled: boolean;
  resolve: (result: GitHubOAuthResult) => void;
}

/** Cleanup for the integration attached to the current main window. */
let activeCleanup: (() => void) | null = null;

/** Error whose message is safe to return to the renderer and log. */
class OAuthFailure extends Error {}

/**
 * Registers GitHub OAuth IPC handlers and the protocol callback provider for a
 * main window, replacing any integration attached to a previous window.
 *
 * Call before the protocol handler becomes ready so launch-time callbacks can
 * be claimed.
 *
 * @param options Window, trust, protocol, and client configuration.
 * @returns Cleanup that removes handlers, the provider, pending state, and the dev server.
 */
export function setupGitHubOAuth(options: GitHubOAuthOptions): () => void {
  activeCleanup?.();
  const {
    mainWindow,
    trustedStartUrl,
    protocolScheme,
    config,
    isDev,
    authorizeGitHubOAuth,
    isGitHubOAuthCapabilityLive,
  } = options;
  const webContents = mainWindow.webContents;
  /** The one flow whose start request has not settled, awaiting or exchanging a callback. */
  let current: PendingFlow | null = null;
  let devServer: http.Server | null = null;
  // Navigation or a new sign-in invalidates a browser launch still starting.
  let documentGeneration = 0;
  let starting = false;
  let disposed = false;

  const isTrustedRenderer = () =>
    !disposed &&
    !mainWindow.isDestroyed() &&
    isTrustedDocumentUrl(webContents.mainFrame.url, trustedStartUrl);
  const isTrustedSender = (event: IpcMainInvokeEvent) =>
    event.sender === webContents &&
    event.senderFrame === webContents.mainFrame &&
    isTrustedRenderer();
  const isAuthorized = (event: IpcMainInvokeEvent, capability: unknown): capability is string =>
    typeof capability === 'string' &&
    isTrustedSender(event) &&
    authorizeGitHubOAuth?.(event, capability) === true;
  const isLive = (capability: string) =>
    isTrustedRenderer() && isGitHubOAuthCapabilityLive?.(capability) === true;

  const stopDevServer = () => {
    devServer?.close();
    devServer?.closeAllConnections();
    devServer = null;
  };
  /** Resolves a flow's start request exactly once. */
  const settle = (flow: PendingFlow, result: GitHubOAuthResult) => {
    if (flow.settled) return;
    flow.settled = true;
    clearTimeout(flow.timer);
    if (current === flow) current = null;
    flow.resolve(result);
  };
  /** Settles the unsettled flow, if any, without tokens and stops its callback server. */
  const cancelCurrent = (error: string) => {
    if (current) settle(current, { success: false, error });
    stopDevServer();
  };

  /** Validates and consumes the pending state before any network exchange. */
  const consumePending = (url: URL, source: CallbackSource): PendingFlow => {
    const state = url.searchParams.get('state') ?? '';
    const flow = current;
    if (!flow || flow.consumed || flow.source !== source || !safeEqual(state, flow.state)) {
      throw new OAuthFailure('Invalid or expired GitHub OAuth state');
    }
    clearTimeout(flow.timer);
    flow.consumed = true;
    return flow;
  };

  const completeFlow = async (url: URL, flow: PendingFlow): Promise<void> => {
    let result: GitHubOAuthResult;
    const providerError = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    if (providerError !== null) {
      const reason = OAUTH_ERROR_PATTERN.test(providerError) ? providerError : 'unknown_error';
      result = { success: false, error: `GitHub authorization failed: ${reason}` };
    } else if (!code || !CODE_PATTERN.test(code)) {
      result = { success: false, error: 'GitHub authorization callback had no valid code' };
    } else {
      result = await requestTokens(config!, {
        code,
        redirect_uri: flow.redirectUri,
        code_verifier: flow.codeVerifier,
      });
    }
    // Replacement, navigation, cleanup, or revocation already settled or invalidated
    // this flow; never hand its tokens to a different document or capability.
    if (flow.settled || current !== flow || !isLive(flow.capability)) {
      settle(flow, { success: false, error: CANCELLED });
      return;
    }
    settle(flow, result);
    mainWindow.focus();
  };

  const startDevServer = (): Promise<void> => {
    const server = http.createServer(async (req, res) => {
      let url: URL;
      try {
        url = new URL(req.url ?? '/', `http://localhost:${DEV_CALLBACK_PORT}`);
      } catch {
        res.writeHead(400).end('Invalid callback URL');
        return;
      }
      if (req.method !== 'GET' || url.pathname !== '/oauth/callback') {
        res.writeHead(404).end('Not found');
        return;
      }
      let flow: PendingFlow;
      try {
        flow = consumePending(url, 'loopback');
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Invalid OAuth callback');
        return;
      }
      await completeFlow(url, flow);
      res
        .writeHead(200, { 'Content-Type': 'text/plain' })
        .end('Return to the application to see the sign-in result. You can close this tab.');
      if (devServer === server) stopDevServer();
    });
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(DEV_CALLBACK_PORT, '127.0.0.1', () => {
        server.off('error', reject);
        server.on('error', () => {
          if (devServer === server) cancelCurrent('GitHub sign-in callback server failed');
        });
        devServer = server;
        resolve();
      });
    });
  };

  ipcMain.removeHandler(GITHUB_OAUTH_START);
  ipcMain.removeHandler(GITHUB_OAUTH_REFRESH);

  ipcMain.handle(
    GITHUB_OAUTH_START,
    async (event, capability: unknown): Promise<GitHubOAuthResult> => {
      if (!isAuthorized(event, capability)) return { success: false, error: UNAUTHORIZED };
      if (!config) return { success: false, error: NOT_AVAILABLE };
      if (starting) return { success: false, error: 'GitHub sign-in is already starting' };
      starting = true;
      const generation = ++documentGeneration;
      cancelCurrent('GitHub sign-in was replaced by a newer request');
      const source: CallbackSource = isDev ? 'loopback' : 'protocol';
      const redirectUri = isDev
        ? DEV_REDIRECT_URI
        : `${protocolScheme}://${CALLBACK_HOSTNAME}${CALLBACK_PATHNAME}`;
      const state = crypto.randomBytes(32).toString('base64url');
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      let flow: PendingFlow | undefined;
      let completion: Promise<GitHubOAuthResult>;
      // `starting` covers only server startup and browser launch; the returned
      // completion promise stays pending until the callback, timeout, or cancellation.
      try {
        if (isDev) await startDevServer();
        if (generation !== documentGeneration || !isAuthorized(event, capability)) {
          stopDevServer();
          return { success: false, error: CANCELLED };
        }
        completion = new Promise<GitHubOAuthResult>(resolve => {
          flow = {
            state,
            codeVerifier,
            capability,
            source,
            redirectUri,
            consumed: false,
            settled: false,
            resolve,
          };
        });
        const started = flow!;
        started.timer = setTimeout(() => {
          if (current === started && !started.consumed) {
            cancelCurrent('GitHub sign-in timed out. Please try again.');
          }
        }, PENDING_FLOW_LIFETIME_MS);
        current = started;
        const authorizeUrl = new URL(AUTHORIZE_URL);
        authorizeUrl.search = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: redirectUri,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        }).toString();
        // Cancellation must reach the caller even if the OS browser launcher stalls.
        await Promise.race([shell.openExternal(authorizeUrl.toString()), completion]);
      } catch (error) {
        const reason = isDev && isAddressInUse(error) ? 'callback port is in use' : 'start failed';
        console.error(`GitHub OAuth ${reason}`);
        const failure = { success: false, error: `Could not start GitHub sign-in: ${reason}` };
        if (flow && current === flow) cancelCurrent(failure.error);
        else if (!flow) stopDevServer();
        return failure;
      } finally {
        starting = false;
      }
      return completion;
    }
  );

  ipcMain.handle(
    GITHUB_OAUTH_REFRESH,
    async (event, payload: unknown): Promise<GitHubOAuthResult> => {
      const request = (typeof payload === 'object' && payload !== null ? payload : {}) as {
        capability?: unknown;
        refreshToken?: unknown;
      };
      const { capability, refreshToken } = request;
      if (!isAuthorized(event, capability)) return { success: false, error: UNAUTHORIZED };
      if (!config) return { success: false, error: NOT_AVAILABLE };
      if (typeof refreshToken !== 'string' || !TOKEN_PATTERN.test(refreshToken)) {
        return { success: false, error: 'Invalid refresh token' };
      }
      const result = await requestTokens(config, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      // Navigation or revocation during the request invalidates its response.
      return isLive(capability)
        ? result
        : { success: false, error: 'GitHub token refresh was cancelled' };
    }
  );

  const unregisterProvider = config
    ? registerOAuthProvider({
        id: 'github',
        callback: { hostname: CALLBACK_HOSTNAME, pathname: CALLBACK_PATHNAME },
        handleCallback: url => completeFlow(url, consumePending(url, 'protocol')),
      })
    : () => {};

  const onNavigation = (
    _event: unknown,
    _url: string,
    isInPlace: boolean,
    isMainFrame: boolean
  ) => {
    if (isMainFrame && !isInPlace) {
      documentGeneration++;
      cancelCurrent(CANCELLED);
    }
  };
  webContents.on('did-start-navigation', onNavigation);

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cancelCurrent(CANCELLED);
    unregisterProvider();
    webContents.removeListener('did-start-navigation', onNavigation);
    if (activeCleanup === cleanup) {
      ipcMain.removeHandler(GITHUB_OAUTH_START);
      ipcMain.removeHandler(GITHUB_OAUTH_REFRESH);
      activeCleanup = null;
    }
  };
  activeCleanup = cleanup;
  return cleanup;
}

/** Removes the integration attached to the current main window, if any. */
export function cleanupGitHubOAuth(): void {
  activeCleanup?.();
}

/**
 * Exchanges a code or refresh token at GitHub's fixed token endpoint.
 *
 * @returns A validated expiring token set or a sanitized failure.
 */
async function requestTokens(
  config: GitHubOAuthConfig,
  grant: Record<string, string>
): Promise<GitHubOAuthResult> {
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...grant,
      }).toString(),
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new OAuthFailure(`GitHub token endpoint returned HTTP ${response.status}`);
    }
    return { success: true, ...parseTokenResponse(await readJson(response)) };
  } catch (error) {
    const message =
      error instanceof OAuthFailure
        ? error.message
        : (error as { name?: unknown })?.name === 'TimeoutError'
        ? 'GitHub token request timed out'
        : 'GitHub token request failed';
    console.error(`GitHub OAuth token request failed: ${message}`);
    return { success: false, error: message };
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await response.json()) as unknown;
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // Fall through to the sanitized failure below.
  }
  throw new OAuthFailure('GitHub token endpoint returned an invalid response');
}

function parseTokenResponse(body: Record<string, unknown>) {
  if (body.error !== undefined) {
    const code =
      typeof body.error === 'string' && OAUTH_ERROR_PATTERN.test(body.error)
        ? body.error
        : 'unknown_error';
    throw new OAuthFailure(`GitHub token request was rejected: ${code}`);
  }
  const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } = body;
  if (typeof accessToken !== 'string' || !TOKEN_PATTERN.test(accessToken)) {
    throw new OAuthFailure('GitHub token endpoint returned an invalid access token');
  }
  // The plugin contract requires expiring user tokens with refresh support.
  if (
    refreshToken === undefined ||
    expiresIn === undefined ||
    typeof expiresIn !== 'number' ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new OAuthFailure(
      'GitHub returned a non-expiring token; enable expiring user tokens for the GitHub App'
    );
  }
  if (typeof refreshToken !== 'string' || !TOKEN_PATTERN.test(refreshToken)) {
    throw new OAuthFailure('GitHub token endpoint returned an invalid refresh token');
  }
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new OAuthFailure('GitHub token endpoint returned an invalid token expiry');
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAt.toISOString(),
  };
}

function safeEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isAddressInUse(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'EADDRINUSE';
}
