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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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

    popupWindow.closed = true;
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

  it('keeps the completion listener when provider isolation reports the popup as closed', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const popupWindow = {
      closed: true,
      close: vi.fn(),
    } as unknown as Window;

    vi.spyOn(window, 'open').mockReturnValue(popupWindow);
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
    vi.advanceTimersByTime(250);

    expect(removeEventListenerSpy).not.toHaveBeenCalledWith('storage', expect.any(Function));
    expect(onClose).not.toHaveBeenCalled();

    localStorage.setItem(AUTH_STATUS_KEY, 'success');
    window.dispatchEvent(new StorageEvent('storage'));

    expect(onCode).toHaveBeenCalledWith('success');
    expect(popupWindow.close).toHaveBeenCalled();
  });

  it('closes the popup and removes listeners when auth completes', () => {
    const popupWindow = {
      closed: false,
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
