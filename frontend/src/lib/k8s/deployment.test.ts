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
import App from '../../App';
import { jsonPatch } from './api/v1/clusterRequests';
import Deployment from './deployment';
import ReplicaSet from './replicaSet';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

vi.mock('./api/v1/clusterRequests', async importOriginal => {
  const actual = await importOriginal<typeof import('./api/v1/clusterRequests')>();
  return {
    ...actual,
    jsonPatch: vi.fn().mockResolvedValue({ kind: 'Deployment' }),
  };
});

function makeReplicaSet(uid: string, ownerUid: string, revision?: string, image = 'nginx:1.0') {
  return new ReplicaSet({
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      name: `rs-${uid}`,
      namespace: 'default',
      uid,
      creationTimestamp: '2025-01-01T00:00:00Z',
      annotations: revision ? { 'deployment.kubernetes.io/revision': revision } : {},
      ownerReferences: ownerUid
        ? [{ apiVersion: 'apps/v1', kind: 'Deployment', name: 'web', uid: ownerUid }]
        : [],
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'web' } },
      template: {
        metadata: { labels: { app: 'web', 'pod-template-hash': 'abc123' } },
        spec: { containers: [{ name: 'web', image }], nodeName: '' },
      },
    },
    status: { replicas: 1 },
  } as any);
}

describe('Deployment class', () => {
  const makeDeployment = (overrides: Record<string, any> = {}) =>
    new Deployment(
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'web',
          namespace: 'default',
          uid: 'dep-uid',
          resourceVersion: '10',
          annotations: { 'deployment.kubernetes.io/revision': '2' },
          ...overrides.metadata,
        },
        spec: {
          selector: { matchLabels: { app: 'web', tier: 'frontend' } },
          template: {
            spec: { containers: [{ name: 'web', image: 'nginx:2.0' }], nodeName: '' },
          },
          ...overrides.spec,
        },
        status: { availableReplicas: 1, ...overrides.status },
      } as any,
      'test-cluster'
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes spec, status, containers, matchLabels, currentRevision, and baseObject', () => {
    const dep = makeDeployment();
    expect(dep.status.availableReplicas).toBe(1);
    expect(dep.getContainers()).toHaveLength(1);
    expect(dep.getMatchLabelsList()).toEqual(['app=web', 'tier=frontend']);
    expect(dep.getCurrentRevision()).toBe('2');

    const emptyDep = makeDeployment({
      metadata: { annotations: undefined },
      spec: { selector: undefined, template: undefined },
    });
    expect(emptyDep.getContainers()).toEqual([]);
    expect(emptyDep.getMatchLabelsList()).toEqual([]);
    expect(emptyDep.getCurrentRevision()).toBe('0');

    const base = Deployment.getBaseObject();
    expect(base.metadata.labels).toEqual({ app: 'headlamp' });
    expect(base.spec.selector?.matchLabels).toEqual({ app: 'headlamp' });
  });

  it('lists owned ReplicaSets and caches revision history', async () => {
    const cancelFn = vi.fn();
    const rs1 = makeReplicaSet('rs1', 'dep-uid', '1', 'nginx:1.0');
    const rs2 = makeReplicaSet('rs2', 'dep-uid', '2', 'nginx:2.0');
    const rsUnowned = makeReplicaSet('rs3', 'other-uid', '3');
    const rsNoRev = makeReplicaSet('rs4', 'dep-uid');

    const spy = vi.spyOn(ReplicaSet, 'apiList').mockImplementation((cb: any) => {
      return async () => {
        setTimeout(() => cb([rs1, rs2, rsUnowned, rsNoRev]), 0);
        return cancelFn;
      };
    });

    const dep = makeDeployment();
    const history = await dep.getRevisionHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ revision: 2, isCurrent: true, images: ['nginx:2.0'] });
    expect(history[1]).toMatchObject({ revision: 1, isCurrent: false, images: ['nginx:1.0'] });
    expect(cancelFn).toHaveBeenCalledTimes(1);

    // Second call with same resourceVersion uses cache
    const cached = await dep.getRevisionHistory();
    expect(cached).toBe(history);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('handles rollback failure cases and paused deployments', async () => {
    const pausedDep = makeDeployment({ spec: { paused: true } });
    expect(await pausedDep.rollback()).toEqual({
      success: false,
      message: 'Cannot rollback a paused deployment',
    });

    const rs2 = makeReplicaSet('rs2', 'dep-uid', '2');
    const spy = vi.spyOn(ReplicaSet, 'apiList').mockImplementation((cb: any) => {
      return async () => {
        cb([rs2]);
        return () => {};
      };
    });

    const dep = makeDeployment();
    expect(await dep.rollback()).toEqual({
      success: false,
      message: 'No previous revision available to rollback to',
    });
    expect(await dep.rollback(99)).toEqual({
      success: false,
      message: 'Revision 99 not found in history',
    });
    expect(await dep.rollback({ toRevision: 2 })).toEqual({
      success: false,
      message: 'Cannot rollback to current revision',
    });
    spy.mockRestore();
  });

  it('rolls back to previous or specific revision and supports dryRun', async () => {
    const rs1 = makeReplicaSet('rs1', 'dep-uid', '1', 'nginx:1.0');
    const rs2 = makeReplicaSet('rs2', 'dep-uid', '2', 'nginx:2.0');
    const spy = vi.spyOn(ReplicaSet, 'apiList').mockImplementation((cb: any) => {
      return async () => {
        cb([rs1, rs2]);
        return () => {};
      };
    });

    const dep = makeDeployment();
    // Dry-run to revision 1
    const dryRes = await dep.rollback({ toRevision: 1, dryRun: true });
    expect(dryRes).toMatchObject({
      success: true,
      message: 'Dry-run: would rollback to revision 1',
      previousRevision: 1,
      dryRunResult: { kind: 'Deployment' },
    });
    expect(jsonPatch).toHaveBeenLastCalledWith(
      '/apis/apps/v1/namespaces/default/deployments/web?dryRun=All',
      [
        {
          op: 'replace',
          path: '/spec/template',
          value: expect.objectContaining({
            metadata: { labels: { app: 'web' } },
          }),
        },
      ],
      true,
      { cluster: 'test-cluster' }
    );

    // Real rollback without explicit revision picks previous (revision 1)
    const res = await dep.rollback();
    expect(res).toEqual({
      success: true,
      message: 'Rolled back to revision 1',
      previousRevision: 1,
      dryRunResult: undefined,
    });

    // Error handling when jsonPatch rejects
    vi.mocked(jsonPatch).mockRejectedValueOnce(new Error('forbidden'));
    expect(await dep.rollback()).toEqual({
      success: false,
      message: 'Failed to rollback: forbidden',
    });
    spy.mockRestore();
  });
});
