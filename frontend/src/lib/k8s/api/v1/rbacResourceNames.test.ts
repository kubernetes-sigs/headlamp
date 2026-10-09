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

import { describe, expect, it, vi } from 'vitest';
import { fetchResourceNamesRestriction } from './rbacResourceNames';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock('./clusterRequests', () => ({
  post: postMock,
}));

vi.mock('../../../cluster', () => ({
  getCluster: () => 'test-cluster',
}));

describe('fetchResourceNamesRestriction', () => {
  it('returns the resourceNames when every matching rule restricts them', async () => {
    postMock.mockResolvedValueOnce({
      status: {
        resourceRules: [
          {
            verbs: ['get', 'list', 'watch'],
            apiGroups: [''],
            resources: ['nodes'],
            resourceNames: ['worker-node-1'],
          },
        ],
      },
    });

    const result = await fetchResourceNamesRestriction('test-cluster', '', 'nodes', 'list');
    expect(result).toEqual(['worker-node-1']);
  });

  it('merges resourceNames across multiple matching rules', async () => {
    postMock.mockResolvedValueOnce({
      status: {
        resourceRules: [
          {
            verbs: ['list'],
            apiGroups: [''],
            resources: ['nodes'],
            resourceNames: ['worker-node-1'],
          },
          {
            verbs: ['list'],
            apiGroups: [''],
            resources: ['nodes'],
            resourceNames: ['worker-node-2'],
          },
        ],
      },
    });

    const result = await fetchResourceNamesRestriction('test-cluster', '', 'nodes', 'list');
    expect(result).toEqual(['worker-node-1', 'worker-node-2']);
  });

  it('returns null when a matching rule has no resourceNames (unrestricted access)', async () => {
    postMock.mockResolvedValueOnce({
      status: {
        resourceRules: [
          {
            verbs: ['list'],
            apiGroups: [''],
            resources: ['nodes'],
          },
        ],
      },
    });

    const result = await fetchResourceNamesRestriction('test-cluster', '', 'nodes', 'list');
    expect(result).toBeNull();
  });

  it('returns null when no rule matches the apiGroup/resource/verb', async () => {
    postMock.mockResolvedValueOnce({
      status: {
        resourceRules: [
          {
            verbs: ['list'],
            apiGroups: [''],
            resources: ['pods'],
            resourceNames: ['some-pod'],
          },
        ],
      },
    });

    const result = await fetchResourceNamesRestriction('test-cluster', '', 'nodes', 'list');
    expect(result).toBeNull();
  });

  it('treats a wildcard verb/apiGroup/resource rule as matching', async () => {
    postMock.mockResolvedValueOnce({
      status: {
        resourceRules: [
          {
            verbs: ['*'],
            apiGroups: ['*'],
            resources: ['*'],
            resourceNames: ['worker-node-1'],
          },
        ],
      },
    });

    const result = await fetchResourceNamesRestriction('test-cluster', '', 'nodes', 'list');
    expect(result).toEqual(['worker-node-1']);
  });

  it('returns null and does not throw when the rules review request fails', async () => {
    postMock.mockRejectedValueOnce(new Error('network error'));

    const result = await fetchResourceNamesRestriction('test-cluster', '', 'nodes', 'list');
    expect(result).toBeNull();
  });

  it('treats resourceNames: ["*"] as a literal restricted name, not unrestricted access', async () => {
    postMock.mockResolvedValueOnce({
      status: {
        resourceRules: [
          {
            verbs: ['list'],
            apiGroups: [''],
            resources: ['nodes'],
            resourceNames: ['*'],
          },
        ],
      },
    });

    const result = await fetchResourceNamesRestriction('test-cluster', '', 'nodes', 'list');
    expect(result).toEqual(['*']);
  });

  it('returns null when the rules review is incomplete, even if a matching rule is restrictive', async () => {
    postMock.mockResolvedValueOnce({
      status: {
        incomplete: true,
        resourceRules: [
          {
            verbs: ['list'],
            apiGroups: [''],
            resources: ['nodes'],
            resourceNames: ['worker-node-1'],
          },
        ],
      },
    });

    const result = await fetchResourceNamesRestriction('test-cluster', '', 'nodes', 'list');
    expect(result).toBeNull();
  });
});
