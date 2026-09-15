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

import { dialog } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerOAuthProvider } from './oauthProvider';
import { createProtocolHandler } from './protocolHandler';

const electronMocks = vi.hoisted(() => ({
  listeners: new Map<string, (...args: any[]) => void>(),
  on: vi.fn((event: string, listener: (...args: any[]) => void) => {
    electronMocks.listeners.set(event, listener);
  }),
  showErrorBox: vi.fn(),
}));

function webContents() {
  const listeners = new Map<string, (...args: any[]) => void>();
  return {
    emit(event: string, ...args: any[]) {
      listeners.get(event)?.(...args);
    },
    value: {
      on(event: string, listener: (...args: any[]) => void) {
        listeners.set(event, listener);
      },
    },
  };
}

vi.mock('electron', () => ({
  app: { on: electronMocks.on },
  dialog: { showErrorBox: electronMocks.showErrorBox },
}));

afterEach(() => {
  electronMocks.listeners.clear();
  vi.clearAllMocks();
});

describe('createProtocolHandler', () => {
  it('buffers launch callbacks until providers are ready', () => {
    const handleCallback = vi.fn();
    const loadURL = vi.fn();
    const focus = vi.fn();
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () =>
        ({ focus, isMinimized: () => false, loadURL, restore: vi.fn() } as never),
    });
    const callbackUrl = 'headlamp://oauth/callback?code=code&state=state';
    const event = { preventDefault: vi.fn() };

    electronMocks.listeners.get('open-url')?.(event, callbackUrl);
    expect(handleCallback).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(focus).not.toHaveBeenCalled();

    const unregister = registerOAuthProvider({
      id: 'example',
      callback: { hostname: 'oauth', pathname: '/callback' },
      handleCallback,
    });
    protocolHandler.setReady([]);

    expect(handleCallback).toHaveBeenCalledWith(new URL(callbackUrl));
    expect(focus).toHaveBeenCalledOnce();
    expect(dialog.showErrorBox).not.toHaveBeenCalled();
    expect(loadURL).not.toHaveBeenCalled();
    unregister();
  });

  it.each(['not a URL', 'other-app://oauth/callback', 'headlamp:cluster'])(
    'rejects an invalid product callback: %s',
    value => {
      const loadURL = vi.fn();
      const protocolHandler = createProtocolHandler({
        protocolScheme: 'headlamp',
        startUrl: 'file:///headlamp/index.html',
        getMainWindow: () =>
          ({ focus: vi.fn(), isMinimized: () => false, loadURL, restore: vi.fn() } as never),
      });

      protocolHandler.setReady([]);
      protocolHandler.handle(value);

      expect(dialog.showErrorBox).toHaveBeenCalledOnce();
      expect(loadURL).not.toHaveBeenCalled();
    }
  );

  it('forwards an unclaimed product callback to the deep-link handler', () => {
    const loadURL = vi.fn();
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html/',
      getMainWindow: () =>
        ({ focus: vi.fn(), isMinimized: () => false, loadURL, restore: vi.fn() } as never),
    });
    const callbackUrl = new URL('headlamp://cluster?name=local');

    protocolHandler.setReady([]);
    protocolHandler.setReady([]);
    protocolHandler.handle(callbackUrl.href);

    expect(dialog.showErrorBox).not.toHaveBeenCalled();
    expect(loadURL).toHaveBeenCalledOnce();
    expect(loadURL).toHaveBeenCalledWith('file:///headlamp/index.html#cluster?name=local');
  });

  it('shows a user-visible error when an OAuth provider fails', () => {
    const error = new Error('provider failure');
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () => null,
    });
    const unregister = registerOAuthProvider({
      id: 'failed-provider',
      callback: { hostname: 'oauth', pathname: '/callback' },
      handleCallback() {
        throw error;
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    protocolHandler.setReady([]);

    protocolHandler.handle('headlamp://oauth/callback');

    expect(dialog.showErrorBox).toHaveBeenCalledWith(
      'OAuth callback failed',
      'The OAuth callback could not be completed. Please try again.'
    );
    unregister();
  });

  it('ignores an unclaimed callback when no window exists', () => {
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () => null,
    });

    protocolHandler.setReady([]);

    expect(() => protocolHandler.handle('headlamp://cluster?name=local')).not.toThrow();
  });

  it('buffers an open-url event when no window exists', () => {
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () => null,
    });
    const event = { preventDefault: vi.fn() };

    electronMocks.listeners.get('open-url')?.(event, 'headlamp://cluster?name=local');
    protocolHandler.setReady([]);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('drains buffered callbacks after the main renderer fails to load', () => {
    const focus = vi.fn();
    const handleCallback = vi.fn();
    const renderer = webContents();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () =>
        ({ focus, isMinimized: () => false, loadURL: vi.fn(), restore: vi.fn() } as never),
    });
    const unregister = registerOAuthProvider({
      id: 'failed-load',
      callback: { hostname: 'oauth', pathname: '/callback' },
      handleCallback,
    });
    protocolHandler.attachToWebContents(renderer.value as never);
    protocolHandler.handle('headlamp://oauth/callback?code=failed-load');

    renderer.emit('did-fail-load', {}, -6, 'File not found', 'file:///missing', true);

    expect(handleCallback).toHaveBeenCalledWith(
      new URL('headlamp://oauth/callback?code=failed-load')
    );
    expect(focus).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      'Main renderer failed to load file:///missing: File not found (-6)'
    );
    unregister();
  });

  it('waits for the main frame when a subframe fails to load', () => {
    const handleCallback = vi.fn();
    const renderer = webContents();
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () => null,
    });
    const unregister = registerOAuthProvider({
      id: 'subframe',
      callback: { hostname: 'oauth', pathname: '/callback' },
      handleCallback,
    });
    protocolHandler.attachToWebContents(renderer.value as never);
    protocolHandler.handle('headlamp://oauth/callback?code=subframe');

    renderer.emit('did-fail-load', {}, -6, 'File not found', 'file:///frame', false);
    expect(handleCallback).not.toHaveBeenCalled();

    renderer.emit('did-finish-load');
    expect(handleCallback).toHaveBeenCalledOnce();
    unregister();
  });

  it('buffers callbacks while a replacement window loads', () => {
    const handleCallback = vi.fn();
    const firstRenderer = webContents();
    const replacementRenderer = webContents();
    const originalArgv = process.argv;
    process.argv = ['electron', 'headlamp://oauth/callback?code=startup'];
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () => null,
    });
    const unregister = registerOAuthProvider({
      id: 'replacement-window',
      callback: { hostname: 'oauth', pathname: '/callback' },
      handleCallback,
    });
    try {
      protocolHandler.attachToWebContents(firstRenderer.value as never);
      firstRenderer.emit('did-finish-load');
      expect(handleCallback).toHaveBeenCalledWith(
        new URL('headlamp://oauth/callback?code=startup')
      );
      protocolHandler.attachToWebContents(replacementRenderer.value as never);

      protocolHandler.handle('headlamp://oauth/callback?code=replacement');
      expect(handleCallback).toHaveBeenCalledOnce();

      replacementRenderer.emit('did-finish-load');
      expect(handleCallback).toHaveBeenCalledTimes(2);
      expect(handleCallback).toHaveBeenLastCalledWith(
        new URL('headlamp://oauth/callback?code=replacement')
      );
    } finally {
      process.argv = originalArgv;
      unregister();
    }
  });

  it('dispatches a startup callback on non-macOS platforms', () => {
    const handleCallback = vi.fn();
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () => null,
    });
    const unregister = registerOAuthProvider({
      id: 'startup',
      callback: { hostname: 'oauth', pathname: '/callback' },
      handleCallback,
    });

    protocolHandler.setReady(['electron', 'headlamp://oauth/callback?code=startup']);

    expect(handleCallback).toHaveBeenCalledWith(new URL('headlamp://oauth/callback?code=startup'));
    unregister();
  });

  it('dispatches the startup callback before callbacks queued while starting up', () => {
    const dispatched: string[] = [];
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () => null,
    });
    const unregister = registerOAuthProvider({
      id: 'ordering',
      callback: { hostname: 'oauth', pathname: '/callback' },
      handleCallback: url => {
        dispatched.push(url.searchParams.get('code') ?? '');
      },
    });

    // Queued after launch but before readiness, so it must follow the startup callback.
    protocolHandler.handle('headlamp://oauth/callback?code=second');
    protocolHandler.setReady(['electron', 'headlamp://oauth/callback?code=startup']);

    expect(dispatched).toEqual(['startup', 'second']);
    unregister();
  });

  it('uses the process startup context by default', () => {
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () => null,
    });

    expect(() => protocolHandler.setReady()).not.toThrow();
  });

  it('focuses and restores the window for a second-instance callback', () => {
    const focus = vi.fn();
    const restore = vi.fn();
    const handleCallback = vi.fn();
    const protocolHandler = createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () => ({ focus, isMinimized: () => true, loadURL: vi.fn(), restore } as never),
    });
    const unregister = registerOAuthProvider({
      id: 'second-instance',
      callback: { hostname: 'oauth', pathname: '/callback' },
      handleCallback,
    });
    protocolHandler.setReady([]);

    electronMocks.listeners.get('second-instance')?.({}, [
      'electron',
      'headlamp://oauth/callback?code=second',
    ]);

    expect(restore).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(handleCallback).toHaveBeenCalledWith(new URL('headlamp://oauth/callback?code=second'));
    unregister();
  });

  it('ignores second-instance arguments without a product protocol URL', () => {
    createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () => null,
    });

    expect(() => electronMocks.listeners.get('second-instance')?.({}, ['electron'])).not.toThrow();
  });

  it('focuses a non-minimized second-instance window without restoring it', () => {
    const focus = vi.fn();
    const restore = vi.fn();
    createProtocolHandler({
      protocolScheme: 'headlamp',
      startUrl: 'file:///headlamp/index.html',
      getMainWindow: () =>
        ({ focus, isMinimized: () => false, loadURL: vi.fn(), restore } as never),
    });

    electronMocks.listeners.get('second-instance')?.({}, ['electron']);

    expect(focus).toHaveBeenCalledOnce();
    expect(restore).not.toHaveBeenCalled();
  });
});
