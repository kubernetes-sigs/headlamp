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
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { stream } from './api/v1/streamingApi';
import Pod from './pod';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

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
  });
});
