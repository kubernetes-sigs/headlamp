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

const { mockDereference, mockRequest, parserLoaded } = vi.hoisted(() => ({
  mockDereference: vi.fn((docs: unknown) => docs),
  mockRequest: vi.fn(),
  parserLoaded: vi.fn(),
}));

vi.mock('./k8s/api/v1/clusterRequests', () => ({
  request: mockRequest,
}));

vi.mock('@apidevtools/swagger-parser', () => {
  parserLoaded();
  return {
    default: {
      dereference: mockDereference,
    },
  };
});

describe('OpenAPI documentation loading', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not load the parser when the documentation module is imported', async () => {
    await import('./docs');

    expect(parserLoaded).not.toHaveBeenCalled();
  });

  it('loads the parser when documentation is first requested', async () => {
    mockRequest.mockResolvedValue({ definitions: {} });
    const getDocDefinitions = (await import('./docs')).default;

    await getDocDefinitions('v1', 'Pod');

    expect(parserLoaded).toHaveBeenCalledOnce();
    expect(mockDereference).toHaveBeenCalledOnce();
  });
});
