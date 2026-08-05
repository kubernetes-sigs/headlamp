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
import { NamespacesPage } from './namespacesPage';

const PROJECT_ID_LABEL = 'headlamp.dev/project-id';

test('opens a project created from a labelled namespace', async ({ page }) => {
  const namespaceName = 'testing-e2e-project';
  const projectName = 'testing-e2e';
  const headlampPage = new HeadlampPage(page);
  const namespacesPage = new NamespacesPage(page);

  await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);

  const content = await page.content();
  test.skip(
    !content.includes('Namespaces') || !content.includes('href="/c/test/namespaces'),
    'Namespace permissions are required for this test'
  );

  await namespacesPage.navigateToNamespaces();
  const setupStatus = await namespacesPage.createNamespace(namespaceName, {
    [PROJECT_ID_LABEL]: projectName,
  });

  try {
    await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
    await page.getByRole('tab', { name: 'Projects' }).click();

    const projectLink = page.getByRole('link', { name: projectName, exact: true });
    await expect(projectLink).toBeVisible();
    await expect(projectLink).toHaveAttribute('href', `/project/${projectName}`);
    await projectLink.click();

    await expect(page).toHaveURL(new RegExp(`/project/${projectName}$`));
    await expect(page.getByText(projectName, { exact: true }).first()).toBeVisible();
  } finally {
    if (setupStatus === 'created') {
      await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
      await namespacesPage.navigateToNamespaces();
      await namespacesPage.deleteNamespace(namespaceName);
    }
  }
});
