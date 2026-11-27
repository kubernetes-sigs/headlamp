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

  it('removes the storage listener when popup authentication times out', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const popupWindow = {
      closed: false,
      close: vi.fn(),
    };

    vi.spyOn(window, 'open').mockReturnValue(popupWindow as unknown as Window);
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

    vi.advanceTimersByTime(250);

    expect(removeEventListenerSpy).not.toHaveBeenCalledWith('storage', expect.any(Function));
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5 * 60 * 1000 - 250);

    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));
    expect(onClose).toHaveBeenCalled();
    expect(popupWindow.close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes the storage listener and notifies when the popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
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

    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', expect.any(Function));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onClose prematurely or remove storage listener when closed becomes true due to COOP', () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });

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

    vi.advanceTimersByTime(500);

    // Must not fire premature onClose or remove storage listener before auth completes or times out
    expect(onClose).not.toHaveBeenCalled();
    expect(removeEventListenerSpy).not.toHaveBeenCalledWith('storage', storageListener);
  });

  it('completes auth and removes listener even if popup was disconnected by COOP before completion', () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });

    const popupWindow = {
      close: vi.fn(),
      closed: false,
    } as unknown as Window;

    vi.spyOn(window, 'open').mockReturnValue(popupWindow);
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const onCode = vi.fn();
    const cleanupRef: { unmount?: () => void } = {};
    const onClose = vi.fn(() => {
      cleanupRef.unmount?.();
    });

    const { unmount } = render(
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
    cleanupRef.unmount = unmount;

    fireEvent.click(screen.getByRole('button', { name: 'Open Auth Popup' }));

    const storageListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'storage'
    )?.[1];
    expect(storageListener).toBeTypeOf('function');

    // Simulate COOP disconnection where popupWindow.closed becomes true while auth is in progress
    // @ts-ignore
    popupWindow.closed = true;

    // Advance past the interval poll; onClose must not fire prematurely (which would unmount & drop listener)
    vi.advanceTimersByTime(500);

    expect(onClose).not.toHaveBeenCalled();
    expect(removeEventListenerSpy).not.toHaveBeenCalledWith('storage', storageListener);

    // Now auth completes in popup and dispatches storage event
    localStorage.setItem(AUTH_STATUS_KEY, 'code=oauth-code');
    window.dispatchEvent(new StorageEvent('storage'));

    expect(onCode).toHaveBeenCalledWith('code=oauth-code');
    expect(localStorage.getItem(AUTH_STATUS_KEY)).toBeNull();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', storageListener);
  });

  it('notifies onClose once on timeout and cleans up storage listener after poll sees closed=true', () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });

    const popupWindow = {
      closed: false,
      close: vi.fn(),
    };

    vi.spyOn(window, 'open').mockReturnValue(popupWindow as unknown as Window);
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

    // Simulate popup closure or COOP disconnect detected by poll
    popupWindow.closed = true;

    // Advance through the interval poll deadline (500ms)
    vi.advanceTimersByTime(500);

    // onClose must not fire prematurely during poll; storage listener remains active
    expect(onClose).not.toHaveBeenCalled();
    expect(removeEventListenerSpy).not.toHaveBeenCalledWith('storage', storageListener);

    // Advance through the 5-minute timeout deadline
    vi.advanceTimersByTime(5 * 60 * 1000 - 500);

    // onClose should be called once on timeout and storage listener should now be removed
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', storageListener);
    expect(vi.getTimerCount()).toBe(0);
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

    localStorage.setItem(AUTH_STATUS_KEY, 'success');
    fireEvent.click(screen.getByRole('button', { name: 'Open Auth Popup' }));

    const storageListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === 'storage'
    )?.[1];
    expect(storageListener).toBeTypeOf('function');
    expect(localStorage.getItem(AUTH_STATUS_KEY)).toBeNull();
    expect(onCode).not.toHaveBeenCalled();

    localStorage.setItem(AUTH_STATUS_KEY, 'success');
    window.dispatchEvent(new StorageEvent('storage'));

    expect(onCode).toHaveBeenCalledWith('success');
    expect(localStorage.getItem(AUTH_STATUS_KEY)).toBeNull();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('storage', storageListener);
    expect(popupWindow.close).toHaveBeenCalled();
  });
});
