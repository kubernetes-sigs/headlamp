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

import { ChildProcessWithoutNullStreams } from 'child_process';
import { app, dialog } from 'electron';
import i18n from './i18next.config';

export interface HeadlessOptions {
  /** Function that starts the backend server process. */
  startServer: () => Promise<ChildProcessWithoutNullStreams>;
  /** Callback invoked when the server process starts successfully. */
  onSuccess?: (serverProcess: ChildProcessWithoutNullStreams) => void;
}

/**
 * Starts the backend server in headless mode and handles any startup failure cleanly.
 */
export async function startHeadlessMode(options: HeadlessOptions): Promise<void> {
  return options
    .startServer()
    .then(serverProcess => {
      options.onSuccess?.(serverProcess);
    })
    .catch((error: unknown) => {
      // Without this, a port-exhaustion rejection becomes an unhandled
      // promise rejection: the user gets no browser window and no diagnostic.
      console.error('Failed to start the backend server:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox(
        i18n.t('Headlamp failed to start'),
        i18n.t('The backend server could not be started:\n\n{{ error }}', {
          error: errorMessage,
        })
      );
      app.quit();
    });
}
