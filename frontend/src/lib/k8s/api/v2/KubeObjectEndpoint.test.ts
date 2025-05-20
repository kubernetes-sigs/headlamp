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

import { describe, expect, it } from 'vitest';
import { KubeObjectEndpoint } from './KubeObjectEndpoint';

describe('KubeObjectEndpoint', () => {
  describe('toUrl', () => {
    it('should generate URL for core resources without namespace', () => {
      const endpoint = { version: 'v1', resource: 'pods' };
      const url = KubeObjectEndpoint.toUrl(endpoint);
      expect(url).toBe('api/v1/pods');
    });

    it('should generate URL for core resources with namespace', () => {
      const endpoint = { version: 'v1', resource: 'pods' };
      const url = KubeObjectEndpoint.toUrl(endpoint, 'default');
      expect(url).toBe('api/v1/namespaces/default/pods');
    });

    it('should generate URL for custom resources without namespace', () => {
      const endpoint = { group: 'apps', version: 'v1', resource: 'deployments' };
      const url = KubeObjectEndpoint.toUrl(endpoint);
      expect(url).toBe('apis/apps/v1/deployments');
    });

    it('should generate URL for custom resources with namespace', () => {
      const endpoint = { group: 'apps', version: 'v1', resource: 'deployments' };
      const url = KubeObjectEndpoint.toUrl(endpoint, 'default');
      expect(url).toBe('apis/apps/v1/namespaces/default/deployments');
    });

    it('should generate URL for custom resources with empty group', () => {
      const endpoint = { group: '', version: 'v1', resource: 'services' };
      const url = KubeObjectEndpoint.toUrl(endpoint);
      expect(url).toBe('api/v1/services');
    });

    it('should generate URL for custom resources with empty group and namespace', () => {
      const endpoint = { group: '', version: 'v1', resource: 'services' };
      const url = KubeObjectEndpoint.toUrl(endpoint, 'default');
      expect(url).toBe('api/v1/namespaces/default/services');
    });
  });
});
