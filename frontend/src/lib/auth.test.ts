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
        expect(mockBackendFetch).toHaveBeenCalledTimes(2);
        expect(mockBackendFetch).toHaveBeenNthCalledWith(
          1,
          '/clusters/sample/clear-refresh-token',
          expect.any(Object)
        );
        expect(mockBackendFetch).toHaveBeenNthCalledWith(
          2,
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

      // The best-effort refresh token cleanup, then the failing clear-token request.
      expect(mockBackendFetch).toHaveBeenCalledTimes(2);
    });

    it('clears the cached refresh token before the cookie and does not fail if that fails', async () => {
      const cluster = 'test-cluster';
      mockProviderLogout.mockReturnValue(true);
      mockBackendFetch
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce({ ok: true } as Response);

      await expect(logout(cluster, true)).resolves.toBeUndefined();

      expect(mockBackendFetch).toHaveBeenCalledTimes(2);
      expect(mockBackendFetch).toHaveBeenNthCalledWith(
        1,
        `/clusters/${encodeURIComponent(cluster)}/clear-refresh-token`,
        expect.objectContaining({ method: 'POST' })
      );
      expect(mockBackendFetch).toHaveBeenNthCalledWith(
        2,
        `/encoded-clusters/${encodeClusterPath(cluster)}/clear-token`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it.each([
      ['prod:oidc', '/clusters/prod:oidc/clear-refresh-token'],
      ['user@example.com', '/clusters/user@example.com/clear-refresh-token'],
      ['prod+oidc', '/clusters/prod+oidc/clear-refresh-token'],
      ['prod=oidc', '/clusters/prod=oidc/clear-refresh-token'],
      ['a$b&c,d;e', '/clusters/a$b&c,d;e/clear-refresh-token'],
      ['team a/b', '/clusters/team%20a%2Fb/clear-refresh-token'],
    ])(
      'keeps cookie-safe path characters in the cleanup path so the auth cookie path matches: %s',
      async (cluster, expectedPath) => {
        mockProviderLogout.mockReturnValue(true);
        mockBackendFetch.mockResolvedValue({ ok: true } as Response);

        await logout(cluster, true);

        expect(mockBackendFetch).toHaveBeenNthCalledWith(
          1,
          expectedPath,
          expect.objectContaining({ method: 'POST' })
        );
      }
    );

    it('gives up on a stalled refresh token cleanup and still clears the cookie', async () => {
      vi.useFakeTimers();

      try {
        const cluster = 'test-cluster';
        mockProviderLogout.mockReturnValue(true);
        let cleanupSignal: AbortSignal | undefined;
        mockBackendFetch
          .mockImplementationOnce(
            (_url, init) =>
              new Promise((_resolve, reject) => {
                cleanupSignal = init?.signal as AbortSignal;
                cleanupSignal.addEventListener('abort', () =>
                  reject(new DOMException('The operation was aborted.', 'AbortError'))
                );
              })
          )
          .mockResolvedValueOnce({ ok: true } as Response);

        const loggedOut = logout(cluster, true);

        // The cleanup is still pending, so the cookie has not been cleared yet.
        await vi.advanceTimersByTimeAsync(2999);
        expect(mockBackendFetch).toHaveBeenCalledTimes(1);
        expect(cleanupSignal?.aborted).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        await expect(loggedOut).resolves.toBeUndefined();

        expect(cleanupSignal?.aborted).toBe(true);
        expect(mockBackendFetch).toHaveBeenCalledTimes(2);
        expect(mockBackendFetch).toHaveBeenNthCalledWith(
          2,
          `/encoded-clusters/${encodeClusterPath(cluster)}/clear-token`,
          expect.objectContaining({ method: 'POST' })
        );
      } finally {
        vi.useRealTimers();
      }
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
        .mockResolvedValueOnce({ ok: true } as Response) // clear-refresh-token
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
        .mockResolvedValueOnce({ ok: true } as Response) // clear-refresh-token
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

      // Per cluster: clear-refresh-token and clear-token (3 clusters), plus one oidc-logout.
      expect(mockBackendFetch).toHaveBeenCalledTimes(7);
      expect(mockBackendFetch).toHaveBeenCalledWith(
        '/clusters/oidc-cluster/clear-refresh-token',
        expect.objectContaining({ method: 'POST' })
      );
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
