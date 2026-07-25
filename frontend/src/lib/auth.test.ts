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

import { Base64 } from 'js-base64';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import store from '../redux/stores/store';
import { getUserInfo, setToken } from './auth';
import { backendFetch } from './k8s/api/v2/fetch';

// Mock the dependencies
vi.mock('./k8s/api/v2/fetch');
vi.mock('../helpers/getHeadlampAPIHeaders');
vi.mock('../redux/stores/store', () => ({
  default: {
    getState: vi.fn(),
  },
}));

const mockBackendFetch = vi.mocked(backendFetch);
const mockStore = vi.mocked(store);

describe('auth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockStore.getState.mockReturnValue({
      ui: { functionsToOverride: {} },
      config: { allClusters: {} },
    } as any);
  });

  describe('setToken', () => {
    it('should successfully set a token for a cluster', async () => {
      const cluster = 'test-cluster';
      const token = 'test-token-123';
      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

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
      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

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
      const mockResponse: Partial<Response> = {
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      await expect(setToken(cluster, token)).rejects.toThrow('Failed to set cookie token');
    });
  });

  describe('getUserInfo', () => {
    it('should return null when no token exists', () => {
      mockStore.getState.mockReturnValue({
        ui: { functionsToOverride: {} },
      } as any);

      expect(getUserInfo('test-cluster')).toBeNull();
    });

    it('should return decoded info for a valid base64url token', () => {
      const userData = { name: 'test-user', email: 'test@example.com' };
      // Base64.encodeURI produces base64url (no padding, url-safe chars) as real JWTs do
      const validToken = `header.${Base64.encodeURI(JSON.stringify(userData))}.signature`;

      mockStore.getState.mockReturnValue({
        ui: {
          functionsToOverride: {
            getToken: () => validToken,
          },
        },
      } as any);

      expect(getUserInfo('test-cluster')).toEqual(userData);
    });

    it('should return null and not crash for a malformed token', () => {
      const malformedToken = 'header.malformed_payload.signature';

      mockStore.getState.mockReturnValue({
        ui: {
          functionsToOverride: {
            getToken: () => malformedToken,
          },
        },
      } as any);

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(getUserInfo('test-cluster')).toBeNull();
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it('should return null for valid base64 but invalid JSON', () => {
      const invalidJsonToken = `header.${Base64.encode('not-json')}.signature`;

      mockStore.getState.mockReturnValue({
        ui: {
          functionsToOverride: {
            getToken: () => invalidJsonToken,
          },
        },
      } as any);

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(getUserInfo('test-cluster')).toBeNull();
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });
  });
});
