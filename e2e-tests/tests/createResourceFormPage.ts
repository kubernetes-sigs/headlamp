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

import { expect, Locator, Page } from '@playwright/test';
import { runA11yScan } from './a11yHelper';

/** Page object for the resource-creation activity that hosts the Form tab
 *  backed by CreateResourceForm. Selectors target the pod flow. */
export class CreateResourceFormPage {
  constructor(private page: Page) {}

  async a11y() {
    await runA11yScan(this.page, expect);
  }

  applyButton(): Locator {
    return this.page.getByRole('button', { name: 'Apply', exact: true });
  }

  formTab(): Locator {
    return this.page.getByRole('tab', { name: 'Form' });
  }

  nameInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Name', exact: true });
  }

  namespaceInput(): Locator {
    // Namespace renders as an Autocomplete combobox. The named lookup covers
    // the case where the label is properly associated; the positional fallback
    // covers the case where it isn't. It's the first combobox in the form.
    return this.page
      .getByRole('combobox', { name: 'Namespace' })
      .or(this.page.getByRole('combobox').first())
      .first();
  }

  containerNameInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Container name' }).first();
  }

  containerImageInput(): Locator {
    return this.page.getByRole('textbox', { name: 'Container image' }).first();
  }

  /** Open the "Create Pod" activity and switch to the Form tab. */
  async openCreatePodForm() {
    const page = this.page;

    if (
      !(await this.formTab()
        .isVisible()
        .catch(() => false))
    ) {
      await expect(page.getByRole('button', { name: 'Create Pod' })).toBeVisible();
      await page.getByRole('button', { name: 'Create Pod' }).click();
      await page.waitForLoadState('load');
    }

    await expect(this.formTab()).toBeVisible();
    await this.formTab().click();
    await expect(this.nameInput()).toBeVisible();
  }

  /** The "X" close icon button on the create-resource activity panel. */
  closeButton(): Locator {
    return this.page.getByRole('button', { name: 'Close' });
  }

  async closeCreateDialog() {
    const closeBtn = this.closeButton();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    }
  }

  async clickApply() {
    const applyBtn = this.applyButton();
    await expect(applyBtn).toBeEnabled();
    await applyBtn.click();
  }

  /** Wait for the "Applied <name>" toast that fires after a successful apply. */
  async waitForAppliedToast(name: string) {
    await this.page.waitForSelector(`text=Applied ${name}`);
  }

  async fillMetadata(opts: { name: string; namespace?: string }) {
    await this.nameInput().fill(opts.name);
    await expect(this.nameInput()).toHaveValue(opts.name);

    if (opts.namespace !== undefined) {
      await this.namespaceInput().fill(opts.namespace);
      await expect(this.namespaceInput()).toHaveValue(opts.namespace);
    }
  }

  async addContainer() {
    const addBtn = this.page.getByRole('button', { name: 'Add container' });
    await expect(addBtn).toBeVisible();
    await addBtn.click();
  }

  /** Fill the first container row's name + image, adding a row if missing. */
  async fillFirstContainer(container: { name: string; image: string }) {
    if (
      !(await this.containerNameInput()
        .isVisible()
        .catch(() => false))
    ) {
      await this.addContainer();
    }
    await this.containerNameInput().fill(container.name);
    await this.containerImageInput().fill(container.image);
  }
}
