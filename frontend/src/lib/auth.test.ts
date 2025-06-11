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
import * as storeModule from '../redux/stores/store';
import { deleteTokens, getToken, getUserInfo, hasToken, logout, setToken } from './auth';

const validToken =
  'header.' + btoa(JSON.stringify({ username: 'john', email: 'john@example.com' })) + '.signature';

describe('token utils', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.tokens = JSON.stringify({});
    vi.restoreAllMocks();
  });

  describe('getToken', () => {
    it('returns token from localStorage', () => {
      const tokens = { clusterA: validToken };
      localStorage.tokens = JSON.stringify(tokens);
      expect(getToken('clusterA')).toBe(validToken);
    });

    it('uses overridden getToken function if provided', () => {
      const mockToken = 'overridden.token';
      const mockGetToken = vi.fn().mockReturnValue(mockToken);

      vi.spyOn(storeModule.default, 'getState').mockReturnValue({
        ui: {
          functionsToOverride: {
            getToken: mockGetToken,
          },
        },
      } as unknown as ReturnType<typeof storeModule.default.getState>);

      expect(getToken('anyCluster')).toBe(mockToken);
      expect(mockGetToken).toHaveBeenCalledWith('anyCluster');
    });
  });

  describe('getUserInfo', () => {
    it('returns parsed user info from token', () => {
      const tokens = { clusterB: validToken };
      localStorage.tokens = JSON.stringify(tokens);
      const userInfo = getUserInfo('clusterB');
      expect(userInfo).toEqual({ username: 'john', email: 'john@example.com' });
    });
  });

  describe('hasToken', () => {
    it('returns true if token exists', () => {
      const tokens = { clusterC: validToken };
      localStorage.tokens = JSON.stringify(tokens);
      expect(hasToken('clusterC')).toBe(true);
    });

    it('returns false if token does not exist', () => {
      expect(hasToken('missingCluster')).toBe(false);
    });
  });

  describe('setToken', () => {
    it('stores token in localStorage if no override', () => {
      setToken('clusterD', 'mock.token');
      const stored = JSON.parse(localStorage.tokens || '{}');
      expect(stored.clusterD).toBe('mock.token');
    });

    it('uses overridden setToken function if provided', () => {
      const mockSetToken = vi.fn();
      vi.spyOn(storeModule.default, 'getState').mockReturnValue({
        ui: {
          functionsToOverride: {
            setToken: mockSetToken,
          },
        },
      } as unknown as ReturnType<typeof storeModule.default.getState>);

      setToken('clusterE', 'override.token');
      expect(mockSetToken).toHaveBeenCalledWith('clusterE', 'override.token');
    });
  });

  describe('deleteTokens', () => {
    it('deletes localStorage tokens', () => {
      localStorage.tokens = JSON.stringify({ cluster: 'token' });
      deleteTokens();
      expect(localStorage.tokens).toBeUndefined();
    });
  });

  describe('logout', () => {
    it('removes all tokens', () => {
      localStorage.tokens = JSON.stringify({ cluster: 'token' });
      logout();
      expect(localStorage.tokens).toBeUndefined();
    });
  });
});
