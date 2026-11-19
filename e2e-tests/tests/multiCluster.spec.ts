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

test.describe('multi-cluster setup', () => {
  let headlampPage: HeadlampPage;
  const testToken = process.env.HEADLAMP_TEST_TOKEN;
  const test2Token = process.env.HEADLAMP_TEST2_TOKEN;

  test.beforeEach(async ({ page }) => {
    headlampPage = new HeadlampPage(page);

    await headlampPage.navigateTopage('/', /Choose a cluster/);
    await expect(page.locator('h1:has-text("Home")')).toBeVisible();
  });

  test('home page lists the configured clusters with valid links', async ({ page }) => {
    await expect(page).toHaveTitle('Choose a cluster - Headlamp');
    await expect(page.locator('th', { hasText: 'Name' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Status' })).toBeVisible();

    for (const clusterName of ['test', 'test2']) {
      const clusterAnchor = page.locator('table tbody tr td a', {
        hasText: new RegExp(`^${clusterName}$`),
      });
      await expect(clusterAnchor).toHaveCount(1);
      await expect(clusterAnchor).toBeVisible();
      await expect(clusterAnchor).toHaveAttribute('href', `/c/${clusterName}/`);

      const clusterRow = clusterAnchor.locator('../../..');

      const clusterStatus = clusterRow.locator('td').nth(2).locator('p');
      await expect(clusterStatus).toBeVisible();
      await expect(clusterStatus).toHaveText(/Active|Plugin/);
    }
  });

  test('cluster version polling pauses in the background and resumes immediately', async ({
    page,
  }) => {
    await page.evaluate(() => localStorage.setItem('recent_clusters', JSON.stringify(['test'])));

    // Each response carries a new gitVersion. Waiting for it to render proves the fetch finished
    // before the clock moves; a poll that fires while a fetch is still in flight reuses that
    // fetch instead of sending a request, which would hide both extra and missing polls.
    let versionRequests = 0;
    await page.route('**/clusters/test/version', async route => {
      versionRequests++;
      await route.fulfill({
        json: { major: '1', minor: '99', gitVersion: `v1.99.${versionRequests}` },
      });
    });
    const expectVersionShown = (count: number) =>
      expect(page.getByText(`v1.99.${count}`, { exact: true })).toBeVisible();

    // Fake timers let the test skip the 10s polling interval instead of waiting it out.
    await page.clock.install();
    await page.reload();
    await expect.poll(() => versionRequests).toBe(1);
    await expectVersionShown(1);

    // While the page is visible, the next polling interval fetches the version again.
    await page.clock.fastForward(11_000);
    await expect.poll(() => versionRequests).toBe(2);
    await expectVersionShown(2);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(11_000);
    // Give a wrongly scheduled background request time to reach the network.
    await page.waitForTimeout(1_000);
    expect(versionRequests).toBe(2);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => versionRequests, { timeout: 2_000 }).toBe(3);
    await expectVersionShown(3);
  });

  test("user should be able to login to 'test' cluster, perform logout and return to cluster selection", async ({
    page,
  }) => {
    const testClusterAnchor = page.locator('table tbody tr td a', {
      hasText: /^test$/,
    });
    await expect(testClusterAnchor).toBeVisible();
    await expect(testClusterAnchor).toHaveAttribute('href', '/c/test/');

    await Promise.all([page.waitForNavigation(), testClusterAnchor.click()]);

    await headlampPage.authenticate(testToken);
    await headlampPage.pageLocatorContent(
      'button:has-text("Our Cluster Chooser button. Cluster: test")',
      'Our Cluster Chooser button. Cluster: test'
    );
    await headlampPage.logout();

    await page.waitForLoadState('load');
    await headlampPage.hasTitleContaining(/Choose a cluster/);
  });

  test("user should be able to login to 'test2' cluster, perform logout and return to cluster selection", async ({
    page,
  }) => {
    const test2ClusterAnchor = page.locator('table tbody tr td a', {
      hasText: /^test2$/,
    });
    await expect(test2ClusterAnchor).toBeVisible();
    await expect(test2ClusterAnchor).toHaveAttribute('href', '/c/test2/');

    await Promise.all([page.waitForNavigation(), test2ClusterAnchor.click()]);

    await headlampPage.authenticate(test2Token);
    await headlampPage.pageLocatorContent(
      'button:has-text("Our Cluster Chooser button. Cluster: test2")',
      'Our Cluster Chooser button. Cluster: test2'
    );
    await headlampPage.logout();

    await page.waitForLoadState('load');
    await headlampPage.hasTitleContaining(/Choose a cluster/);
  });

  // This is commented out because the CI e2e test job loads the plugins
  // Which interferes with the test. It replaces the cluster chooser,
  // so this test does not work.

  // test('react-hotkey to open cluster chooser', async ({ page }) => {
  //   const testClusterAnchor = page.locator('table tbody tr td a', {
  //     hasText: /^test$/,
  //   });
  //   await expect(testClusterAnchor).toBeVisible();
  //   await expect(testClusterAnchor).toHaveAttribute('href', '/c/test/');

  //   await Promise.all([page.waitForNavigation(), testClusterAnchor.click()]);

  //   await headlampPage.authenticate(testToken);
  //   await headlampPage.pageLocatorContent(
  //     'button:has-text("Our Cluster Chooser button. Cluster: test")',
  //     'Our Cluster Chooser button. Cluster: test'
  //   );

  //   await page.keyboard.press('Control+Shift+L');

  //   const chooseClusterLabel = page.getByLabel(/^Choose cluster$/);
  //   await expect(chooseClusterLabel).toBeVisible();

  //   const clusterNameInput = page.getByPlaceholder(/^Name$/);
  //   await expect(clusterNameInput).toBeVisible();
  //   await expect(clusterNameInput).toHaveValue(/^$/);
  //   await expect(clusterNameInput).toBeFocused();
  // });
});
