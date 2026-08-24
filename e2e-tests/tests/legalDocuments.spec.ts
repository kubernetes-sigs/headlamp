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

import { expect, test } from "@playwright/test";

test("opens a manifest-declared legal document from version information", async ({
  page,
}) => {
  await page.goto("/settings/general");
  await expect(
    page.getByRole("heading", { name: "General Settings" })
  ).toBeVisible();
  const assistantDialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "Configure AI Assistant" }),
  });
  if (await assistantDialog.isVisible()) {
    await assistantDialog
      .getByRole("button", { name: "Dismiss configuration prompt" })
      .click();
    await expect(assistantDialog).not.toBeVisible();
  }
  const versionButton = page.getByRole("button", { name: "Version" });
  await expect(versionButton).toBeVisible();
  await page.evaluate(() => {
    window.desktopApi = {
      getLegalDocuments: async () => [{ id: "license", title: "License" }],
      getLegalDocument: async (id: string) => ({
        success: id === "license",
        content: id === "license" ? "Headlamp test license text" : undefined,
      }),
    };
  });
  await expect
    .poll(() =>
      page.evaluate(() => typeof window.desktopApi?.getLegalDocuments)
    )
    .toBe("function");

  await versionButton.click();
  await expect(page.getByRole("dialog", { name: /Headlamp/ })).toBeVisible();
  await page.getByRole("tab", { name: "Legal" }).click();
  await page.getByRole("button", { name: "License" }).click();

  await expect(page.getByRole("dialog", { name: "License" })).toContainText(
    "Headlamp test license text"
  );
});
