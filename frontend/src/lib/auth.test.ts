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
import { setToken } from './auth';
import { backendFetch } from './k8s/api/v2/fetch';

// Mock the dependencies
vi.mock('./k8s/api/v2/fetch');
vi.mock('../helpers/getHeadlampAPIHeaders');

const mockBackendFetch = vi.mocked(backendFetch);

describe('auth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('setToken', () => {
    it('should successfully set a token for a cluster', async () => {
      const cluster = 'test-cluster';
      const token = 'test-token-123';
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as any);

      const result = await setToken(cluster, token);

      expect(result).toBe(true);
      expect(mockBackendFetch).toHaveBeenCalledWith(`/clusters/${cluster}/set-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });
    });

    it('should successfully clear a token when token is null', async () => {
      const cluster = 'test-cluster';
      const token = null;
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as any);

      const result = await setToken(cluster, token);

      expect(result).toBe(true);
      expect(mockBackendFetch).toHaveBeenCalledWith(`/clusters/${cluster}/set-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: null }),
      });
    });

    it('should throw an error when backend returns error response', async () => {
      const cluster = 'test-cluster';
      const token = 'test-token-123';
      const mockResponse = {
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as any);

      await expect(setToken(cluster, token)).rejects.toThrow('Failed to set cookie token');
    });
  });
});
