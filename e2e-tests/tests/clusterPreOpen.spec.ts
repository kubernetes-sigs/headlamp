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

test("cluster pre-open preparation gates cluster rendering", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const defineProperty = Object.defineProperty;
    Object.defineProperty = ((
      target: object,
      property: PropertyKey,
      attributes: PropertyDescriptor
    ) => {
      const result = defineProperty(target, property, attributes);
      if (target === window && property === "pluginLib") {
        Object.defineProperty = defineProperty;
        let finishPreparation: () => void;
        const preparation = new Promise<void>((resolve) => {
          finishPreparation = resolve;
        });
        (window as any).__finishClusterPreparation = finishPreparation!;
        (window as any).pluginLib.registerClusterProviderPreOpen(
          async ({
            reportProgress,
          }: {
            reportProgress?: (message: string) => void;
          }) => {
            reportProgress?.("Starting secure cluster proxy");
            await preparation;
          }
        );
      }
      return result;
    }) as typeof Object.defineProperty;
  });

  await page.goto("/c/test");

  await expect(
    page.getByRole("dialog", { name: 'Connecting to "test"' })
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "Starting secure cluster proxy"
  );

  await page.evaluate(() => (window as any).__finishClusterPreparation());

  await expect(
    page.getByRole("dialog", { name: 'Connecting to "test"' })
  ).toHaveCount(0);
  await expect(page.locator("main > *").first()).toBeVisible();
});
