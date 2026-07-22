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

/// <reference types="node" />
import { AxeBuilder } from '@axe-core/playwright';
import { expect, Page } from '@playwright/test';

export class HeadlampPage {
  private testURL: string;

  constructor(private page: Page) {
    this.testURL = process.env.HEADLAMP_TEST_URL || '/';
  }

  /**
   * Run an accessibility audit against the current Playwright page using AxeBuilder.
   *
   * Summary:
   * - Executes axe-core analysis on this.page.
   * - If any violations are found, creates an output directory
   *   (<GITHUB_WORKSPACE> or cwd)/a11y-artifacts and saves:
   *   - a full-page screenshot: a11y-<timestamp>.png
   *   - violations JSON: a11y-<timestamp>-violations.json
   *   - page HTML: a11y-<timestamp>.html
   * - Logs the saved artifact paths and the violations to stderr.
   * - Fails the test by asserting that there are no accessibility violations.
   *
   * Notes:
   * - Timestamp uses ISO format with ":" and "." replaced by "-" to make filenames safe.
   * - The workspace path is resolved from process.env.GITHUB_WORKSPACE or falling back to process.cwd().
   * - This method performs file I/O and may throw if the runner/user has no write permissions.
   *
   * How to view the screenshot from a GitHub Actions run:
   *
   * After the workflow completes, open the workflow run in the GitHub Actions UI,
   *    download the "a11y-artifacts" artifact, extract it, and open the PNG file locally.
   *
   * @remarks
   * - Intended to be used inside an e2e test/page object where `this.page` is a Playwright Page.
   * - The final expect will cause the test to fail when violations are present, making CI fail fast.
   *
   * @returns Promise<void> resolving when analysis, artifact creation, and the assertion complete.
   */
  async a11y() {
    const axeBuilder = new AxeBuilder({ page: this.page });
    const accessibilityResults = await axeBuilder.analyze();

    if (accessibilityResults.violations && accessibilityResults.violations.length > 0) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
      const { join } = await import('path');
      const fs = await import('fs/promises');

      const outDir = join(workspace, 'a11y-artifacts');
      await fs.mkdir(outDir, { recursive: true });

      const screenshotPath = join(outDir, `a11y-${timestamp}.png`);
      await this.page.screenshot({ path: screenshotPath, fullPage: true });

      const violationsPath = join(outDir, `a11y-${timestamp}-violations.json`);
      await fs.writeFile(
        violationsPath,
        JSON.stringify(accessibilityResults.violations, null, 2),
        'utf8'
      );

      const html = await this.page.content();
      const htmlPath = join(outDir, `a11y-${timestamp}.html`);
      await fs.writeFile(htmlPath, html, 'utf8');

      console.error(`Accessibility violations saved to: ${violationsPath}`);
      console.error(`Screenshot saved to: ${screenshotPath}`);
      console.error(`Page HTML saved to: ${htmlPath}`);
      console.error(
        'Accessibility violations:',
        JSON.stringify(accessibilityResults.violations, null, 2)
      );
    }

    expect(accessibilityResults.violations).toStrictEqual([]);
  }

  async authenticate(token?: string) {
    await this.page.waitForSelector('h1:has-text("Authentication")');

    // Check to see if already authenticated
    if (await this.page.isVisible('button:has-text("Authenticate")')) {
      this.hasToken(token || '');

      // Fill in the token
      await this.page.locator('#token').fill(token || '');

      // Click on the "Authenticate" button and wait for navigation
      await Promise.all([
        this.page.waitForNavigation(),
        this.page.click('button:has-text("Authenticate")'),
      ]);
    }
  }

  async navigateToCluster(name: string, token?: string) {
    await this.navigateTopage(`/c/${name}`);
    await this.authenticate(token);
  }

  async hasURLContaining(pattern: RegExp) {
    await expect(this.page).toHaveURL(pattern);
  }

  async hasTitleContaining(pattern: RegExp) {
    await expect(this.page).toHaveTitle(pattern);
  }

  async hasToken(token: string) {
    expect(token).not.toBe('');
  }

  async hasNetworkTab() {
    const networkTab = this.page.locator('span:has-text("Network")').first();
    expect(await networkTab.textContent()).toBe('Network');
  }

  async hasSecurityTab() {
    const securityTab = this.page.locator('span:has-text("Security")').first();
    expect(await securityTab.textContent()).toBe('Security');
  }

  async hasGlobalSearch() {
    const globalSearch = this.page.getByPlaceholder(/^Search$/);

    await expect(globalSearch).toBeVisible();
    await expect(globalSearch).toHaveValue(/^$/);
    await expect(globalSearch).not.toBeFocused();

    return globalSearch;
  }

  async checkPageContent(text: string) {
    await this.page.waitForSelector(`:has-text("${text}")`);
    const pageContent = await this.page.content();
    expect(pageContent).toContain(text);
  }

  async pageLocatorContent(locator: string, text: string) {
    const pageContent = this.page.locator(locator).textContent();
    expect(await pageContent).toContain(text);
  }

  async navigateTopage(path: string, title?: RegExp) {
    await this.page.goto(`${this.testURL}${path}`, {
      waitUntil: 'networkidle',
    });
    await this.page.waitForLoadState('load');
    if (title) {
      await this.hasTitleContaining(title);
    }
  }

  async logout() {
    // Click on the account button to open the user menu
    await this.page.click('button[aria-label="Account of current user"]');

    // Wait for the logout option to be visible and click on it
    await this.page.waitForSelector('.MuiMenuItem-root:has-text("Log out")');
    await this.page.click('.MuiMenuItem-root:has-text("Log out")');
    await this.page.waitForLoadState('load');

    // Expects the URL to contain c/test/token
    // await this.hasURLContaining(/.*token/);
  }

  async tableHasHeaders(tableSelector: string, expectedHeaders: string[]) {
    // Get all table headers
    const headers = await this.page.$$eval(`${tableSelector} th`, ths =>
      ths.map(th => {
        if (th && th.textContent) {
          // Table header also contains a number, displayed during multi-sorting, so we remove it
          return th.textContent.trim().replace('0', '');
        }
      })
    );

    // Check if all expected headers are present in the table
    for (const header of expectedHeaders) {
      if (!headers.includes(header)) {
        throw new Error(`Table does not contain header: ${header}`);
      }
    }
  }

  async clickOnPlugin(pluginName: string) {
    await this.page.click(`a:has-text("${pluginName}")`);
    await this.page.waitForLoadState('load');
  }

  async checkRows() {
    // Get value of rows per page
    const rowsDisplayed1 = await this.getRowsDisplayed();

    // Click on the next page button
    const nextPageButton = this.page.getByRole('button', {
      name: 'Go to next page',
    });
    await nextPageButton.click();

    // Get value of rows per page after clicking next page button
    const rowsDisplayed2 = await this.getRowsDisplayed();

    // Check if the rows displayed are different
    expect(rowsDisplayed1).not.toBe(rowsDisplayed2);
  }

  async getRowsDisplayed() {
    const paginationCaption = this.page.locator("span:has-text(' of ')");
    const captionText = await paginationCaption.textContent();
    return captionText;
  }
}
