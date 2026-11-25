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
import ControllerRevision from './controllerRevision';
import StatefulSet from './statefulSet';

vi.mock('./api/v1/clusterRequests', () => ({
  jsonPatch: vi.fn(),
}));

const mockedJsonPatch = vi.mocked(jsonPatch);

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function makeControllerRevision(
  uid: string,
  ownerUid: string,
  revision: number,
  withTemplate = true
) {
  return new ControllerRevision({
    apiVersion: 'apps/v1',
    kind: 'ControllerRevision',
    metadata: {
      name: `sts-rev-${revision}`,
      namespace: 'default',
      uid,
      creationTimestamp: '2025-01-01T00:00:00Z',
      ownerReferences: ownerUid
        ? [{ apiVersion: 'apps/v1', kind: 'StatefulSet', name: 'test-statefulset', uid: ownerUid }]
        : [],
    },
    revision,
    data: withTemplate
      ? {
          spec: {
            template: {
              metadata: { labels: { app: 'myapp', 'controller-revision-hash': 'hash123' } },
              spec: { containers: [{ name: 'db', image: `postgres:${revision}` }] },
            },
          },
        }
      : {},
  } as any);
}

describe('StatefulSet class', () => {
  const mockStatefulSetData = {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: 'test-statefulset',
      namespace: 'default',
      uid: 'sts-uid-123',
      resourceVersion: '789',
      generation: 2,
    },
    spec: {
      selector: {
        matchLabels: { app: 'myapp' },
      },
      serviceName: 'my-service',
      podManagementPolicy: 'OrderedReady',
      updateStrategy: {
        type: 'RollingUpdate',
        rollingUpdate: { partition: 0 },
      },
      template: {
        spec: {
          containers: [
            { name: 'db', image: 'postgres:15', imagePullPolicy: 'Always' },
            { name: 'exporter', image: 'pg-exporter:v2', imagePullPolicy: 'IfNotPresent' },
          ],
          nodeName: 'node-1',
        },
      },
    },
    status: {
      observedGeneration: 2,
    },
  };

  describe('getBaseObject', () => {
    it('returns a StatefulSet with correct defaults', () => {
      const base = StatefulSet.getBaseObject();
      expect(base.kind).toBe('StatefulSet');
      expect(base.apiVersion).toBe('apps/v1');
      expect(base.metadata.namespace).toBe('');
      expect(base.spec.selector.matchLabels).toEqual({ app: 'headlamp' });
      expect(base.spec.updateStrategy.type).toBe('RollingUpdate');
      expect(base.spec.updateStrategy.rollingUpdate.partition).toBe(0);
    });

    it('includes a default container template', () => {
      const base = StatefulSet.getBaseObject();
      expect(base.spec.template.spec.containers).toHaveLength(1);
      expect(base.spec.template.spec.containers![0].name).toBe('');
      expect(base.spec.template.spec.containers![0].image).toBe('');
      expect(base.spec.template.spec.containers![0].imagePullPolicy).toBe('Always');
    });

    it('has isScalable static property set to true', () => {
      expect(StatefulSet.isScalable).toBe(true);
    });
  });

  describe('getContainers', () => {
    it('returns all containers from the pod template spec', () => {
      const sts = new StatefulSet(JSON.parse(JSON.stringify(mockStatefulSetData)));
      const containers = sts.getContainers();
      expect(containers).toHaveLength(2);
      expect(containers[0].name).toBe('db');
      expect(containers[1].name).toBe('exporter');
    });

    it('returns empty array when spec is missing', () => {
      const data = JSON.parse(JSON.stringify(mockStatefulSetData));
      delete data.spec;
      const sts = new StatefulSet(data);
      expect(sts.getContainers()).toEqual([]);
    });

    it('returns empty array when template is missing', () => {
      const data = JSON.parse(JSON.stringify(mockStatefulSetData));
      delete data.spec.template;
      const sts = new StatefulSet(data);
      expect(sts.getContainers()).toEqual([]);
    });
  });

  describe('getCurrentRevision', () => {
    it('returns observedGeneration when available', () => {
      const sts = new StatefulSet(JSON.parse(JSON.stringify(mockStatefulSetData)));
      expect(sts.getCurrentRevision()).toBe('2');
    });

    it('falls back to metadata.generation when observedGeneration is missing', () => {
      const data = JSON.parse(JSON.stringify(mockStatefulSetData));
      delete data.status.observedGeneration;
      const sts = new StatefulSet(data);
      expect(sts.getCurrentRevision()).toBe('2');
    });

    it('returns empty string when no generation or observedGeneration exists', () => {
      const data = JSON.parse(JSON.stringify(mockStatefulSetData));
      delete data.status.observedGeneration;
      data.metadata.generation = undefined;
      const sts = new StatefulSet(data);
      expect(sts.getCurrentRevision()).toBe('');
    });
  });

  describe('rollback', () => {
    function makeTemplate(image: string) {
      return {
        metadata: {
          labels: {
            app: 'myapp',
            'controller-revision-hash': 'test-hash',
          },
        },
        spec: {
          containers: [{ name: 'db', image }],
        },
      };
    }

    const template = makeTemplate('postgres:16');

    function makeRevision(revision: number, revisionTemplate: any = template) {
      return {
        revision,
        data: revisionTemplate ? { spec: { template: revisionTemplate } } : {},
      };
    }

    function makeStatefulSet() {
      return new StatefulSet(JSON.parse(JSON.stringify(mockStatefulSetData)));
    }

    beforeEach(() => {
      mockedJsonPatch.mockReset();
    });

    it('rolls back to the previous revision', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3, makeTemplate('postgres:17')),
        makeRevision(2, makeTemplate('postgres:16')),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      const result = await sts.rollback();

      expect(result).toMatchObject({
        success: true,
        message: 'Rolled back to revision 2',
        previousRevision: 2,
      });
      expect(mockedJsonPatch).toHaveBeenCalledWith(
        expect.stringContaining('/apis/apps/v1/namespaces/default/statefulsets/test-statefulset'),
        [
          {
            op: 'replace',
            path: '/spec/template',
            value: {
              metadata: {
                labels: {
                  app: 'myapp',
                },
              },
              spec: {
                containers: [{ name: 'db', image: 'postgres:16' }],
              },
            },
          },
        ],
        true,
        { cluster: sts.cluster }
      );
    });

    it('rolls back to a specific older revision', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3, makeTemplate('postgres:17')),
        makeRevision(2, makeTemplate('postgres:16')),
        makeRevision(1, makeTemplate('postgres:15')),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      const result = await sts.rollback(1);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Rolled back to revision 1');
      expect(result.previousRevision).toBe(1);
      expect(mockedJsonPatch.mock.calls[0][1][0]).toMatchObject({
        value: { spec: { containers: [{ image: 'postgres:15' }] } },
      });
    });

    it('returns failure when no previous revision is available', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([makeRevision(3)]);

      const result = await sts.rollback();

      expect(result).toEqual({
        success: false,
        message: 'No previous revision available to rollback to',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('returns failure when the target revision is not found', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);

      const result = await sts.rollback(1);

      expect(result).toEqual({
        success: false,
        message: 'Revision 1 not found in history',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('returns failure when rolling back to the current revision', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);

      const result = await sts.rollback(3);

      expect(result).toEqual({
        success: false,
        message: 'Cannot rollback to current revision',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('returns failure when the target revision has no pod template', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2, null),
      ]);

      const result = await sts.rollback();

      expect(result).toEqual({
        success: false,
        message: 'Target revision does not contain a valid pod template',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('supports dry run rollback', async () => {
      const sts = makeStatefulSet();
      const dryRunResult = { metadata: { name: 'test-statefulset' } };
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3, makeTemplate('postgres:17')),
        makeRevision(2, makeTemplate('postgres:16')),
      ]);
      mockedJsonPatch.mockResolvedValue(dryRunResult as any);

      const result = await sts.rollback({ dryRun: true });

      expect(result).toEqual({
        success: true,
        message: 'Dry-run: would rollback to revision 2',
        previousRevision: 2,
        dryRunResult,
      });
      expect(mockedJsonPatch).toHaveBeenCalledWith(
        expect.stringContaining('/statefulsets/test-statefulset?dryRun=All'),
        expect.any(Array),
        true,
        { cluster: sts.cluster }
      );
      expect(mockedJsonPatch.mock.calls[0][1][0]).toMatchObject({
        value: { spec: { containers: [{ image: 'postgres:16' }] } },
      });
    });

    it('returns failure when the patch request fails', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);
      mockedJsonPatch.mockRejectedValue(new Error('patch failed'));

      const result = await sts.rollback();

      expect(result).toEqual({
        success: false,
        message: 'Failed to rollback: patch failed',
      });
    });

    it('returns failure when there are no revisions at all', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([]);

      const result = await sts.rollback();

      expect(result).toEqual({
        success: false,
        message: 'No previous revision available to rollback to',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('ignores revisions with revision number <= 0', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(2),
        makeRevision(0),
        makeRevision(-1),
      ]);

      const result = await sts.rollback();

      expect(result).toEqual({
        success: false,
        message: 'No previous revision available to rollback to',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('correctly sorts unsorted revisions and picks the second highest', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(1, makeTemplate('postgres:15')),
        makeRevision(3, makeTemplate('postgres:17')),
        makeRevision(2, makeTemplate('postgres:16')),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      const result = await sts.rollback();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Rolled back to revision 2');
      expect(result.previousRevision).toBe(2);
      expect(mockedJsonPatch.mock.calls[0][1][0]).toMatchObject({
        value: { spec: { containers: [{ image: 'postgres:16' }] } },
      });
    });

    it('handles non-Error exceptions gracefully', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);
      mockedJsonPatch.mockRejectedValue('string error');

      const result = await sts.rollback();

      expect(result).toEqual({
        success: false,
        message: 'Failed to rollback: string error',
      });
    });

    it('strips controller-revision-hash label from the patched template', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      await sts.rollback();

      const patchOps = mockedJsonPatch.mock.calls[0][1];
      expect(patchOps[0]).toMatchObject({
        value: {
          metadata: {
            labels: {
              app: 'myapp',
            },
          },
        },
      });
      expect(patchOps[0]).not.toMatchObject({
        value: {
          metadata: {
            labels: {
              'controller-revision-hash': expect.any(String),
            },
          },
        },
      });
    });

    it('invalidates the revision history cache after a real rollback', async () => {
      const sts = makeStatefulSet();
      (sts as any).revisionHistoryCache = { resourceVersion: '789', history: [] };
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      await sts.rollback();

      expect((sts as any).revisionHistoryCache).toBeUndefined();
    });

    it('preserves the revision history cache after a dry-run rollback', async () => {
      const sts = makeStatefulSet();
      const existingCache = { resourceVersion: '789', history: [] };
      (sts as any).revisionHistoryCache = existingCache;
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      await sts.rollback({ dryRun: true });

      expect((sts as any).revisionHistoryCache).toBe(existingCache);
    });

    it('accepts RollbackOptions object with toRevision', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3, makeTemplate('postgres:17')),
        makeRevision(2, makeTemplate('postgres:16')),
        makeRevision(1, makeTemplate('postgres:15')),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      const result = await sts.rollback({ toRevision: 1 });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Rolled back to revision 1');
      expect(result.previousRevision).toBe(1);
      expect(mockedJsonPatch.mock.calls[0][1][0]).toMatchObject({
        value: { spec: { containers: [{ image: 'postgres:15' }] } },
      });
    });

    it('returns failure when getOwnedControllerRevisions rejects', async () => {
      const sts = makeStatefulSet();
      vi.spyOn(sts as any, 'getOwnedControllerRevisions').mockRejectedValue(
        new Error('failed to list revisions')
      );

      const result = await sts.rollback();

      expect(result).toEqual({
        success: false,
        message: 'Failed to rollback: failed to list revisions',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });
  });

  describe('rollback and revision history', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockedJsonPatch.mockResolvedValue({ kind: 'StatefulSet' } as any);
    });

    it('exposes status, lists owned ControllerRevisions, and caches revision history', async () => {
      const sts = new StatefulSet(JSON.parse(JSON.stringify(mockStatefulSetData)), 'my-cluster');
      expect(sts.status.observedGeneration).toBe(2);

      const rev1 = makeControllerRevision('r1', 'sts-uid-123', 1);
      const rev2 = makeControllerRevision('r2', 'sts-uid-123', 2);
      const revOther = makeControllerRevision('r3', 'other-uid', 3);
      const revZero = makeControllerRevision('r4', 'sts-uid-123', 0);

      const cancelFn = vi.fn();
      const spy = vi.spyOn(ControllerRevision, 'apiList').mockImplementation((cb: any) => {
        return async () => {
          setTimeout(() => cb([rev1, rev2, revOther, revZero]), 0);
          return cancelFn;
        };
      });

      const history = await sts.getRevisionHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({ revision: 2, isCurrent: true, images: ['postgres:2'] });
      expect(history[1]).toMatchObject({ revision: 1, isCurrent: false, images: ['postgres:1'] });
      expect(cancelFn).toHaveBeenCalledTimes(1);

      expect(await sts.getRevisionHistory()).toBe(history);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('handles rollback error and validation cases', async () => {
      const sts = new StatefulSet(JSON.parse(JSON.stringify(mockStatefulSetData)));
      const rev2 = makeControllerRevision('r2', 'sts-uid-123', 2);
      const spy = vi.spyOn(ControllerRevision, 'apiList').mockImplementation((cb: any) => {
        return async () => {
          cb([rev2]);
          return () => {};
        };
      });

      expect(await sts.rollback()).toEqual({
        success: false,
        message: 'No previous revision available to rollback to',
      });
      expect(await sts.rollback(99)).toEqual({
        success: false,
        message: 'Revision 99 not found in history',
      });
      expect(await sts.rollback({ toRevision: 2 })).toEqual({
        success: false,
        message: 'Cannot rollback to current revision',
      });
      spy.mockRestore();
    });

    it('fails when target revision lacks a pod template and succeeds on valid/dryRun rollback', async () => {
      const sts = new StatefulSet(JSON.parse(JSON.stringify(mockStatefulSetData)), 'my-cluster');
      const rev1NoTpl = makeControllerRevision('r1', 'sts-uid-123', 1, false);
      const rev2 = makeControllerRevision('r2', 'sts-uid-123', 2);

      const spy = vi.spyOn(ControllerRevision, 'apiList').mockImplementation((cb: any) => {
        return async () => {
          cb([rev1NoTpl, rev2]);
          return () => {};
        };
      });

      expect(await sts.rollback(1)).toEqual({
        success: false,
        message: 'Target revision does not contain a valid pod template',
      });

      const rev1 = makeControllerRevision('r1', 'sts-uid-123', 1, true);
      spy.mockImplementation((cb: any) => {
        return async () => {
          cb([rev1, rev2]);
          return () => {};
        };
      });

      const dryRes = await sts.rollback({ toRevision: 1, dryRun: true });
      expect(dryRes).toMatchObject({
        success: true,
        message: 'Dry-run: would rollback to revision 1',
        previousRevision: 1,
        dryRunResult: { kind: 'StatefulSet' },
      });
      expect(jsonPatch).toHaveBeenLastCalledWith(
        '/apis/apps/v1/namespaces/default/statefulsets/test-statefulset?dryRun=All',
        [
          {
            op: 'replace',
            path: '/spec/template',
            value: expect.objectContaining({ metadata: { labels: { app: 'myapp' } } }),
          },
        ],
        true,
        { cluster: 'my-cluster' }
      );

      expect(await sts.rollback()).toEqual({
        success: true,
        message: 'Rolled back to revision 1',
        previousRevision: 1,
        dryRunResult: undefined,
      });

      vi.mocked(jsonPatch).mockRejectedValueOnce(new Error('denied'));
      expect(await sts.rollback()).toEqual({
        success: false,
        message: 'Failed to rollback: denied',
      });
      spy.mockRestore();
    });
  });
});
