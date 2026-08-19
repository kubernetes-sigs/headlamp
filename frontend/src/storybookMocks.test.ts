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

import fs from 'fs';
import { setupServer } from 'msw/node';
import path from 'path';
import { baseMocks as frontendMocks } from '../.storybook/baseMocks';

const crdV1Url = 'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions';
const crdV1beta1Url =
  'http://localhost:4466/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions';

describe('frontend Storybook mocks', () => {
  const server = setupServer(...frontendMocks);

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  it('mocks custom resource definition discovery', async () => {
    const response = await fetch(crdV1Url);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      kind: 'CustomResourceDefinitionList',
      apiVersion: 'apiextensions.k8s.io/v1',
      metadata: {},
      items: [],
    });
    await expect(fetch(crdV1beta1Url)).resolves.toMatchObject({ status: 404 });
  });
});

it.each([
  ['frontend', path.resolve(__dirname, '../.storybook/baseMocks.ts')],
  [
    'plugin template',
    path.resolve(__dirname, '../../plugins/headlamp-plugin/config/.storybook/baseMocks.ts'),
  ],
])('keeps the %s CRD mock contract synchronized', (_name, sourcePath) => {
  const source = fs.readFileSync(sourcePath, 'utf8');

  expect(source).toContain(crdV1Url);
  expect(source).toContain("kind: 'CustomResourceDefinitionList'");
  expect(source).toContain("apiVersion: 'apiextensions.k8s.io/v1'");
  expect(source).toContain(crdV1beta1Url);
  expect(source).toContain('new HttpResponse(null, { status: 404 })');
});
