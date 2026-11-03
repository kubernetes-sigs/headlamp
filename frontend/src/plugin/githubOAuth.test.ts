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

import { describe, expect, it, vi } from 'vitest';
import type { PluginCommandCapability } from './commandCapabilities';
import {
  captureGitHubOAuthBridge,
  createPluginGitHubOAuth,
  getPluginGitHubOAuthArgValues,
  type GitHubOAuthResult,
} from './githubOAuth';
import type { PluginInfo } from './pluginsSlice';

const CAPABILITY = 'a'.repeat(64);
const TOKENS = {
  success: true,
  accessToken: 'ghu_token',
  refreshToken: 'ghr_token',
  expiresAt: '2030-01-01T00:00:00.000Z',
};
const plugin = {
  name: '@example/plugin',
  folderName: 'example-plugin',
  source: 'shipped',
  type: 'shipped',
} as PluginInfo;
const granted: PluginCommandCapability = {
  bundleName: 'example-plugin',
  packageName: '@example/plugin',
  source: 'shipped',
  capability: CAPABILITY,
  clusterRegistrationProviders: [],
  githubOAuth: true,
};

function bridge(result: unknown = TOKENS) {
  return { start: vi.fn().mockResolvedValue(result), refresh: vi.fn().mockResolvedValue(TOKENS) };
}

describe('getPluginGitHubOAuthArgValues', () => {
  it('injects pluginGitHubOAuth only for the exact granted identity', () => {
    const raw = bridge();
    const [names, values] = getPluginGitHubOAuthArgValues([granted], plugin, raw);
    expect(names).toEqual(['pluginGitHubOAuth']);
    expect(Object.keys(values[0] as object).sort()).toEqual([
      'onGitHubOAuthCallback',
      'refreshGitHubOAuth',
      'startGitHubOAuth',
    ]);
  });

  it.each([
    ['an unrelated package', [granted], { ...plugin, name: '@attacker/plugin' }],
    ['an unrelated bundle', [granted], { ...plugin, folderName: 'attacker' }],
    ['a different inventory', [granted], { ...plugin, source: 'user', type: 'user' }],
    ['an ungranted capability', [{ ...granted, githubOAuth: undefined }], plugin],
    ['an explicitly denied grant', [{ ...granted, githubOAuth: false }], plugin],
    ['a malformed capability', [{ ...granted, capability: 'secret' }], plugin],
  ])('withholds the facade from %s', (_name, capabilities, candidate) => {
    expect(
      getPluginGitHubOAuthArgValues(
        capabilities as PluginCommandCapability[],
        candidate as PluginInfo,
        bridge()
      )
    ).toEqual([[], []]);
  });

  it('withholds the facade without the private bridge', () => {
    expect(getPluginGitHubOAuthArgValues([granted], plugin, undefined)).toEqual([[], []]);
  });
});

describe('captureGitHubOAuthBridge', () => {
  it('captures bridge functions so later global mutation cannot redirect them', async () => {
    const raw = bridge();
    const original = raw.start;
    const captured = captureGitHubOAuthBridge(raw)!;
    raw.start = vi.fn();

    await captured.start(CAPABILITY);
    expect(original).toHaveBeenCalledWith(CAPABILITY);
    expect(raw.start).not.toHaveBeenCalled();
    expect(captureGitHubOAuthBridge(undefined)).toBeUndefined();
    expect(captureGitHubOAuthBridge({ start: 'x' } as never)).toBeUndefined();
  });
});

