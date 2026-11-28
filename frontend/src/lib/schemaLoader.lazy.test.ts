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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClusterRequest, parserLoaded } = vi.hoisted(() => ({
  mockClusterRequest: vi.fn(),
  parserLoaded: vi.fn(),
}));

vi.mock('./k8s/api/v1/clusterRequests', () => ({
  clusterRequest: mockClusterRequest,
}));

vi.mock('@apidevtools/swagger-parser', () => {
  parserLoaded();
  return {
    default: {
      dereference: vi.fn(),
    },
  };
});

describe('schemaLoader lazy behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not make network requests or load heavy parsers upon import', async () => {
    await import('./schemaLoader');

    expect(mockClusterRequest).not.toHaveBeenCalled();
    expect(parserLoaded).not.toHaveBeenCalled();
  });
});
