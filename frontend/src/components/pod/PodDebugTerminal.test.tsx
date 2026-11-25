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
import Pod from '../../lib/k8s/pod';
import { Channel } from '../../lib/k8s/useTerminalStream';
import { TestContext } from '../../test';
import { PodDebugTerminal } from './PodDebugTerminal';

const {
  mockEnqueueSnackbar,
  mockGetCluster,
  mockLoadClusterSettings,
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
  mockLoadClusterSettings: vi.fn(),
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

vi.mock('../../helpers/clusterSettings', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    loadClusterSettings: (...args: any[]) => mockLoadClusterSettings(...args),
  };
});

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

function makePod(overrides: any = {}) {
  return {
    getName: () => 'my-pod',
    getNamespace: () => 'default',
    cluster: 'test-cluster',
    jsonData: {
      spec: {
        ephemeralContainers: [],
      },
    },
    status: {
      ephemeralContainerStatuses: [],
    },
    addEphemeralContainer: vi.fn().mockResolvedValue({}),
    attach: vi.fn().mockReturnValue({ getSocket: () => mockSocketRef.current, cancel: mockCancel }),
    ...overrides,
  } as any;
}

describe('PodDebugTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminalHookArgsRef.current = null;
    mockSocketRef.current = null;
    mockGetCluster.mockReturnValue('test-cluster');
    mockLoadClusterSettings.mockReturnValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns null stream when no cluster is selected or pod debug is disabled', async () => {
    const pod = makePod();
    render(
      <TestContext>
        <PodDebugTerminal item={pod} />
      </TestContext>
    );

    mockGetCluster.mockReturnValueOnce(null);
    let res = await terminalHookArgsRef.current.connectStream(vi.fn());
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith('No cluster selected', { variant: 'error' });
    expect(res.stream).toBeNull();

    mockLoadClusterSettings.mockReturnValueOnce({ podDebugTerminal: { isEnabled: false } });
    res = await terminalHookArgsRef.current.connectStream(vi.fn());
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith('Pod debug is disabled in settings', {
      variant: 'error',
    });
    expect(res.stream).toBeNull();
  });

  it('attaches to an existing running debug container without creating a new one', async () => {
    const pod = makePod({
      jsonData: {
        spec: {
          ephemeralContainers: [{ name: 'headlamp-debug', targetContainerName: 'app' }],
        },
      },
      status: {
        ephemeralContainerStatuses: [{ name: 'headlamp-debug', state: { running: {} } }],
      },
    });

    render(
      <TestContext>
        <PodDebugTerminal item={pod} targetContainer="app" />
      </TestContext>
    );

    const onData = vi.fn();
    const res = await terminalHookArgsRef.current.connectStream(onData);
    expect(pod.addEphemeralContainer).not.toHaveBeenCalled();
    expect(pod.attach).toHaveBeenCalledWith('headlamp-debug', onData, {});
    expect(mockWriteln).toHaveBeenCalledWith('Attaching to existing debug container...');
    expect(res.stream).toBe(pod.attach.mock.results[0].value);
  });

  it('creates an ephemeral container, polls until running, and attaches', async () => {
    vi.useFakeTimers();
    const pod = makePod({
      jsonData: {
        spec: {
          // Existing non-running headlamp-debug triggers timestamped name generation
          ephemeralContainers: [{ name: 'headlamp-debug' }],
        },
      },
    });

    vi.spyOn(Pod, 'apiGet').mockImplementation((cb: any) => {
      return async () => {
        cb({
          status: {
            ephemeralContainerStatuses: [
              {
                name: pod.addEphemeralContainer.mock.calls[0][0],
                state: { running: {} },
              },
            ],
          },
        });
        return () => {};
      };
    });

    render(
      <TestContext>
        <PodDebugTerminal item={pod} targetContainer="app" />
      </TestContext>
    );

    const onData = vi.fn();
    const connectPromise = terminalHookArgsRef.current.connectStream(onData);
    await vi.advanceTimersByTimeAsync(1000);
    const res = await connectPromise;

    expect(pod.addEphemeralContainer).toHaveBeenCalledWith(
      expect.stringMatching(/^headlamp-debug-/),
      expect.any(String),
      ['sh'],
      'app'
    );
    const createdContainerName = pod.addEphemeralContainer.mock.calls[0][0];
    expect(pod.attach).toHaveBeenCalledWith(createdContainerName, onData, {});
    expect(res.stream).toBe(pod.attach.mock.results[0].value);
  });

  it('reports error when ephemeral container terminates or creation fails', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pod = makePod();

    vi.spyOn(Pod, 'apiGet').mockImplementation((cb: any) => {
      return async () => {
        cb({
          status: {
            ephemeralContainerStatuses: [
              {
                name: 'headlamp-debug',
                state: { terminated: { reason: 'OOMKilled' } },
              },
            ],
          },
        });
        return () => {};
      };
    });

    render(
      <TestContext>
        <PodDebugTerminal item={pod} />
      </TestContext>
    );

    const p1 = terminalHookArgsRef.current.connectStream(vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    const res1 = await p1;
    expect(res1.stream).toBeNull();
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.stringContaining('OOMKilled'), {
      variant: 'error',
    });

    pod.addEphemeralContainer.mockRejectedValueOnce(new Error('Forbidden'));
    const res2 = await terminalHookArgsRef.current.connectStream(vi.fn());
    expect(res2.stream).toBeNull();
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(expect.stringContaining('Forbidden'), {
      variant: 'error',
    });
  });

  it('handles close and error handlers', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();

    const pod = makePod({
      jsonData: {
        spec: { ephemeralContainers: [{ name: 'headlamp-debug' }] },
      },
      status: {
        ephemeralContainerStatuses: [{ name: 'headlamp-debug', state: { running: {} } }],
      },
    });

    const { unmount } = render(
      <TestContext>
        <PodDebugTerminal item={pod} onClose={onClose} />
      </TestContext>
    );

    // Trigger close while socket is not open -> queues pending exit
    mockSocketRef.current = { readyState: WebSocket.CLOSED };
    terminalHookArgsRef.current.onClose();
    expect(onClose).toHaveBeenCalledTimes(1);

    const { isSuccessfulExit, isShellNotFound, onConnectionFailed } =
      terminalHookArgsRef.current.errorHandlers;

    mockSocketRef.current = { readyState: WebSocket.OPEN };
    expect(
      isSuccessfulExit(Channel.ServerError, JSON.stringify({ metadata: {}, status: 'Success' }))
    ).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(Channel.StdIn, 'exit\r');
    vi.advanceTimersByTime(1000);
    expect(mockCancel).toHaveBeenCalledTimes(1);

    expect(isSuccessfulExit(Channel.ServerError, 'bad-json')).toBe(false);
    expect(
      isShellNotFound(
        Channel.ServerError,
        JSON.stringify({ code: 500, status: 'Failure', reason: 'InternalError' })
      )
    ).toBe(true);
    expect(isShellNotFound(Channel.ServerError, 'bad-json')).toBe(false);
    expect(isShellNotFound(Channel.StdOut, 'The system cannot find the file specified')).toBe(true);
    expect(isShellNotFound(Channel.StdOut, 'ok')).toBe(false);

    onConnectionFailed({ xterm: { clear: mockClear, write: mockWrite } });
    expect(mockClear).toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith('Failed to connect…\r\n');

    unmount();
  });

  it('sends exit on beforeunload when socket is open and exit has not been sent yet', () => {
    const pod = makePod({
      jsonData: {
        spec: { ephemeralContainers: [{ name: 'headlamp-debug' }] },
      },
      status: {
        ephemeralContainerStatuses: [{ name: 'headlamp-debug', state: { running: {} } }],
      },
    });

    mockSocketRef.current = { readyState: WebSocket.OPEN };

    render(
      <TestContext>
        <PodDebugTerminal item={pod} onClose={vi.fn()} />
      </TestContext>
    );

    window.dispatchEvent(new Event('beforeunload'));
    expect(mockSend).toHaveBeenCalledWith(Channel.StdIn, 'exit\r');
  });

  it('logs warning on unmount when debug container was created and exit was not sent', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetCluster.mockReturnValue('test-cluster');
    mockLoadClusterSettings.mockReturnValue({});
    mockSocketRef.current = { readyState: WebSocket.CLOSED };

    const pod = makePod({
      jsonData: {
        spec: { ephemeralContainers: [{ name: 'headlamp-debug' }] },
      },
      status: {
        ephemeralContainerStatuses: [{ name: 'headlamp-debug', state: { running: {} } }],
      },
    });

    const { unmount } = render(
      <TestContext>
        <PodDebugTerminal item={pod} onClose={vi.fn()} />
      </TestContext>
    );

    await terminalHookArgsRef.current.connectStream(vi.fn());
    unmount();

    expect(warnSpy).toHaveBeenCalledWith(
      'Debug container may still be running. Use Ctrl+D before closing the window to ensure cleanup.'
    );
    warnSpy.mockRestore();
  });
});
