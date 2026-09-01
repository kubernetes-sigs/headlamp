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
import { CreateResourceFormPage } from './createResourceFormPage';
import { HeadlampPage } from './headlampPage';

test.describe('CreateResourceForm – Pod', () => {
  test.beforeEach(async ({ page }) => {
    const headlampPage = new HeadlampPage(page);
    await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
    await headlampPage.navigateTopage('/c/test/pods', /Pods/);

    // Skip if the cluster user can't see Pods.
    const content = await page.content();
    test.skip(
      !content.includes('Pods') || !content.includes('href="/c/test/pods'),
      'No pods permission on the test cluster'
    );
  });

  test('Apply stays disabled until required fields are filled', async ({ page }) => {
    const formPage = new CreateResourceFormPage(page);
    await formPage.openCreatePodForm();

    // The base pod already seeds one empty container row, so no addContainer()
    // here — we just fill the seeded row.

    // Nothing filled yet: name + container name + container image all empty.
    await expect(formPage.applyButton()).toBeDisabled();

    // Only metadata filled – container name + image still empty.
    await formPage.fillMetadata({ name: 'validation-check', namespace: 'default' });
    await expect(formPage.applyButton()).toBeDisabled();

    // Container name filled – image still empty.
    await formPage.containerNameInput().fill('nginx');
    await expect(formPage.applyButton()).toBeDisabled();

    // All required fields filled – Apply is enabled.
    await formPage.containerImageInput().fill('nginx:1.14.2');
    await expect(formPage.applyButton()).toBeEnabled();

    await formPage.closeCreateDialog();
  });

  test('creates a pod via the form', async ({ page }, testInfo) => {
    test.setTimeout(60000);
    // Unique name per retry so a leftover from a failed prior attempt doesn't
    // turn the Apply click into a duplicate-create no-op.
    const name = `e2e-form-pod-${testInfo.retry}`;

    const headlampPage = new HeadlampPage(page);
    const formPage = new CreateResourceFormPage(page);

    // Open the Create Pod activity and switch to the Form tab.
    await formPage.openCreatePodForm();

    // Fill the form.
    await formPage.fillMetadata({ name, namespace: 'default' });
    await expect(formPage.nameInput()).toHaveValue(name);

    await formPage.fillFirstContainer({ name: 'nginx', image: 'nginx:1.14.2' });
    await expect(formPage.containerNameInput()).toHaveValue('nginx');
    await expect(formPage.containerImageInput()).toHaveValue('nginx:1.14.2');

    // Apply, then close the activity via the "X" and wait for the created toast.
    await formPage.clickApply();
    await formPage.closeCreateDialog();
    await formPage.waitForAppliedToast(name);

    // Navigate back to the pods list and confirm the new pod is there.
    await headlampPage.navigateTopage('/c/test/pods', /Pods/);
    await expect(page.getByRole('link', { name })).toBeVisible({ timeout: 20000 });
  });
});
