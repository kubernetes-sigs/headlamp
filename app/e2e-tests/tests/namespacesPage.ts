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

import { expect, Page } from '@playwright/test';

export class NamespacesPage {
  constructor(private page: Page) {}

  async navigateToNamespaces() {
    await this.page.waitForLoadState('load');
    await this.page.waitForSelector('span:has-text("Cluster")');
    await this.page.getByText('Cluster', { exact: true }).click();
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
      throw new Error(`Test failed: Namespace "${name}" already exists.`);
    }

    await page.getByText('Create', { exact: true }).click();

    await page.waitForLoadState('load');

    // this is a workaround for the checked input not having any unique identifier
    const checkedSpan = await page.$('span.Mui-checked');

    if (!checkedSpan) {
      await expect(page.getByText('Use minimal editor')).toBeVisible();

      await page.getByText('Use minimal editor').click();
    }

    await page.waitForLoadState('load');

    await page.waitForSelector('textarea[aria-label="yaml Code"]', { state: 'visible' });

    await expect(page.getByRole('textbox', { name: 'yaml Code' })).toBeVisible();
    await page.fill('textarea[aria-label="yaml Code"]', yaml);

    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
    await page.getByRole('button', { name: 'Apply' }).click();

    await page.waitForSelector(`a:has-text("${name}")`);
    await expect(page.locator(`a:has-text("${name}")`)).toBeVisible();
  }

  async deleteNamespace(name) {
    const page = this.page;
    await page.click('span:has-text("Namespaces")');
    await page.waitForLoadState('load');

    await page.waitForSelector(`text=${name}`);
    await page.click(`a:has-text("${name}")`);

    await page.waitForSelector('button[aria-label="Delete"]');
    await page.click('button[aria-label="Delete"]');

    await page.waitForLoadState('load');

    await page.waitForSelector('button:has-text("Yes")');

    await page.waitForLoadState('load');

    await page.click('button:has-text("Yes")');

    await page.waitForSelector('h1:has-text("Namespaces")');
    await page.waitForSelector('td:has-text("Terminating")');

    await expect(page.locator(`a:has-text("${name}")`)).toBeHidden();
  }
}
