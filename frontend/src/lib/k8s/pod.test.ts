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
vi.mock('./api/v1/streamingApi', () => ({
  stream: vi.fn(() => ({ cancel: vi.fn(), getSocket: vi.fn(() => null) })),
}));

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
    it('extracts lastTimestamp, strips timestamps when showTimestamps is false, and appends sinceTime upon reconnect', () => {
      vi.useFakeTimers();
      let captureOnResults: any = null;
      let captureFailCb: any = null;
      const mockStream = vi.mocked(stream).mockImplementation((_url, onResults, options) => {
        captureOnResults = onResults;
        captureFailCb = options?.failCb;
        return { cancel: vi.fn(), getSocket: vi.fn(() => null) };
      });

      const pod = new Pod(mockPodData as any);
      const onLogs = vi.fn();

      const cancel = pod.getLogs('container-1', onLogs, {
        showTimestamps: false,
        follow: true,
      });

      expect(mockStream).toHaveBeenCalledWith(
        expect.stringContaining('timestamps=true'),
        expect.any(Function),
        expect.any(Object)
      );

      const lastCallUrl = mockStream.mock.calls[0][0];
      expect(lastCallUrl).not.toContain('sinceTime');

      const logLine1 = '2026-06-30T10:00:00.123456Z Log message line 1\n';
      const encodedLog1 = Base64.encode(logLine1);

      captureOnResults(encodedLog1);

      expect(onLogs).toHaveBeenCalledWith({
        logs: ['Log message line 1\n'],
        hasJsonLogs: false,
      });

      // Send a second log line to verify no premature [Reconnected!] banner is shown
      const logLine1b = '2026-06-30T10:01:00.000000Z Log message line 1b\n';
      const encodedLog1b = Base64.encode(logLine1b);
      captureOnResults(encodedLog1b);

      expect(onLogs).toHaveBeenLastCalledWith({
        logs: ['Log message line 1\n', 'Log message line 1b\n'],
        hasJsonLogs: false,
      });

      mockStream.mockClear();
      captureFailCb();

      expect(onLogs).toHaveBeenLastCalledWith({
        logs: [
          'Log message line 1\n',
          'Log message line 1b\n',
          '\n\x1b[33m[Connection lost. Reconnecting... (attempt 1/5)]\x1b[0m\n',
        ],
        hasJsonLogs: false,
      });

      // Fast-forward the 3000ms delay
      vi.advanceTimersByTime(3000);

      expect(mockStream).toHaveBeenCalledWith(
        expect.stringContaining('sinceTime=2026-06-30T10%3A01%3A00.000000Z'),
        expect.any(Function),
        expect.any(Object)
      );

      const logLine2 = '2026-06-30T10:05:00.000000Z Log message line 2\n';
      const encodedLog2 = Base64.encode(logLine2);
      captureOnResults(encodedLog2);

      expect(onLogs).toHaveBeenLastCalledWith({
        logs: [
          'Log message line 1\n',
          'Log message line 1b\n',
          '\n\x1b[33m[Connection lost. Reconnecting... (attempt 1/5)]\x1b[0m\n',
          '\n\x1b[32m[Reconnected!]\x1b[0m\n',
          'Log message line 2\n',
        ],
        hasJsonLogs: false,
      });

      cancel();
      vi.useRealTimers();
    });

    it('flushes a final line without a trailing newline when a non-follow stream closes', () => {
      let captureOnResults: any = null;
      let captureFailCb: any = null;
      vi.mocked(stream).mockImplementation((_url, onResults, options) => {
        captureOnResults = onResults;
        captureFailCb = options?.failCb;
        return { cancel: vi.fn(), getSocket: vi.fn(() => null) };
      });

      const pod = new Pod(mockPodData as any);
      const onLogs = vi.fn();

      const cancel = pod.getLogs('container-1', onLogs, { follow: false });

      captureOnResults(Base64.encode('line 1\nlast line'));
      captureFailCb();

      expect(onLogs).toHaveBeenLastCalledWith({
        logs: ['line 1\n', 'last line\n'],
        hasJsonLogs: false,
      });

      cancel();
    });
    describe('follow reconnects', () => {
      const lost = (attempt: number) =>
        `\n\x1b[33m[Connection lost. Reconnecting... (attempt ${attempt}/5)]\x1b[0m\n`;
      const reconnected = '\n\x1b[32m[Reconnected!]\x1b[0m\n';

      function startLogs(options: { showTimestamps?: boolean; follow?: boolean } = {}) {
        vi.useFakeTimers();
        const urls: string[] = [];
        let onResults: any = null;
        let failCb: any = null;
        vi.mocked(stream).mockImplementation((url, cb, args) => {
          urls.push(url);
          onResults = cb;
          failCb = args?.failCb;
          return { cancel: vi.fn(), getSocket: vi.fn(() => null) };
        });
        const onLogs = vi.fn();
        const cancel = new Pod(mockPodData as any).getLogs('container-1', onLogs, {
          follow: true,
          ...options,
        });
        return {
          urls,
          send: (text: string) => onResults(Base64.encode(text)),
          reconnect: () => {
            failCb();
            vi.advanceTimersByTime(3000);
          },
          shown: () => onLogs.mock.lastCall?.[0].logs.join(''),
          stop: () => {
            cancel();
            vi.useRealTimers();
          },
        };
      }

      it('strips only the requested timestamp prefix', () => {
        const logs = startLogs();
        logs.send('2026-06-30T10:00:00.1Z   indented\r\n');
        expect(logs.shown()).toBe('  indented\r\n');
        logs.stop();
      });

      it('keeps application timestamps when no prefix was requested', () => {
        const logs = startLogs({ follow: false });
        expect(logs.urls[0]).toContain('timestamps=false');
        logs.send('2026-06-30T10:00:00Z app message\n');
        expect(logs.shown()).toBe('2026-06-30T10:00:00Z app message\n');
        logs.stop();
      });

      it('does not reset the retry budget for replayed records', () => {
        const logs = startLogs();
        logs.send('2026-06-30T10:00:00.1Z line 1\n');
        logs.reconnect();
        logs.send('2026-06-30T10:00:00.1Z line 1\n');
        logs.reconnect();
        expect(logs.shown()).toBe('line 1\n' + lost(1) + reconnected + lost(2));
        logs.stop();
      });

      it('shows an unterminated fragment and completes it after a reconnect', () => {
        const logs = startLogs();
        logs.send('2026-06-30T10:00:00.1Z line 1\n2026-06-30T10:00:00.2Z par');
        expect(logs.shown()).toBe('line 1\npar');
        logs.send('t');
        expect(logs.shown()).toBe('line 1\npart');

        logs.reconnect();
        expect(logs.urls[1]).toContain('sinceTime=2026-06-30T10%3A00%3A00.1Z');
        logs.send('2026-06-30T10:00:00.1Z line 1\n2026-06-30T10:00:00.2Z partial\n');
        expect(logs.shown()).toBe('line 1\npart' + lost(1) + reconnected + 'ial\n');
        logs.stop();
      });

      it('suppresses a replay that spans several callbacks', () => {
        const logs = startLogs();
        logs.send('2026-06-30T10:00:00.1Z a\n2026-06-30T10:00:00.2Z b\n');
        logs.reconnect();
        // The kubelet resumes from the start of the second, replaying both records.
        logs.send('2026-06-30T10:00:00.1Z a\n');
        logs.send('2026-06-30T10:00:00.2Z b\n2026-06-30T10:00:01Z c\n');
        expect(logs.shown()).toBe('a\nb\n' + lost(1) + reconnected + 'c\n');
        logs.stop();
      });

      it('drops replayed records when the saved boundary is gone', () => {
        const logs = startLogs();
        logs.send('2026-06-30T10:00:00.5Z b\n');
        logs.reconnect();
        logs.send('2026-06-30T10:00:00.1Z rotated\n2026-06-30T10:00:00.50Z other\n');
        logs.send('2026-06-30T10:00:00.51Z c\n');
        expect(logs.shown()).toBe('b\n' + lost(1) + reconnected + 'c\n');
        logs.stop();
      });
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

describe('Pod.resourceClaims', () => {
  const makePod = (spec: Record<string, unknown> = {}, status: Record<string, unknown> = {}) =>
    new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'trainer', namespace: 'default', uid: 'pod-uid', creationTimestamp: '' },
      spec: { containers: [], nodeName: '', ...spec },
      status: { conditions: [], containerStatuses: [], phase: 'Running', startTime: '', ...status },
    } as any);

  const using = (name: string, ...claims: string[]) => ({
    name,
    image: 'trainer',
    imagePullPolicy: 'IfNotPresent',
    resources: { claims: claims.map(claim => ({ name: claim })) },
  });

  it('holds no claims when it names none', () => {
    expect(makePod().resourceClaims).toEqual([]);
  });

  it('resolves a claim it names directly, with the containers that use it', () => {
    const pod = makePod({
      resourceClaims: [{ name: 'gpu', resourceClaimName: 'shared-gpu' }],
      initContainers: [using('setup', 'gpu')],
      containers: [using('train', 'gpu'), using('sidecar')],
    });

    expect(pod.resourceClaims).toEqual([
      {
        source: 'claim',
        podClaimName: 'gpu',
        claimName: 'shared-gpu',
        containers: ['setup', 'train'],
      },
    ]);
  });

  it('reads the name of a claim generated from a template from the status', () => {
    const pod = makePod(
      {
        resourceClaims: [{ name: 'gpu', resourceClaimTemplateName: 'single-gpu' }],
        containers: [using('train', 'gpu')],
      },
      { resourceClaimStatuses: [{ name: 'gpu', resourceClaimName: 'trainer-gpu-x7k2q' }] }
    );

    expect(pod.resourceClaims).toEqual([
      {
        source: 'template',
        podClaimName: 'gpu',
        claimName: 'trainer-gpu-x7k2q',
        templateName: 'single-gpu',
        containers: ['train'],
      },
    ]);
  });

  it('leaves a template claim unresolved until it has been generated', () => {
    const pod = makePod({
      resourceClaims: [{ name: 'gpu', resourceClaimTemplateName: 'single-gpu' }],
    });

    expect(pod.resourceClaims[0].claimName).toBeUndefined();
  });

  it('finds the claim made for extended resources, which the spec does not name', () => {
    const pod = makePod(
      { containers: [using('train')] },
      {
        extendedResourceClaimStatus: {
          resourceClaimName: 'trainer-extended-resources-p26fr',
          requestMappings: [
            { containerName: 'train', resourceName: 'example.com/gpu', requestName: 'container-0' },
            { containerName: 'train', resourceName: 'example.com/nic', requestName: 'container-1' },
          ],
        },
      }
    );

    expect(pod.resourceClaims).toEqual([
      {
        source: 'extendedResource',
        claimName: 'trainer-extended-resources-p26fr',
        containers: ['train'],
      },
    ]);
  });
});
