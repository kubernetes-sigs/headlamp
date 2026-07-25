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

// The Prometheus plugin is bundled in the Docker image via container/build-manifest.json
// and in the App via app/app-build-manifest.json. These tests verify it is present and working.

test('prometheus plugin is bundled', async ({ page }) => {
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  // Query the plugins endpoint to verify Prometheus is bundled.
  // The Docker image includes it as a static plugin (container/build-manifest.json).
  // The App includes it via app/app-build-manifest.json.
  // If this assertion fails, the plugin is missing from the build — that's a bug.
  const pluginsResponse = await page.request.get('/plugins');
  expect(pluginsResponse.ok(), '/plugins should return a successful response').toBeTruthy();
  const plugins = await pluginsResponse.json();
  expect(Array.isArray(plugins), '/plugins should return an array').toBeTruthy();

  const prometheusPlugin = plugins.find(
    (p: { name?: string; path?: string }) =>
      (p.name && p.name.toLowerCase().includes('prometheus')) ||
      (p.path && p.path.toLowerCase().includes('prometheus'))
  );
  expect(prometheusPlugin, 'Prometheus plugin should be bundled in the image/app').toBeTruthy();
});

test('prometheus plugin has settings', async ({ page }) => {
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  // Navigate to Settings > Plugins and verify the Prometheus plugin appears in the table.
  await headlampPage.navigateTopage('/settings/plugins', /Plugins/);

  // The Prometheus plugin should appear as a row in the plugins table.
  // The plugin settings page displays each plugin's name as a link.
  await headlampPage.clickOnPlugin('prometheus');
  await headlampPage.hasTitleContaining(/Plugin Details/);

  // Verify the details page is specifically for the Prometheus plugin:
  // the section header renders the plugin name as a heading.
  await expect(
    page
      .locator('h2, h3')
      .filter({ hasText: /prometheus/i })
      .first()
  ).toBeVisible();

  // Verify a stable element from the Prometheus settings component is present,
  // confirming the settings UI actually loaded for this plugin.
  await expect(page.getByText('Enable Metrics')).toBeVisible();
});
