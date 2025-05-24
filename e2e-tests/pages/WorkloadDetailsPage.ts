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

// e2e-tests/pages/WorkloadDetailsPage.ts
import { expect, Locator, Page } from '@playwright/test';

export class WorkloadDetailsPage {
  readonly page: Page;
  readonly followSwitchInput: Locator;
  readonly followSwitchLabel: Locator;
  readonly terminalViewport: Locator;
  readonly terminalRows: Locator;

  constructor(page: Page) {
    this.page = page;
    // Locators for logs elements
    this.followSwitchLabel = page.locator('label:has-text("Follow")');
    this.followSwitchInput = this.followSwitchLabel.locator('input[type="checkbox"]');
    this.terminalViewport = page.locator('.xterm-viewport');
    this.terminalRows = page.locator('.xterm-rows');
  }

  async openLogsViewer(): Promise<boolean> {
    const logsButtonByName = this.page.getByRole('button', { name: /show logs/i });
    const logsIconButtonByAria = this.page.locator('button[aria-label*="logs" i]');
    const otherLogSelectors = [
      'button:has-text("Logs")',
      'button:has(svg):has-text("Logs")',
      'button[title*="log" i]',
      'button:has([data-testid*="log"])',
    ];

    if (await logsButtonByName.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logsButtonByName.click();
    } else if (await logsIconButtonByAria.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logsIconButtonByAria.click();
    } else {
      for (const selector of otherLogSelectors) {
        const button = this.page.locator(selector).first();
        if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
          await button.click();
          break;
        }
      }
    }

    // Wait for the logs dialog to appear
    try {
      await Promise.race([
        this.page.locator('div[role="dialog"]').waitFor({ timeout: 10000 }),
        this.page.locator('.MuiDialog-root').waitFor({ timeout: 10000 }),
        this.page.locator('.logs-viewer').waitFor({ timeout: 10000 }),
      ]);
      return true;
    } catch (e) {
      console.warn('Failed to detect logs dialog:', e);
      return false;
    }
  }

  async waitForLogsToLoad() {
    try {
      await Promise.race([
        this.terminalRows.waitFor({ timeout: 15000 }),
        this.page.locator('.xterm').waitFor({ timeout: 15000 }), // xterm-rows is more specific
        this.page.getByText(/Fetching logs|Attempting to follow|logs/i).waitFor({ timeout: 15000 }),
      ]);
    } catch (e) {
      console.warn('Failed to detect logs content after opening dialog:', e);
      // Don't fail the setup, let individual tests check content
    }
  }

  async ensureFollowIs(state: 'ON' | 'OFF') {
    await expect(this.followSwitchInput).toBeVisible({ timeout: 10000 });
    const isChecked = await this.followSwitchInput.isChecked();
    if (state === 'ON' && !isChecked) {
      await this.followSwitchLabel.click();
      await expect(this.followSwitchInput).toBeChecked({ timeout: 5000 });
    } else if (state === 'OFF' && isChecked) {
      await this.followSwitchLabel.click();
      await expect(this.followSwitchInput).not.toBeChecked({ timeout: 5000 });
    }
  }

  async expectLogMessage(regex: RegExp, timeout = 5000): Promise<boolean> {
    const messages = [
      this.page.getByText(regex),
      this.terminalRows.getByText(regex), // if it's inside xterm
    ];
    for (const messageLocator of messages) {
      if (
        await messageLocator
          .first()
          .isVisible({ timeout })
          .catch(() => false)
      ) {
        return true;
      }
    }
    return false;
  }

  async expectTerminalContent(timeout = 5000): Promise<boolean> {
    const logsMessages = [
      this.page.getByText(/Attempting to follow logs/i), // Specific message
      this.terminalRows.locator('div').first(), // Any row div in xterm
    ];

    for (const selector of logsMessages) {
      if (await selector.isVisible({ timeout }).catch(() => false)) {
        return true;
      }
    }
    return false;
  }

  async scrollTerminal(direction: 'up' | 'down' | 'bottom') {
    await expect(this.terminalViewport).toBeVisible({ timeout: 10000 });
    await this.terminalViewport.hover();
    if (direction === 'up') {
      await this.page.mouse.wheel(0, -200);
    } else if (direction === 'down') {
      await this.page.mouse.wheel(0, 200);
    } else if (direction === 'bottom') {
      await this.terminalViewport.evaluate(el => (el.scrollTop = el.scrollHeight));
    }
    await this.page.waitForTimeout(500); // Wait for scroll to process
  }

  async getScrollTop(): Promise<number> {
    await expect(this.terminalViewport).toBeVisible({ timeout: 10000 });
    return this.terminalViewport.evaluate(el => el.scrollTop);
  }

  async isTerminalScrollable(): Promise<boolean> {
    await expect(this.terminalViewport).toBeVisible({ timeout: 10000 });
    return this.terminalViewport.evaluate(el => el.scrollHeight > el.clientHeight);
  }

  async isAtBottomOfTerminal(margin = 5): Promise<boolean> {
    await expect(this.terminalViewport).toBeVisible({ timeout: 10000 });
    return this.terminalViewport.evaluate(el => {
      return el.scrollTop + el.clientHeight + margin >= el.scrollHeight;
    });
  }
}
