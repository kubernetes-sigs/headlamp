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

import { app, BrowserWindow, dialog } from 'electron';
import i18n from './i18next.config';
import { dispatchOAuthCallback } from './oauthProvider';
import { isProtocolUrl } from './protocol';

/** Configures product protocol callback validation and fallback behavior. */
export interface ProtocolHandlerOptions {
  /** Product protocol scheme accepted by the desktop application. */
  protocolScheme: string;
  /** Base URL used for unclaimed desktop deep links. */
  startUrl: string;
  /** Returns the current desktop window when one is available. */
  getMainWindow(): BrowserWindow | null;
}

/** Renderer lifecycle events required to release buffered protocol callbacks. */
export interface ProtocolWebContents {
  /** Registers the successful-load listener. */
  on(event: 'did-finish-load', listener: () => void): unknown;
  /** Registers the failed-load listener. */
  on(
    event: 'did-fail-load',
    listener: (
      event: unknown,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean
    ) => void
  ): unknown;
}

/** Buffers and dispatches product protocol callbacks around application startup. */
export interface ProtocolHandler {
  /**
   * Accepts a protocol callback immediately or queues it until initialization completes.
   *
   * @param value Raw protocol callback URL.
   */
  handle(value: string): void;
  /**
   * Releases buffered callbacks when the main renderer finishes or definitively fails to load.
   *
   * @param webContents Main window renderer events.
   */
  attachToWebContents(webContents: ProtocolWebContents): void;
  /**
   * Marks providers and the application window ready, handles startup arguments,
   * then drains queued callbacks.
   *
   * @param argv Application startup arguments.
   */
  setReady(argv?: readonly string[]): void;
}

/**
 * Creates a handler that delays protocol callback dispatch until application initialization.
 *
 * @param options Product protocol and fallback handlers.
 * @returns A callback handler with an explicit readiness boundary.
 */
export function createProtocolHandler(options: ProtocolHandlerOptions): ProtocolHandler {
  const pendingUrls: string[] = [];
  let isReady = false;
  let hasHandledStartupArguments = false;

  app.on('open-url', (event, value) => {
    event.preventDefault();
    handle(value);
  });

  app.on('second-instance', (_event, argv) => {
    if (handleFirstProtocolUrl(argv)) {
      return;
    }
    focusMainWindow();
  });

  /** Accepts or queues a raw protocol callback URL. */
  function handle(value: string): void {
    if (!isReady) {
      pendingUrls.push(value);
      return;
    }
    processUrl(value);
  }

  /** Handles the first product protocol URL in an argument list. */
  function handleFirstProtocolUrl(argv: readonly string[]): boolean {
    const callbackUrl = argv.find(value => isProtocolUrl(value, options.protocolScheme));
    if (callbackUrl) {
      handle(callbackUrl);
      return true;
    }
    return false;
  }

  /** Processes a callback after providers and the application window are ready. */
  function processUrl(value: string): void {
    if (!isProtocolUrl(value, options.protocolScheme)) {
      showInvalidUrl(value);
      return;
    }
    const callbackUrl = new URL(value);

    focusMainWindow();

    if (!dispatchOAuthCallback(callbackUrl, options.protocolScheme, showOAuthCallbackError)) {
      loadUnclaimedUrl(callbackUrl);
    }
  }

  /** Displays the standard desktop error for an invalid protocol URL. */
  function showInvalidUrl(value: string): void {
    dialog.showErrorBox(
      i18n.t('Invalid URL'),
      i18n.t('Application opened with an invalid URL: {{ url }}', { url: value })
    );
  }

  /** Displays a user-facing error after a registered OAuth provider fails. */
  function showOAuthCallbackError(): void {
    dialog.showErrorBox(
      i18n.t('OAuth callback failed'),
      i18n.t('The OAuth callback could not be completed. Please try again.')
    );
  }

  /** Routes a valid callback that no OAuth provider claimed to the renderer. */
  function loadUnclaimedUrl(callbackUrl: URL): void {
    const urlParam = callbackUrl.hostname;
    const baseUrl = options.startUrl.endsWith('/')
      ? options.startUrl.slice(0, options.startUrl.length - 1)
      : options.startUrl;
    options.getMainWindow()?.loadURL(baseUrl + '#' + urlParam + callbackUrl.search);
  }

  /** Restores and focuses the current window when one is available. */
  function focusMainWindow(): void {
    const mainWindow = options.getMainWindow();
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }

  return {
    handle,
    attachToWebContents(webContents) {
      isReady = false;
      webContents.on('did-finish-load', () => this.setReady());
      webContents.on(
        'did-fail-load',
        (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
          if (!isMainFrame) {
            return;
          }
          console.error(
            `Main renderer failed to load ${validatedURL}: ${errorDescription} (${errorCode})`
          );
          this.setReady();
        }
      );
    },
    setReady(argv = process.argv) {
      if (isReady) {
        return;
      }
      isReady = true;
      if (!hasHandledStartupArguments) {
        hasHandledStartupArguments = true;
        // The launch argument callback arrived before anything queued by open-url or
        // second-instance, so dispatch it first to keep dispatch order matching arrival order.
        handleFirstProtocolUrl(argv);
      }
      for (const value of pendingUrls.splice(0)) {
        processUrl(value);
      }
    },
  };
}
