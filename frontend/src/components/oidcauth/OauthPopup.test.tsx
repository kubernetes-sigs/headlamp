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

import Button from '@mui/material/Button';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OauthPopup from './OauthPopup';

describe('OauthPopup', () => {
  const originalWindowOpen = window.open;

  afterEach(() => {
    window.open = originalWindowOpen;
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function setup() {
    let beforeUnloadListener: (() => void) | undefined;
    const popupWindow = {
      addEventListener: vi.fn((event: string, listener: () => void) => {
        if (event === 'beforeunload') {
          beforeUnloadListener = listener;
        }
      }),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    };

    window.open = vi.fn(() => popupWindow as unknown as Window);

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const view = render(
      <OauthPopup button={Button} onCode={vi.fn()} title="Auth" url="https://example.com/auth">
        Sign in
      </OauthPopup>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const storageListener = addEventListenerSpy.mock.calls.find(call => call[0] === 'storage')?.[1];

    return {
      beforeUnload: () => beforeUnloadListener?.(),
      popupWindow,
      removeEventListenerSpy,
      storageListener,
      ...view,
    };
  }

  it('removes storage listener when popup is closed without auth', () => {
    const { beforeUnload, popupWindow, removeEventListenerSpy, storageListener } = setup();

    beforeUnload();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', storageListener);
    expect(popupWindow.removeEventListener).toHaveBeenCalledWith(
      'beforeunload',
      expect.any(Function)
    );
  });

  it('removes storage listener when component unmounts', () => {
    const { popupWindow, removeEventListenerSpy, storageListener, unmount } = setup();

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', storageListener);
    expect(popupWindow.removeEventListener).toHaveBeenCalledWith(
      'beforeunload',
      expect.any(Function)
    );
    expect(popupWindow.close).toHaveBeenCalled();
  });

  it('closes the popup and removes listeners when auth completes', () => {
    const popupWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    };

    window.open = vi.fn(() => popupWindow as unknown as Window);

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const onCode = vi.fn();

    render(
      <OauthPopup button={Button} onCode={onCode} title="Auth" url="https://example.com/auth">
        Sign in
      </OauthPopup>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const storageListener = addEventListenerSpy.mock.calls.find(call => call[0] === 'storage')?.[1];

    expect(storageListener).toBeTypeOf('function');

    localStorage.setItem('auth_status', 'code=oauth-code');
    window.dispatchEvent(new StorageEvent('storage'));

    expect(onCode).toHaveBeenCalledWith('code=oauth-code');
    expect(localStorage.getItem('auth_status')).toBeNull();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', storageListener);
    expect(popupWindow.removeEventListener).toHaveBeenCalledWith(
      'beforeunload',
      expect.any(Function)
    );
    expect(popupWindow.close).toHaveBeenCalled();
  });

  it('does not clear a newer storage listener when an older popup closes', () => {
    const onClose = vi.fn();
    const beforeUnloadListeners: Array<() => void> = [];
    const popupWindows = [
      {
        addEventListener: vi.fn((event: string, listener: () => void) => {
          if (event === 'beforeunload') {
            beforeUnloadListeners[0] = listener;
          }
        }),
        removeEventListener: vi.fn(),
        close: vi.fn(),
      },
      {
        addEventListener: vi.fn((event: string, listener: () => void) => {
          if (event === 'beforeunload') {
            beforeUnloadListeners[1] = listener;
          }
        }),
        removeEventListener: vi.fn(),
        close: vi.fn(),
      },
    ];

    window.open = vi
      .fn()
      .mockReturnValueOnce(popupWindows[0] as unknown as Window)
      .mockReturnValueOnce(popupWindows[1] as unknown as Window);

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(
      <OauthPopup
        button={Button}
        onClose={onClose}
        onCode={vi.fn()}
        title="Auth"
        url="https://example.com/auth"
      >
        Sign in
      </OauthPopup>
    );

    const button = screen.getByRole('button', { name: 'Sign in' });
    fireEvent.click(button);
    const firstStorageListener = addEventListenerSpy.mock.calls.find(
      call => call[0] === 'storage'
    )?.[1];

    fireEvent.click(button);
    const secondStorageListener = addEventListenerSpy.mock.calls.filter(
      call => call[0] === 'storage'
    )[1]?.[1];

    expect(popupWindows[0].close).toHaveBeenCalled();
    expect(firstStorageListener).toBeDefined();
    expect(secondStorageListener).toBeDefined();
    expect(secondStorageListener).not.toBe(firstStorageListener);

    removeEventListenerSpy.mockClear();
    beforeUnloadListeners[0]();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', firstStorageListener);
    expect(removeEventListenerSpy).not.toHaveBeenCalledWith('storage', secondStorageListener);
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();

    expect(popupWindows[1].close).toHaveBeenCalled();
  });

  it('calls onClose and registers no storage listener when popup is blocked', () => {
    const onClose = vi.fn();

    window.open = vi.fn(() => null);

    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    render(
      <OauthPopup
        button={Button}
        onClose={onClose}
        onCode={vi.fn()}
        title="Auth"
        url="https://example.com/auth"
      >
        Sign in
      </OauthPopup>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const storageListeners = addEventListenerSpy.mock.calls.filter(call => call[0] === 'storage');
    expect(storageListeners).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
