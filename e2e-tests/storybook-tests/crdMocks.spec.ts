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

import { expect, test } from '@playwright/test';

const crdV1Url = 'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions';
const crdV1beta1Url =
  'http://localhost:4466/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions';

test('Storybook mocks custom resource definition discovery', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/iframe.html?id=common-actionbutton--basic&viewMode=story');

  await expect
    .poll(
      () =>
        page.evaluate(async url => {
          try {
            return (await fetch(url)).status;
          } catch {
            return null;
          }
        }, crdV1Url),
      { timeout: 30_000 }
    )
    .toBe(200);

  const result = await page.evaluate(
    async ({ v1Url, v1beta1Url }) => {
      const response = await fetch(v1Url);
      const v1beta1Response = await fetch(v1beta1Url);

      return {
        status: response.status,
        body: await response.json(),
        v1beta1Status: v1beta1Response.status,
      };
    },
    { v1Url: crdV1Url, v1beta1Url: crdV1beta1Url }
  );

  expect(result).toEqual({
    status: 200,
    body: {
      kind: 'CustomResourceDefinitionList',
      apiVersion: 'apiextensions.k8s.io/v1',
      metadata: {},
      items: [],
    },
    v1beta1Status: 404,
  });
});
