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

import { expect, test, TestInfo } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron, ElectronApplication, Page } from 'playwright';
import { parse } from 'yaml';

const appPath = path.resolve(__dirname, '../..');
const electronExecutable = process.platform === 'win32' ? 'electron.cmd' : 'electron';
const electronPath = path.join(appPath, 'node_modules', '.bin', electronExecutable);

let electronApp: ElectronApplication;
let page: Page;
let configHome: string;

function kubeconfig(name: string, server = 'https://127.0.0.1:9') {
  return {
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [{ name, cluster: { server } }],
    users: [{ name, user: { token: `${name}-example-token` } }],
    contexts: [{ name, context: { cluster: name, user: name } }],
    'current-context': name,
  };
}

function writeConfig(name: string, content: unknown): string {
  const file = path.join(configHome, name);
  fs.writeFileSync(file, JSON.stringify(content), { mode: 0o600 });
  return file;
}

async function chooseFiles(files: string[]) {
  let chooserCount = 0;
  const countChooser = () => chooserCount++;
  page.on('filechooser', countChooser);
  try {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Drag & drop or choose kubeconfig files here' }).click(),
    ]);
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles(files);
    await expect(page.getByText('Select clusters', { exact: true })).toBeVisible();
    expect(chooserCount).toBe(1);
  } finally {
    page.off('filechooser', countChooser);
  }
}

async function screenshot(testInfo: TestInfo, name: string) {
  const file = testInfo.outputPath(`${name}.png`);
  await page.getByRole('dialog').screenshot({ path: file, animations: 'disabled' });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

async function submit(expectedNames: string[]) {
  const responsePromise = page.waitForResponse(
    response =>
      new URL(response.url()).pathname === '/parseKubeConfig' &&
      response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const result: { clusters: { name: string }[] } = await response.json();
  expect(result.clusters.map(cluster => cluster.name).sort()).toEqual([...expectedNames].sort());
  await expect(page.getByText('Clusters successfully set up!', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const body: { kubeconfigs: string[] } = response.request().postDataJSON();
  expect(body.kubeconfigs).toHaveLength(1);
  return parse(Buffer.from(body.kubeconfigs[0], 'base64').toString('utf8'));
}

async function storedConfigs(): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('kubeconfigs', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('kubeconfigStore', 'readonly');
          const rows = transaction.objectStore('kubeconfigStore').getAll();
          rows.onerror = () => reject(rows.error);
          rows.onsuccess = () =>
            resolve(rows.result.map((row: { kubeconfig: string }) => row.kubeconfig));
          transaction.oncomplete = () => db.close();
        };
      })
  );
}

test.beforeEach(async () => {
  configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-kubeconfig-import-e2e-'));
  const emptyConfig = writeConfig('initial-config', {
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [],
    users: [],
    contexts: [],
  });
  electronApp = await _electron.launch({
    cwd: appPath,
    executablePath: electronPath,
    args: [
      '.',
      `--user-data-dir=${path.join(configHome, 'profile')}`,
      `--kubeconfig=${emptyConfig}`,
    ],
    env: {
      ...process.env,
      APPDATA: configHome,
      ELECTRON_DEV: 'true',
      HEADLAMP_CHECK_FOR_UPDATES: 'false',
      HEADLAMP_MCP_ENABLE: 'false',
      HOME: configHome,
      KUBECONFIG: emptyConfig,
      LOCALAPPDATA: configHome,
      NODE_ENV: 'development',
      XDG_CONFIG_HOME: configHome,
    },
  });
  page = await electronApp.firstWindow();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    localStorage.setItem('disable_update_check', 'true');
    window.location.hash = '/load-kube-config';
  });
  await expect(page.getByText('Choose files', { exact: true })).toBeVisible();
});

test.afterEach(async () => {
  await electronApp?.close();
  if (configHome) {
    fs.rmSync(configHome, { recursive: true, force: true });
  }
});

test('imports multiple selected files through the real backend and persists the selection', async ({}, testInfo) => {
  await chooseFiles([
    writeConfig('production.yaml', kubeconfig('production')),
    writeConfig('staging.yaml', kubeconfig('staging')),
    writeConfig('development.yaml', kubeconfig('development')),
  ]);
  for (const name of ['production', 'staging', 'development']) {
    await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked();
  }
  await screenshot(testInfo, 'combined-contexts');
  await page.getByRole('checkbox', { name: 'development', exact: true }).uncheck();
  const submitted = await submit(['production', 'staging']);
  const expectedConfig = {
    clusters: [...kubeconfig('production').clusters, ...kubeconfig('staging').clusters],
    users: [...kubeconfig('production').users, ...kubeconfig('staging').users],
    contexts: [...kubeconfig('production').contexts, ...kubeconfig('staging').contexts],
  };
  expect(submitted).toMatchObject(expectedConfig);
  await screenshot(testInfo, 'import-success');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.reload();
  await expect.poll(async () => (await storedConfigs()).length).toBe(1);
  const [stored] = await storedConfigs();
  expect(parse(Buffer.from(stored, 'base64').toString('utf8'))).toMatchObject(expectedConfig);
});

test('imports valid files despite partial failures and clears the warning on success', async ({}, testInfo) => {
  await chooseFiles([
    writeConfig('invalid.yaml', { clusters: 'invalid' }),
    writeConfig('production.yaml', kubeconfig('production')),
    writeConfig('staging.yaml', kubeconfig('staging')),
  ]);
  await expect(page.getByRole('alert')).toHaveClass(/MuiAlert-standardWarning/);
  await expect(page.getByRole('alert')).toContainText('1 file could not be loaded');
  await expect(page.getByRole('alert')).toContainText('invalid.yaml: Invalid kubeconfig structure');
  await expect(page.getByRole('alert').getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('alert').getByRole('listitem')).toHaveText(
    'invalid.yaml: Invalid kubeconfig structure'
  );
  await expect(page.getByRole('alert').locator('.MuiAlertTitle-root')).toHaveText(
    '1 file could not be loaded'
  );
  await screenshot(testInfo, 'partial-import-warning');
  await submit(['production', 'staging']);
});

