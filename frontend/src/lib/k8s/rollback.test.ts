/*
 * Copyright 2026 The Kubernetes Authors
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

import nock from 'nock';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../../App';
import { getAppUrl } from '../../helpers/getAppUrl';
import * as statelessKubeconfig from '../../stateless/findKubeconfigByClusterName';
import { jsonPatch } from './api/v1/clusterRequests';
import * as streamingApi from './api/v1/streamingApi';
import * as discoveredRevisions from './api/v2/discoveredConnectionRevisions';
import { recordDiscoveryConnection } from './api/v2/discoveryConnection';
import type { KubeControllerRevision } from './controllerRevision';
import DaemonSet from './daemonSet';
import Deployment from './deployment';
import ReplicaSet from './replicaSet';
import StatefulSet from './statefulSet';

// Load the components involved in the KubeObject imports before using the resources.
// eslint-disable-next-line no-unused-vars
const app = App;

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  jsonPatch: vi.fn().mockResolvedValue({}),
}));

afterEach(() => {
  vi.restoreAllMocks();
  nock.cleanAll();
  vi.mocked(jsonPatch).mockClear();
});

it.each([
  ['deployments', () => new Deployment(Deployment.getBaseObject(), 'discovered')],
  ['statefulsets', () => new StatefulSet(StatefulSet.getBaseObject(), 'discovered')],
  ['daemonsets', () => new DaemonSet(DaemonSet.getBaseObject(), 'discovered')],
] as const)(
  'keeps the history read and rollback of %s on the original connection',
  async (kind, create) => {
    const workload = create();
    Object.assign(workload.jsonData.metadata, {
      name: 'example',
      namespace: 'default',
      uid: 'workload',
    });
    const current = vi
      .spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision')
      .mockReturnValue('origin:1');
    recordDiscoveryConnection(workload, 'discovered', 'origin:1');

    const template = workload.spec.template;
    const ownerReferences = [
      {
        apiVersion: 'apps/v1',
        kind: workload.kind,
        name: 'example',
        uid: 'workload',
        blockOwnerDeletion: true,
        controller: true,
      },
    ];
    const isDeployment = kind === 'deployments';
    const revisions = [1, 2].map(revision => {
      if (isDeployment) {
        const data = ReplicaSet.getBaseObject();
        data.metadata.ownerReferences = ownerReferences;
        data.metadata.annotations = { 'deployment.kubernetes.io/revision': String(revision) };
        data.spec.template = template;
        return data;
      }

      return {
        apiVersion: 'apps/v1',
        kind: 'ControllerRevision',
        metadata: {
          creationTimestamp: '2026-01-01T00:00:00Z',
          name: `revision-${revision}`,
          uid: `revision-${revision}`,
          ownerReferences,
        },
        revision,
        data: { spec: { template } },
      } satisfies KubeControllerRevision;
    });
    const history = vi
      .spyOn(streamingApi, 'streamResultsForCluster')
      .mockImplementation(async (_path, { cb }) => {
        cb(revisions);
        return () => {};
      });

    await expect(workload.rollback({ toRevision: 1, dryRun: true })).resolves.toMatchObject({
      success: true,
    });
    expect(history).toHaveBeenCalledWith(
      `/apis/apps/v1/namespaces/default/${isDeployment ? 'replicasets' : 'controllerrevisions'}`,
      expect.objectContaining({ cluster: 'discovered' }),
      expect.objectContaining({ __headlamp_connection_revision: 'origin' })
    );
    const [url, , , request] = vi.mocked(jsonPatch).mock.calls[0];
    const guarded = new URL(url, 'https://headlamp.test/');
    expect(guarded.pathname).toBe(`/apis/apps/v1/namespaces/default/${kind}/example`);
    expect(guarded.searchParams.get('dryRun')).toBe('All');
    expect(guarded.searchParams.get('__headlamp_connection_revision')).toBe('origin');
    expect(request?.cluster).toBe('discovered');
    expect(request?.expectedDiscoveryConnection).toEqual({ revision: 'origin:1' });

    const transport = await vi.importActual<typeof import('./api/v1/clusterRequests')>(
      './api/v1/clusterRequests'
    );
    vi.mocked(jsonPatch).mockImplementationOnce(transport.jsonPatch);
    vi.spyOn(statelessKubeconfig, 'findKubeconfigByClusterName').mockImplementationOnce(
      async () => {
        current.mockReturnValue('origin:2');
        return null;
      }
    );
    const replacement = nock(getAppUrl())
      .patch(`/clusters/discovered/apis/apps/v1/namespaces/default/${kind}/example`)
      .query({ __headlamp_connection_revision: 'origin' })
      .reply(200, {});
    await expect(workload.rollback(1)).resolves.toMatchObject({
      success: false,
      message: expect.stringContaining('Discovered cluster connection changed'),
    });
    expect(replacement.isDone()).toBe(false);

    workload.cluster = 'replacement';
    await expect(workload.rollback(1)).resolves.toMatchObject({ success: false });
    expect(history).toHaveBeenCalledTimes(2);
    expect(jsonPatch).toHaveBeenCalledTimes(2);
  }
);
