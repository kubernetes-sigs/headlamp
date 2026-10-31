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
import { deleteTokens, getUserInfo, logout, setToken } from './auth';
import { backendFetch } from './k8s/api/v2/fetch';
import { canLogoutFromProvider } from './k8s/clusterAuthType';
import { encodeClusterPath } from './oidcLogout';
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
vi.mock('./queryClient', () => ({
  queryClient: {
    removeQueries: vi.fn(),
    invalidateQueries: vi.fn(),
  },
}));

const mockBackendFetch = vi.mocked(backendFetch);
const mockStore = vi.mocked(store);
const mockProviderLogout = vi.mocked(canLogoutFromProvider);
const mockQueryClient = vi.mocked(queryClient);

describe('auth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockStore.getState.mockReturnValue({
      ui: { functionsToOverride: {} },
      config: { allClusters: {} },
    } as any);
    mockProviderLogout.mockReturnValue(false);
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
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/clusters/${encodeURIComponent(cluster)}/set-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        }
      );
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
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/encoded-clusters/${encodeClusterPath(cluster)}/clear-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: null }),
        }
      );
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
    it.each([false, true])(
      'keeps stateless OIDC logout local-only (same-named global context=%s)',
      async sameName => {
        const actual = await vi.importActual<typeof import('./k8s/clusterAuthType')>(
          './k8s/clusterAuthType'
        );
        mockProviderLogout.mockImplementation(actual.canLogoutFromProvider);
        const realStore = await vi.importActual<typeof import('../redux/stores/store')>(
          '../redux/stores/store'
        );
        const state = realStore.default.getState();
        mockStore.getState.mockReturnValue({
          ...state,
          ui: { ...state.ui, functionsToOverride: {} },
          config: {
            ...state.config,
            clusters: sameName ? { sample: { name: 'sample', auth_type: 'oidc' } } : {},
            statelessClusters: { sample: { name: 'sample', auth_type: 'oidc' } },
          },
        });
        mockBackendFetch.mockResolvedValue({ ok: true } as Response);
        await logout('sample');
        expect(mockBackendFetch).toHaveBeenCalledExactlyOnceWith(
          `/encoded-clusters/${encodeClusterPath('sample')}/clear-token`,
          expect.any(Object)
        );
      }
    );

    it('should redirect an OIDC cluster with slash and dot segments', async () => {
      const cluster = 'team/../prod';
      mockProviderLogout.mockReturnValue(true);

      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ redirectURL: 'https://idp.example/logout' }),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      const result = await logout(cluster);

      expect(result).toBeUndefined();
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['auth'],
        exact: false,
      });
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['clusterMe', cluster],
        exact: true,
      });
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/encoded-clusters/${encodeClusterPath(cluster)}/clear-token`,
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockBackendFetch).toHaveBeenCalledWith(
        '/encoded-clusters/dGVhbS8uLi9wcm9k/oidc-logout',
        {
          method: 'POST',
          headers: expect.objectContaining({
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }),
        }
      );
      expect(mockLocation.href).toBe('https://idp.example/logout');
    });

    it('should preserve the void result when skipping an OIDC redirect', async () => {
      const cluster = 'test-cluster';
      mockProviderLogout.mockReturnValue(true);

      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      const result = await logout(cluster, true);

      expect(result).toBeUndefined();
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['auth'],
        exact: false,
      });
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['clusterMe', cluster],
        exact: true,
      });
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/encoded-clusters/${encodeClusterPath(cluster)}/clear-token`,
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockLocation.href).toBe('');
    });

    it('should surface setToken failure when skipping the OIDC redirect', async () => {
      const cluster = 'test-cluster';
      mockProviderLogout.mockReturnValue(true);
      mockBackendFetch.mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(logout(cluster, true)).rejects.toThrow();

      expect(mockBackendFetch).toHaveBeenCalledTimes(1);
    });

    it('should still redirect to oidc-logout when setToken fails for OIDC cluster', async () => {
      const cluster = 'test-cluster';
      mockProviderLogout.mockReturnValue(true);

      const failedSetTokenResponse: Partial<Response> = {
        ok: false,
        status: 500,
      };
      const logoutResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ redirectURL: 'https://idp.example/logout' }),
      };
      mockBackendFetch
        .mockResolvedValueOnce(failedSetTokenResponse as Response)
        .mockResolvedValueOnce(logoutResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      const result = await logout(cluster);

      expect(result).toBeUndefined();
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['auth'],
        exact: false,
      });
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['clusterMe', cluster],
        exact: true,
      });
      expect(mockLocation.href).toBe('https://idp.example/logout');
    });

    it('should clear token and queries for non-OIDC cluster', async () => {
      const cluster = 'test-cluster';
      mockProviderLogout.mockReturnValue(false);

      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      const result = await logout(cluster);

      expect(result).toBeUndefined();
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/encoded-clusters/${encodeClusterPath(cluster)}/clear-token`,
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
    it('preserves the public authentication function return types', () => {
      const compatibleLogout: (cluster: string) => Promise<void> = logout;
      const compatibleDeleteTokens: () => Promise<void[]> = deleteTokens;

      expect(compatibleLogout).toBe(logout);
      expect(compatibleDeleteTokens).toBe(deleteTokens);
    });

    it('should redirect to oidc-logout when there is one OIDC cluster', async () => {
      mockStore.getState.mockReturnValue({
        ui: { functionsToOverride: {} },
        config: { allClusters: { 'oidc-cluster': {} } },
      } as any);
      mockProviderLogout.mockReturnValue(true);

      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ redirectURL: 'https://idp.example/logout' }),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      expect(await deleteTokens()).toEqual([undefined]);

      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['auth'],
        exact: false,
      });
      expect(mockQueryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: ['clusterMe', 'oidc-cluster'],
        exact: true,
      });
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/encoded-clusters/${encodeClusterPath('oidc-cluster')}/clear-token`,
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/encoded-clusters/${encodeClusterPath('oidc-cluster')}/oidc-logout`,
        {
          method: 'POST',
          headers: expect.objectContaining({
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }),
        }
      );
      expect(mockLocation.href).toBe('https://idp.example/logout');
    });

    it('should still redirect when the selected OIDC cluster clear fails', async () => {
      mockStore.getState.mockReturnValue({
        ui: { functionsToOverride: {} },
        config: { allClusters: { 'oidc-cluster': {} } },
      } as any);
      mockProviderLogout.mockReturnValue(true);

      const failedClearResponse: Partial<Response> = { ok: false, status: 500 };
      const logoutResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ redirectURL: 'https://idp.example/logout' }),
      };
      mockBackendFetch
        .mockResolvedValueOnce(failedClearResponse as Response)
        .mockResolvedValueOnce(logoutResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      await expect(deleteTokens()).resolves.toEqual([undefined]);

      expect(mockBackendFetch).toHaveBeenLastCalledWith(
        `/encoded-clusters/${encodeClusterPath('oidc-cluster')}/oidc-logout`,
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockLocation.href).toBe('https://idp.example/logout');
    });

    it('should redirect to the OIDC cluster logout when there are mixed clusters', async () => {
      mockStore.getState.mockReturnValue({
        ui: { functionsToOverride: {} },
        config: {
          allClusters: { 'oidc-cluster': {}, 'second-oidc-cluster': {}, 'non-oidc-cluster': {} },
        },
      } as any);

      mockProviderLogout.mockImplementation((cluster: string) => {
        return cluster !== 'non-oidc-cluster';
      });

      const mockResponse: Partial<Response> = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ redirectURL: 'https://idp.example/logout' }),
      };
      mockBackendFetch.mockResolvedValue(mockResponse as Response);

      const mockLocation = { href: '' };
      vi.stubGlobal('location', mockLocation);

      expect(await deleteTokens()).toEqual([undefined, undefined, undefined]);

      expect(mockBackendFetch).toHaveBeenCalledTimes(4);
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/encoded-clusters/${encodeClusterPath('oidc-cluster')}/clear-token`,
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/encoded-clusters/${encodeClusterPath('non-oidc-cluster')}/clear-token`,
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockBackendFetch).toHaveBeenCalledWith(
        `/encoded-clusters/${encodeClusterPath('oidc-cluster')}/oidc-logout`,
        {
          method: 'POST',
          headers: expect.objectContaining({
            Accept: 'application/json',
            'Content-Type': 'application/json',
          }),
        }
      );
      expect(mockLocation.href).toBe('https://idp.example/logout');
    });

    it('should not redirect when there are no OIDC clusters', async () => {
      mockStore.getState.mockReturnValue({
        ui: { functionsToOverride: {} },
        config: { allClusters: { 'non-oidc-cluster': {} } },
      } as any);
      mockProviderLogout.mockReturnValue(false);

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
        `/encoded-clusters/${encodeClusterPath('non-oidc-cluster')}/clear-token`,
        expect.objectContaining({
          body: JSON.stringify({ token: null }),
        })
      );
      expect(mockLocation.href).toBe('');
    });
  });
});
