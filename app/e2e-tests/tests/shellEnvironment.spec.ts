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
import path from 'node:path';
import { _electron } from 'playwright';

const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(__dirname, `../../node_modules/.bin/${electronExecutable}`);
const appPath = path.resolve(__dirname, '../../');

test('preserves the process environment through shell discovery', async () => {
  test.skip(process.env.PLAYWRIGHT_TEST_MODE !== 'app', 'This test only runs in app mode');

  const markerName = 'HEADLAMP_SHELL_ENV_E2E';
  const markerValue = `shell-environment-${process.pid}`;
  const launchEnvironment = { ...process.env };
  delete launchEnvironment.ELECTRON_RUN_AS_NODE;
  const electronApp = await _electron.launch({
    cwd: appPath,
    executablePath: electronPath,
    args: ['.'],
    env: {
      ...launchEnvironment,
      ELECTRON_DEV: 'true',
      ELECTRON_START_URL: 'data:text/html,<title>Headlamp shell environment test</title>',
      EXTERNAL_SERVER: 'true',
      HEADLAMP_CHECK_FOR_UPDATES: 'false',
      HEADLAMP_MCP_ENABLE: 'false',
      [markerName]: markerValue,
    },
  });

  try {
    await electronApp.firstWindow();
    const resolvedMarker = await electronApp.evaluate(async ({ app }, environmentKey) => {
      const getBuiltinModule = Reflect.get(process, 'getBuiltinModule') as (
        moduleName: string
      ) => typeof import('node:module');
      const { createRequire } = getBuiltinModule('node:module');
      const requireFromApp = createRequire(`${app.getAppPath()}/package.json`);
      const mainModule = requireFromApp(app.getAppPath()) as {
        getShellEnvironment: () => Promise<NodeJS.ProcessEnv>;
      };
      const environment = await mainModule.getShellEnvironment();
      return environment[environmentKey];
    }, markerName);

    expect(resolvedMarker).toBe(markerValue);
  } finally {
    await electronApp.close();
  }
});