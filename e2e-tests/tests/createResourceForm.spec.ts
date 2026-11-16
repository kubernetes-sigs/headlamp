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

import { expect, Response, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { CreateResourceFormPage } from './createResourceFormPage';
import { HeadlampPage } from './headlampPage';

const execFileAsync = promisify(execFile);

async function kubectl(kubeconfig: string, ...args: string[]) {
  const { stdout } = await execFileAsync('kubectl', [
    '--kubeconfig',
    kubeconfig,
    '--context=kind-test',
    ...args,
  ]);
  return stdout;
}

/** Matches the access review the Pods list sends to decide whether to render the
 *  Create Pod button (CreateResourceButton is wrapped in AuthVisible authVerb="create"). */
function isPodCreateAccessReview(response: Response) {
  const request = response.request();
  if (
    request.method() !== 'POST' ||
    !request.url().includes('/clusters/test/apis/authorization.k8s.io/') ||
    !request.url().endsWith('/selfsubjectaccessreviews')
  ) {
    return false;
  }
  try {
    const attributes = request.postDataJSON()?.spec?.resourceAttributes;
    return attributes?.resource === 'pods' && attributes?.verb === 'create';
  } catch {
    return false;
  }
}

test.describe('CreateResourceForm – Pod', () => {
  test.beforeEach(async ({ page }) => {
    // Listen before navigating so the review can't be missed. A missing review
    // resolves to null, leaving a missing button to fail the test as a real bug.
    const podCreateReview = page
      .waitForResponse(isPodCreateAccessReview)
      .then(response => response.json())
      .catch(() => null);

    const headlampPage = new HeadlampPage(page);
    await headlampPage.navigateToCluster('test', process.env.HEADLAMP_TEST_TOKEN);
    await headlampPage.navigateTopage('/c/test/pods', /Pods/);

    // Skip if the cluster user can't see Pods.
    const content = await page.content();
    test.skip(
      !content.includes('Pods') || !content.includes('href="/c/test/pods'),
      'No pods permission on the test cluster'
    );

    // Listing pods isn't enough: the Create Pod button only renders when creating
    // pods is allowed, so skip when the cluster explicitly denies it.
    const review = await podCreateReview;
    test.skip(
      review?.status?.allowed === false,
      'No permission to create pods on the test cluster'
    );
  });

  test('Apply stays disabled until required fields are filled', async ({ page }) => {
    const formPage = new CreateResourceFormPage(page);
    await formPage.openCreatePodForm();
    await formPage.a11y();

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

    // Each name must be required independently of the other fields.
    await formPage.nameInput().fill('');
    await expect(formPage.applyButton()).toBeDisabled();
    await formPage.nameInput().fill('validation-check');
    await expect(formPage.applyButton()).toBeEnabled();
    await formPage.containerNameInput().fill('');
    await expect(formPage.applyButton()).toBeDisabled();
    await formPage.containerNameInput().fill('nginx');
    await expect(formPage.applyButton()).toBeEnabled();

    // The form was edited, so closing must ask before discarding the changes.
    await formPage.closeAndDiscardChanges();
  });

  test('creates a pod via the form', async ({ page }) => {
    test.setTimeout(60000);
    // Run-unique name so a pod left over from an earlier run or retry can't make
    // Apply an update and satisfy the list assertion without creating anything.
    const name = `e2e-form-pod-${Date.now()}`;
    const tempDirectory = await mkdtemp(join(tmpdir(), 'headlamp-e2e-'));
    const kubeconfig = join(tempDirectory, 'kubeconfig');

    try {
      const { stdout } = await execFileAsync('kind', ['get', 'kubeconfig', '--name', 'test']);
      await writeFile(kubeconfig, stdout);

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

      // Apply closes the activity on its own once the apply succeeds, right
      // as the "Applied" toast shows; wait for both rather than clicking close.
      await formPage.clickApply();
      await formPage.waitForAppliedToast(name);
      await formPage.waitForClosed();

      // Navigate back to the pods list and confirm the new pod is there.
      await headlampPage.navigateTopage('/c/test/pods', /Pods/);
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible({
        timeout: 20000,
      });

      // The list only proves a pod with this name exists; check the form values
      // actually reached the created pod's spec.
      const containers = await kubectl(
        kubeconfig,
        '--namespace=default',
        'get',
        'pod',
        name,
        '-o',
        'jsonpath={range .spec.containers[*]}{.name}={.image}{"\\n"}{end}'
      );
      expect(containers.trim()).toBe('nginx=nginx:1.14.2');
    } finally {
      await kubectl(
        kubeconfig,
        '--namespace=default',
        'delete',
        'pod',
        name,
        '--ignore-not-found=true',
        '--wait=false'
      )
        .catch(() => undefined)
        .finally(() => rm(tempDirectory, { recursive: true, force: true }));
    }
  });
});
