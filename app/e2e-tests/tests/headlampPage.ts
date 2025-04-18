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
import { expect, Page } from '@playwright/test';

export class HeadlampPage {
  constructor(private page: Page) {}

  async authenticate() {
    // If we are running in cluster, we need to authenticate
    if (process.env.PLAYWRIGHT_TEST_MODE === 'app' || process.env.PLAYWRIGHT_TEST_MODE === 'web') {
      await this.startFromMainPage();
      return;
    }

    // Go to the authentication page
    const url = process.env.HEADLAMP_TEST_URL;
    await this.page.goto(url || '/');
    await this.page.waitForSelector('h1:has-text("Authentication")');

    // Check to see if already authenticated
    if (await this.page.isVisible('button:has-text("Authenticate")')) {
      const token = process.env.HEADLAMP_TOKEN || '';
      this.hasToken(token);

      // Fill in the token
      await this.page.locator('#token').fill(token);

      // Click on the "Authenticate" button and wait for navigation
      await Promise.all([
        this.page.waitForNavigation(),
        this.page.click('button:has-text("Authenticate")'),
      ]);
    }
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
    const networkTab = this.page.locator('span:has-text("Security")').first();
    expect(await networkTab.textContent()).toBe('Security');
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

  // note: must have minikube started before running these
  async startFromMainPage() {
    await this.page.waitForLoadState('load');

    // note: backend must be running with connected frontend for web mode
    if (process.env.PLAYWRIGHT_TEST_MODE === 'web') {
      await this.page.goto('localhost:3000');
    }

    await this.page.waitForTimeout(5000);
    const currentURL = this.page.url();

    // note: this starts at the cluster select page if the URL does not contain minikube or main then there is more than one cluster
    if (!currentURL.includes('c/minikube') && !currentURL.includes('c/main')) {
      console.log('MORE THAN ONE CLUSTER');
      await this.page.waitForSelector('a:has-text("minikube")');
      await this.page.getByRole('link', { name: 'minikube', exact: true }).click();
      await this.page.waitForLoadState('load');
    }
  }

  async navigateTopage(page: string, title: RegExp) {
    await this.page.goto(page);
    await this.page.waitForLoadState('load');
    await this.hasTitleContaining(title);
  }

  async logout() {
    // Click on the account button to open the user menu
    await this.page.click('button[aria-label="Account of current user"]');

    // Wait for the logout option to be visible and click on it
    await this.page.waitForSelector('a.MuiMenuItem-root:has-text("Log out")');
    await this.page.click('a.MuiMenuItem-root:has-text("Log out")');
    await this.page.waitForLoadState('load');

    // Expects the URL to contain c/main/token
    await this.hasURLContaining(/.*token/);
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
