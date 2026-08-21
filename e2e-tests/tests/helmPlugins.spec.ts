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

/// <reference types="node" />
import { expect, test } from '@playwright/test';
import { HeadlampPage } from './headlampPage';

let headlampPage: HeadlampPage;

// Only run against the dedicated Helm deployment set up in CI. In the generic e2e run this
// points at the ordinary kube-system instance, which never has the plugin installed, so skip it
// there instead of letting it fail.
const shouldRun = !!process.env.HEADLAMP_TEST_HELM;

test.describe('Headlamp plugin manager via Helm', () => {
  test.skip(!shouldRun, 'HEADLAMP_TEST_HELM is not set; skipping helm plugin manager test');

  test.beforeEach(async ({ page }) => {
    headlampPage = new HeadlampPage(page);

    await headlampPage.navigateToCluster('main', process.env.HEADLAMP_TEST_TOKEN);
  });

  test('plugin manager should have installed plugins via helm', async ({ page }) => {
    // Wait for plugins to be loaded.
    // The plugin we are installing is 'Flux' via Helm.
    // Give the plugin manager sidecar (npx download + Artifact Hub fetch/extract) and the
    // repeated page reloads below plenty of time to complete.
    test.setTimeout(300000);

    await headlampPage.navigateTopage('/settings/plugins', /Plugins/);

    // Plugins are only discovered once, on app boot, so a plugin the sidecar installs after the
    // page has already loaded will not show up without a reload. Poll by reloading until it does.
    await expect(async () => {
      await page.reload();
      await headlampPage.tableContains(/flux/i, { timeout: 5000 });
    }).toPass({ timeout: 240000, intervals: [5000] });
  });
});
