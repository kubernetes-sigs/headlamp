/// <reference types="node" />
import { expect, Page } from '@playwright/test';

export class HeadlampPage {
  private testURL: string;

  constructor(private page: Page) {
    this.testURL = process.env.HEADLAMP_TEST_URL || '/';
  }

  async authenticate(token?: string) {
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
    // Since we are using multi cluster structure we need to have a full reset navigation
    await this.page.goto(`${this.testURL}`);
    await this.page.waitForLoadState('load');
    await this.page.getByRole('link', { name: name, exact: true }).click();
    await this.page.waitForLoadState('load');
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
    if (title) {
      await this.hasTitleContaining(title);
    }
  }

  async logout() {
    // Click on the account button to open the user menu
    await this.page.click('button[aria-label="Account of current user"]');

    // Wait for the logout option to be visible and click on it
    await this.page.waitForSelector('a.MuiMenuItem-root:has-text("Log out")');
    await this.page.click('a.MuiMenuItem-root:has-text("Log out")');
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
