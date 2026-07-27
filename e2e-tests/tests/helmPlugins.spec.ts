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
import { test } from '@playwright/test';
import { HeadlampPage } from './headlampPage';

let headlampPage: HeadlampPage;

test.beforeEach(async ({ page }) => {
  headlampPage = new HeadlampPage(page);

  await headlampPage.navigateToCluster('main', process.env.HEADLAMP_TEST_TOKEN);
});

test('plugin manager should have installed plugins via helm', async () => {
  // Wait for plugins to be loaded.
  // The plugin we are installing is 'Flux' via Helm.

  await headlampPage.navigateTopage('/settings/plugins', /Plugins/);

  // Check if the plugin is in the list.
  // It might take some time for the plugin manager to install it.
  await headlampPage.tableContains(/flux/i, { timeout: 60000 });
});
