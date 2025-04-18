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

import { test } from '@playwright/test';
import { HeadlampPage } from './headlampPage';

let headlampPage: HeadlampPage;

test.beforeEach(async ({ page }) => {
  headlampPage = new HeadlampPage(page);

  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
});

test('plugin settings page should have a title', async () => {
  await headlampPage.navigateTopage('/settings/plugins', /Plugins/);
});

test('plugin settings page should have a table', async () => {
  const expectedHeaders = ['Name', 'Description', 'Origin', 'Status'];
  // note: Enable column is only there in app mode.

  await headlampPage.navigateTopage('/settings/plugins', /Plugins/);
  await headlampPage.tableHasHeaders('table', expectedHeaders);
});

test('pod counter plugin should have setting option', async () => {
  const pluginName = 'headlamp-pod-counter';

  await headlampPage.navigateTopage('/settings/plugins', /Plugin/);
  await headlampPage.clickOnPlugin(pluginName);
  await headlampPage.hasTitleContaining(/Plugin Details/);
  await headlampPage.checkPageContent('Custom Error Message');
});
