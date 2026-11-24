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

import { expect, test } from '@playwright/test';
import path from 'path';
import { _electron } from 'playwright';

/** Window fields made available by the Electron preload bridge. */
type DesktopWindow = Window & {
  /** APIs exposed to Headlamp's renderer process. */
  desktopApi: {
    /** Operating system platform hosting the desktop app. */
    platform: NodeJS.Platform;
  };
};

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

test.describe('desktop platform API', () => {
  test('exposes the host platform to the renderer', async () => {
    test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'The preload bridge is desktop-only');

    const electronApp = await _electron.launch({
      cwd: appPath,
      executablePath: electronPath,
      args: ['.'],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ELECTRON_DEV: 'true',
      },
    });

    try {
      const page = await electronApp.firstWindow();
      const platform = await page.evaluate(
        () => (window as unknown as DesktopWindow).desktopApi.platform
      );

      expect(platform).toBe(process.platform);
    } finally {
      await electronApp.close();
    }
  });
});
