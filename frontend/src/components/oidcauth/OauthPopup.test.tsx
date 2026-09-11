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
import React from 'react';
import { AUTH_STATUS_KEY } from './constants';
import OauthPopup from './OauthPopup';

describe('OauthPopup', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('removes the storage listener when the component unmounts', () => {
    const popupWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    } as unknown as Window;

    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popupWindow);
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(
      <OauthPopup
        button={Button}
        url="https://example.com/auth"
        title="Auth Popup"
        onCode={vi.fn()}
      >
        Open Auth Popup
      </OauthPopup>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Auth Popup' }));

    const storageListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'storage'
    )?.[1];

    expect(openSpy).toHaveBeenCalled();
    expect(storageListener).toBeTypeOf('function');

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', storageListener);
    expect(popupWindow.close).toHaveBeenCalled();
  });

  it('removes the storage listener when the popup closes without completing auth', async () => {
    const popupListeners: Record<string, () => void> = {};
    const popupWindow = {
      addEventListener: vi.fn((eventName: string, listener: () => void) => {
        popupListeners[eventName] = listener;
      }),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    } as unknown as Window;

    vi.useFakeTimers();
    vi.spyOn(window, 'open').mockReturnValue(popupWindow);
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const onClose = vi.fn();

    render(
      <OauthPopup
        button={Button}
        url="https://example.com/auth"
        title="Auth Popup"
        onCode={vi.fn()}
        onClose={onClose}
      >
        Open Auth Popup
      </OauthPopup>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Auth Popup' }));

    popupListeners.beforeunload?.();

    // beforeUnloadListener defers via setTimeout(..., 0) — flush it
    await vi.runAllTimersAsync();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));
    expect(onClose).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('closes the popup and removes listeners when auth completes', () => {
    const popupListeners: Record<string, () => void> = {};
    const popupWindow = {
      addEventListener: vi.fn((eventName: string, listener: () => void) => {
        popupListeners[eventName] = listener;
      }),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    } as unknown as Window;

    vi.spyOn(window, 'open').mockReturnValue(popupWindow);
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const onCode = vi.fn();

    render(
      <OauthPopup button={Button} url="https://example.com/auth" title="Auth Popup" onCode={onCode}>
        Open Auth Popup
      </OauthPopup>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Auth Popup' }));

    const storageListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'storage'
    )?.[1];
    expect(storageListener).toBeTypeOf('function');

    localStorage.setItem(AUTH_STATUS_KEY, 'code=oauth-code');
    window.dispatchEvent(new StorageEvent('storage'));

    expect(onCode).toHaveBeenCalledWith('code=oauth-code');
    expect(localStorage.getItem(AUTH_STATUS_KEY)).toBeNull();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', storageListener);
    expect(popupWindow.removeEventListener).toHaveBeenCalledWith(
      'beforeunload',
      popupListeners.beforeunload
    );
    expect(popupWindow.close).toHaveBeenCalled();
  });

  it('completes auth when beforeunload fires after localStorage is set (Safari ITP)', async () => {
    // Safari suppresses the cross-window storage event due to ITP, so the
    // parent relies on beforeunload + a deferred localStorage check.
    const popupListeners: Record<string, () => void> = {};
    const popupWindow = {
      addEventListener: vi.fn((eventName: string, listener: () => void) => {
        popupListeners[eventName] = listener;
      }),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    } as unknown as Window;

    vi.spyOn(window, 'open').mockReturnValue(popupWindow);
    vi.useFakeTimers();

    const onCode = vi.fn();
    const onClose = vi.fn();

    render(
      <OauthPopup
        button={Button}
        url="https://example.com/auth"
        title="Auth Popup"
        onCode={onCode}
        onClose={onClose}
      >
        Open Auth Popup
      </OauthPopup>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Auth Popup' }));

    // Simulate: popup sets localStorage, then beforeunload fires
    localStorage.setItem(AUTH_STATUS_KEY, 'success');
    popupListeners.beforeunload?.();

    // Flush the setTimeout(..., 0) inside beforeUnloadListener
    await vi.runAllTimersAsync();

    expect(onCode).toHaveBeenCalledWith('success');
    expect(localStorage.getItem(AUTH_STATUS_KEY)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('completes auth when interval detects closed popup with localStorage set (Safari ITP)', () => {
    // Safari may not fire beforeunload reliably either; the interval is the
    // last-resort check and must read localStorage when the popup is closed.
    let isClosed = false;
    const popupWindow = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
      get closed() {
        return isClosed;
      },
    } as unknown as Window;

    vi.spyOn(window, 'open').mockReturnValue(popupWindow);

    // Capture the interval callback so we can invoke it directly
    let intervalCallback: (() => void) | null = null;
    vi.spyOn(window, 'setInterval').mockImplementation((fn: TimerHandler) => {
      intervalCallback = fn as () => void;
      return 0 as unknown as ReturnType<typeof setInterval>;
    });

    const onCode = vi.fn();
    const onClose = vi.fn();

    render(
      <OauthPopup
        button={Button}
        url="https://example.com/auth"
        title="Auth Popup"
        onCode={onCode}
        onClose={onClose}
      >
        Open Auth Popup
      </OauthPopup>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Auth Popup' }));

    expect(intervalCallback).not.toBeNull();

    // Simulate: popup sets localStorage then closes
    localStorage.setItem(AUTH_STATUS_KEY, 'success');
    isClosed = true;

    // Trigger the interval callback manually
    intervalCallback!();

    expect(onCode).toHaveBeenCalledWith('success');
    expect(localStorage.getItem(AUTH_STATUS_KEY)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
