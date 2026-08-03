/*
 * Copyright 2026 The Kubernetes Authors
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

import { setupServer } from 'msw/node';
import { baseMocks as frontendMocks } from '../.storybook/baseMocks';
import { baseMocks as pluginMocks } from '../../plugins/headlamp-plugin/config/.storybook/baseMocks';

const crdV1Url = 'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions';
const crdV1beta1Url =
  'http://localhost:4466/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions';

describe.each([
  ['frontend', frontendMocks],
  ['plugin template', pluginMocks],
])('%s Storybook mocks', (_name, handlers) => {
  const server = setupServer(...handlers);

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
    await expect(fetch(crdV1beta1Url)).rejects.toThrow();
  });
});
