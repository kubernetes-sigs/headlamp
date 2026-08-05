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
import { NamespacesPage } from './namespacesPage';

test('create a namespace with the minimal editor then delete it', async ({ page }) => {
  const name = 'testing-e2e';
  const headlampPage = new HeadlampPage(page);
  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  const content = await page.content();
  test.skip(
    !content.includes('Namespaces') || !content.includes('href="/c/test/namespaces'),
    'Namespace permissions are required for this test'
  );

  const namespacesPage = new NamespacesPage(page);
  await namespacesPage.navigateToNamespaces();
  await namespacesPage.a11y();

  const setupStatus = await namespacesPage.createNamespace(name);
  try {
    await namespacesPage.a11y();
  } finally {
    if (setupStatus === 'created') {
      await namespacesPage.deleteNamespace(name);
      await namespacesPage.a11y();
    }
  }
});
