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
    const other = createPluginGitHubOAuth('b'.repeat(64), bridge());
    const listener = vi.fn();
    const otherListener = vi.fn();
    facade.onGitHubOAuthCallback(listener);
    other.onGitHubOAuthCallback(otherListener);

    const status = await facade.startGitHubOAuth();

    expect(raw.start).toHaveBeenCalledWith(CAPABILITY);
    expect(status).toEqual({ success: true });
    expect(JSON.stringify(status)).not.toContain('ghu_token');
    expect(listener).toHaveBeenCalledWith(TOKENS);
    expect(otherListener).not.toHaveBeenCalled();
  });

  it('returns failures with their error and notifies listeners', async () => {
    const failure = { success: false, error: 'GitHub sign-in timed out. Please try again.' };
    const facade = createPluginGitHubOAuth(CAPABILITY, bridge(failure));
    const listener = vi.fn();
    facade.onGitHubOAuthCallback(listener);

    await expect(facade.startGitHubOAuth()).resolves.toEqual(failure);
    expect(listener).toHaveBeenCalledWith(failure);
  });

  it('converts bridge rejections to sanitized failures', async () => {
    const raw = { start: vi.fn().mockRejectedValue(new Error('ghr_secret')), refresh: vi.fn() };
    raw.refresh.mockRejectedValue(new Error('ghr_secret'));
    const facade = createPluginGitHubOAuth(CAPABILITY, raw);

    const status = await facade.startGitHubOAuth();
    const refreshed = await facade.refreshGitHubOAuth('ghr_old');
    expect(status).toEqual({ success: false, error: expect.any(String) });
    expect(refreshed).toEqual({ success: false, error: expect.any(String) });
    expect(JSON.stringify([status, refreshed])).not.toContain('ghr_secret');
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
    facade.onGitHubOAuthCallback(later);
    unsubscribe();

    await expect(facade.startGitHubOAuth()).resolves.toEqual({ success: true });
    expect(removed).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledWith(TOKENS);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('ghu_token');
    consoleError.mockRestore();
  });

  it('refreshes through the private bridge with the bound capability', async () => {
    const raw = bridge();
    const facade = createPluginGitHubOAuth(CAPABILITY, raw);

    await expect(facade.refreshGitHubOAuth('ghr_old')).resolves.toEqual(TOKENS);
    expect(raw.refresh).toHaveBeenCalledWith(CAPABILITY, 'ghr_old');
  });
});
