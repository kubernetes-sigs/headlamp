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
import { storeClusterSettings } from '../../helpers/clusterSettings';
import type { ClusterUserInfo } from './api/v1/clusterApi';
import {
  AuthNotReadyForDiscoveryError,
  buildDiscoveryError,
  discoverAccessibleNamespaces,
  extractNamespacesFromRoleBindings,
  type KubeBinding,
  ROLE_BINDINGS_LIST_PATH,
  subjectMatchesUser,
} from './namespaceDiscovery';
import {
  formatNamespaceDiscoveryError,
  getDiscoveredNamespaces,
  getEffectiveNamespaces,
  getNamespaceListConfig,
  runNamespaceDiscoveryWithAuthRetry,
  usesDiscoveredNamespaceRouting,
} from './useDiscoveredNamespaces';

vi.mock('./api/v1/clusterApi', async importOriginal => {
  const actual = await importOriginal<typeof import('./api/v1/clusterApi')>();
  return {
    ...actual,
    getClusterUserInfoForRbac: vi.fn(),
  };
});

vi.mock('./api/v1/clusterRequests', () => ({
  clusterRequest: vi.fn(),
  post: vi.fn(),
}));

import { getClusterUserInfoForRbac } from './api/v1/clusterApi';
import { clusterRequest, post } from './api/v1/clusterRequests';

const userInfo: ClusterUserInfo = {
  username: 'alice@example.com',
  groups: ['team-a', 'oidc-users'],
};

const mockedGetClusterUserInfoForRbac = vi.mocked(getClusterUserInfoForRbac);
const mockedClusterRequest = vi.mocked(clusterRequest);
const mockedPost = vi.mocked(post);

function forbiddenError(): Error & { status: number } {
  return Object.assign(new Error('Forbidden'), { status: 403 });
}

describe('subjectMatchesUser', () => {
  it('matches User subject by username', () => {
    expect(subjectMatchesUser({ kind: 'User', name: 'alice@example.com' }, userInfo)).toBe(true);
    expect(subjectMatchesUser({ kind: 'User', name: 'bob@example.com' }, userInfo)).toBe(false);
  });

  it('matches Group subject by group membership', () => {
    expect(subjectMatchesUser({ kind: 'Group', name: 'team-a' }, userInfo)).toBe(true);
    expect(subjectMatchesUser({ kind: 'Group', name: 'team-b' }, userInfo)).toBe(false);
  });
});

describe('extractNamespacesFromRoleBindings', () => {
  const roleBindings: KubeBinding[] = [
    {
      metadata: { namespace: 'app-team-a', name: 'alice-binding' },
      subjects: [{ kind: 'User', name: 'alice@example.com' }],
    },
    {
      metadata: { namespace: 'app-team-b', name: 'group-binding' },
      subjects: [{ kind: 'Group', name: 'team-a' }],
    },
  ];

  it('returns namespaces from matching RoleBindings', () => {
    expect(extractNamespacesFromRoleBindings(roleBindings, userInfo)).toEqual([
      'app-team-a',
      'app-team-b',
    ]);
  });
});

