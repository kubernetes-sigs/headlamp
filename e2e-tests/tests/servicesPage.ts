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

export class ServicesPage {
  constructor(private page: Page) {}

  async navigateToServices() {
    // Click on the "Network" button
    await this.page.click('span:has-text("Network")');
    // Wait for the page to load
    await this.page.waitForLoadState('load');
  }

  async clickOnServicesSection() {
    // Wait for the Services tab to load
    await this.page.waitForSelector('span:has-text("Services")');
    // Click on the "Services" section
    await this.page.click('span:has-text("Services")');
    // Wait for the page to load
    await this.page.waitForLoadState('load');
  }

  async goToParticularService(serviceName: string) {
    // Click on the particular service
    await this.page.click(`a:has-text("${serviceName}")`);
    // Wait for the page to load
    await this.page.waitForLoadState('load');
    // Wait for section to load
    await this.page.waitForSelector('h1:has-text("Service")');
  }
}
