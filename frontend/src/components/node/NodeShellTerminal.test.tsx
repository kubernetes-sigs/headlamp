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

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Channel } from '../../lib/k8s/useTerminalStream';
import { TestContext } from '../../test';
import { NodeShellTerminal } from './NodeShellTerminal';

const {
  mockEnqueueSnackbar,
  mockGetCluster,
  mockApply,
  mockStream,
  mockSend,
  mockCancel,
  mockWriteln,
  mockWrite,
  mockClear,
  terminalHookArgsRef,
  mockSocketRef,
} = vi.hoisted(() => ({
  mockEnqueueSnackbar: vi.fn(),
  mockGetCluster: vi.fn(),
  mockApply: vi.fn(),
  mockStream: vi.fn(),
  mockSend: vi.fn(),
  mockCancel: vi.fn(),
  mockWriteln: vi.fn(),
  mockWrite: vi.fn(),
  mockClear: vi.fn(),
  terminalHookArgsRef: { current: null as any },
  mockSocketRef: { current: null as any },
}));

vi.mock('notistack', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
  };
});

vi.mock('../../lib/cluster', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    getCluster: () => mockGetCluster(),
  };
});

vi.mock('../../lib/k8s/api/v1/apply', () => ({
  apply: (...args: any[]) => mockApply(...args),
}));

vi.mock('../../lib/k8s/api/v1/streamingApi', () => ({
  stream: (...args: any[]) => mockStream(...args),
}));

vi.mock('../../lib/k8s/useTerminalStream', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    useTerminalStream: (args: any) => {
      terminalHookArgsRef.current = args;
      return {
        xtermRef: {
          current: {
            xterm: {
              writeln: mockWriteln,
              write: mockWrite,
              clear: mockClear,
            },
          },
        },
        streamRef: {
          current: {
            getSocket: () => mockSocketRef.current,
            cancel: mockCancel,
          },
        },
        send: mockSend,
      };
    },
  };
});

const fakeNode = {
  getName: () => 'worker-1',
} as any;

describe('NodeShellTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminalHookArgsRef.current = null;
    mockSocketRef.current = null;
    mockGetCluster.mockReturnValue('test-cluster');
    mockApply.mockResolvedValue({});
    mockStream.mockReturnValue({ getSocket: () => mockSocketRef.current, cancel: mockCancel });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('handles missing cluster in connectStream', async () => {
    mockGetCluster.mockReturnValue(null);

    render(
      <TestContext>
        <NodeShellTerminal item={fakeNode} />
      </TestContext>
    );

    const res = await terminalHookArgsRef.current.connectStream(vi.fn());
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith('No cluster selected', { variant: 'error' });
    expect(res.stream).toBeNull();
    expect(res.initialMessage).toContain('No cluster selected');
  });

  it('creates debugger pod and opens attach stream on connectStream', async () => {
    render(
      <TestContext>
        <NodeShellTerminal item={fakeNode} />
      </TestContext>
    );

    const onData = vi.fn();
    const res = await terminalHookArgsRef.current.connectStream(onData);

    expect(mockWriteln).toHaveBeenCalledWith('Trying to open a shell');
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'Pod',
        spec: expect.objectContaining({ nodeName: 'worker-1' }),
      }),
      'test-cluster'
    );
    expect(mockStream).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/namespaces\/.*\/pods\/node-debugger-worker-1-.*\/attach/),
      onData,
      expect.objectContaining({ cluster: 'test-cluster', isJson: false })
    );
    expect(res.stream).toBe(mockStream.mock.results[0].value);
  });

  it('handles pod creation error (Error and non-Error) in connectStream', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <TestContext>
        <NodeShellTerminal item={fakeNode} />
      </TestContext>
    );

    mockApply.mockRejectedValueOnce(new Error('RBAC denied'));
    await terminalHookArgsRef.current.connectStream(vi.fn());
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.stringContaining('RBAC denied'), {
      variant: 'error',
    });
    expect(mockWriteln).toHaveBeenCalledWith(expect.stringContaining('RBAC denied'));

    mockApply.mockRejectedValueOnce('unknown-failure');
    await terminalHookArgsRef.current.connectStream(vi.fn());
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create node shell pod'),
      { variant: 'error' }
    );

    consoleSpy.mockRestore();
  });

  it('sends exit on close when socket is open and queues exit when not connected', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();

    render(
      <TestContext>
        <NodeShellTerminal item={fakeNode} onClose={onClose} />
      </TestContext>
    );

    // 1) Socket not open -> queues pendingExit, then flushes on ServerError Success
    mockSocketRef.current = { readyState: WebSocket.CLOSED };
    terminalHookArgsRef.current.onClose();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();

    mockSocketRef.current = { readyState: WebSocket.OPEN };
    const { isSuccessfulExit, isShellNotFound, onConnectionFailed } =
      terminalHookArgsRef.current.errorHandlers;

    expect(
      isSuccessfulExit(Channel.ServerError, JSON.stringify({ metadata: {}, status: 'Success' }))
    ).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(Channel.StdIn, 'exit\r');

    vi.advanceTimersByTime(1000);
    expect(mockCancel).toHaveBeenCalledTimes(1);

    // Subsequent beforeunload is a no-op since exitSentRef is true
    window.dispatchEvent(new Event('beforeunload'));
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Error parser branches
    expect(isSuccessfulExit(Channel.ServerError, 'not-json')).toBe(false);
    expect(isSuccessfulExit(Channel.StdOut, '{}')).toBe(false);

    expect(
      isShellNotFound(
        Channel.ServerError,
        JSON.stringify({ code: 500, status: 'Failure', reason: 'InternalError' })
      )
    ).toBe(true);
    expect(isShellNotFound(Channel.ServerError, 'bad-json')).toBe(false);
    expect(isShellNotFound(Channel.StdOut, 'The system cannot find the file specified')).toBe(true);
    expect(isShellNotFound(Channel.StdOut, 'other')).toBe(false);

    const fakeXterm = { xterm: { clear: mockClear, write: mockWrite } };
    onConnectionFailed(fakeXterm);
    expect(mockClear).toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith('Failed to connect…\r\n');
  });
});
