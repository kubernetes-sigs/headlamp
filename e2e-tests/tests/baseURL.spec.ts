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

test('loads the frontend from a non-root base URL', async ({ page }) => {
  const testURL = process.env.HEADLAMP_TEST_URL;
  expect(testURL).toBeTruthy();

  const failedRequests: string[] = [];
  const frontendAssets: string[] = [];
  page.on('requestfailed', request => {
    const error = request.failure()?.errorText;
    if (error !== 'net::ERR_ABORTED') {
      failedRequests.push(`${error}: ${request.url()}`);
    }
  });
  page.on('response', response => {
    if (['script', 'stylesheet'].includes(response.request().resourceType())) {
      frontendAssets.push(response.url());
      if (response.status() >= 400) {
        failedRequests.push(`${response.status()}: ${response.url()}`);
      }
    }
  });

  await page.goto(`${testURL}/project/create-yaml`);
  await expect(page.locator('#root .splash')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Create new Project from YAML' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Create new Project from YAML' })).toBeVisible();
  await expect.poll(() => frontendAssets.length).toBeGreaterThan(0);

  expect(
    await page.evaluate(() => (window as Window & { headlampBaseUrl?: string }).headlampBaseUrl)
  ).toBe('/headlamp');
  expect(failedRequests).toEqual([]);
  expect(frontendAssets.every(url => new URL(url).pathname.startsWith('/headlamp/'))).toBe(true);
});
