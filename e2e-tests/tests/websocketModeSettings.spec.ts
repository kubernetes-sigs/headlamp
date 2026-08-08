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

import { expect, Page, test } from '@playwright/test';
import { HeadlampPage } from './headlampPage';

let headlampPage: HeadlampPage;

/** MUI Select is a combobox, not a native <select>. Open it and click the option. */
async function selectWebsocketMode(page: Page, optionText: string) {
  await page.getByRole('combobox', { name: 'WebSocket mode' }).click();
  await page.getByRole('option', { name: optionText }).click();
}

/** Returns the visible text of the WebSocket mode combobox. */
async function getWebsocketModeText(page: Page): Promise<string> {
  return (await page.getByRole('combobox', { name: 'WebSocket mode' }).textContent()) ?? '';
}

/** Returns the websocketModeUserOverride stored in localStorage. */
async function getStoredMode(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    try {
      const settings = JSON.parse(localStorage.getItem('settings') || '{}');
      return settings.websocketModeUserOverride as string | undefined;
    } catch {
      return undefined;
    }
  });
}

test.beforeEach(async ({ page }) => {
  headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
});

test.afterEach(async ({ page }) => {
  // Reset the override so tests are independent
  await page.evaluate(() => {
    const stored = localStorage.getItem('settings');
    if (stored) {
      try {
        const settings = JSON.parse(stored);
        delete settings.websocketModeUserOverride;
        localStorage.setItem('settings', JSON.stringify(settings));
      } catch {
        localStorage.setItem('settings', '{}');
      }
    }
  });
});

test('general settings page shows WebSocket mode selector', async ({ page }) => {
  await headlampPage.navigateTopage('/settings/general', /Settings/);
  await expect(page.getByRole('combobox', { name: 'WebSocket mode' })).toBeVisible();
});

test('WebSocket mode selector defaults to "Default" option', async ({ page }) => {
  await headlampPage.navigateTopage('/settings/general', /Settings/);
  const text = await getWebsocketModeText(page);
  expect(text).toContain('Default');
});

test('WebSocket mode selection is saved to localStorage', async ({ page }) => {
  await headlampPage.navigateTopage('/settings/general', /Settings/);
  await selectWebsocketMode(page, 'Off (disable real-time updates)');
  expect(await getStoredMode(page)).toBe('off');
});

test('WebSocket mode selection persists after page reload', async ({ page }) => {
  await headlampPage.navigateTopage('/settings/general', /Settings/);
  await selectWebsocketMode(page, 'Multiplexer (experimental, improved performance)');

  await page.reload({ waitUntil: 'networkidle' });
  await headlampPage.navigateTopage('/settings/general', /Settings/);

  const text = await getWebsocketModeText(page);
  expect(text).toContain('Multiplexer');
});

test('WebSocket mode can be reset to default', async ({ page }) => {
  await headlampPage.navigateTopage('/settings/general', /Settings/);

  await selectWebsocketMode(page, 'Off (disable real-time updates)');
  await selectWebsocketMode(page, 'Default (use environment / server setting)');

  const text = await getWebsocketModeText(page);
  expect(text).toContain('Default');
  expect(await getStoredMode(page)).toBe('auto');
});

test('Off mode disables standard and multiplexed watch connections', async ({ page }) => {
  const watchSocketUrls: string[] = [];
  const isWatchSocket = (url: string) => {
    const socketUrl = new URL(url);
    return (
      socketUrl.pathname.endsWith('/wsMultiplexer') ||
      (socketUrl.pathname.endsWith('/api/v1/pods') && socketUrl.searchParams.has('watch'))
    );
  };

  page.on('websocket', socket => {
    if (isWatchSocket(socket.url())) {
      watchSocketUrls.push(socket.url());
    }
  });

  await page.route('**/clusters/test/api/v1/pods?*', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        apiVersion: 'v1',
        kind: 'PodList',
        metadata: { resourceVersion: '1' },
        items: [
          {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: 'websocket-mode-test-pod',
              namespace: 'default',
              uid: 'websocket-mode-test-pod-uid',
              resourceVersion: '1',
              creationTimestamp: '2026-01-01T00:00:00Z',
            },
            spec: { containers: [{ name: 'main', image: 'busybox' }] },
            status: { phase: 'Running' },
          },
        ],
      }),
    });
  });

  await headlampPage.navigateTopage('/settings/general', /Settings/);
  await selectWebsocketMode(page, 'Off (disable real-time updates)');

  await headlampPage.navigateTopage('/c/test/pods', /Pods/);
  await expect(page.getByRole('link', { name: 'websocket-mode-test-pod' })).toBeVisible();
  await expect(
    page.waitForEvent('websocket', {
      predicate: socket => isWatchSocket(socket.url()),
      timeout: 1000,
    })
  ).rejects.toThrow();
  expect(watchSocketUrls).toEqual([]);

  await headlampPage.navigateTopage('/settings/general', /Settings/);
  await selectWebsocketMode(page, 'Websockets (standard)');
  watchSocketUrls.length = 0;

  await headlampPage.navigateTopage('/c/test/pods', /Pods/);
  await expect(page.getByRole('link', { name: 'websocket-mode-test-pod' })).toBeVisible();
  await expect.poll(() => watchSocketUrls.length).toBeGreaterThan(0);
  expect(watchSocketUrls.every(url => !new URL(url).pathname.endsWith('/wsMultiplexer'))).toBe(true);
});

test('Multiplexer mode receives backend watch updates', async ({ page }) => {
  test.setTimeout(60000);

  await headlampPage.navigateTopage('/settings/general', /Settings/);
  await selectWebsocketMode(page, 'Multiplexer (experimental, improved performance)');

  const multiplexerSocket = page.waitForEvent('websocket', {
    predicate: socket =>
      new URL(socket.url()).pathname.endsWith('/clusters/test/wsMultiplexer'),
  });

  await headlampPage.navigateTopage('/c/test/pods', /Pods/);
  const socket = await multiplexerSocket;
  const receivedFrames: string[] = [];
  socket.on('framereceived', ({ payload }) => receivedFrames.push(payload.toString()));

  const podName = `websocket-multiplexer-e2e-${Date.now()}`;
  const podUrl = `/clusters/test/api/v1/namespaces/default/pods`;
  const headers: Record<string, string> = process.env.HEADLAMP_TEST_TOKEN
    ? { Authorization: `Bearer ${process.env.HEADLAMP_TEST_TOKEN}` }
    : {};
  const createResponse = await page.request.post(podUrl, {
    headers,
    data: {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: podName },
      spec: { containers: [{ name: 'main', image: 'busybox' }] },
    },
  });
  expect(createResponse.ok(), `failed to create Pod: ${await createResponse.text()}`).toBe(true);

  const observedPod = page.getByRole('link', { name: podName });
  try {
    await expect(observedPod).toBeVisible({ timeout: 15000 });
    await expect.poll(() => receivedFrames.some(frame => frame.includes(podName))).toBe(true);
    receivedFrames.length = 0;
  } finally {
    const deleteResponse = await page.request.delete(`${podUrl}/${podName}`, { headers });
    expect(deleteResponse.ok(), `failed to delete Pod: ${await deleteResponse.text()}`).toBe(true);
  }
  await expect(observedPod).toHaveCount(0, { timeout: 15000 });
  await expect.poll(() => receivedFrames.some(frame => frame.includes(podName))).toBe(true);
});