describe('createPluginGitHubOAuth', () => {
  it('delivers start results only to this facade and returns token-free status', async () => {
    const raw = bridge();
    const facade = createPluginGitHubOAuth(CAPABILITY, raw);
    const otherRaw = bridge();
    const other = createPluginGitHubOAuth('b'.repeat(64), otherRaw);
    const listener = vi.fn();
    const otherListener = vi.fn();
    facade.onGitHubOAuthCallback(listener);
    other.onGitHubOAuthCallback(otherListener);

    const pending = facade.startGitHubOAuth();
    const otherPending = other.startGitHubOAuth();
    const status = await pending;

    expect(raw.start).toHaveBeenCalledExactlyOnceWith(CAPABILITY);
    expect(otherRaw.start).toHaveBeenCalledExactlyOnceWith('b'.repeat(64));
    expect(status).toEqual({ success: true });
    expect(await otherPending).toEqual({ success: true });
    expect(JSON.stringify(status)).not.toContain('ghu_token');
    expect(listener).toHaveBeenCalledExactlyOnceWith(TOKENS);
    expect(otherListener).toHaveBeenCalledExactlyOnceWith(TOKENS);
  });

  it('does not notify overlapping subscribers before their shared sign-in completes', async () => {
    let resolveFirst!: (result: GitHubOAuthResult) => void;
    let resolveSecond!: (result: GitHubOAuthResult) => void;
    const first = new Promise<GitHubOAuthResult>(resolve => {
      resolveFirst = resolve;
    });
    const second = new Promise<GitHubOAuthResult>(resolve => {
      resolveSecond = resolve;
    });
    const raw = bridge();
    raw.start
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => {
        resolveFirst({
          success: false,
          error: 'GitHub sign-in was replaced by a newer request',
        });
        return second;
      });
    const facade = createPluginGitHubOAuth(CAPABILITY, raw);
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    facade.onGitHubOAuthCallback(firstListener);
    const firstStatus = facade.startGitHubOAuth();
    facade.onGitHubOAuthCallback(secondListener);
    const secondStatus = facade.startGitHubOAuth();

    // Flush replacement-result continuations without awaiting the still-pending sign-in.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(secondListener).not.toHaveBeenCalled();

    resolveFirst(TOKENS);
    resolveSecond(TOKENS);
    expect(await Promise.all([firstStatus, secondStatus])).toEqual([
      { success: true },
      { success: true },
    ]);
    expect(firstListener).toHaveBeenCalledExactlyOnceWith(TOKENS);
    expect(secondListener).toHaveBeenCalledExactlyOnceWith(TOKENS);
    expect(raw.start).toHaveBeenCalledTimes(1);
  });

  it('returns host failures, notifies listeners and permits a successful retry', async () => {
    const failure = { success: false, error: 'GitHub sign-in timed out. Please try again.' };
    const raw = bridge();
    raw.start.mockResolvedValueOnce(failure);
    const facade = createPluginGitHubOAuth(CAPABILITY, raw);
    const listener = vi.fn();
    facade.onGitHubOAuthCallback(listener);

    await expect(facade.startGitHubOAuth()).resolves.toEqual(failure);
    expect(listener).toHaveBeenCalledExactlyOnceWith(failure);
    await expect(facade.startGitHubOAuth()).resolves.toEqual({ success: true });
    expect(listener).toHaveBeenNthCalledWith(2, TOKENS);
    expect(raw.start).toHaveBeenCalledTimes(2);
  });

  it.each(['rejection', 'synchronous throw'])(
    'sanitizes bridge %s and permits retry',
    async mode => {
      const raw = bridge();
      raw.start.mockImplementationOnce(() => {
        if (mode === 'synchronous throw') throw new Error('ghr_secret');
        return Promise.reject(new Error('ghr_secret'));
      });
      raw.refresh.mockRejectedValue(new Error('ghr_secret'));
      const facade = createPluginGitHubOAuth(CAPABILITY, raw);

      const status = await facade.startGitHubOAuth();
      const refreshed = await facade.refreshGitHubOAuth('ghr_old');
      expect(status).toEqual({ success: false, error: 'GitHub sign-in failed' });
      expect(refreshed).toEqual({ success: false, error: expect.any(String) });
      expect(JSON.stringify([status, refreshed])).not.toContain('ghr_secret');
      await expect(facade.startGitHubOAuth()).resolves.toEqual({ success: true });
      expect(raw.start).toHaveBeenCalledTimes(2);
    }
  );

  it('lets a failure listener start a deferred retry that a third start joins', async () => {
    const failure = { success: false, error: 'GitHub sign-in timed out. Please try again.' };
    let resolveRetry!: (result: GitHubOAuthResult) => void;
    const deferred = new Promise<GitHubOAuthResult>(resolve => {
      resolveRetry = resolve;
    });
    const raw = bridge();
    raw.start.mockResolvedValueOnce(failure).mockReturnValueOnce(deferred);
    const facade = createPluginGitHubOAuth(CAPABILITY, raw);
    let retry!: ReturnType<typeof facade.startGitHubOAuth>;
    const listener = vi.fn((result: GitHubOAuthResult) => {
      if (!result.success) retry = facade.startGitHubOAuth();
    });
    facade.onGitHubOAuthCallback(listener);

    await expect(facade.startGitHubOAuth()).resolves.toEqual(failure);
    const third = facade.startGitHubOAuth();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(raw.start).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledExactlyOnceWith(failure);
    resolveRetry(TOKENS);
    expect(await Promise.all([retry, third])).toEqual([{ success: true }, { success: true }]);
    expect(listener).toHaveBeenNthCalledWith(2, TOKENS);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes listeners and isolates listener failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const facade = createPluginGitHubOAuth(CAPABILITY, bridge());
    const removed = vi.fn();
    const later = vi.fn();
    const unsubscribe = facade.onGitHubOAuthCallback(removed);
    facade.onGitHubOAuthCallback(() => {
      throw new Error('ghu_token listener failure');
    });
    facade.onGitHubOAuthCallback(async () => {
      throw new Error('ghu_token async listener failure');
    });
    facade.onGitHubOAuthCallback(() => new Promise(() => {}));
    facade.onGitHubOAuthCallback(later);
    unsubscribe();

    await expect(facade.startGitHubOAuth()).resolves.toEqual({ success: true });
    expect(removed).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledExactlyOnceWith(TOKENS);
    await new Promise(resolve => setTimeout(resolve, 0));
    const logged = consoleError.mock.calls;
    consoleError.mockRestore();
    expect(logged).toEqual([['GitHub OAuth listener failed'], ['GitHub OAuth listener failed']]);
    expect(JSON.stringify(logged)).not.toContain('ghu_token');
  });

  it('refreshes through the private bridge with the bound capability', async () => {
    const raw = bridge();
    const facade = createPluginGitHubOAuth(CAPABILITY, raw);

    await expect(facade.refreshGitHubOAuth('ghr_old')).resolves.toEqual(TOKENS);
    expect(raw.refresh).toHaveBeenCalledWith(CAPABILITY, 'ghr_old');
  });
});