test('warns about duplicates and submits the first configurations', async ({}, testInfo) => {
  await chooseFiles([
    writeConfig('production.yaml', kubeconfig('production')),
    writeConfig('duplicate.yaml', kubeconfig('production', 'https://127.0.0.1:10')),
    writeConfig('staging.yaml', kubeconfig('staging')),
  ]);
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await expect(page.getByRole('alert')).toContainText(
    'Duplicate kubeconfig entries were skipped (first occurrence wins)'
  );
  await expect(page.getByRole('alert').getByRole('listitem')).toHaveText([
    'duplicate.yaml: Cluster "production"',
    'duplicate.yaml: User "production"',
    'duplicate.yaml: Context "production"',
  ]);
  await screenshot(testInfo, 'duplicate-warning');
  const submitted = await submit(['production', 'staging']);
  expect(submitted).toMatchObject({
    clusters: [...kubeconfig('production').clusters, ...kubeconfig('staging').clusters],
  });
});

test('imports multiple files dropped into the desktop renderer', async () => {
  const transfer = await page.evaluateHandle(
    configs => {
      const data = new DataTransfer();
      for (const config of configs) {
        data.items.add(
          new File([JSON.stringify(config)], `${config['current-context']}.yaml`, {
            type: 'application/yaml',
          })
        );
      }
      return data;
    },
    [kubeconfig('production'), kubeconfig('staging')]
  );
  try {
    await page
      .locator('input[type="file"]')
      .locator('xpath=ancestor::*[@role="presentation"][1]')
      .dispatchEvent('drop', { dataTransfer: transfer });
  } finally {
    await transfer.dispose();
  }
  await expect(page.getByRole('checkbox', { name: 'production', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'staging', exact: true })).toBeChecked();
  await submit(['production', 'staging']);
});

test('imports anonymous contexts through the real parser without reusing credentials', async () => {
  await chooseFiles([
    writeConfig('anonymous.yaml', {
      ...kubeconfig('anonymous'),
      users: [],
      contexts: [
        { name: 'anonymous', context: { cluster: 'anonymous', namespace: 'default' } },
        { name: 'empty-user', context: { cluster: 'anonymous', user: '' } },
      ],
    }),
    writeConfig('authenticated.yaml', kubeconfig('headlamp-anonymous')),
  ]);
  const expectedConfig = {
    users: [
      { name: 'headlamp-anonymous-1', user: {} },
      {
        name: 'headlamp-anonymous',
        user: { token: 'headlamp-anonymous-example-token' },
      },
    ],
    contexts: [
      {
        name: 'anonymous',
        context: {
          cluster: 'anonymous',
          user: 'headlamp-anonymous-1',
          namespace: 'default',
        },
      },
      { name: 'empty-user', context: { cluster: 'anonymous', user: 'headlamp-anonymous-1' } },
      {
        name: 'headlamp-anonymous',
        context: { cluster: 'headlamp-anonymous', user: 'headlamp-anonymous' },
      },
    ],
  };
  expect(await submit(['anonymous', 'empty-user', 'headlamp-anonymous'])).toMatchObject(
    expectedConfig
  );
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.reload();
  await expect.poll(async () => (await storedConfigs()).length).toBe(1);
  const [stored] = await storedConfigs();
  expect(parse(Buffer.from(stored, 'base64').toString('utf8'))).toMatchObject(expectedConfig);
});

test('rejects unresolved named users before merging conflicting cluster definitions', async () => {
  const invalid = kubeconfig('production', 'https://127.0.0.1:10');
  invalid.users = [];
  invalid.contexts[0].context.user = 'missing-user';
  await chooseFiles([
    writeConfig('missing-user.yaml', invalid),
    writeConfig('production.yaml', kubeconfig('production')),
    writeConfig('staging.yaml', kubeconfig('staging')),
  ]);
  await expect(page.getByRole('alert').getByRole('listitem')).toHaveText(
    'missing-user.yaml: Kubeconfig contexts reference missing users'
  );
  expect(await submit(['production', 'staging'])).toMatchObject({
    clusters: [...kubeconfig('production').clusters, ...kubeconfig('staging').clusters],
    users: [...kubeconfig('production').users, ...kubeconfig('staging').users],
    contexts: [...kubeconfig('production').contexts, ...kubeconfig('staging').contexts],
  });
});

test('reports all invalid files without submitting them to the backend', async ({}, testInfo) => {
  const requests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/parseKubeConfig') {
      requests.push(request.url());
    }
  });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Drag & drop or choose kubeconfig files here' }).click(),
  ]);
  await chooser.setFiles([
    writeConfig('empty.yaml', {}),
    writeConfig('malformed.yaml', { clusters: {}, contexts: [] }),
  ]);
  await expect(page.getByRole('alert')).toContainText(
    'No valid kubeconfig contexts found in the selected files'
  );
  await expect(page.getByRole('alert')).toContainText('empty.yaml:');
  await expect(page.getByRole('alert')).toContainText('malformed.yaml:');
  await expect(page.getByRole('alert').getByRole('listitem')).toHaveText([
    'empty.yaml: Invalid kubeconfig structure',
    'malformed.yaml: Invalid kubeconfig structure',
  ]);
  await expect(page.getByText('Choose files', { exact: true })).toBeVisible();
  await screenshot(testInfo, 'invalid-files');
  expect(requests).toEqual([]);
});
