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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron } from 'playwright';

const appPath = path.resolve(__dirname, '../..');
const frontendBuild = path.resolve(appPath, '../frontend/build');
const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.resolve(appPath, `node_modules/.bin/${electronExecutable}`);

test('loads the default frontend production build in Electron', async () => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-frontend-build-e2e-'));
  const indexFile = path.join(frontendBuild, 'index.html');
  expect(fs.existsSync(indexFile)).toBe(true);
  const index = fs.readFileSync(indexFile, 'utf8');
  expect(index).not.toMatch(/(?:src|href)="\//);
  expect(index).toContain('<base href="./">');

  const electronApp = await _electron.launch({
    cwd: appPath,
    executablePath: electronPath,
    args: ['.'],
    env: {
      ...process.env,
      APPDATA: configHome,
      ELECTRON_DEV: 'true',
      HOME: configHome,
      LOCALAPPDATA: configHome,
      NODE_ENV: 'development',
      XDG_CONFIG_HOME: configHome,
    },
  });

  try {
    const page = await electronApp.firstWindow();
    const rendererErrors: string[] = [];
    const loadedScripts: string[] = [];
    page.on('pageerror', error => rendererErrors.push(error.message));
    page.on('requestfailed', request => {
      const error = request.failure()?.errorText;
      if (error !== 'net::ERR_ABORTED') {
        rendererErrors.push(`${error}: ${request.url()}`);
      }
    });
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        rendererErrors.push(message.text());
      }
    });
    page.on('response', response => {
      const resourceType = response.request().resourceType();
      if (['script', 'stylesheet', 'font', 'image'].includes(resourceType) && !response.ok()) {
        rendererErrors.push(`${response.status()}: ${response.url()}`);
      }
      if (resourceType === 'script') {
        loadedScripts.push(response.url());
      }
    });
    await page.reload();
    await expect(page.locator('#root .splash')).toHaveCount(0);
    await expect(page.locator('#root')).not.toBeEmpty();
    await page.waitForTimeout(1000);
    expect(rendererErrors).toEqual([]);

    expect(
      await page.evaluate(() => {
        const pluginLib = (window as Window & { pluginLib?: Record<string, unknown> }).pluginLib;
        return (
          pluginLib &&
          ['Headlamp', 'K8s', 'MuiMaterial', 'React', 'Router'].every(key => key in pluginLib)
        );
      })
    ).toBe(true);

    const initialScriptCount = loadedScripts.length;
    rendererErrors.length = 0;
    await page.evaluate(() => {
      window.location.hash = '/project/create-yaml';
    });
    await expect(page.getByRole('heading', { name: 'Create new Project from YAML' })).toBeVisible();
    await expect.poll(() => loadedScripts.length).toBeGreaterThan(initialScriptCount);
    expect(rendererErrors).toEqual([]);
  } finally {
    await electronApp.close();
    fs.rmSync(configHome, { force: true, recursive: true });
  }
});
