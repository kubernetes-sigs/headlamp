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

import Swagger from '@apidevtools/swagger-parser';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { request } from './k8s/apiProxy';

vi.mock('./k8s/apiProxy', () => ({
  request: vi.fn(),
}));

vi.mock('@apidevtools/swagger-parser', () => ({
  default: {
    dereference: vi.fn(),
  },
}));

describe('getDocDefinitions', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should return the correct definition for given apiVersion and kind', async () => {
    const getDocDefinitions = (await import('./docs')).default;
    const mockDocs = {
      definitions: {
        'io.k8s.api.apps.v1.Deployment': {
          type: 'object',
          properties: {
            metadata: { type: 'object' },
          },
          'x-kubernetes-group-version-kind': [{ group: 'apps', version: 'v1', kind: 'Deployment' }],
        },
      },
    };
    (request as Mock).mockResolvedValue(mockDocs);
    (Swagger.dereference as Mock).mockResolvedValue(mockDocs);

    const result = await getDocDefinitions('apps/v1', 'Deployment');
    expect(result).toEqual(mockDocs.definitions['io.k8s.api.apps.v1.Deployment']);
  });

  it('should correctly parse apiVersion when group is missing', async () => {
    const getDocDefinitions = (await import('./docs')).default;
    const mockDocs = {
      definitions: {
        'io.k8s.api.core.v1.Pod': {
          type: 'object',
          properties: {
            metadata: { type: 'object' },
          },
          'x-kubernetes-group-version-kind': [{ group: '', version: 'v1', kind: 'Pod' }],
        },
      },
    };
    (request as Mock).mockResolvedValue(mockDocs);
    (Swagger.dereference as Mock).mockResolvedValue(mockDocs);

    const result = await getDocDefinitions('v1', 'Pod');
    expect(result).toEqual(mockDocs.definitions['io.k8s.api.core.v1.Pod']);
  });

  it("should return undefined for definitions without 'x-kubernetes-group-version-kind' metadata", async () => {
    const getDocDefinitions = (await import('./docs')).default;
    const mockDocs = {
      definitions: {
        'io.k8s.api.apps.v1.Deployment': {
          type: 'object',
          properties: {
            metadata: { type: 'object' },
          },
        },
      },
    };
    (request as Mock).mockResolvedValue(mockDocs);
    (Swagger.dereference as Mock).mockResolvedValue(mockDocs);

    const result = await getDocDefinitions('apps/v1', 'Deployment');
    expect(result).toBeUndefined();
  });

  it('should return undefined for non-existent resources', async () => {
    const getDocDefinitions = (await import('./docs')).default;
    const mockDocs = {
      definitions: {
        'io.k8s.api.apps.v1.Deployment': {
          'x-kubernetes-group-version-kind': [{ group: 'apps', version: 'v1', kind: 'Deployment' }],
        },
      },
    };
    (request as Mock).mockResolvedValue(mockDocs);
    (Swagger.dereference as Mock).mockResolvedValue(mockDocs);

    const result = await getDocDefinitions('fake/v1', 'NonExistent');
    expect(result).toBeUndefined();
  });

  it('should cache the docs and not make multiple requests', async () => {
    const getDocDefinitions = (await import('./docs')).default;
    const mockDocs = {
      definitions: {
        'io.k8s.api.apps.v1.Deployment': {
          'x-kubernetes-group-version-kind': [{ group: 'apps', version: 'v1', kind: 'Deployment' }],
        },
      },
    };
    (request as Mock).mockResolvedValue(mockDocs);
    (Swagger.dereference as Mock).mockResolvedValue(mockDocs);

    await getDocDefinitions('apps/v1', 'Deployment');
    await getDocDefinitions('apps/v1', 'Deployment');

    expect(request).toHaveBeenCalledTimes(1);
    expect(Swagger.dereference).toHaveBeenCalledTimes(1);
  });

  it('should handle errors from the request', async () => {
    const getDocDefinitions = (await import('./docs')).default;
    (request as Mock).mockRejectedValue(new Error('API Request Failed'));

    await expect(getDocDefinitions('apps/v1', 'Deployment')).rejects.toThrow('API Request Failed');
  });
});
