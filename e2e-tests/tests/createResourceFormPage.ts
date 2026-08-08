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

export class CreateResourceFormPage {
  constructor(private page: Page) {}

  async a11y() {
    const axeBuilder = new AxeBuilder({ page: this.page });
    const accessibilityResults = await axeBuilder.analyze();
    expect(accessibilityResults.violations).toStrictEqual([]);
  }

  async createPodViaForm(name: string) {
    const page = this.page;

    // If the pod already exists, return.
    const pageContent = await page.content();
    if (pageContent.includes(name)) {
      return;
    }

    // Click the pods page Create button (icon button with aria-label "Create Pod")
    await expect(page.getByRole('button', { name: 'Create Pod' })).toBeVisible();
    await page.getByRole('button', { name: 'Create Pod' }).click();
    await page.waitForLoadState('load');

    // Switch to the Form tab
    await expect(page.getByRole('tab', { name: 'Form' })).toBeVisible();
    await page.getByRole('tab', { name: 'Form' }).click();

    // Fill in the pod name
    const nameInput = page.getByRole('textbox', { name: 'Name', exact: true });
    await expect(nameInput).toBeVisible();
    await nameInput.fill(name);

    // Fill in the namespace
    const namespaceInput = page.getByRole('combobox', { name: 'Namespace' });
    await expect(namespaceInput).toBeVisible();
    await namespaceInput.fill('default');

    // Fill in the container name
    const containerNameInput = page.getByRole('textbox', { name: 'Container name' });
    await expect(containerNameInput).toBeVisible();
    await containerNameInput.fill('nginx');

    // Fill in the container image
    const imageInput = page.getByRole('textbox', { name: 'Container image' });
    await expect(imageInput).toBeVisible();
    await imageInput.fill('nginx:1.14.2');

    // Click Apply
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Apply', exact: true }).click();

    await page.waitForSelector(`text=Applied ${name}`);

    // Verify the pod link appears in the list
    const podLink = page.getByRole('link', { name: name });
    try {
      await podLink.waitFor({ state: 'visible', timeout: 10000 });
    } catch (error) {
      await page.reload({ waitUntil: 'networkidle' });
    }
    await expect(podLink).toBeVisible();

    console.log(`Created pod ${name} via form`);
    await this.a11y();
  }

  async deletePod(name: string) {
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
}
