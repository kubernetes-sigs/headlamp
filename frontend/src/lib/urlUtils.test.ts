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

import { addQueryParams, getFilterValueFromURL, getFilterValuesFromURL } from './urlUtils';

describe('urlUtils', () => {
  describe('addQueryParams', () => {
    it('should add query parameters to URL', () => {
      const history = {
        push: vi.fn(),
      };
      const location = {
        pathname: '/pods',
        search: '',
      };

      addQueryParams({ labelSelector: 'app=nginx' }, {}, history, location);

      expect(history.push).toHaveBeenCalledWith({
        pathname: '/pods',
        search: 'labelSelector=app%3Dnginx',
      });
    });

    it('should remove parameters that match default values', () => {
      const history = {
        push: vi.fn(),
      };
      const location = {
        pathname: '/pods',
        search: 'labelSelector=app%3Dnginx',
      };

      addQueryParams({ labelSelector: '' }, { labelSelector: '' }, history, location);

      expect(history.push).toHaveBeenCalledWith({
        pathname: '/pods',
        search: '',
      });
    });

    it('should add tableName when provided', () => {
      const history = {
        push: vi.fn(),
      };
      const location = {
        pathname: '/pods',
        search: '',
      };

      addQueryParams({ namespace: 'default' }, {}, history, location, 'pods');

      expect(history.push).toHaveBeenCalledWith({
        pathname: '/pods',
        search: 'tableName=pods&namespace=default',
      });
    });
  });

  describe('getFilterValueFromURL', () => {
    it('should return filter value as string', () => {
      const location = {
        search: '?labelSelector=app%3Dnginx',
      };

      const value = getFilterValueFromURL('labelSelector', location);
      expect(value).toBe('app=nginx');
    });

    it('should return empty string when parameter not found', () => {
      const location = {
        search: '',
      };

      const value = getFilterValueFromURL('labelSelector', location);
      expect(value).toBe('');
    });
  });

  describe('getFilterValuesFromURL', () => {
    it('should return filter value as array of strings', () => {
      const location = {
        search: '?namespace=default+kube-system',
      };

      const values = getFilterValuesFromURL('namespace', location);
      expect(values).toEqual(['default', 'kube-system']);
    });

    it('should return empty array when parameter not found', () => {
      const location = {
        search: '',
      };

      const values = getFilterValuesFromURL('namespace', location);
      expect(values).toEqual([]);
    });

    it('should split space-separated values', () => {
      const location = {
        search: '?namespace=ns1 ns2 ns3',
      };

      const values = getFilterValuesFromURL('namespace', location);
      expect(values).toEqual(['ns1', 'ns2', 'ns3']);
    });
  });
});