describe('discoverAccessibleNamespaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetClusterUserInfoForRbac.mockResolvedValue(userInfo);
  });

  it('uses list namespaces API when permitted', async () => {
    mockedClusterRequest.mockResolvedValueOnce({
      items: [{ metadata: { name: 'default' } }, { metadata: { name: 'kube-system' } }],
    });

    await expect(discoverAccessibleNamespaces('test-cluster')).resolves.toEqual({
      namespaces: ['default', 'kube-system'],
      isClusterWide: false,
      source: 'api',
    });
  });

  it('returns RoleBinding-derived namespaces when list namespaces is denied', async () => {
    mockedClusterRequest.mockRejectedValueOnce(forbiddenError()).mockResolvedValueOnce({
      items: [
        {
          metadata: { namespace: 'app-team-a', name: 'viewer' },
          subjects: [{ kind: 'Group', name: 'team-a' }],
        },
      ],
    });

    mockedPost.mockResolvedValue({ status: { allowed: true } });

    await expect(discoverAccessibleNamespaces('test-cluster')).resolves.toEqual({
      namespaces: ['app-team-a'],
      isClusterWide: false,
      source: 'rolebindings',
    });
  });

  it('lists only RoleBindings for namespace discovery (not ClusterRoleBindings)', async () => {
    mockedClusterRequest.mockRejectedValueOnce(forbiddenError()).mockResolvedValueOnce({
      items: [
        {
          metadata: { namespace: 'app-team-a', name: 'viewer' },
          subjects: [{ kind: 'Group', name: 'team-a' }],
        },
      ],
    });

    mockedPost.mockResolvedValue({ status: { allowed: true } });

    const result = await discoverAccessibleNamespaces('test-cluster');
    expect(result.namespaces).toEqual(['app-team-a']);
    expect(result.isClusterWide).toBe(false);

    const rbacCalls = mockedClusterRequest.mock.calls
      .map(([path]) => String(path))
      .filter(path => path.includes('rbac.authorization.k8s.io'));
    expect(rbacCalls).toEqual([ROLE_BINDINGS_LIST_PATH]);
  });

  it('detects cluster-wide routing via SSAR without listing ClusterRoleBindings', async () => {
    mockedClusterRequest
      .mockRejectedValueOnce(forbiddenError()) // list namespaces denied
      .mockResolvedValueOnce({ items: [] }); // no RoleBindings

    mockedPost.mockResolvedValue({ status: { allowed: true } }); // cluster-scoped SSAR

    const result = await discoverAccessibleNamespaces('test-cluster');
    expect(result.isClusterWide).toBe(true);
    expect(result.source).toBe('clusterwide');

    const rbacCalls = mockedClusterRequest.mock.calls
      .map(([path]) => String(path))
      .filter(path => path.includes('clusterrolebindings'));
    expect(rbacCalls).toHaveLength(0);
  });

  it('retries when auth identity is not ready (cluster-name fallback + rolebindings 403)', async () => {
    mockedGetClusterUserInfoForRbac.mockResolvedValue({
      username: 'test-cluster',
      isClusterNamePlaceholder: true,
    });
    mockedClusterRequest
      .mockRejectedValueOnce(forbiddenError())
      .mockRejectedValueOnce(forbiddenError());
    mockedPost.mockResolvedValue({ status: { allowed: false } });

    await expect(discoverAccessibleNamespaces('test-cluster')).rejects.toBeInstanceOf(
      AuthNotReadyForDiscoveryError
    );
  });
});

describe('usesDiscoveredNamespaceRouting', () => {
  it('is false for list-namespaces API success (legacy path)', () => {
    expect(
      usesDiscoveredNamespaceRouting({
        namespaces: ['default', 'kube-system'],
        isClusterWide: false,
        source: 'api',
      })
    ).toBe(false);
  });

  it('is true for RoleBinding discovery', () => {
    expect(
      usesDiscoveredNamespaceRouting({
        namespaces: ['app-team-a'],
        isClusterWide: false,
        source: 'rolebindings',
      })
    ).toBe(true);
  });

  it('is true for Settings/kubeconfig fallback', () => {
    expect(
      usesDiscoveredNamespaceRouting({
        namespaces: ['team-a', 'team-b'],
        isClusterWide: false,
        source: 'fallback',
      })
    ).toBe(true);
  });

  it('is false for cluster-wide routing', () => {
    expect(
      usesDiscoveredNamespaceRouting({
        namespaces: [],
        isClusterWide: true,
        source: 'clusterwide',
      })
    ).toBe(false);
  });
});

describe('getEffectiveNamespaces', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns discovered namespaces for rolebindings source', () => {
    expect(
      getEffectiveNamespaces('test-cluster', {
        namespaces: ['app-team-a'],
        isClusterWide: false,
        source: 'rolebindings',
      })
    ).toEqual(['app-team-a']);
  });

  it('returns discovered namespaces for fallback source', () => {
    expect(
      getEffectiveNamespaces('test-cluster', {
        namespaces: ['default'],
        isClusterWide: false,
        source: 'fallback',
      })
    ).toEqual(['default']);
  });

  it('returns empty for list-namespaces API success (preserves legacy cluster-wide routing)', () => {
    expect(
      getEffectiveNamespaces('test-cluster', {
        namespaces: ['default', 'kube-system'],
        isClusterWide: false,
        source: 'api',
      })
    ).toEqual([]);
  });

  it('returns empty while discovery is loading (preserves legacy path)', () => {
    expect(getEffectiveNamespaces('test-cluster', undefined)).toEqual([]);
  });

  it('prefers manual Settings override over discovered namespaces', () => {
    storeClusterSettings('test-cluster', { allowedNamespaces: ['manual-ns'] });
    expect(
      getEffectiveNamespaces('test-cluster', {
        namespaces: ['discovered-ns'],
        isClusterWide: false,
        source: 'rolebindings',
      })
    ).toEqual(['manual-ns']);
  });
});

