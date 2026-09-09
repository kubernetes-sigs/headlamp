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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: electronMocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
    send: electronMocks.send,
  },
}));

await import('./preload');

const desktopApi = electronMocks.exposeInMainWorld.mock.calls[0][1];

describe('desktop preload API', () => {
  beforeEach(() => {
    electronMocks.invoke.mockReset();
    electronMocks.on.mockReset();
    electronMocks.removeListener.mockReset();
    electronMocks.send.mockReset();
  });

  it('exposes the host platform', () => {
    expect(desktopApi.platform).toBe(process.platform);
  });

  it('sends messages only on allowed channels', () => {
    desktopApi.send('locale', 'en');
    desktopApi.send('not-allowed', 'ignored');

    expect(electronMocks.send).toHaveBeenCalledOnce();
    expect(electronMocks.send).toHaveBeenCalledWith('locale', 'en');
  });

  it('receives messages only on allowed channels and strips the event', () => {
    const listener = vi.fn();
    const unsubscribe = desktopApi.receive('locale', listener);
    const wrappedListener = electronMocks.on.mock.calls[0][1];

    wrappedListener({ sender: 'private' }, 'fr');
    expect(listener).toHaveBeenCalledWith('fr');
    expect(desktopApi.receive('not-allowed', listener)).toBeUndefined();

    unsubscribe();
    expect(electronMocks.removeListener).toHaveBeenCalledWith('locale', wrappedListener);
  });

  it('removes the wrapped listener registered for a channel', () => {
    const listener = vi.fn();
    desktopApi.receive('locale', listener);
    const wrappedListener = electronMocks.on.mock.calls[0][1];

    desktopApi.removeListener('locale', listener);

    expect(electronMocks.removeListener).toHaveBeenCalledWith('locale', wrappedListener);
  });

  it('falls back to removing the provided listener', () => {
    const listener = vi.fn();
    desktopApi.receive('locale', listener);

    desktopApi.removeListener('currentMenu', listener);
    desktopApi.removeListener('locale', vi.fn());

    expect(electronMocks.removeListener).toHaveBeenNthCalledWith(1, 'currentMenu', listener);
    expect(electronMocks.removeListener).toHaveBeenNthCalledWith(2, 'locale', expect.any(Function));
  });
});
