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

import { Base64 } from 'js-base64';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { post } from './api/v1/clusterRequests';
import { stream } from './api/v1/streamingApi';
import Pod from './pod';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

// Module-level capture array for addEphemeralContainer patch tests
const capturedPatchBodies: any[] = [];

vi.mock('./api/v1/clusterRequests', async importOriginal => {
  const actual = await importOriginal<typeof import('./api/v1/clusterRequests')>();
  return {
    ...actual,
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn(async (_url: string, body: any) => {
      capturedPatchBodies.push(body);
    }),
  };
});

vi.mock('./api/v1/streamingApi', async () => {
  const actual = await vi.importActual<typeof import('./api/v1/streamingApi')>(
    './api/v1/streamingApi'
  );
  return { ...actual, stream: vi.fn() };
});

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

  it('does not throw when spec and status are missing', () => {
    const dataMissingBoth = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: 'test-pod-missing-fields',
        namespace: 'default',
        resourceVersion: '123',
      },
    };
    const pod = new Pod(dataMissingBoth as any);
    expect(() => pod.getDetailedStatus()).not.toThrow();
  });

  it("sends the eviction request to the pod's own cluster", () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    const pod = new Pod(data, 'other-cluster');

    pod.evict();

    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ cluster: 'other-cluster' })
    );
  });

  it('returns ExitCode when a container terminated with empty reason and no signal', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    data.status.containerStatuses = [
      {
        name: 'container-1',
        ready: false,
        restartCount: 0,
        state: { terminated: { exitCode: 1, reason: '' } },
      },
    ];
    const pod = new Pod(data);
    const status = pod.getDetailedStatus();
    expect(status.reason).toBe('ExitCode:1');
  });

  describe('getHealth', () => {
    const makePod = (status: any, metadata: any = {}) =>
      new Pod({
        ...mockPodData,
        metadata: { ...mockPodData.metadata, ...metadata },
        status,
      } as any);

    it('classifies a Running and Ready pod as healthy', () => {
      const pod = makePod({
        phase: 'Running',
        conditions: [{ type: 'Ready', status: 'True' }],
      });
      expect(pod.getHealth()).toBe('healthy');
    });

    it('classifies a Running but NotReady pod as degraded', () => {
      const pod = makePod({
        phase: 'Running',
        conditions: [{ type: 'Ready', status: 'False' }],
      });
      expect(pod.getHealth()).toBe('degraded');
    });

    it('classifies a Pending pod as transitional', () => {
      const pod = makePod({ phase: 'Pending' });
      expect(pod.getHealth()).toBe('transitional');
    });

    it('classifies a terminating (deletionTimestamp) pod as transitional', () => {
      const pod = makePod({ phase: 'Running' }, { deletionTimestamp: '2020-01-01T00:00:00Z' });
      expect(pod.getHealth()).toBe('transitional');
    });

    it('classifies a lost node (NodeLost) pod as failed', () => {
      const pod = makePod(
        { phase: 'Running', reason: 'NodeLost' },
        { deletionTimestamp: '2020-01-01T00:00:00Z' }
      );
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a pod with a CrashLoopBackOff container as failed', () => {
      const pod = makePod({
        phase: 'Running',
        containerStatuses: [{ name: 'c', state: { waiting: { reason: 'CrashLoopBackOff' } } }],
      });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a pod with an ImagePullBackOff container as failed', () => {
      const pod = makePod({
        phase: 'Pending',
        containerStatuses: [{ name: 'c', state: { waiting: { reason: 'ImagePullBackOff' } } }],
      });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a terminated container with a non-zero exitCode and empty reason as failed', () => {
      const pod = makePod({
        phase: 'Pending',
        initContainerStatuses: [
          { name: 'init', state: { terminated: { exitCode: 1, reason: '' } } },
        ],
      });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a Failed pod as failed', () => {
      const pod = makePod({ phase: 'Failed' });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a Succeeded pod as healthy', () => {
      const pod = makePod({ phase: 'Succeeded' });
      expect(pod.getHealth()).toBe('healthy');
    });
  });
  describe('getLogs', () => {
    const chunk =
      '{"level":"info","message":"test0"}\n' +
      '{"level":"warn","message":"test1"}\n' +
      '{"level":"error","message":"test2"}\n';

    function startLogStream(logsOptions: object = {}) {
      let onResults: (item: string) => void = () => {};
      let onFail: () => void = () => {};
      const cancelStream = vi.fn();

      vi.mocked(stream).mockImplementation(((
        _url: string,
        cb: (item: string) => void,
        args: { failCb?: () => void }
      ) => {
        onResults = cb;
        onFail = args.failCb ?? (() => {});
        return { cancel: cancelStream, getSocket: () => null };
      }) as any);

      const pod = new Pod(JSON.parse(JSON.stringify(mockPodData)));
      const updates: string[][] = [];
      const cancel = pod.getLogs('container-1', ({ logs }) => updates.push([...logs]), {
        follow: true,
        ...logsOptions,
      });

      return {
        send: (text: string) => onResults(Base64.encode(text)),
        endStream: () => onFail(),
        cancel,
        cancelStream,
        last: () => updates[updates.length - 1],
        updateCount: () => updates.length,
      };
    }

    it('gives each line of a chunk its own entry', () => {
      const logStream = startLogStream();
      logStream.send(chunk);

      expect(logStream.last()).toEqual([
        '{"level":"info","message":"test0"}\n',
        '{"level":"warn","message":"test1"}\n',
        '{"level":"error","message":"test2"}\n',
      ]);
    });

    it('rejoins the lines to the original text', () => {
      const logStream = startLogStream();
      logStream.send(chunk);

      expect(logStream.last().join('')).toBe(chunk);
    });

    it('waits for the rest of a line split across two chunks', () => {
      const logStream = startLogStream();

      logStream.send('{"level":"error","mess');
      expect(logStream.last()).toEqual([]);

      logStream.send('age":"split"}\n');
      expect(logStream.last()).toEqual(['{"level":"error","message":"split"}\n']);
    });

    it('emits a trailing line without a newline once the stream ends', () => {
      const logStream = startLogStream();

      logStream.send('{"level":"error","message":"last"}');
      expect(logStream.last()).toEqual([]);

      logStream.endStream();
      expect(logStream.last()).toEqual(['{"level":"error","message":"last"}']);
    });

    it('does not report logs while being cancelled', () => {
      const logStream = startLogStream();

      logStream.send('{"level":"error","message":"last"}');
      const updatesBeforeCancel = logStream.updateCount();

      logStream.cancel();
      expect(logStream.updateCount()).toBe(updatesBeforeCancel);
      expect(logStream.cancelStream).toHaveBeenCalled();
    });

    it('prettifies every line of a chunk, not only the first', () => {
      const logStream = startLogStream({ prettifyLogs: true });
      logStream.send(chunk);

      const output = logStream.last().join('');
      expect(output).toContain('test0');
      expect(output).toContain('test1');
      expect(output).toContain('test2');
    });
  });
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
