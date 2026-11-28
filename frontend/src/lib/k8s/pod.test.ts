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
import Pod, { LogOptions } from './pod';

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

vi.mock('./api/v1/streamingApi', async importOriginal => {
  const actual = await importOriginal<typeof import('./api/v1/streamingApi')>();
  return { ...actual, stream: vi.fn(() => ({ cancel: vi.fn(), failed: () => false })) };
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

  describe('a finished container next to a failed one', () => {
    function makePod(containerStatuses: any[], conditions: any[] = []) {
      const data = JSON.parse(JSON.stringify(mockPodData));
      data.spec.containers = containerStatuses.map(c => ({ name: c.name }));
      data.status.phase = 'Failed';
      data.status.containerStatuses = containerStatuses;
      data.status.conditions = conditions;
      return new Pod(data);
    }

    const completed = {
      name: 'main',
      ready: false,
      restartCount: 0,
      state: { terminated: { reason: 'Completed', exitCode: 0 } },
    };
    const failed = {
      name: 'uploader',
      ready: false,
      restartCount: 0,
      state: { terminated: { reason: 'Error', exitCode: 1, message: 'upload failed' } },
    };

    it('shows the failed container, not Completed', () => {
      const status = makePod([completed, failed]).getDetailedStatus();
      expect(status.reason).toBe('Error');
      expect(status.message).toBe('upload failed');
    });

    it('uses ExitCode when the failed container has no reason', () => {
      const noReason = { ...failed, state: { terminated: { exitCode: 2 } } };
      expect(makePod([completed, noReason]).getDetailedStatus().reason).toBe('ExitCode:2');
    });

    it('shows Completed when every container exited with 0', () => {
      const other = { ...completed, name: 'other' };
      expect(makePod([completed, other]).getDetailedStatus().reason).toBe('Completed');
    });

    it('prefers the failed container over NotReady when the running one is not ready', () => {
      const running = {
        name: 'web',
        ready: true,
        restartCount: 0,
        state: { running: { startedAt: '2020-01-01T00:00:00Z' } },
      };
      const status = makePod(
        [completed, running, failed],
        [{ type: 'Ready', status: 'False' }]
      ).getDetailedStatus();
      expect(status.reason).toBe('Error');
    });
  });

  // The API omits reason and signal when they are empty or 0 (omitempty).
  it('returns Init:ExitCode when an init container terminated without reason and signal', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    data.spec.initContainers = [{ name: 'init' }];
    data.status.phase = 'Pending';
    data.status.initContainerStatuses = [
      { name: 'init', ready: false, restartCount: 0, state: { terminated: { exitCode: 1 } } },
    ];
    const pod = new Pod(data);
    expect(pod.getDetailedStatus().reason).toBe('Init:ExitCode:1');
  });

  it('returns Init:Signal when an init container was killed by a signal without reason', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    data.spec.initContainers = [{ name: 'init' }];
    data.status.phase = 'Pending';
    data.status.initContainerStatuses = [
      {
        name: 'init',
        ready: false,
        restartCount: 0,
        state: { terminated: { exitCode: 137, signal: 9 } },
      },
    ];
    const pod = new Pod(data);
    expect(pod.getDetailedStatus().reason).toBe('Init:Signal:9');
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
      let onFail: (event?: CloseEvent) => void = () => {};
      const cancelStream = vi.fn();

      vi.mocked(stream).mockImplementation(((
        _url: string,
        cb: (item: string) => void,
        args: { failCb?: (event?: CloseEvent) => void }
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
        // A followed stream that closes otherwise is reconnected rather than ended.
        endStream: () => onFail({ code: 1000 } as CloseEvent),
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

    it('keeps a fragmented pending line when later chunks contain several lines', () => {
      const logStream = startLogStream();

      for (let index = 0; index < 1000; index++) {
        logStream.send('x');
      }
      logStream.send(' first\nsecond\nthird');
      logStream.endStream();

      // The final line is ended, so a next pod's line in the all pods view starts on its own.
      expect(logStream.last()).toEqual([`${'x'.repeat(1000)} first\n`, 'second\n', 'third\n']);
    });

    it('emits a trailing line without a newline once the stream ends', () => {
      const logStream = startLogStream();

      logStream.send('{"level":"error","message":"last"}');
      expect(logStream.last()).toEqual([]);

      logStream.endStream();
      expect(logStream.last()).toEqual(['{"level":"error","message":"last"}\n']);
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

  describe('getLogs', () => {
    it('stops instead of reconnecting when the API server ends a followed stream', () => {
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
      const onReconnectStop = vi.fn();

      pod.getLogs('container-1', onLogs, { follow: true, showPrevious: true, onReconnectStop });

      // The last record has no newline yet, so it is held back until the stream ends.
      captureOnResults(
        Base64.encode('2026-06-30T10:00:00.000000Z first\n2026-06-30T10:00:01.000000Z last')
      );

      mockStream.mockClear();
      captureFailCb({ code: 1000 } as CloseEvent);
      vi.advanceTimersByTime(3000);

      expect(mockStream).not.toHaveBeenCalled();
      expect(onReconnectStop).toHaveBeenCalledTimes(1);
      expect(onLogs).toHaveBeenLastCalledWith({
        logs: ['first\n', 'last\n'],
        hasJsonLogs: false,
      });

      vi.useRealTimers();
    });

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

      function startLogs(options: LogOptions = {}, now = new Date()) {
        vi.useFakeTimers({ now });
        const urls: string[] = [];
        let onResults: any = null;
        let failCb: any = null;
        let openCb: any = null;
        vi.mocked(stream).mockImplementation((url, cb, args) => {
          urls.push(url);
          onResults = cb;
          failCb = args?.failCb;
          openCb = args?.openCb;
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
          open: () => openCb?.(),
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

      it('resumes from the start of the stream when it drops before the first record', () => {
        const logs = startLogs({ tailLines: 0 }, new Date('2026-06-30T10:00:00.900Z'));
        logs.reconnect();
        expect(logs.urls[0]).toContain('tailLines=0');
        expect(logs.urls[1]).toContain('sinceTime=2026-06-30T10%3A00%3A00Z');
        expect(logs.urls[1]).not.toContain('tailLines');
        logs.send('2026-06-30T10:00:01.1Z line 1\n');
        expect(logs.shown()).toBe(lost(1) + reconnected + 'line 1\n');
        logs.stop();
      });

      it('only limits the first request with sinceSeconds', () => {
        const logs = startLogs(
          { sinceSeconds: 60, tailLines: -1 },
          new Date('2026-06-30T10:00:00Z')
        );
        logs.reconnect();
        logs.send('2026-06-30T10:00:01.1Z line 1\n');
        logs.reconnect();
        expect(logs.urls[0]).toContain('sinceSeconds=60');
        // The API rejects sinceSeconds with sinceTime.
        expect(logs.urls[1]).toContain('sinceTime=2026-06-30T10%3A00%3A00Z');
        expect(logs.urls[2]).toContain('sinceTime=2026-06-30T10%3A00%3A01.1Z');
        expect(logs.urls.slice(1).some(url => url.includes('sinceSeconds'))).toBe(false);
        logs.stop();
      });

      it('does not treat a stream resumed from its start as a cut tail', () => {
        const logs = startLogs({ tailLines: 1 }, new Date('2026-06-30T10:00:00Z'));
        logs.reconnect();
        logs.send('2026-06-30T10:00:01.1Z a\n');
        logs.reconnect();
        // The replay sends the shown record and one at the same time that never arrived.
        logs.send('2026-06-30T10:00:01.1Z a\n2026-06-30T10:00:01.1Z b\n');
        expect(logs.shown()).toBe(lost(1) + reconnected + 'a\n' + lost(1) + reconnected + 'b\n');
        logs.stop();
      });

      it('holds a record back until its newline, and completes it after a reconnect', () => {
        const logs = startLogs();
        logs.send('2026-06-30T10:00:00.1Z line 1\n2026-06-30T10:00:00.2Z par');
        expect(logs.shown()).toBe('line 1\n');
        logs.send('t');
        expect(logs.shown()).toBe('line 1\n');

        logs.reconnect();
        expect(logs.urls[1]).toContain('sinceTime=2026-06-30T10%3A00%3A00.1Z');
        logs.send('2026-06-30T10:00:00.1Z line 1\n2026-06-30T10:00:00.2Z partial\n');
        expect(logs.shown()).toBe('line 1\n' + lost(1) + reconnected + 'partial\n');
        logs.stop();
      });

      it('resumes from a first record that was cut off before its newline', () => {
        const logs = startLogs({}, new Date('2026-06-30T10:01:00Z'));
        logs.send('2026-06-30T10:00:00.2Z par');

        logs.reconnect();
        expect(logs.urls[1]).toContain('sinceTime=2026-06-30T10%3A00%3A00.2Z');
        expect(logs.urls[1]).not.toContain('tailLines');
        logs.send(
          '2026-06-30T10:00:00.1Z older\n2026-06-30T10:00:00.2Z partial\n2026-06-30T10:00:00.3Z next\n'
        );
        expect(logs.shown()).toBe(lost(1) + reconnected + 'partial\nnext\n');
        logs.stop();
      });

      it('refunds the reconnect budget of a connection that worked for a while', () => {
        const logs = startLogs();
        logs.open();
        logs.send('2026-06-30T10:00:00.1Z a\n');

        // A quiet stream that an idle timeout keeps closing only replays what was shown.
        for (let drop = 0; drop < 7; drop++) {
          vi.advanceTimersByTime(60_000);
          logs.reconnect();
          logs.open();
          logs.send('2026-06-30T10:00:00.1Z a\n');
        }

        expect(logs.urls).toHaveLength(8);
        expect(logs.shown()).not.toContain('Reconnection limit reached');
        logs.stop();
      });

      it('refunds the reconnect budget of an empty stream that stayed open', () => {
        // E.g. a container that logs nothing, followed with tailLines: 0.
        const logs = startLogs({ tailLines: 0 });

        for (let drop = 0; drop < 7; drop++) {
          logs.open();
          vi.advanceTimersByTime(60_000);
          logs.reconnect();
        }

        expect(logs.urls).toHaveLength(8);
        expect(logs.shown()).not.toContain('Reconnection limit reached');
        logs.stop();
      });

      it('does not refund the budget of a connection that never opened', () => {
        const logs = startLogs();

        // Each attempt fails after a long handshake, without the socket ever opening.
        for (let drop = 0; drop < 6; drop++) {
          vi.advanceTimersByTime(60_000);
          logs.reconnect();
        }

        expect(logs.urls).toHaveLength(6);
        expect(logs.shown()).toContain('Reconnection limit reached');
        logs.stop();
      });

      it('does not show a replayed record that arrives without its newline', () => {
        const logs = startLogs();
        logs.send('2026-06-30T10:00:00.1Z a\n');
        logs.reconnect();
        logs.send('2026-06-30T10:00:00.1Z a');
        expect(logs.shown()).toBe('a\n' + lost(1) + reconnected);
        logs.send('\n2026-06-30T10:00:00.2Z b\n');
        expect(logs.shown()).toBe('a\n' + lost(1) + reconnected + 'b\n');
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

      it('skips identical records up to the saved boundary', () => {
        const logs = startLogs();
        logs.send('2026-06-30T10:00:00.1Z same\n2026-06-30T10:00:00.1Z same\n');
        logs.reconnect();
        logs.send(
          '2026-06-30T10:00:00.1Z same\n2026-06-30T10:00:00.1Z same\n2026-06-30T10:00:00.2Z next\n'
        );
        expect(logs.shown()).toBe('same\nsame\n' + lost(1) + reconnected + 'next\n');
        logs.stop();
      });

      it('shows an identical record that follows the saved boundary', () => {
        const logs = startLogs();
        logs.send('2026-06-30T10:00:00.1Z same\n');
        logs.reconnect();
        // The second record was written after the connection dropped.
        logs.send('2026-06-30T10:00:00.1Z same\n2026-06-30T10:00:00.1Z same\n');
        expect(logs.shown()).toBe('same\n' + lost(1) + reconnected + 'same\n');
        logs.stop();
      });

      it('skips the records the initial tail left out of the saved boundary', () => {
        const logs = startLogs({ tailLines: 2 });
        // The tail starts inside the group of records at the boundary, leaving out "a".
        logs.send('2026-06-30T10:00:00.1Z b\n2026-06-30T10:00:00.1Z c\n');
        logs.reconnect();
        logs.send(
          '2026-06-30T10:00:00.1Z a\n2026-06-30T10:00:00.1Z b\n2026-06-30T10:00:00.1Z c\n' +
            '2026-06-30T10:00:00.2Z d\n'
        );
        expect(logs.shown()).toBe('b\nc\n' + lost(1) + reconnected + 'd\n');
        logs.stop();
      });

      it('shows a new record at the saved boundary after a full initial tail', () => {
        const logs = startLogs({ tailLines: 1 });
        logs.send('2026-06-30T10:00:00.1Z a\n');
        logs.reconnect();
        // "b" was written at the same instant as "a" after the connection dropped.
        logs.send('2026-06-30T10:00:00.1Z a\n2026-06-30T10:00:00.1Z b\n2026-06-30T10:00:01.1Z c\n');
        expect(logs.shown()).toBe('a\n' + lost(1) + reconnected + 'b\nc\n');
        logs.stop();
      });

      it('skips the records at the saved boundary again after another reconnect', () => {
        const logs = startLogs();
        logs.send('2026-06-30T10:00:00.1Z a\n');
        logs.reconnect();
        // A new record arrives at the same instant as the boundary.
        logs.send('2026-06-30T10:00:00.1Z a\n2026-06-30T10:00:00.1Z b\n');
        logs.reconnect();
        logs.send('2026-06-30T10:00:00.1Z a\n2026-06-30T10:00:00.1Z b\n2026-06-30T10:00:00.2Z c\n');
        expect(logs.shown()).toBe(
          'a\n' + lost(1) + reconnected + 'b\n' + lost(1) + reconnected + 'c\n'
        );
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

describe('Pod.getLogs sinceSeconds', () => {
  const getStreamUrl = (logOptions: LogOptions) => {
    vi.mocked(stream).mockClear();
    new Pod({
      kind: 'Pod',
      metadata: { name: 'test-pod', namespace: 'default', uid: 'uid-1' },
    } as any).getLogs('container-1', () => {}, logOptions);
    return vi.mocked(stream).mock.calls[0][0];
  };

  it('does not add sinceSeconds by default', () => {
    expect(getStreamUrl({})).not.toContain('sinceSeconds');
  });

  it('does not add sinceSeconds when it is zero', () => {
    expect(getStreamUrl({ sinceSeconds: 0 })).not.toContain('sinceSeconds');
  });

  it('adds sinceSeconds to the log URL', () => {
    expect(getStreamUrl({ sinceSeconds: 900 })).toContain('&sinceSeconds=900');
  });

  it('combines sinceSeconds with tailLines, previous and follow', () => {
    const url = getStreamUrl({
      sinceSeconds: 300,
      tailLines: 1000,
      showPrevious: true,
      follow: false,
    });
    expect(url).toContain('previous=true');
    expect(url).toContain('follow=false');
    expect(url).toContain('&tailLines=1000');
    expect(url).toContain('&sinceSeconds=300');
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

describe('Pod.getLogs streaming and formatting', () => {
  const makePod = () =>
    new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'log-pod', namespace: 'default', uid: 'uid-log' },
      spec: { containers: [{ name: 'app' }], nodeName: 'n1' },
      status: { conditions: [], containerStatuses: [], phase: 'Running', startTime: '' },
    } as any);

  beforeEach(() => {
    vi.mocked(stream).mockClear();
  });

  it('supports deprecated 4-argument getLogs signature', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onLogs = vi.fn();
    makePod().getLogs('app', 50, true, onLogs);

    expect(warnSpy).toHaveBeenCalled();
    const url = vi.mocked(stream).mock.calls[0][0];
    expect(url).toContain('tailLines=50');
    expect(url).toContain('previous=true');
    warnSpy.mockRestore();
  });

  it('omits tailLines when tailLines is -1', () => {
    makePod().getLogs('app', () => {}, { tailLines: -1 });
    expect(vi.mocked(stream).mock.calls[0][0]).not.toContain('tailLines=');
  });

  it('decodes, prettifies and unescapes JSON logs', () => {
    const onLogs = vi.fn();
    makePod().getLogs('app', onLogs, {
      prettifyLogs: true,
      formatJsonValues: true,
      showTimestamps: true,
    });

    const [, onResults] = vi.mocked(stream).mock.calls[0];
    // An empty item is ignored
    onResults('');
    expect(onLogs).not.toHaveBeenCalled();

    // Non-JSON log line
    onResults(btoa('plain message\n'));
    expect(onLogs).toHaveBeenLastCalledWith({ logs: ['plain message\n'], hasJsonLogs: false });

    // Timestamped JSON log with escaped characters
    const jsonLine = '2025-01-01T00:00:00Z {"msg":"line1\\nline2\\r\\n\\t\\"q\\"\\\\b"}';
    onResults(btoa(jsonLine + '\n'));
    const lastCall = onLogs.mock.calls.at(-1)?.[0];
    expect(lastCall.hasJsonLogs).toBe(true);
    expect(lastCall.logs[1]).toContain('2025-01-01T00:00:00Z\n');
    expect(lastCall.logs[1]).toContain('line1\nline2');

    // Invalid JSON falls back to original line
    onResults(btoa('{not-valid-json}\n'));
    expect(onLogs.mock.calls.at(-1)?.[0].logs[2]).toBe('{not-valid-json}\n');
  });

  it('prettifies JSON logs without timestamps or formatJsonValues', () => {
    const onLogs = vi.fn();
    makePod().getLogs('app', onLogs, {
      prettifyLogs: true,
      formatJsonValues: false,
      showTimestamps: false,
    });
    const [, onResults] = vi.mocked(stream).mock.calls[0];
    onResults(btoa('{"a":1}\n'));
    expect(onLogs).toHaveBeenLastCalledWith({
      logs: ['{\n  "a": 1\n}\n'],
      hasJsonLogs: true,
    });
  });

  it('calls onReconnectStop once the API server ends a followed stream', () => {
    const onReconnectStop = vi.fn();
    makePod().getLogs('app', () => {}, { follow: true, onReconnectStop });
    const opts = vi.mocked(stream).mock.calls[0][2];
    opts.failCb?.({ code: 1000 } as CloseEvent);
    expect(onReconnectStop).toHaveBeenCalledTimes(1);
  });
});

describe('Pod.attach, Pod.exec, and Pod.getBaseObject', () => {
  const makePod = () =>
    new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'exec-pod', namespace: 'ns1', uid: 'uid-exec' },
      spec: { containers: [{ name: 'app' }], nodeName: 'n1' },
      status: { conditions: [], containerStatuses: [], phase: 'Running', startTime: '' },
    } as any);

  beforeEach(() => {
    vi.mocked(stream).mockClear();
  });

  it('calls stream with attach URL and channel protocols', () => {
    const cb = vi.fn();
    makePod().attach('app', cb);
    const [url, handler, opts] = vi.mocked(stream).mock.calls[0];
    expect(url).toBe(
      '/api/v1/namespaces/ns1/pods/exec-pod/attach?container=app&stdin=true&stderr=true&stdout=true&tty=true'
    );
    expect(handler).toBe(cb);
    expect(opts.additionalProtocols).toContain('v4.channel.k8s.io');
    expect(opts.isJson).toBe(false);
  });

  it('calls stream with exec URL using default and custom options', () => {
    const cb = vi.fn();
    makePod().exec('app', cb);
    expect(vi.mocked(stream).mock.calls[0][0]).toBe(
      '/api/v1/namespaces/ns1/pods/exec-pod/exec?container=app&command=sh&stdin=1&stderr=1&stdout=1&tty=1'
    );

    vi.mocked(stream).mockClear();
    makePod().exec('app', cb, {
      command: ['ls', '-la'],
      stdin: false,
      stderr: false,
      stdout: false,
      tty: false,
    });
    expect(vi.mocked(stream).mock.calls[0][0]).toBe(
      '/api/v1/namespaces/ns1/pods/exec-pod/exec?container=app&command=ls&command=-la&stdin=0&stderr=0&stdout=0&tty=0'
    );
  });

  it('returns default base object', () => {
    const base = Pod.getBaseObject();
    expect(base.metadata.labels).toEqual({ app: 'headlamp' });
    expect(base.spec.containers[0].ports).toEqual([{ containerPort: 80 }]);
  });
});

describe('Pod.getDetailedStatus init containers, signals, restarts, and cache', () => {
  const makePod = (overrides: Record<string, any> = {}) =>
    new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'p', namespace: 'default', resourceVersion: 'rv1', ...overrides.metadata },
      spec: { containers: [{ name: 'c1' }], nodeName: 'n1', ...overrides.spec },
      status: {
        phase: 'Pending',
        conditions: [],
        containerStatuses: [],
        startTime: '',
        ...overrides.status,
      },
    } as any);

  it('caches detailed status for identical resourceVersion', () => {
    const pod = makePod();
    const first = pod.getDetailedStatus();
    const second = pod.getDetailedStatus();
    expect(second).toBe(first);
  });

  it('handles init container terminated with signal, exitCode, reason, waiting, and default', () => {
    expect(
      makePod({
        spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'c1' }] },
        status: {
          initContainerStatuses: [
            {
              name: 'i1',
              restartCount: 1,
              state: { terminated: { exitCode: 1, signal: 9, reason: '' } },
              lastState: { terminated: { finishedAt: '2025-01-01T00:00:00Z' } },
            },
          ],
        },
      }).getDetailedStatus().reason
    ).toBe('Init:Signal:9');

    expect(
      makePod({
        spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'c1' }] },
        status: {
          initContainerStatuses: [
            {
              name: 'i1',
              restartCount: 0,
              state: { terminated: { exitCode: 2, signal: 0, reason: '' } },
            },
          ],
        },
      }).getDetailedStatus().reason
    ).toBe('Init:ExitCode:2');

    expect(
      makePod({
        spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'c1' }] },
        status: {
          initContainerStatuses: [
            {
              name: 'i1',
              restartCount: 0,
              state: { terminated: { exitCode: 1, reason: 'OOMKilled', message: 'oom' } },
            },
          ],
        },
      }).getDetailedStatus()
    ).toMatchObject({ reason: 'Init:OOMKilled', message: 'oom' });

    expect(
      makePod({
        spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'c1' }] },
        status: {
          initContainerStatuses: [
            {
              name: 'i1',
              restartCount: 0,
              state: { waiting: { reason: 'CrashLoopBackOff', message: 'loop' } },
            },
          ],
        },
      }).getDetailedStatus()
    ).toMatchObject({ reason: 'Init:CrashLoopBackOff', message: 'loop' });

    expect(
      makePod({
        spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'c1' }] },
        status: {
          initContainerStatuses: [
            {
              name: 'i1',
              restartCount: 0,
              state: { waiting: { reason: 'PodInitializing' } },
            },
          ],
        },
      }).getDetailedStatus().reason
    ).toBe('Init:0/1');
  });

  it('handles restartable init containers and Initialized condition', () => {
    const details = makePod({
      spec: {
        initContainers: [{ name: 'sidecar', restartPolicy: 'Always' }],
        containers: [{ name: 'c1' }],
      },
      status: {
        phase: 'Running',
        conditions: [{ type: 'Initialized', status: 'True' }],
        initContainerStatuses: [
          {
            name: 'sidecar',
            started: true,
            ready: true,
            restartCount: 2,
            state: { running: {} },
            lastState: { terminated: { finishedAt: '2025-01-02T00:00:00Z' } },
          },
        ],
        containerStatuses: [
          {
            name: 'c1',
            ready: true,
            restartCount: 1,
            state: { running: {} },
            lastState: { terminated: { finishedAt: '2025-01-03T00:00:00Z' } },
          },
        ],
      },
    }).getDetailedStatus();

    expect(details.totalContainers).toBe(2);
    expect(details.readyContainers).toBe(2);
    expect(details.restarts).toBe(3);
    expect(details.lastRestartDate).toEqual(new Date('2025-01-03T00:00:00Z'));
  });

  it('handles container waiting, signal termination, and Terminating/Unknown deletion states', () => {
    expect(
      makePod({
        status: {
          containerStatuses: [
            {
              name: 'c1',
              restartCount: 0,
              state: { waiting: { reason: 'ImagePullBackOff', message: 'pull' } },
            },
          ],
        },
      }).getDetailedStatus()
    ).toMatchObject({ reason: 'ImagePullBackOff', message: 'pull' });

    expect(
      makePod({
        status: {
          containerStatuses: [
            { name: 'c1', restartCount: 0, state: { terminated: { exitCode: 137, signal: 9 } } },
          ],
        },
      }).getDetailedStatus().reason
    ).toBe('Signal:9');

    expect(
      makePod({
        metadata: { deletionTimestamp: '2025-01-01T00:00:00Z' },
        status: { phase: 'Running' },
      }).getDetailedStatus().reason
    ).toBe('Terminating');

    expect(
      makePod({
        metadata: { deletionTimestamp: '2025-01-01T00:00:00Z' },
        status: { phase: 'Running', reason: 'NodeLost' },
      }).getDetailedStatus().reason
    ).toBe('Unknown');
  });

  it('classifies Unknown phase pod as failed in getHealth', () => {
    const pod = makePod({ status: { phase: 'Unknown' } });
    expect(pod.getHealth()).toBe('failed');
  });
});
