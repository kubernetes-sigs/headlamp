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
import { runA11yScan } from './a11yHelper';

export class podsPage {
  constructor(private page: Page) {}

  /** Checks the pods page while ignoring tooltip landmark placement. */
  async a11y(): Promise<void> {
    await runA11yScan(this.page, expect, ['[role="tooltip"]']);
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

  async deletePod(name) {
    const page = this.page;

    await page.waitForSelector(`a:has-text("${name}")`);

    await expect(page.getByRole('link', { name: name })).toBeVisible();
    await page.getByRole('link', { name: name }).click();

    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();

    await expect(page.locator('button[aria-label="confirm-button"]')).toBeVisible();
    await page.locator('button[aria-label="confirm-button"]').click();

    await page.waitForSelector(`text=Deleted item ${name}`);

    console.log(`Deleted pod ${name}`);
    await this.a11y();
  }
}
