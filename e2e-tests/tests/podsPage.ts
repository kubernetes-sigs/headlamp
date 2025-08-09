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

import { AxeBuilder } from '@axe-core/playwright';
import { expect, Page } from '@playwright/test';

export class podsPage {
  constructor(private page: Page) {}

  async a11y() {
    const axeBuilder = new AxeBuilder({ page: this.page });
    const accessibilityResults = await axeBuilder.analyze();
    expect(accessibilityResults.violations).toStrictEqual([]);
  }

  async navigateToPods() {
    await this.page.click('span:has-text("Workloads")');
    await this.page.waitForLoadState('load');
    await this.page.waitForSelector('span:has-text("Pods")');
    await this.page.waitForLoadState('load');
    await this.page.click('span:has-text("Pods")');

    await this.a11y();

    console.log('Now on the pods page');
  }

  async createPod(name) {
    const yaml = `
apiVersion: v1
kind: Pod
metadata:
  name: ${name}
spec:
  containers:
  - name: nginx
    image: nginx:1.14.2
    ports:
    - containerPort: 80
    `;
    const page = this.page;

    // If the pod already exists, return.
    // This makes it a bit more resilient to flakiness.
    const pageContent = await this.page.content();
    if (pageContent.includes(name)) {
      return;
    }

    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await page.waitForLoadState('load');

    await expect(page.getByText('Use minimal editor')).toBeVisible();
    await page.getByText('Use minimal editor').click();

    await page.waitForLoadState('load');
    await page.fill('textarea[aria-label="yaml Code"]', yaml);

    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Apply', exact: true }).click();

    await page.waitForSelector(`text=Applied ${name}`);

    const podLink = page.getByRole('link', { name: name });
    try {
      await podLink.waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      await page.reload({ waitUntil: 'networkidle' });
    }
    await expect(podLink).toBeVisible();

    console.log(`Created pod ${name}`);
    await this.a11y();
  }

  async deletePod(name) {
    const page = this.page;

    await page.waitForSelector(`a:has-text("${name}")`);

    await expect(page.getByRole('link', { name: name })).toBeVisible();
    await page.getByRole('link', { name: name }).click();

    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).click();

    await page.waitForSelector(`text=Are you sure you want to delete item ${name}?`);

    await expect(page.getByRole('button', { name: 'Yes' })).toBeVisible();
    await page.getByRole('button', { name: 'Yes' }).click();

    await page.waitForSelector(`text=Deleted item ${name}`);

    console.log(`Deleted pod ${name}`);
    await this.a11y();
  }

  async confirmPodCreation(name) {
    const podLink = this.page.locator(`a:has-text("${name}")`);
    try {
      await podLink.waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      await this.page.reload({ waitUntil: 'networkidle' });
    }
    await expect(podLink).toBeVisible();

    console.log(`Pod ${name} is running`);
    await this.a11y();
  }
}
