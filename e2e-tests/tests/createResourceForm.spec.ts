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
import { podsPage } from './podsPage';

test('create a pod via the resource form then delete it', async ({ page }) => {
  // Creating + deleting a pod can be slow.
  test.setTimeout(60000);

  const name = 'form-created-pod';
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  // If there's no pods permission, skip.
  await headlampPage.navigateTopage('/c/test/pods', /Pods/);
  const content = await page.content();
  if (!content.includes('Pods') || !content.includes('href="/c/test/pods')) {
    return;
  }

  const formPage = new CreateResourceFormPage(page);
  await formPage.openCreateActivity();
  await formPage.a11y();

  await formPage.selectResourceType('Pod');
  await formPage.createPodViaForm({
    name,
    containerName: 'nginx',
    image: 'nginx:1.14.2',
  });
  await formPage.a11y();

  // Verify and clean up using the existing pods page object.
  const pods = new podsPage(page);
  await pods.confirmPodCreation(name);
  await pods.deletePod(name);
});
