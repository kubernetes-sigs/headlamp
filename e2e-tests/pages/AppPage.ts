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

// e2e-tests/pages/AppPage.ts
import { expect, Page } from '@playwright/test';

export class AppPage {
  readonly page: Page;
  readonly baseURL: string;

  constructor(page: Page) {
    this.page = page;
    this.baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
  }

  async login() {
    try {
      await this.page.goto(this.baseURL, { timeout: 30000 });
      console.log(`Successfully navigated to ${this.baseURL}`);
      await this.page.waitForSelector('body', { timeout: 10000 });
      // Optional: If login is required, implement it here
    } catch (error) {
      console.error(`Failed to navigate to ${this.baseURL}:`, error);
      // Let tests fail naturally if login fails critically
      throw new Error(`Login failed: ${error}`);
    }
  }

  async navigateToWorkloads() {
    console.log(
      `[${new Date().toISOString()}] In navigateToWorkloads: Current URL before nav: ${this.page.url()}`
    );
    await this.page.screenshot({ path: `debug_before_nav_to_workloads_${Date.now()}.png` });

    // Try a more robust selector, or one you verify with Playwright Inspector
    const workloadsLink = this.page.getByRole('link', { name: 'Workloads', exact: true });
    // Alternative: const workloadsLink = this.page.locator('nav').getByText('Workloads', { exact: true }); // If it's in a nav
    // Alternative: const workloadsLink = this.page.locator('a[href*="/workloads"]').filter({ hasText: 'Workloads' });

    const workloadsHeading = this.page.getByRole('heading', { name: 'Workloads' });

    try {
      if (this.page.url().includes('/workloads')) {
        console.log(`[${new Date().toISOString()}] Already on a workloads-related page.`);
        if (await workloadsHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log(`[${new Date().toISOString()}] Workloads heading visible.`);
          await expect(workloadsHeading).toBeVisible({ timeout: 10000 });
          return;
        }
      }

      console.log(
        `[${new Date().toISOString()}] Attempting to make 'Workloads' link visible and click.`
      );
      await expect(workloadsLink, 'Workloads link should be present').toBeVisible({
        timeout: 20000,
      }); // Longer wait for link
      console.log(`[${new Date().toISOString()}] 'Workloads' link is visible. Clicking now.`);
      await workloadsLink.click({ timeout: 5000 });
      console.log(`[${new Date().toISOString()}] Clicked 'Workloads' link. Waiting for heading.`);

      await expect(
        workloadsHeading,
        'Workloads page heading should be visible after click'
      ).toBeVisible({ timeout: 25000 });
      console.log(`[${new Date().toISOString()}] 'Workloads' heading visible after click.`);
      await this.page.screenshot({ path: `debug_after_workloads_click_${Date.now()}.png` });
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error clicking 'Workloads' link or finding heading:`,
        error
      );
      await this.page.screenshot({ path: `debug_error_nav_to_workloads_${Date.now()}.png` });
      console.log(
        `[${new Date().toISOString()}] Attempting direct navigation to /workloads as fallback.`
      );
      try {
        await this.page.goto(`${this.baseURL}/workloads`, {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        });
        console.log(`[${new Date().toISOString()}] Successfully navigated directly to /workloads.`);
        await expect(
          workloadsHeading,
          'Workloads page heading should be visible after direct goto'
        ).toBeVisible({ timeout: 25000 });
        console.log(`[${new Date().toISOString()}] 'Workloads' heading visible after direct goto.`);
        await this.page.screenshot({ path: `debug_after_direct_goto_workloads_${Date.now()}.png` });
      } catch (fallbackError) {
        console.error(
          `[${new Date().toISOString()}] Error during direct navigation to /workloads:`,
          fallbackError
        );
        await this.page.screenshot({ path: `debug_error_direct_goto_workloads_${Date.now()}.png` });
        throw fallbackError;
      }
    }
  }

  async findAndNavigateToFirstWorkloadDetails(): Promise<boolean> {
    const workloadTypes = [
      '.MuiDataGrid-row:has-text("ReplicaSet")',
      '.MuiDataGrid-row:has-text("Deployment")',
      '.MuiDataGrid-row:has-text("DaemonSet")',
      '.MuiDataGrid-row:has-text("Pod")',
    ];

    for (const selector of workloadTypes) {
      const row = this.page.locator(selector).first();
      if (await row.isVisible({ timeout: 5000 }).catch(() => false)) {
        try {
          await row.getByRole('link').first().click();
          await expect(this.page.locator('h1')).toBeVisible({ timeout: 15000 }); // Wait for details page
          return true;
        } catch (e) {
          console.warn(`Failed to click workload type ${selector}:`, e);
        }
      }
    }

    // Fallback to any workload row
    const anyWorkloadRow = this.page.locator('.MuiDataGrid-row').first();
    if (await anyWorkloadRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      try {
        await anyWorkloadRow.getByRole('link').first().click();
        await expect(this.page.locator('h1')).toBeVisible({ timeout: 15000 }); // Wait for details page
        return true;
      } catch (e) {
        console.warn('Failed to click any workload row:', e);
      }
    }
    return false;
  }
}
