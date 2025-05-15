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

import { Page } from '@playwright/test';

export class SecurityPage {
  constructor(private page: Page) {}

  async navigateToSecurity() {
    // Click on the "Security" button
    await this.page.click('span:has-text("Security")');
    // Wait for the page to load
    await this.page.waitForLoadState('load');
  }

  async clickOnServiceAccountsSection() {
    // Wait for the Service Accounts tab to load
    await this.page.waitForSelector('span:has-text("Service Accounts")');
    // Click on the "Service Accounts" section
    await this.page.click('span:has-text("Service Accounts")');
    // Wait for the page to load
    await this.page.waitForLoadState('load');
  }

  async clickOnRolesSection() {
    // Wait for the Service Accounts tab to load
    await this.page.waitForSelector('span:has-text("Roles")');
    // Click on the "Service Accounts" section
    await this.page.click('span:has-text("Roles")');
    // Wait for the page to load
    await this.page.waitForLoadState('load');
  }
}