describe('getDiscoveredNamespaces', () => {
  it('returns namespaces from rolebindings and fallback sources only', () => {
    expect(
      getDiscoveredNamespaces({
        namespaces: ['app-team-a'],
        isClusterWide: false,
        source: 'rolebindings',
      })
    ).toEqual(['app-team-a']);

    expect(
      getDiscoveredNamespaces({
        namespaces: ['team-a'],
        isClusterWide: false,
        source: 'fallback',
      })
    ).toEqual(['team-a']);

    expect(
      getDiscoveredNamespaces({
        namespaces: ['default'],
        isClusterWide: false,
        source: 'api',
      })
    ).toEqual([]);
  });
});

describe('buildDiscoveryError', () => {
  it('returns list_rolebindings_denied when RoleBinding list failed', () => {
    expect(
      buildDiscoveryError(userInfo, {
        namespaces: [],
        listFailed: true,
        bindingCount: 0,
      })
    ).toEqual({
      code: 'list_rolebindings_denied',
      identity: 'user=alice@example.com, groups=team-a, oidc-users',
    });
  });

  it('returns no_matching_bindings when bindings exist but none match', () => {
    expect(
      buildDiscoveryError(userInfo, {
        namespaces: [],
        listFailed: false,
        bindingCount: 3,
      })
    ).toEqual({
      code: 'no_matching_bindings',
      identity: 'user=alice@example.com, groups=team-a, oidc-users',
    });
  });
});

describe('runNamespaceDiscoveryWithAuthRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetClusterUserInfoForRbac.mockResolvedValue({
      username: 'test-cluster',
      isClusterNamePlaceholder: true,
    });
    mockedClusterRequest.mockRejectedValue(forbiddenError());
    mockedPost.mockResolvedValue({ status: { allowed: false } });
  });

  it('returns auth_not_ready after auth retries are exhausted', async () => {
    vi.useFakeTimers();
    const resultPromise = runNamespaceDiscoveryWithAuthRetry('test-cluster');
    await vi.runAllTimersAsync();
    await expect(resultPromise).resolves.toEqual({
      namespaces: [],
      isClusterWide: false,
      source: 'none',
      error: { code: 'auth_not_ready', identity: '' },
    });
    vi.useRealTimers();
  });
});

describe('formatNamespaceDiscoveryError', () => {
  const t = ((key: string, params?: Record<string, string>) =>
    params?.identity ? `${key} ${params.identity}` : key) as Parameters<
    typeof formatNamespaceDiscoveryError
  >[0];

  it('formats discovery_failed with identity interpolation', () => {
    expect(
      formatNamespaceDiscoveryError(t, {
        code: 'discovery_failed',
        identity: 'user=alice@example.com, groups=(none)',
      })
    ).toContain('user=alice@example.com, groups=(none)');
  });
});

describe('getNamespaceListConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses legacy empty namespaces while discovery is loading', () => {
    expect(getNamespaceListConfig('test-cluster', undefined, false)).toEqual({
      namespaces: [],
    });
  });

  it('uses discovered namespaces once rolebinding discovery completes', () => {
    expect(
      getNamespaceListConfig(
        'test-cluster',
        { namespaces: ['app-team-a'], isClusterWide: false, source: 'rolebindings' },
        false
      )
    ).toEqual({ namespaces: ['app-team-a'] });
  });

  it('preserves legacy cluster-wide routing when list namespaces works', () => {
    expect(
      getNamespaceListConfig(
        'test-cluster',
        { namespaces: ['default'], isClusterWide: false, source: 'api' },
        false
      )
    ).toEqual({ namespaces: [] });
  });

  it('prefers manual Settings override over discovered namespaces', () => {
    storeClusterSettings('test-cluster', { allowedNamespaces: ['manual-ns'] });
    expect(
      getNamespaceListConfig(
        'test-cluster',
        { namespaces: ['discovered-ns'], isClusterWide: false, source: 'rolebindings' },
        false
      )
    ).toEqual({ namespaces: ['manual-ns'] });
  });
});
