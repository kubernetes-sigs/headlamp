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

import * as getBaseUrl from '../helpers/getBaseUrl';
import * as isElectron from '../helpers/isElectron';
import { getCluster, getClusterGroup, getClusterPrefixedPath } from './cluster';

vi.mock('../helpers/getBaseUrl', () => ({
  getBaseUrl: vi.fn(),
}));

vi.mock('../helpers/isElectron', () => ({
  isElectron: vi.fn(),
}));

describe('getClusterGroup', () => {
  beforeEach(() => {
    vi.mocked(getBaseUrl.getBaseUrl).mockReturnValue('');
    vi.mocked(isElectron.isElectron).mockReturnValue(false);
  });

  it('returns all selected clusters in browser URL order', () => {
    window.history.replaceState({}, '', '/c/east+west+central/pods');
    expect(getClusterGroup()).toEqual(['east', 'west', 'central']);
    expect(getCluster()).toBe('east');
  });

  it('retains all clusters with a deployment base URL', () => {
    vi.mocked(getBaseUrl.getBaseUrl).mockReturnValue('/headlamp');
    window.history.replaceState({}, '', '/headlamp/c/west+east/nodes');
    expect(getClusterGroup()).toEqual(['west', 'east']);
  });

  it('returns all selected clusters from the desktop hash', () => {
    vi.mocked(isElectron.isElectron).mockReturnValue(true);
    window.history.replaceState({}, '', '/#/c/east+west/pods');
    expect(getClusterGroup()).toEqual(['east', 'west']);
  });

  it('keeps the single-cluster and no-cluster fallback behavior', () => {
    window.history.replaceState({}, '', '/c/east/pods');
    expect(getClusterGroup()).toEqual(['east']);
    window.history.replaceState({}, '', '/settings');
    expect(getClusterGroup()).toEqual([]);
    expect(getClusterGroup(['fallback'])).toEqual(['fallback']);
  });
});

describe('getCluster', () => {
  const originalWindow = { ...window };

  beforeEach(() => {
    vi.clearAllMocks();

    window.location = {
      ...originalWindow.location,
      pathname: '',
      hash: '',
    } as Window['location'] & string;
  });

  afterEach(() => {
    window = { ...originalWindow };
  });

  describe('Browser Environment', () => {
    beforeEach(() => {
      vi.mocked(isElectron.isElectron).mockReturnValue(false);
    });

    it('should extract cluster name from pathname without base URL', () => {
      vi.mocked(getBaseUrl.getBaseUrl).mockReturnValue('');
      window.location.pathname = '/c/test-cluster/workloads';

      expect(getCluster()).toBe('test-cluster');
    });

    it('should extract cluster name from pathname with base URL', () => {
      vi.mocked(getBaseUrl.getBaseUrl).mockReturnValue('/base');
      window.location.pathname = '/base/c/test-cluster/workloads';

      expect(getCluster()).toBe('test-cluster');
    });

    it('should return null for non-cluster path', () => {
      vi.mocked(getBaseUrl.getBaseUrl).mockReturnValue('');
      window.location.pathname = '/workloads';

      expect(getCluster()).toBeNull();
    });

    it('should handle trailing slashes correctly', () => {
      vi.mocked(getBaseUrl.getBaseUrl).mockReturnValue('');
      window.location.pathname = '/c/test-cluster/';

      expect(getCluster()).toBe('test-cluster');
    });

    it('should decode an opaque logout landing path without normalizing the cluster', () => {
      vi.mocked(getBaseUrl.getBaseUrl).mockReturnValue('/base');
      window.location.pathname = '/base/encoded-clusters/dGVhbS8uLi9wcm9k/login';

      expect(getCluster()).toBe('team/../prod');
    });

    it('should reject a malformed opaque logout landing path', () => {
      vi.mocked(getBaseUrl.getBaseUrl).mockReturnValue('');
      window.location.pathname = '/encoded-clusters/not+base64/login';

      expect(getCluster()).toBeNull();
    });
  });

  describe('Electron Environment', () => {
    beforeEach(() => {
      vi.mocked(isElectron.isElectron).mockReturnValue(true);
    });

    it('should extract cluster name from hash', () => {
      window.location.hash = '#/c/test-cluster/workloads';

      expect(getCluster()).toBe('test-cluster');
    });

    it('should return null for non-cluster hash', () => {
      window.location.hash = '#/workloads';

      expect(getCluster()).toBeNull();
    });

    it('should handle empty hash', () => {
      window.location.hash = '';

      expect(getCluster()).toBeNull();
    });

    it('should decode an opaque logout landing path from the hash', () => {
      window.location.hash = '#/encoded-clusters/dGVhbS9jbHVzdGVy/login';

      expect(getCluster()).toBe('team/cluster');
    });
  });
});

describe('getClusterPrefixedPath', () => {
  it('should handle null path', () => {
    expect(getClusterPrefixedPath()).toBe('/c/:cluster');
  });

  it('should handle path without leading slash', () => {
    expect(getClusterPrefixedPath('path')).toBe('/c/:cluster/path');
  });

  it('should handle path with leading slash', () => {
    expect(getClusterPrefixedPath('/path')).toBe('/c/:cluster/path');
  });
});
