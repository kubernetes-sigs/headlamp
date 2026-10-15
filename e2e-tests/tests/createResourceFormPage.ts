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
  private assistantPromptHandled = false;

  constructor(private page: Page) {}

  /** The AI Assistant plugin's "Configure AI Assistant" prompt can pop up at any
   *  time and cover the activity title bar; dismiss it whenever it blocks an action. */
  private async dismissAssistantPromptWhenShown() {
    if (this.assistantPromptHandled) {
      return;
    }
    this.assistantPromptHandled = true;
    const prompt = this.page.getByRole('dialog').filter({
      has: this.page.getByRole('heading', { name: 'Configure AI Assistant' }),
    });
    await this.page.addLocatorHandler(prompt, async () => {
      await prompt.getByRole('button', { name: 'Dismiss configuration prompt' }).click();
    });
  }

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
    return this.page.getByRole('tabpanel', { name: 'Form' }).getByRole('combobox').first();
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
    await this.dismissAssistantPromptWhenShown();

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

  /** The "Create Pod" activity panel, labelled by its title. */
  activityPanel(): Locator {
    return this.page.getByRole('complementary', { name: 'Create Pod', exact: true });
  }

  /** The title-bar "X" of the activity. Matched by its `title` attribute so the
   *  editor footer "Close" button and the taskbar "Close" button are excluded. */
  closeButton(): Locator {
    return this.activityPanel().getByTitle('Close', { exact: true });
  }

  /** The "unsaved changes" confirmation shown when closing an edited form. */
  discardChangesDialog(): Locator {
    return this.page.getByRole('dialog').filter({
      hasText: 'You have unsaved changes in the editor. Closing will discard them.',
    });
  }

  /** Close the edited activity via the title-bar "X" and confirm discarding. */
  async closeAndDiscardChanges() {
    await this.closeButton().click();
    await expect(this.discardChangesDialog()).toBeVisible();
    await this.discardChangesDialog().getByRole('button', { name: 'Yes', exact: true }).click();
    await this.waitForClosed();
  }

  async waitForClosed() {
    await expect(this.activityPanel()).toBeHidden();
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
