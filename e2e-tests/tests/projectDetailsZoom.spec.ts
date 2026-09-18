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
import { HeadlampPage } from "./headlampPage";

test("project tabs and resources remain usable at 200% text zoom", async ({
  page,
}, testInfo) => {
  const token = process.env.HEADLAMP_TEST_TOKEN;
  if (!token) {
    test.skip(
      true,
      "HEADLAMP_TEST_TOKEN is not set; cannot create the project fixture."
    );
  }

  const fixtureId = `${testInfo.workerIndex}-${
    testInfo.retry
  }-${Date.now().toString(36)}`;
  const namespaceName = `project-zoom-${fixtureId}`;
  const projectName = namespaceName;
  const configMapName = `zoom-config-${fixtureId}`;
  const headers = { Authorization: `Bearer ${token}` };
  const namespaceURL = `/clusters/test/api/v1/namespaces/${namespaceName}`;
  const createNamespace = await page.request.post(
    "/clusters/test/api/v1/namespaces",
    {
      headers,
      data: {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: namespaceName,
          labels: { "headlamp.dev/project-id": projectName },
        },
      },
    }
  );
  expect(createNamespace.status(), await createNamespace.text()).toBe(201);

  try {
    const createConfigMap = await page.request.post(
      `/clusters/test/api/v1/namespaces/${namespaceName}/configmaps`,
      {
        headers,
        data: {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: { name: configMapName, namespace: namespaceName },
          data: { purpose: "project zoom e2e coverage" },
        },
      }
    );
    expect(createConfigMap.status(), await createConfigMap.text()).toBe(201);

    const headlampPage = new HeadlampPage(page);
    await headlampPage.navigateToCluster("test", token);
    await headlampPage.navigateTopage(`/project/${projectName}`);

    const tabs = page.getByRole("tablist");
    await expect(tabs).toBeVisible({ timeout: 30_000 });

    await page.setViewportSize({ width: 640, height: 384 });
    await page.addStyleTag({ content: ":root { font-size: 200%; }" });

    const tabScroller = tabs.locator("..");
    await expect(tabScroller).toHaveClass(/MuiTabs-scrollableX/);
    await expect
      .poll(() =>
        tabScroller.evaluate(
          (element) => element.scrollWidth > element.clientWidth
        )
      )
      .toBe(true);
    const defaultTabs = tabs.getByRole("tab");
    for (let index = 0; index < 4; index += 1) {
      await expect(defaultTabs.nth(index)).toBeAttached();
    }

    await defaultTabs.nth(1).click();
    await page.getByRole("button", { name: /Configuration/ }).click();
    const configMapCell = page.getByRole("cell", { name: configMapName });
    await configMapCell.scrollIntoViewIfNeeded();
    await expect(configMapCell).toBeInViewport();
  } finally {
    const deleteNamespace = await page.request.delete(namespaceURL, {
      headers,
    });
    expect([200, 202]).toContain(deleteNamespace.status());
  }
});
