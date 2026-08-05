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
import YAML from 'yaml';
import { runA11yScan } from './a11yHelper';

/** Indicates whether an e2e test created a namespace or reused an existing one. */
export type NamespaceSetupStatus = 'created' | 'reused';

export class NamespacesPage {
  constructor(private page: Page) {}

  async a11y() {
    await runA11yScan(this.page, expect);
  }

  async navigateToNamespaces() {
    await this.page.click('a span:has-text("Cluster")');
    await this.page.waitForLoadState('load');
    await this.page.waitForSelector('span:has-text("Namespaces")');
    await this.page.click('span:has-text("Namespaces")');
    await this.page.waitForLoadState('load');
  }

  /**
   * Creates a namespace or validates the requested labels on an existing namespace.
   *
   * @param name - Namespace name to create or reuse.
   * @param labels - Labels required when creating or reusing the namespace.
   * @returns Whether the namespace was created by this call or reused.
   */
  async createNamespace(
    name: string,
    labels?: Record<string, string>
  ): Promise<NamespaceSetupStatus> {
    const yaml = YAML.stringify({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name, ...(labels ? { labels } : {}) },
    });
    const page = this.page;

    await page.waitForSelector('span:has-text("Namespaces")');
    await page.click('span:has-text("Namespaces")');
    await page.waitForLoadState('load');

    const namespaceLink = page.getByRole('link', { name, exact: true });
    if ((await namespaceLink.count()) > 0) {
      const namespaceRow = namespaceLink.locator('xpath=ancestor::tr');
      for (const [key, value] of Object.entries(labels ?? {})) {
        await expect(namespaceRow).toContainText(`${key}: ${value}`);
      }
      return 'reused';
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
    return 'created';
  }

  async deleteNamespace(name: string) {
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
    await expect(page.getByRole('dialog')).toBeVisible();
    const confirmButton = page.locator('button[aria-label="confirm-button"]');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();
    await page.waitForSelector(`text=Deleted item ${name}`);

    await this.a11y();
  }
}
