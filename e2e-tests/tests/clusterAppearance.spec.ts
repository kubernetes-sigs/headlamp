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
import { HeadlampPage } from './headlampPage';

let headlampPage: HeadlampPage;

test.beforeEach(async ({ page }) => {
  headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
  await page.evaluate(() => localStorage.removeItem('cluster_settings.test'));
  await headlampPage.navigateTopage('/settings/cluster?c=test');
});

test('cluster appearance controls update color and icon', async ({ page }) => {
  await page.locator('#color-picker-button').click();
  await page.locator('button[value="#f44336"]').click();

  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('cluster_settings.test') || '{}'))
    )
    .toMatchObject({ appearance: { accentColor: '#f44336' } });

  await page.locator('#icon-picker-button').click();
  await page.locator('button[value="mdi:kubernetes"]').click();

  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('cluster_settings.test') || '{}'))
    )
    .toMatchObject({ appearance: { accentColor: '#f44336', icon: 'mdi:kubernetes' } });
});
