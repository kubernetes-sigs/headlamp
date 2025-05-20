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

export class NamespacesPage {
  constructor(private page: Page) {}

  async a11y() {
    const axeBuilder = new AxeBuilder({ page: this.page });
    const accessibilityResults = await axeBuilder.analyze();
    expect(accessibilityResults.violations).toStrictEqual([]);
  }

  async navigateToNamespaces() {
    await this.page.click('a span:has-text("Cluster")');
    await this.page.waitForLoadState('load');
    await this.page.waitForSelector('span:has-text("Namespaces")');
    await this.page.click('span:has-text("Namespaces")');
    await this.page.waitForLoadState('load');
  }

  async createNamespace(name) {
    const yaml = `
    apiVersion: v1
    kind: Namespace
    metadata:
      name: ${name}
    `;
    const page = this.page;

    await page.waitForSelector('span:has-text("Namespaces")');
    await page.click('span:has-text("Namespaces")');
    await page.waitForLoadState('load');

    // If the namespace already exists, return.
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

    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
    await page.getByRole('button', { name: 'Apply' }).click();

    await page.waitForSelector(`text=Applied ${name}`);

    await this.a11y();
  }

  async deleteNamespace(name) {
    const page = this.page;
    await page.waitForSelector('span:has-text("Namespaces")');
    await page.click('span:has-text("Namespaces")');
    await page.waitForLoadState('load');

    const namespaceLink = page.locator(`a:has-text("${name}")`);
    try {
      await namespaceLink.waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      await this.page.reload({ waitUntil: 'networkidle' });
    }
    await expect(namespaceLink).toBeVisible();

    await namespaceLink.click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.waitForSelector(`text=Are you sure you want to delete item ${name}?`);
    await page.click('button:has-text("Yes")');
    await page.waitForSelector(`text=Deleted item ${name}`);

    await this.a11y();
  }
}
