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

import helpers from '../helpers';
import { getCluster, getClusterPrefixedPath } from './cluster';

vi.mock('../helpers', () => ({
  default: {
    getBaseUrl: vi.fn(),
    isElectron: vi.fn(),
  },
}));

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
      vi.mocked(helpers.isElectron).mockReturnValue(false);
    });

    it('should extract cluster name from pathname without base URL', () => {
      vi.mocked(helpers.getBaseUrl).mockReturnValue('');
      window.location.pathname = '/c/test-cluster/workloads';

      expect(getCluster()).toBe('test-cluster');
    });

    it('should extract cluster name from pathname with base URL', () => {
      vi.mocked(helpers.getBaseUrl).mockReturnValue('/base');
      window.location.pathname = '/base/c/test-cluster/workloads';

      expect(getCluster()).toBe('test-cluster');
    });

    it('should return null for non-cluster path', () => {
      vi.mocked(helpers.getBaseUrl).mockReturnValue('');
      window.location.pathname = '/workloads';

      expect(getCluster()).toBeNull();
    });

    it('should handle trailing slashes correctly', () => {
      vi.mocked(helpers.getBaseUrl).mockReturnValue('');
      window.location.pathname = '/c/test-cluster/';

      expect(getCluster()).toBe('test-cluster');
    });
  });

  describe('Electron Environment', () => {
    beforeEach(() => {
      vi.mocked(helpers.isElectron).mockReturnValue(true);
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
