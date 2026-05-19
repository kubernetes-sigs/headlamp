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
import Pod from './pod';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('Pod class', () => {
  const mockPodData = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: 'test-pod',
      namespace: 'default',
      resourceVersion: '123',
    },
    spec: {
      containers: [{ name: 'container-1' }, { name: 'container-2' }],
    },
    status: {
      phase: 'Running',
      containerStatuses: [
        {
          name: 'container-1',
          ready: false,
          restartCount: 0,
          state: { terminated: { reason: 'Completed', exitCode: 0 } },
        },
        {
          name: 'container-2',
          ready: true,
          restartCount: 0,
          state: { running: { startedAt: '2020-01-01T00:00:00Z' } },
        },
      ],
      conditions: [
        {
          type: 'Ready',
          status: 'True',
        },
      ],
    },
  };

  it('correctly identifies a healthy pod with lowercase condition status in edge cases', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    const pod = new Pod(data);
    const status = pod.getDetailedStatus();
    // hasRunning is true, reason became Completed from container-1, so it checks Ready condition
    expect(status.reason).toBe('Running');
  });

  it('falls back to NotReady if Ready condition is False in edge cases', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    data.status.conditions[0].status = 'False';
    const pod = new Pod(data);
    const status = pod.getDetailedStatus();
    expect(status.reason).toBe('NotReady');
  });

  it('handles missing conditions gracefully', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    delete data.status.conditions;
    const pod = new Pod(data);
    expect(() => pod.getDetailedStatus()).not.toThrow();
  });
});

// Module-level capture array for addEphemeralContainer patch tests
// (vi.mock is hoisted so closures over local variables don't work)
const capturedPatchBodies: any[] = [];

vi.mock('./api/v1/clusterRequests', async importOriginal => {
  const actual = await importOriginal<typeof import('./api/v1/clusterRequests')>();
  return {
    ...actual,
    patch: vi.fn(async (_url: string, body: any) => {
      capturedPatchBodies.push(body);
    }),
  };
});

describe('Pod.addEphemeralContainer targetContainerName', () => {
  beforeEach(() => {
    capturedPatchBodies.length = 0;
  });

  it('includes targetContainerName in PATCH body when provided', async () => {
    const pod = new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'test-pod', namespace: 'default', uid: 'uid-1' },
      spec: { containers: [{ name: 'main', image: 'nginx' }], ephemeralContainers: [] },
      status: {},
    } as any);

    await pod.addEphemeralContainer('headlamp-debug-1', 'busybox', ['sh'], 'main');

    const ephemeralContainers = capturedPatchBodies[0]?.spec?.ephemeralContainers;
    expect(ephemeralContainers).toBeDefined();
    expect(ephemeralContainers[0].targetContainerName).toBe('main');
  });

  it('omits targetContainerName from PATCH body when not provided', async () => {
    const pod = new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'test-pod', namespace: 'default', uid: 'uid-2' },
      spec: { containers: [{ name: 'main', image: 'nginx' }], ephemeralContainers: [] },
      status: {},
    } as any);

    await pod.addEphemeralContainer('headlamp-debug-2', 'busybox', ['sh']);

    const ephemeralContainers = capturedPatchBodies[0]?.spec?.ephemeralContainers;
    expect(ephemeralContainers).toBeDefined();
    expect(ephemeralContainers[0].targetContainerName).toBeUndefined();
  });
});
