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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AUTH_STATUS_KEY } from './constants';
import OauthPopup from './OauthPopup';

describe('OauthPopup', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  it('calls onClose without removing storage listener when popup is closed or disconnected by COOP', async () => {
    const popupWindow = {
      close: vi.fn(),
      closed: false,
    } as unknown as Window;

    vi.spyOn(window, 'open').mockReturnValue(popupWindow);
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
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

    const storageListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'storage'
    )?.[1];
    expect(storageListener).toBeTypeOf('function');

    // Simulate popup close or COOP browsing context disconnection
    // @ts-ignore
    popupWindow.closed = true;

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    // Storage listener must remain attached to avoid losing completion signals on COOP redirects
    expect(removeEventListenerSpy).not.toHaveBeenCalledWith('storage', storageListener);
  });

  it('completes auth and removes listener even if popup was disconnected by COOP before completion', async () => {
    const popupWindow = {
      close: vi.fn(),
      closed: false,
    } as unknown as Window;

    vi.spyOn(window, 'open').mockReturnValue(popupWindow);
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
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

    const storageListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'storage'
    )?.[1];
    expect(storageListener).toBeTypeOf('function');

    // Simulate COOP disconnection where popupWindow.closed becomes true while auth is in progress
    // @ts-ignore
    popupWindow.closed = true;

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    // Storage listener should still be active
    expect(removeEventListenerSpy).not.toHaveBeenCalledWith('storage', storageListener);

    // Now auth completes in popup and dispatches storage event
    localStorage.setItem(AUTH_STATUS_KEY, 'code=oauth-code');
    window.dispatchEvent(new StorageEvent('storage'));

    expect(onCode).toHaveBeenCalledWith('code=oauth-code');
    expect(localStorage.getItem(AUTH_STATUS_KEY)).toBeNull();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', storageListener);
  });

  it('handles SecurityError when accessing popupWindow.closed due to strict COOP', async () => {
    const closedGetterSpy = vi.fn(() => {
      throw new Error('Blocked by Cross-Origin-Opener-Policy');
    });
    const popupWindow = {
      close: vi.fn(),
      get closed() {
        return closedGetterSpy();
      },
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

    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Auth Popup' }));

    const storageListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'storage'
    )?.[1];
    expect(storageListener).toBeTypeOf('function');

    // Advance fake timers through one poll to invoke the throwing getter
    vi.advanceTimersByTime(500);

    expect(closedGetterSpy).toHaveBeenCalled();

    // Storage listener remains active despite the error thrown by closed property
    expect(removeEventListenerSpy).not.toHaveBeenCalledWith('storage', storageListener);

    // Auth completes normally
    localStorage.setItem(AUTH_STATUS_KEY, 'code=oauth-code');
    window.dispatchEvent(new StorageEvent('storage'));

    expect(onCode).toHaveBeenCalledWith('code=oauth-code');
    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', storageListener);

    vi.useRealTimers();
  });

  it('closes the popup and removes listeners when auth completes', async () => {
    const popupWindow = {
      close: vi.fn(),
      closed: false,
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
    expect(popupWindow.close).toHaveBeenCalled();
  });
});
