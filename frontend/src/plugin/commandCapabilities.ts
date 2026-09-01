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

import { PluginRunCommand, runCommand } from '../components/App/runCommand';
import { PluginInfo } from './pluginsSlice';

// Keep these IPC contract interfaces in sync with app/electron/runCmd.ts.

/**
 * Plugin provenance sent to Electron before third-party code executes.
 *
 * @example Report a plugin discovered in the shipped inventory.
 * ```ts
 * const registration: PluginCommandRegistration = {
 *   bundleName: 'example-plugin',
 *   packageName: '@example/plugin',
 *   path: 'static-plugins/example-plugin',
 *   source: 'shipped',
 *   type: 'shipped',
 *   sourceDigest: 'dd746362bdf7510734ba74a34f15e2a6a625e7e044efb0bc38da54b7cc316084',
 * };
 * ```
 */
export interface PluginCommandRegistration {
  /** Bundle directory reported by backend discovery. */
  bundleName: string;
  /** Package identity read from the plugin bundle. */
  packageName: string;
  /** URL path used to load the plugin. */
  path: string;
  /** Inventory root containing the plugin. */
  source: string;
  /** Plugin priority type. */
  type: string;
  /** SHA-256 of the exact main.js source cached for execution. */
  sourceDigest: string;
}

/**
 * Command authorization issued by Electron for one verified plugin.
 *
 * The capability is a random 32-byte secret represented as 64 hexadecimal characters. Electron
 * stores which plugin identity and command grants belong to that secret. The renderer includes it
 * with each command request, allowing Electron to reject requests that have no token, use a
 * revoked token, or request a command outside that plugin's grants.
 *
 * The token contains no readable plugin or permission data; plugin code must not interpret or
 * create it.
 *
 * @example A capability returned by Electron for a verified plugin.
 * ```ts
 * const commandCapability: PluginCommandCapability = {
 *   bundleName: 'example-plugin',
 *   packageName: '@example/plugin',
 *   capability: '4f8c2a917bd03e65a1c94f286e5b70d39ac214ef53d8b607c1e49a728f306db5',
 * };
 * ```
 */
export interface PluginCommandCapability {
  /** Bundle directory bound to the capability. */
  bundleName: string;
  /** Package identity bound to the capability. */
  packageName: string;
  /** Opaque authorization token. */
  capability: string;
}

interface PluginCommandCapabilitiesBridge {
  register(registrations: PluginCommandRegistration[]): Promise<PluginCommandCapability[]>;
}

type DesktopApiSend = Parameters<typeof runCommand>[4];
type DesktopApiReceive = Parameters<typeof runCommand>[5];

/**
 * Builds the provenance claim for a discovered plugin.
 *
 * @param plugin - Package metadata combined with backend inventory metadata.
 * @param pluginPath - URL path used to load the plugin.
 * @param sourceDigest - SHA-256 of the fetched source that will execute.
 * @returns A registration claim, or undefined when identity metadata is incomplete.
 */
export function commandCapabilityRegistration(
  plugin: PluginInfo,
  pluginPath: string,
  sourceDigest: string
): PluginCommandRegistration | undefined {
  if (
    !plugin.folderName ||
    !plugin.source ||
    !plugin.type ||
    !/^[a-f0-9]{64}$/.test(sourceDigest)
  ) {
    return undefined;
  }
  return {
    bundleName: plugin.folderName,
    packageName: plugin.name,
    path: pluginPath,
    source: plugin.source,
    type: plugin.type,
    sourceDigest,
  };
}

/** Returns the SHA-256 digest of the exact JavaScript source string that will execute. */
export async function pluginSourceDigest(source: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Prepares command capabilities only when the Electron preload bridge is available. */
export async function preparePluginCommandCapabilities(
  bridge: PluginCommandCapabilitiesBridge | undefined,
  plugins: PluginInfo[],
  pluginPaths: string[],
  sources: string[],
  sourceDigest: (source: string) => Promise<string> = pluginSourceDigest
): Promise<PluginCommandCapability[]> {
  if (!bridge) {
    return [];
  }
  const sourceDigests = await Promise.all(sources.map(sourceDigest));
  const registrations = plugins
    .map((plugin, index) =>
      commandCapabilityRegistration(plugin, pluginPaths[index], sourceDigests[index])
    )
    .filter(registration => registration !== undefined);
  return bridge.register(registrations);
}

/**
 * Finds the opaque capability bound to one exact plugin identity.
 *
 * @param capabilities - Capabilities returned by Electron's main process.
 * @param plugin - Plugin package and inventory metadata.
 * @returns The matching token, or undefined when no product grant exists.
 */
export function findCommandCapability(
  capabilities: PluginCommandCapability[],
  plugin: PluginInfo
): string | undefined {
  if (!plugin.folderName) {
    return undefined;
  }
  for (const capability of capabilities) {
    if (capability.bundleName === plugin.folderName && capability.packageName === plugin.name) {
      return capability.capability;
    }
  }
  return undefined;
}

/**
 * Creates the command-running function made available to one authorized plugin.
 * The returned function captures that plugin's capability and Headlamp's private IPC helpers,
 * so plugin code only supplies the command, arguments, and public options. Electron checks the
 * captured capability against the requested command before starting the process.
 *
 * @param capability - Opaque capability issued for the plugin identity.
 * @param internalRunCommand - Private command function captured before plugins execute.
 * @param permissionSecrets - Legacy secrets filtered for this plugin.
 * @param desktopApiSend - Private preload send function.
 * @param desktopApiReceive - Private preload receive function.
 * @returns A scoped command function, or undefined without product authorization.
 */
export function createPluginRunCommand(
  capability: string | undefined,
  internalRunCommand: typeof runCommand,
  permissionSecrets: Record<string, number>,
  desktopApiSend: DesktopApiSend,
  desktopApiReceive: DesktopApiReceive
): PluginRunCommand | undefined {
  if (!capability) {
    return undefined;
  }
  return (command, args, options) =>
    internalRunCommand(
      command,
      args,
      options,
      permissionSecrets,
      desktopApiSend,
      desktopApiReceive,
      capability
    );
}
