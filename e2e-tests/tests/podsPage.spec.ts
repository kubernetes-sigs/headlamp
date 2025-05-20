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
import { podsPage } from './podsPage';

test('multi tab create delete pod', async ({ browser }) => {
  // This test may be slow to create and delete a pod
  test.setTimeout(60000);
  const name = 'examplepodlol';

  const instance1 = await browser.newContext();
  const page1 = await instance1.newPage();
  const window1 = new HeadlampPage(page1);
  await window1.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  const page2 = await instance1.newPage();
  const window2 = new HeadlampPage(page2);
  await window2.navigateTopage('/c/test/pods', /Pods/);

  // if no pod permission, return
  const content1 = await page1.content();
  const content2 = await page2.content();
  if (
    !content1.includes('Pods') ||
    !content1.includes('href="/c/test/pods') ||
    !content2.includes('Pods') ||
    !content2.includes('href="/c/test/pods')
  ) {
    return;
  }

  const realtimeUpdate1 = new podsPage(page1);
  const realtimeUpdate2 = new podsPage(page2);

  await realtimeUpdate1.navigateToPods();

  await realtimeUpdate1.createPod(name);
  await realtimeUpdate2.confirmPodCreation(name);

  await realtimeUpdate1.deletePod(name);
  await realtimeUpdate2.confirmPodDeletion(name);
});
