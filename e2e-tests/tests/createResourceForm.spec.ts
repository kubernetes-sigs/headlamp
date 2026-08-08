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
import { CreateResourceFormPage } from './createResourceFormPage';
import { HeadlampPage } from './headlampPage';

test('create and delete pod via form', async ({ page }) => {
  test.setTimeout(60000);
  const name = 'e2e-form-pod';

  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
  await headlampPage.navigateTopage('/c/test/pods', /Pods/);

  // If no pod permission, skip
  const content = await page.content();
  if (!content.includes('Pods') || !content.includes('href="/c/test/pods')) {
    return;
  }

  const formPage = new CreateResourceFormPage(page);
  await formPage.createPodViaForm(name);
  await formPage.deletePod(name);
});
