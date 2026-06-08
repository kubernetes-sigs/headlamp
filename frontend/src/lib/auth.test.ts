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
import { getAppUrl } from '../helpers/getAppUrl';
import store from '../redux/stores/store';
import { deleteTokens, getUserInfo, logout, setToken } from './auth';
import { backendFetch } from './k8s/api/v2/fetch';
import { getClusterAuthType } from './k8s/clusterAuthType';
import { queryClient } from './queryClient';

// Mock the dependencies
vi.mock('./k8s/api/v2/fetch');
vi.mock('../helpers/getHeadlampAPIHeaders');
vi.mock('../redux/stores/store', () => ({
  default: {
    getState: vi.fn(),
  },
}));
vi.mock('./k8s/clusterAuthType');
vi.mock('../helpers/getAppUrl');
vi.mock('./queryClient', () => ({
  queryClient: {
    removeQueries: vi.fn(),
    invalidateQueries: vi.fn(),
  },
}));

const mockBackendFetch = vi.mocked(backendFetch);
const mockStore = vi.mocked(store);
const mockGetClusterAuthType = vi.mocked(getClusterAuthType);
const mockGetAppUrl = vi.mocked(getAppUrl);
const mockQueryClient = vi.mocked(queryClient);

describe('auth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockStore.getState.mockReturnValue({
      ui: { functionsToOverride: {} },
      config: { allClusters: {} },
    } as any);
    mockGetClusterAuthType.mockReturnValue('');
    mockGetAppUrl.mockReturnValue('http://localhost:4466/');
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

  describe('logout', () => {
    it('should redirect to oidc-logout endpoint for OIDC cluster when skipRedirect is false', async () => {
      const cluster = 'test-cluster';
      mockGetClusterAuthType.mockReturnValue('oidc');

      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      const result = await logout(cluster);

      expect(result).toBe(false);
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['auth'],
        exact: false,
      });
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['clusterMe', cluster],
        exact: true,
      });
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/clusters/${cluster}/set-token`,
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockLocation.href).toBe(
        `http://localhost:4466/clusters/${encodeURIComponent(cluster)}/oidc-logout`
      );
    });

    it('should return true for OIDC cluster when skipRedirect is true', async () => {
      const cluster = 'test-cluster';
      mockGetClusterAuthType.mockReturnValue('oidc');

      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      const result = await logout(cluster, true);

      expect(result).toBe(true);
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['auth'],
        exact: false,
      });
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['clusterMe', cluster],
        exact: true,
      });
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/clusters/${cluster}/set-token`,
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockLocation.href).toBe('');
    });

    it('should still redirect to oidc-logout when setToken fails for OIDC cluster', async () => {
      const cluster = 'test-cluster';
      mockGetClusterAuthType.mockReturnValue('oidc');

      const mockResponse: Partial<Response> = {
        ok: false,
        status: 500,
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      const result = await logout(cluster);

      expect(result).toBe(false);
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['auth'],
        exact: false,
      });
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['clusterMe', cluster],
        exact: true,
      });
      expect(mockLocation.href).toBe(
        `http://localhost:4466/clusters/${encodeURIComponent(cluster)}/oidc-logout`
      );
    });

    it('should clear token and queries for non-OIDC cluster', async () => {
      const cluster = 'test-cluster';
      mockGetClusterAuthType.mockReturnValue('');

      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      const result = await logout(cluster);

      expect(result).toBe(false);
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/clusters/${cluster}/set-token`,
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['auth'],
        exact: false,
      });
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['clusterMe', cluster],
        exact: true,
      });
      expect(mockLocation.href).toBe('');
    });
  });

  describe('deleteTokens', () => {
    it('should redirect to oidc-logout when there is one OIDC cluster', async () => {
      mockStore.getState.mockReturnValue({
        ui: { functionsToOverride: {} },
        config: { allClusters: { 'oidc-cluster': {} } },
      } as any);
      mockGetClusterAuthType.mockReturnValue('oidc');

      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      await deleteTokens();

      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['auth'],
        exact: false,
      });
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['clusterMe', 'oidc-cluster'],
        exact: true,
      });
      expect(mockBackendFetch).toHaveBeenCalledWith(
        '/clusters/oidc-cluster/set-token',
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockLocation.href).toBe(
        `http://localhost:4466/clusters/${encodeURIComponent('oidc-cluster')}/oidc-logout`
      );
    });

    it('should redirect to the OIDC cluster logout when there are mixed clusters', async () => {
      mockStore.getState.mockReturnValue({
        ui: { functionsToOverride: {} },
        config: { allClusters: { 'oidc-cluster': {}, 'non-oidc-cluster': {} } },
      } as any);

      mockGetClusterAuthType.mockImplementation((cluster: string) => {
        return cluster === 'oidc-cluster' ? 'oidc' : '';
      });

      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      await deleteTokens();

      expect(mockBackendFetch).toHaveBeenCalledTimes(2);
      expect(mockBackendFetch).toHaveBeenCalledWith(
        '/clusters/oidc-cluster/set-token',
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockBackendFetch).toHaveBeenCalledWith(
        '/clusters/non-oidc-cluster/set-token',
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockLocation.href).toBe(
        `http://localhost:4466/clusters/${encodeURIComponent('oidc-cluster')}/oidc-logout`
      );
    });

    it('should not redirect when there are no OIDC clusters', async () => {
      mockStore.getState.mockReturnValue({
        ui: { functionsToOverride: {} },
        config: { allClusters: { 'non-oidc-cluster': {} } },
      } as any);
      mockGetClusterAuthType.mockReturnValue('');

      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      await deleteTokens();

      expect(mockBackendFetch).toHaveBeenCalledWith(
        '/clusters/non-oidc-cluster/set-token',
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockLocation.href).toBe('');
    });
  });
});
