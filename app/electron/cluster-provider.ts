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

import crypto from 'crypto';
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';

const VALID_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const MAX_NAME_LENGTH = 214;
const MAX_PLUGINS = 256;
const MAX_PROVIDERS_PER_PLUGIN = 16;
const MAX_REQUEST_LENGTH = 1024 * 1024;

/** Handles a request for a host-registered cluster provider. */
export type ClusterProviderHandler = (
  /** Request supplied by the authorized package plugin. */
  request: Record<string, unknown>
) => unknown | Promise<unknown>;

/** Cluster providers requested by one package plugin. */
interface ClusterProviderRegistration {
  /** Package plugin name that requests the providers. */
  pluginName: string;
  /** Stable IDs of the requested cluster providers. */
  providers: string[];
}

/** Opaque authorization for one host-registered cluster provider. */
export interface ClusterProviderCapability {
  /** Stable ID of the authorized provider. */
  provider: string;
  /** Opaque token that authorizes provider invocation. */
  capability: string;
}

/** Capabilities generated for the package plugins in one renderer load. */
export interface ClusterProviderCapabilities {
  /** Authorized providers keyed by package plugin name. */
  capabilities: Record<string, ClusterProviderCapability[]>;
  /** Host provider ID keyed by opaque capability token. */
  providerByCapability: Map<string, string>;
}

const providers = new Map<string, ClusterProviderHandler>();

/**
 * Checks whether a package or provider ID has a valid package-style name.
 *
 * @param value - Candidate name.
 * @returns Whether the value is a valid name.
 */
function validName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_NAME_LENGTH && VALID_NAME.test(value);
}

/**
 * Registers a cluster provider owned by the desktop host.
 *
 * @param provider - Stable provider ID exposed to package plugins.
 * @param handler - Handler invoked for authorized requests.
 * @returns A function that unregisters this handler if it is still current.
 */
export function registerClusterProvider(
  provider: string,
  handler: ClusterProviderHandler
): () => void {
  if (!validName(provider) || typeof handler !== 'function') {
    throw new Error('Invalid cluster provider registration');
  }
  if (providers.has(provider)) {
    throw new Error(`Cluster provider is already registered: ${provider}`);
  }
  providers.set(provider, handler);

  return () => {
    if (providers.get(provider) === handler) {
      providers.delete(provider);
    }
  };
}

/**
 * Creates opaque capabilities for valid provider declarations.
 *
 * @param registrations - Untrusted package plugin provider declarations.
 * @returns Authorized capabilities and their host provider lookup.
 */
export function createClusterProviderCapabilities(
  registrations: unknown
): ClusterProviderCapabilities {
  const capabilities: Record<string, ClusterProviderCapability[]> = Object.create(null);
  const providerByCapability = new Map<string, string>();
  if (!Array.isArray(registrations) || registrations.length > MAX_PLUGINS) {
    return { capabilities, providerByCapability };
  }

  const seenPlugins = new Set<string>();
  for (const item of registrations) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const { pluginName, providers: requestedProviders } =
      item as Partial<ClusterProviderRegistration>;
    if (
      !validName(pluginName) ||
      seenPlugins.has(pluginName) ||
      !Array.isArray(requestedProviders) ||
      requestedProviders.length > MAX_PROVIDERS_PER_PLUGIN
    ) {
      continue;
    }
    seenPlugins.add(pluginName);
    capabilities[pluginName] = [];

    for (const provider of new Set(requestedProviders)) {
      if (!validName(provider) || !providers.has(provider)) {
        continue;
      }
      const capability = crypto.randomBytes(32).toString('hex');
      capabilities[pluginName].push({ provider, capability });
      providerByCapability.set(capability, provider);
    }
  }
  return { capabilities, providerByCapability };
}

/**
 * Checks whether an invocation payload is a bounded JSON object.
 *
 * @param request - Untrusted invocation payload.
 * @returns Whether the payload can be sent to a provider.
 */
function validRequest(request: unknown): request is Record<string, unknown> {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    return false;
  }
  try {
    return JSON.stringify(request).length <= MAX_REQUEST_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Installs the renderer-scoped cluster provider IPC handlers.
 *
 * @param mainWindow - Window allowed to register and invoke capabilities.
 * @param ipcMain - Electron IPC registry receiving the handlers.
 * @returns Nothing.
 */
export function setupClusterProviderHandlers(mainWindow: BrowserWindow, ipcMain: IpcMain): void {
  let registrationAllowed = true;
  let providerByCapability = new Map<string, string>();
  const fromMainWindow = (event: IpcMainInvokeEvent) => event.sender === mainWindow.webContents;

  ipcMain.removeHandler('register-plugin-cluster-provider-capabilities');
  ipcMain.removeHandler('invoke-cluster-provider');
  ipcMain.handle('register-plugin-cluster-provider-capabilities', (event, registrations) => {
    if (!fromMainWindow(event) || !registrationAllowed) {
      return {};
    }
    registrationAllowed = false;
    const registration = createClusterProviderCapabilities(registrations);
    providerByCapability = registration.providerByCapability;
    return registration.capabilities;
  });

  ipcMain.handle('invoke-cluster-provider', async (event, capability, request) => {
    const provider =
      fromMainWindow(event) && typeof capability === 'string'
        ? providerByCapability.get(capability)
        : undefined;
    const handler = provider ? providers.get(provider) : undefined;
    if (!provider || !handler || !validRequest(request)) {
      return { success: false, message: 'Invalid cluster provider capability or request' };
    }
    try {
      return await handler(request);
    } catch (error) {
      console.error(`Cluster provider failed: ${provider}`, error);
      return { success: false, message: 'Cluster provider failed' };
    }
  });

  mainWindow.webContents.on('did-start-loading', () => {
    registrationAllowed = true;
    providerByCapability.clear();
  });
}
