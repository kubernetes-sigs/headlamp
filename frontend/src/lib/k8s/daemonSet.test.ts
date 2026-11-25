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
import DaemonSet from './daemonSet';

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
      name: `ds-rev-${revision}`,
      namespace: 'default',
      uid,
      creationTimestamp: '2025-01-01T00:00:00Z',
      ownerReferences: ownerUid
        ? [{ apiVersion: 'apps/v1', kind: 'DaemonSet', name: 'test-daemonset', uid: ownerUid }]
        : [],
    },
    revision,
    data: withTemplate
      ? {
          spec: {
            template: {
              metadata: { labels: { app: 'myapp', 'controller-revision-hash': 'hash123' } },
              spec: { containers: [{ name: 'app', image: `myapp:v${revision}` }] },
            },
          },
        }
      : {},
  } as any);
}

describe('DaemonSet class', () => {
  const mockDaemonSetData = {
    apiVersion: 'apps/v1',
    kind: 'DaemonSet',
    metadata: {
      name: 'test-daemonset',
      namespace: 'default',
      uid: 'ds-uid-123',
      resourceVersion: '456',
      generation: 3,
    },
    spec: {
      updateStrategy: {
        type: 'RollingUpdate',
        rollingUpdate: {
          maxUnavailable: 1,
        },
      },
      selector: {
        matchLabels: { app: 'myapp' },
      },
      template: {
        spec: {
          containers: [
            { name: 'app', image: 'myapp:v1', imagePullPolicy: 'Always' },
            { name: 'sidecar', image: 'sidecar:v1', imagePullPolicy: 'IfNotPresent' },
          ],
          nodeSelector: { disk: 'ssd', region: 'us-east-1' },
          nodeName: 'node-1',
        },
      },
    },
    status: {
      observedGeneration: 3,
    },
  };

  describe('getBaseObject', () => {
    it('returns a DaemonSet with correct defaults', () => {
      const base = DaemonSet.getBaseObject();
      expect(base.kind).toBe('DaemonSet');
      expect(base.apiVersion).toBe('apps/v1');
      expect(base.metadata.namespace).toBe('');
      expect(base.spec.updateStrategy.type).toBe('RollingUpdate');
      expect(base.spec.updateStrategy.rollingUpdate.maxUnavailable).toBe(1);
      expect(base.spec.selector.matchLabels).toEqual({ app: 'headlamp' });
    });

    it('includes a default container template', () => {
      const base = DaemonSet.getBaseObject();
      expect(base.spec.template.spec.containers).toHaveLength(1);
      expect(base.spec.template.spec.containers![0].name).toBe('');
      expect(base.spec.template.spec.containers![0].image).toBe('');
      expect(base.spec.template.spec.containers![0].imagePullPolicy).toBe('Always');
    });
  });

  describe('getContainers', () => {
    it('returns all containers from the pod template spec', () => {
      const ds = new DaemonSet(JSON.parse(JSON.stringify(mockDaemonSetData)));
      const containers = ds.getContainers();
      expect(containers).toHaveLength(2);
      expect(containers[0].name).toBe('app');
      expect(containers[1].name).toBe('sidecar');
    });

    it('returns empty array when spec is missing', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.spec;
      const ds = new DaemonSet(data);
      expect(ds.getContainers()).toEqual([]);
    });

    it('returns empty array when template is missing', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.spec.template;
      const ds = new DaemonSet(data);
      expect(ds.getContainers()).toEqual([]);
    });
  });

  describe('getNodeSelectors', () => {
    it('returns nodeSelector entries as key=value pairs', () => {
      const ds = new DaemonSet(JSON.parse(JSON.stringify(mockDaemonSetData)));
      const selectors = ds.getNodeSelectors();
      expect(selectors).toContain('disk=ssd');
      expect(selectors).toContain('region=us-east-1');
      expect(selectors).toHaveLength(2);
    });

    it('returns empty array when no nodeSelector defined', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.spec.template.spec.nodeSelector;
      const ds = new DaemonSet(data);
      expect(ds.getNodeSelectors()).toEqual([]);
    });

    it('returns empty array when spec is missing', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.spec;
      const ds = new DaemonSet(data);
      expect(ds.getNodeSelectors()).toEqual([]);
    });
  });

  describe('getCurrentRevision', () => {
    it('returns observedGeneration when available', () => {
      const ds = new DaemonSet(JSON.parse(JSON.stringify(mockDaemonSetData)));
      expect(ds.getCurrentRevision()).toBe('3');
    });

    it('falls back to metadata.generation when observedGeneration is missing', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.status.observedGeneration;
      const ds = new DaemonSet(data);
      expect(ds.getCurrentRevision()).toBe('3');
    });

    it('returns empty string when no generation or observedGeneration exists', () => {
      const data = JSON.parse(JSON.stringify(mockDaemonSetData));
      delete data.status.observedGeneration;
      data.metadata.generation = undefined;
      const ds = new DaemonSet(data);
      expect(ds.getCurrentRevision()).toBe('');
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
          containers: [{ name: 'app', image }],
        },
      };
    }

    const template = makeTemplate('myapp:v2');

    function makeRevision(revision: number, revisionTemplate: any = template) {
      return {
        revision,
        data: revisionTemplate ? { spec: { template: revisionTemplate } } : {},
      };
    }

    function makeDaemonSet() {
      return new DaemonSet(JSON.parse(JSON.stringify(mockDaemonSetData)));
    }

    beforeEach(() => {
      mockedJsonPatch.mockReset();
    });

    it('rolls back to the previous revision', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3, makeTemplate('myapp:v3')),
        makeRevision(2, makeTemplate('myapp:v2')),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      const result = await ds.rollback();

      expect(result).toMatchObject({
        success: true,
        message: 'Rolled back to revision 2',
        previousRevision: 2,
      });
      expect(mockedJsonPatch).toHaveBeenCalledWith(
        expect.stringContaining('/apis/apps/v1/namespaces/default/daemonsets/test-daemonset'),
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
                containers: [{ name: 'app', image: 'myapp:v2' }],
              },
            },
          },
        ],
        true,
        { cluster: ds.cluster }
      );
    });

    it('rolls back to a specific older revision', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3, makeTemplate('myapp:v3')),
        makeRevision(2, makeTemplate('myapp:v2')),
        makeRevision(1, makeTemplate('myapp:v1')),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      const result = await ds.rollback(1);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Rolled back to revision 1');
      expect(result.previousRevision).toBe(1);
      expect(mockedJsonPatch.mock.calls[0][1][0]).toMatchObject({
        value: { spec: { containers: [{ image: 'myapp:v1' }] } },
      });
    });

    it('returns failure when no previous revision is available', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([makeRevision(3)]);

      const result = await ds.rollback();

      expect(result).toEqual({
        success: false,
        message: 'No previous revision available to rollback to',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('returns failure when the target revision is not found', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);

      const result = await ds.rollback(1);

      expect(result).toEqual({
        success: false,
        message: 'Revision 1 not found in history',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('returns failure when rolling back to the current revision', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);

      const result = await ds.rollback(3);

      expect(result).toEqual({
        success: false,
        message: 'Cannot rollback to current revision',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('returns failure when the target revision has no pod template', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2, null),
      ]);

      const result = await ds.rollback();

      expect(result).toEqual({
        success: false,
        message: 'Target revision does not contain a valid pod template',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('supports dry run rollback', async () => {
      const ds = makeDaemonSet();
      const dryRunResult = { metadata: { name: 'test-daemonset' } };
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3, makeTemplate('myapp:v3')),
        makeRevision(2, makeTemplate('myapp:v2')),
      ]);
      mockedJsonPatch.mockResolvedValue(dryRunResult as any);

      const result = await ds.rollback({ dryRun: true });

      expect(result).toEqual({
        success: true,
        message: 'Dry-run: would rollback to revision 2',
        previousRevision: 2,
        dryRunResult,
      });
      expect(mockedJsonPatch).toHaveBeenCalledWith(
        expect.stringContaining('/daemonsets/test-daemonset?dryRun=All'),
        expect.any(Array),
        true,
        { cluster: ds.cluster }
      );
      expect(mockedJsonPatch.mock.calls[0][1][0]).toMatchObject({
        value: { spec: { containers: [{ image: 'myapp:v2' }] } },
      });
    });

    it('returns failure when the patch request fails', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);
      mockedJsonPatch.mockRejectedValue(new Error('patch failed'));

      const result = await ds.rollback();

      expect(result).toEqual({
        success: false,
        message: 'Failed to rollback: patch failed',
      });
    });

    it('returns failure when there are no revisions at all', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([]);

      const result = await ds.rollback();

      expect(result).toEqual({
        success: false,
        message: 'No previous revision available to rollback to',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('ignores revisions with revision number <= 0', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(2),
        makeRevision(0),
        makeRevision(-1),
      ]);

      const result = await ds.rollback();

      expect(result).toEqual({
        success: false,
        message: 'No previous revision available to rollback to',
      });
      expect(mockedJsonPatch).not.toHaveBeenCalled();
    });

    it('correctly sorts unsorted revisions and picks the second highest', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(1, makeTemplate('myapp:v1')),
        makeRevision(3, makeTemplate('myapp:v3')),
        makeRevision(2, makeTemplate('myapp:v2')),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      const result = await ds.rollback();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Rolled back to revision 2');
      expect(result.previousRevision).toBe(2);
      expect(mockedJsonPatch.mock.calls[0][1][0]).toMatchObject({
        value: { spec: { containers: [{ image: 'myapp:v2' }] } },
      });
    });

    it('handles non-Error exceptions gracefully', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);
      mockedJsonPatch.mockRejectedValue('string error');

      const result = await ds.rollback();

      expect(result).toEqual({
        success: false,
        message: 'Failed to rollback: string error',
      });
    });

    it('strips controller-revision-hash label from the patched template', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      await ds.rollback();

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
      const ds = makeDaemonSet();
      (ds as any).revisionHistoryCache = { resourceVersion: '456', history: [] };
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      await ds.rollback();

      expect((ds as any).revisionHistoryCache).toBeUndefined();
    });

    it('preserves the revision history cache after a dry-run rollback', async () => {
      const ds = makeDaemonSet();
      const existingCache = { resourceVersion: '456', history: [] };
      (ds as any).revisionHistoryCache = existingCache;
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3),
        makeRevision(2),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      await ds.rollback({ dryRun: true });

      expect((ds as any).revisionHistoryCache).toBe(existingCache);
    });

    it('accepts RollbackOptions object with toRevision', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockResolvedValue([
        makeRevision(3, makeTemplate('myapp:v3')),
        makeRevision(2, makeTemplate('myapp:v2')),
        makeRevision(1, makeTemplate('myapp:v1')),
      ]);
      mockedJsonPatch.mockResolvedValue({} as any);

      const result = await ds.rollback({ toRevision: 1 });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Rolled back to revision 1');
      expect(result.previousRevision).toBe(1);
      expect(mockedJsonPatch.mock.calls[0][1][0]).toMatchObject({
        value: { spec: { containers: [{ image: 'myapp:v1' }] } },
      });
    });

    it('returns failure when getOwnedControllerRevisions rejects', async () => {
      const ds = makeDaemonSet();
      vi.spyOn(ds as any, 'getOwnedControllerRevisions').mockRejectedValue(
        new Error('failed to list revisions')
      );

      const result = await ds.rollback();

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
      mockedJsonPatch.mockResolvedValue({ kind: 'DaemonSet' } as any);
    });

    it('exposes status, lists owned ControllerRevisions, and caches revision history', async () => {
      const ds = new DaemonSet(JSON.parse(JSON.stringify(mockDaemonSetData)), 'my-cluster');
      expect(ds.status.observedGeneration).toBe(3);

      const rev1 = makeControllerRevision('r1', 'ds-uid-123', 1);
      const rev2 = makeControllerRevision('r2', 'ds-uid-123', 2);
      const revOther = makeControllerRevision('r3', 'other-uid', 3);
      const revZero = makeControllerRevision('r4', 'ds-uid-123', 0);

      const cancelFn = vi.fn();
      const spy = vi.spyOn(ControllerRevision, 'apiList').mockImplementation((cb: any) => {
        return async () => {
          setTimeout(() => cb([rev1, rev2, revOther, revZero]), 0);
          return cancelFn;
        };
      });

      const history = await ds.getRevisionHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({ revision: 2, isCurrent: true, images: ['myapp:v2'] });
      expect(history[1]).toMatchObject({ revision: 1, isCurrent: false, images: ['myapp:v1'] });
      expect(cancelFn).toHaveBeenCalledTimes(1);

      expect(await ds.getRevisionHistory()).toBe(history);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('handles rollback error and validation cases', async () => {
      const ds = new DaemonSet(JSON.parse(JSON.stringify(mockDaemonSetData)));
      const rev2 = makeControllerRevision('r2', 'ds-uid-123', 2);
      const spy = vi.spyOn(ControllerRevision, 'apiList').mockImplementation((cb: any) => {
        return async () => {
          cb([rev2]);
          return () => {};
        };
      });

      expect(await ds.rollback()).toEqual({
        success: false,
        message: 'No previous revision available to rollback to',
      });
      expect(await ds.rollback(99)).toEqual({
        success: false,
        message: 'Revision 99 not found in history',
      });
      expect(await ds.rollback({ toRevision: 2 })).toEqual({
        success: false,
        message: 'Cannot rollback to current revision',
      });
      spy.mockRestore();
    });

    it('fails when target revision lacks a pod template and succeeds on valid/dryRun rollback', async () => {
      const ds = new DaemonSet(JSON.parse(JSON.stringify(mockDaemonSetData)), 'my-cluster');
      const rev1NoTpl = makeControllerRevision('r1', 'ds-uid-123', 1, false);
      const rev2 = makeControllerRevision('r2', 'ds-uid-123', 2);

      const spy = vi.spyOn(ControllerRevision, 'apiList').mockImplementation((cb: any) => {
        return async () => {
          cb([rev1NoTpl, rev2]);
          return () => {};
        };
      });

      expect(await ds.rollback(1)).toEqual({
        success: false,
        message: 'Target revision does not contain a valid pod template',
      });

      const rev1 = makeControllerRevision('r1', 'ds-uid-123', 1, true);
      spy.mockImplementation((cb: any) => {
        return async () => {
          cb([rev1, rev2]);
          return () => {};
        };
      });

      const dryRes = await ds.rollback({ toRevision: 1, dryRun: true });
      expect(dryRes).toMatchObject({
        success: true,
        message: 'Dry-run: would rollback to revision 1',
        previousRevision: 1,
        dryRunResult: { kind: 'DaemonSet' },
      });
      expect(jsonPatch).toHaveBeenLastCalledWith(
        '/apis/apps/v1/namespaces/default/daemonsets/test-daemonset?dryRun=All',
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

      expect(await ds.rollback()).toEqual({
        success: true,
        message: 'Rolled back to revision 1',
        previousRevision: 1,
        dryRunResult: undefined,
      });

      vi.mocked(jsonPatch).mockRejectedValueOnce(new Error('denied'));
      expect(await ds.rollback()).toEqual({
        success: false,
        message: 'Failed to rollback: denied',
      });
      spy.mockRestore();
    });
  });
});
