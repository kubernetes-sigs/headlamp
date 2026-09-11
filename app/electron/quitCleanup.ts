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

interface BeforeQuitEvent {
  preventDefault(): void;
}

/**
 * Prevents Electron from quitting until asynchronous cleanup settles or its deadline expires.
 *
 * @param cleanup - Asynchronous application cleanup to start once.
 * @param quit - Resumes Electron quit after cleanup or timeout.
 * @param reportError - Reports cleanup rejection or timeout.
 * @param timeoutMs - Maximum time to keep Electron's quit event prevented.
 * @returns An Electron before-quit event handler.
 */
export function createBeforeQuitHandler(
  cleanup: () => Promise<void>,
  quit: () => void,
  reportError: (error: unknown) => void = error => console.error('Quit cleanup failed:', error),
  timeoutMs = 10_000
): (event: BeforeQuitEvent) => void {
  let cleanupStarted = false;
  let readyToQuit = false;

  return event => {
    if (readyToQuit) {
      return;
    }
    event.preventDefault();
    if (cleanupStarted) {
      return;
    }
    cleanupStarted = true;
    let cleanupPromise: Promise<void>;
    try {
      cleanupPromise = cleanup();
    } catch (error) {
      cleanupPromise = Promise.reject(error);
    }
    let timeout: ReturnType<typeof setTimeout>;
    const cleanupDeadline = new Promise<void>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error(`Quit cleanup did not settle within ${timeoutMs}ms.`)),
        timeoutMs
      );
      timeout.unref?.();
    });
    void Promise.race([cleanupPromise, cleanupDeadline])
      .catch(reportError)
      .finally(() => {
        clearTimeout(timeout);
        readyToQuit = true;
        quit();
      });
  };
}
