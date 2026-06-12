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

/**
 * Page object for the Create / Apply activity opened by the global Create
 * button. Drives the data-driven resource form rendered by
 * `CreateResourceForm` (currently exposed for the Pod resource type).
 */
export class CreateResourceFormPage {
  constructor(private page: Page) {}

  async a11y() {
    const axeBuilder = new AxeBuilder({ page: this.page });
    const accessibilityResults = await axeBuilder.analyze();
    expect(accessibilityResults.violations).toStrictEqual([]);
  }

  /** Open the Create / Apply activity from the global Create button. */
  async openCreateActivity() {
    const page = this.page;
    await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForLoadState('load');

    // The editor opens on the "Editor" (YAML) tab by default; switch to the
    // "Form" tab so the data-driven form (and resource-type picker) become
    // the visible tab panel.
    await page.getByRole('tab', { name: 'Form', exact: true }).click();

    // The resource-type picker is rendered immediately; the data-driven
    // form is only rendered once a resource type is selected.
    await expect(page.getByLabel('Resource Type', { exact: true })).toBeVisible();
  }

  /** Pick a resource type (e.g. "Pod") in the resource picker dropdown. */
  async selectResourceType(resourceType: string) {
    const page = this.page;
    await page.getByLabel('Resource Type', { exact: true }).click();
    await page.getByRole('option', { name: resourceType, exact: true }).click();

    // The form panel becomes visible once the resource type is selected.
    await expect(this.page.getByLabel('Resource form')).toBeVisible();
  }

  /**
   * Create a Pod via the form (no YAML typing). Fills metadata.name and the
   * first container row's name + image, then clicks Apply.
   */
  async createPodViaForm(opts: { name: string; containerName: string; image: string }) {
    const { name, containerName, image } = opts;
    const page = this.page;

    const form = page.getByLabel('Resource form');

    // Pod name lives in the Metadata fieldset. The label is rendered as
    // "Name *" because the field is required, so use a regex rather than
    // an exact string. Scope to the Metadata group so it can't accidentally
    // match a container row's Name input.
    const metadata = form.getByRole('group', { name: 'Metadata' });
    await metadata.getByLabel(/^Name\s*\*?$/).fill(name);

    // Default container row is added automatically when Pod is selected
    // (Pod.getBaseObject seeds spec.containers). Fill its name + image.
    await form.getByLabel('Container name', { exact: true }).fill(containerName);
    await form.getByLabel('Container image', { exact: true }).fill(image);

    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Apply', exact: true }).click();

    await page.waitForSelector(`text=Applied ${name}`);
  }
}
