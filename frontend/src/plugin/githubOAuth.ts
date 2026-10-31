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

// Private GitHub OAuth facade injected only into the plugin identity whose command
// capability carries the product's githubOAuth grant. Results reach only that
// facade's listeners; Electron exposes no global token event. This is least
// privilege against unauthorized API use, not isolation from same-realm code.

import { findPluginCapability, type PluginCommandCapability } from './commandCapabilities';
import type { PluginInfo } from './pluginsSlice';

/** Token set or sanitized failure returned by Electron. */
export interface GitHubOAuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  error?: string;
}

/** Capability-bound preload bridge captured before plugins execute. */
export interface GitHubOAuthBridge {
  start(capability: string): Promise<GitHubOAuthResult>;
  refresh(capability: string, refreshToken: string): Promise<GitHubOAuthResult>;
}

/** Facade available to the granted plugin as the lexical `pluginGitHubOAuth`. */
export interface PluginGitHubOAuth {
  /** Opens the browser; resolves with the sign-in status after it completes, without tokens. */
  startGitHubOAuth(): Promise<{ success: boolean; error?: string }>;
  /** Receives completed sign-in results for this plugin only. */
  onGitHubOAuthCallback(callback: (result: GitHubOAuthResult) => void): () => void;
  /** Exchanges a refresh token for a new expiring token set. */
  refreshGitHubOAuth(refreshToken: string): Promise<GitHubOAuthResult>;
}

/**
 * Copies bridge functions so later changes to `window.desktopApi` cannot redirect them.
 *
 * @param bridge - Preload bridge read before plugin code runs.
 * @returns Captured functions, or undefined when the bridge is unavailable.
 */
export function captureGitHubOAuthBridge(
  bridge: Partial<GitHubOAuthBridge> | undefined
): GitHubOAuthBridge | undefined {
  const start = bridge?.start;
  const refresh = bridge?.refresh;
  if (typeof start !== 'function' || typeof refresh !== 'function') return undefined;
  return Object.freeze({ start, refresh });
}

/**
 * Creates the facade bound to one capability with its own listener set.
 *
 * @param capability - Opaque command capability granted GitHub OAuth.
 * @param bridge - Captured capability-bound preload bridge.
 * @returns The plugin-visible facade.
 */
export function createPluginGitHubOAuth(
  capability: string,
  bridge: GitHubOAuthBridge
): PluginGitHubOAuth {
  const { start, refresh } = bridge;
  const listeners = new Set<(result: GitHubOAuthResult) => void>();
  const consoleError = console.error;
  const failed = (error: string): GitHubOAuthResult => ({ success: false, error });

  return Object.freeze({
    async startGitHubOAuth() {
      let result: GitHubOAuthResult;
      try {
        result = await start(capability);
      } catch {
        result = failed('GitHub sign-in failed');
      }
      for (const listener of [...listeners]) {
        try {
          listener(result);
        } catch {
          // Do not log the error: it may embed token values from the result.
          consoleError('GitHub OAuth listener failed');
        }
      }
      return result.error === undefined
        ? { success: result.success }
        : { success: result.success, error: result.error };
    },
    onGitHubOAuthCallback(callback: (result: GitHubOAuthResult) => void) {
      const listener = (result: GitHubOAuthResult) => callback(result);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async refreshGitHubOAuth(refreshToken: string) {
      try {
        return await refresh(capability, refreshToken);
      } catch {
        return failed('GitHub token refresh failed');
      }
    },
  });
}

/**
 * Builds lexical plugin arguments only for the exact identity granted GitHub OAuth.
 *
 * @param capabilities - Capabilities returned by Electron's main process.
 * @param plugin - Plugin package and inventory metadata.
 * @param bridge - Captured preload bridge, or undefined outside Electron.
 * @returns `pluginGitHubOAuth` and its facade, or empty arrays without a grant.
 */
export function getPluginGitHubOAuthArgValues(
  capabilities: PluginCommandCapability[],
  plugin: PluginInfo,
  bridge: GitHubOAuthBridge | undefined
): [string[], unknown[]] {
  const capability = findPluginCapability(capabilities, plugin);
  if (
    !bridge ||
    capability?.githubOAuth !== true ||
    !/^[0-9a-f]{64}$/.test(capability.capability)
  ) {
    return [[], []];
  }
  return [['pluginGitHubOAuth'], [createPluginGitHubOAuth(capability.capability, bridge)]];
}
