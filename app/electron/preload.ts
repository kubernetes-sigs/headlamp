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

import { contextBridge, ipcRenderer } from 'electron';

// Keeps the mapping between a caller-provided listener and the wrapped one we
// actually register with ipcRenderer, so removeListener can still unsubscribe
// the listener when callers pass the original function reference.
// Using a WeakMap so the mapping itself doesn't retain listeners; note this
// doesn't avoid leaks on its own - ipcRenderer holds a strong reference to
// the wrapped listener (which closes over the original) until the caller
// unsubscribes via the returned function or removeListener.
const wrappedListeners = new WeakMap<
  (...args: unknown[]) => void,
  { channel: string; wrapped: (event: unknown, ...args: unknown[]) => void }
>();

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('desktopApi', {
  send: (channel: string, data: unknown) => {
    // allowed channels
    const validChannels = [
      'setMenu',
      'locale',
      'appConfig',
      'pluginsLoaded',
      'run-command',
      'plugin-manager',
      'request-backend-token',
      'request-plugin-permission-secrets',
      'open-plugin-folder',
      'request-backend-port',
      'request-tray-icon',
      'set-tray-icon',
      'cluster-changed',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel: string, func: (...args: unknown[]) => void) => {
    const validChannels = [
      'currentMenu',
      'setMenu',
      'locale',
      'appConfig',
      'command-stdout',
      'command-stderr',
      'command-exit',
      'plugin-manager',
      'backend-token',
      'plugin-permission-secrets',
      'open-about-dialog',
      'backend-port',
      'tray-icon',
    ];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      const wrapped = (event: unknown, ...args: unknown[]) => func(...args);
      ipcRenderer.on(channel, wrapped);
      wrappedListeners.set(func, { channel, wrapped });
      // Also return an unsubscribe function for new callers; older callers
      // that prefer `removeListener(channel, originalFunc)` keep working too.
      return () => {
        ipcRenderer.removeListener(channel, wrapped);
        wrappedListeners.delete(func);
      };
    }
  },

  removeListener: (channel: string, func: (...args: unknown[]) => void) => {
    const entry = wrappedListeners.get(func);
    if (entry && entry.channel === channel) {
      ipcRenderer.removeListener(channel, entry.wrapped);
      wrappedListeners.delete(func);
      return;
    }
    // Fallback for listeners registered without going through `receive`.
    ipcRenderer.removeListener(channel, func);
  },

  // @todo: move these to the send receive pattern above, restricted to ai-assistant only.
  // @todo: do not enable if environment variable disabling mcp is set.
  // MCP client APIs
  mcp: {
    executeTool: (toolName: string, args: Record<string, any>, toolCallId?: string) =>
      ipcRenderer.invoke('mcp-execute-tool', { toolName, args, toolCallId }),
    getStatus: () => ipcRenderer.invoke('mcp-get-status'),
    resetClient: () => ipcRenderer.invoke('mcp-reset-client'),
    getConfig: () => ipcRenderer.invoke('mcp-get-config'),
    updateConfig: (config: any) => ipcRenderer.invoke('mcp-update-config', config),
    getToolsConfig: () => ipcRenderer.invoke('mcp-get-tools-config'),
    updateToolsConfig: (config: any) => ipcRenderer.invoke('mcp-update-tools-config', config),
    setToolEnabled: (serverName: string, toolName: string, enabled: boolean) =>
      ipcRenderer.invoke('mcp-set-tool-enabled', { serverName, toolName, enabled }),
    getToolStats: (serverName: string, toolName: string) =>
      ipcRenderer.invoke('mcp-get-tool-stats', { serverName, toolName }),
    clusterChange: (cluster: string | null) =>
      ipcRenderer.invoke('mcp-cluster-change', { cluster }),
  },

  // Notify cluster change (for MCP server restart)
  notifyClusterChange: (cluster: string | null) => {
    ipcRenderer.send('cluster-changed', cluster);
  },
});
