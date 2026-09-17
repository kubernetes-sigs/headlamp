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

import { act, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apply } from '../../lib/k8s/api/v1/apply';
import { stream } from '../../lib/k8s/api/v1/streamingApi';
import { remove } from '../../lib/k8s/apiProxy';
import { useTerminalStream } from '../../lib/k8s/useTerminalStream';
import { TestContext } from '../../test';
import { NodeShellTerminal } from './NodeShellTerminal';

vi.mock('../../lib/k8s/apiProxy', () => ({
  remove: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../lib/cluster', () => ({
  getCluster: () => 'test-cluster',
}));

vi.mock('../../helpers/clusterSettings', () => ({
  DEFAULT_NODE_SHELL_LINUX_IMAGE: 'default-linux-image',
  DEFAULT_NODE_SHELL_NAMESPACE: 'default-namespace',
  loadClusterSettings: () => ({
    nodeShellTerminal: {
      isEnabled: true,
      namespace: 'custom-namespace',
      linuxImage: 'custom-image',
    },
  }),
}));

vi.mock('../../lib/k8s/api/v1/apply', () => ({
  apply: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../lib/k8s/api/v1/streamingApi', () => ({
  stream: vi.fn().mockReturnValue({ cancel: vi.fn(), getSocket: vi.fn().mockReturnValue(null) }),
}));

vi.mock('../../lib/k8s/pod', () => ({
  default: {
    apiEndpoint: {
      delete: vi.fn().mockResolvedValue({}),
    },
  },
  KubePod: {},
}));

vi.mock('../../redux/stores/store', () => ({
  default: {
    getState: () => ({
      config: {
        defaultNodeShellImage: 'default-image',
      },
    }),
    subscribe: () => () => {},
    dispatch: () => {},
  },
}));

let capturedOptions: any = null;
vi.mock('../../lib/k8s/useTerminalStream', () => {
  return {
    Channel: {
      StdIn: 0,
      StdOut: 1,
      StdErr: 2,
      ServerError: 3,
      Resize: 4,
    },
    useTerminalStream: vi.fn().mockImplementation(options => {
      capturedOptions = options;
      return {
        xtermRef: { current: { xterm: { writeln: vi.fn(), write: vi.fn(), clear: vi.fn() } } },
        streamRef: { current: { getSocket: () => null } },
        send: vi.fn(),
      };
    }),
  };
});

const mockNode = {
  cluster: 'test-cluster',
  getName: () => 'test-node',
} as any;

function expectPodDeleted(namespace: string, podName: string) {
  const expectedUrl = `/api/v1/namespaces/${namespace}/pods/${podName}`;
  const wasRemoved = vi.mocked(remove).mock.calls.some(call => call[0] === expectedUrl);
  const wasFetched = vi.mocked(global.fetch).mock.calls.some(call => {
    const url = call[0];
    const opts = call[1] as any;
    return typeof url === 'string' && url.includes(expectedUrl) && opts?.method === 'DELETE';
  });
  expect(wasRemoved || wasFetched).toBe(true);
}

describe('NodeShellTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOptions = null;
    vi.mocked(apply).mockResolvedValue({} as any);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()));
  });

  it('connects to stream and deletes the pod when onClose is called', async () => {
    const onCloseSpy = vi.fn();
    render(
      <TestContext>
        <NodeShellTerminal item={mockNode} onClose={onCloseSpy} />
      </TestContext>
    );

    // Verify useTerminalStream was called and capturedOptions is populated
    expect(capturedOptions).toBeDefined();

    // Invoke connectStream to simulate stream initialization and pod creation
    let connectPromise: Promise<any>;
    await act(async () => {
      connectPromise = capturedOptions.connectStream(vi.fn());
    });

    const connectResult = await connectPromise!;
    expect(connectResult).toBeDefined();

    // Verify apply was called to create the pod
    expect(vi.mocked(apply).mock.calls[0][1]).toBe('test-cluster');

    // Verify stream was called with the correct cluster
    const streamMock = vi.mocked(stream);
    expect(streamMock).toHaveBeenCalled();
    expect(streamMock.mock.calls[0][2]).toMatchObject({ cluster: 'test-cluster' });

    // Get the name of the created pod from the apply call
    const createdPod = (apply as any).mock.calls[0][0];
    const podName = createdPod.metadata.name;
    const namespace = createdPod.metadata.namespace;

    // Simulate dialog close by calling onClose callback passed to useTerminalStream
    await act(async () => {
      capturedOptions.onClose();
    });

    // Verify pod deletion was triggered
    expectPodDeleted(namespace, podName);
    expect(onCloseSpy).toHaveBeenCalled();
  });

  it('deletes the pod when the component unmounts', async () => {
    const { unmount } = render(
      <TestContext>
        <NodeShellTerminal item={mockNode} />
      </TestContext>
    );

    // Invoke connectStream to create the pod
    let connectPromise: Promise<any>;
    await act(async () => {
      connectPromise = capturedOptions.connectStream(vi.fn());
    });
    await connectPromise!;

    const createdPod = (apply as any).mock.calls[0][0];
    const podName = createdPod.metadata.name;
    const namespace = createdPod.metadata.namespace;

    // Simulate unmounting
    unmount();

    // Verify pod deletion was triggered on unmount
    expectPodDeleted(namespace, podName);
  });

  it('deletes the pod immediately if component unmounts before stream resolves', async () => {
    // We want to control the resolution of the apply call to simulate a slow pod creation
    let resolveApply: any;
    const applyPromise = new Promise<void>(resolve => {
      resolveApply = resolve;
    });
    vi.mocked(apply).mockImplementation(() => applyPromise as any);

    const { unmount } = render(
      <TestContext>
        <NodeShellTerminal item={mockNode} />
      </TestContext>
    );

    // Start connecting the stream (will wait for apply to resolve)
    let connectPromise: Promise<any>;
    await act(async () => {
      connectPromise = capturedOptions.connectStream(vi.fn());
    });

    // Verify apply was called, but Pod.apiEndpoint.delete has not been called yet
    expect(apply).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();

    // Unmount before apply resolves
    unmount();

    // Resolve apply now
    await act(async () => {
      resolveApply();
    });

    // Wait for the connectStream to finish its execution path
    await act(async () => {
      await connectPromise;
    });

    const createdPod = (apply as any).mock.calls[0][0];
    const podName = createdPod.metadata.name;
    const namespace = createdPod.metadata.namespace;

    // Verify the pod was deleted immediately since component was already unmounted
    expectPodDeleted(namespace, podName);
  });

  it('deletes the pod when window beforeunload event is dispatched', async () => {
    render(
      <TestContext>
        <NodeShellTerminal item={mockNode} />
      </TestContext>
    );

    // Invoke connectStream to create the pod
    let connectPromise: Promise<any>;
    await act(async () => {
      connectPromise = capturedOptions.connectStream(vi.fn());
    });
    await connectPromise!;

    const createdPod = (apply as any).mock.calls[0][0];
    const podName = createdPod.metadata.name;
    const namespace = createdPod.metadata.namespace;

    // Dispatch beforeunload event on window
    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    // Verify pod deletion was triggered
    expectPodDeleted(namespace, podName);
  });

  it('deletes the pod when socket connection fails (failCb is called)', async () => {
    render(
      <TestContext>
        <NodeShellTerminal item={mockNode} />
      </TestContext>
    );

    // Invoke connectStream to create the pod
    let connectPromise: Promise<any>;
    await act(async () => {
      connectPromise = capturedOptions.connectStream(vi.fn());
    });
    await connectPromise!;

    const createdPod = (apply as any).mock.calls[0][0];
    const podName = createdPod.metadata.name;
    const namespace = createdPod.metadata.namespace;

    // Get the failCb callback passed to stream and trigger it 10 times to exceed MAX_CONNECTION_ATTEMPTS
    const streamCalls = vi.mocked(stream).mock.calls;
    const failCb = streamCalls[0][2].failCb;
    expect(failCb).toBeDefined();

    for (let i = 0; i < 10; i++) {
      await act(async () => {
        failCb?.();
      });
    }

    // Verify pod deletion was triggered
    expectPodDeleted(namespace, podName);

    // Verify stream cancel was called
    const streamInstance = vi.mocked(stream).mock.results[0].value;
    expect(streamInstance.cancel).toHaveBeenCalled();
  });

  it('deletes the pod when connection fails (onConnectionFailed is triggered)', async () => {
    render(
      <TestContext>
        <NodeShellTerminal item={mockNode} />
      </TestContext>
    );

    // Invoke connectStream to create the pod
    let connectPromise: Promise<any>;
    await act(async () => {
      connectPromise = capturedOptions.connectStream(vi.fn());
    });
    await connectPromise!;

    const createdPod = (apply as any).mock.calls[0][0];
    const podName = createdPod.metadata.name;
    const namespace = createdPod.metadata.namespace;

    // Trigger onConnectionFailed
    await act(async () => {
      capturedOptions.errorHandlers?.onConnectionFailed?.({
        xterm: { clear: vi.fn(), write: vi.fn() } as any,
      });
    });

    // Verify pod deletion was triggered
    expectPodDeleted(namespace, podName);

    // Verify stream cancel was called
    const streamInstance = vi.mocked(stream).mock.results[0].value;
    expect(streamInstance.cancel).toHaveBeenCalled();
  });

  it('deletes the pod when socket connection fails immediately (synchronous failCb)', async () => {
    // Override stream mock to call failCb synchronously 10 times to exceed MAX_CONNECTION_ATTEMPTS
    const streamCancelSpy = vi.fn();
    vi.mocked(stream).mockImplementationOnce((url, onExec, options) => {
      for (let i = 0; i < 10; i++) {
        options?.failCb?.();
      }
      return {
        cancel: streamCancelSpy,
        getSocket: vi.fn().mockReturnValue(null),
      };
    });

    render(
      <TestContext>
        <NodeShellTerminal item={mockNode} />
      </TestContext>
    );

    // Invoke connectStream to create the pod
    let connectPromise: Promise<any>;
    await act(async () => {
      connectPromise = capturedOptions.connectStream(vi.fn());
    });
    await connectPromise!;

    // Verify pod deletion was triggered
    const createdPod = (apply as any).mock.calls[0][0];
    const podName = createdPod.metadata.name;
    const namespace = createdPod.metadata.namespace;

    expectPodDeleted(namespace, podName);

    // Verify cancel was called on the immediately returned stream
    expect(streamCancelSpy).toHaveBeenCalled();
  });

  it('does not delete the pod on transient socket connection failure when already connected', async () => {
    const xtermWriteln = vi.fn();
    const xtermRefObj = {
      current: {
        xterm: { writeln: xtermWriteln, write: vi.fn(), clear: vi.fn() },
        connected: true,
      },
    };
    vi.mocked(useTerminalStream).mockImplementation(((options: any) => {
      capturedOptions = options;
      return {
        xtermRef: xtermRefObj as any,
        fitAddonRef: { current: null },
        streamRef: { current: { getSocket: () => null } },
        send: vi.fn(),
      };
    }) as any);

    render(
      <TestContext>
        <NodeShellTerminal item={mockNode} />
      </TestContext>
    );

    // Invoke connectStream to create the pod
    let connectPromise: Promise<any>;
    await act(async () => {
      connectPromise = capturedOptions.connectStream(vi.fn());
    });
    await connectPromise!;

    // Get the failCb callback passed to stream and trigger it
    const streamCalls = vi.mocked(stream).mock.calls;
    const failCb = streamCalls[0][2].failCb;
    expect(failCb).toBeDefined();

    vi.mocked(remove).mockClear();
    vi.mocked(global.fetch).mockClear();

    await act(async () => {
      failCb?.();
    });

    // Verify pod deletion was NOT triggered
    expect(remove).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();

    // Verify "Connection lost" message was written to the terminal
    expect(xtermWriteln).toHaveBeenCalledWith(
      expect.stringContaining('Connection lost. Retrying...')
    );

    // Verify stream cancel was NOT called
    const streamInstance = vi.mocked(stream).mock.results[0].value;
    expect(streamInstance.cancel).not.toHaveBeenCalled();
  });

  it('deletes the pod on persistent connection failure after being connected (exceeds MAX_CONNECTION_ATTEMPTS)', async () => {
    const xtermWriteln = vi.fn();
    const xtermRefObj = {
      current: {
        xterm: { writeln: xtermWriteln, write: vi.fn(), clear: vi.fn() },
        connected: true,
      },
    };
    vi.mocked(useTerminalStream).mockImplementation(((options: any) => {
      capturedOptions = options;
      return {
        xtermRef: xtermRefObj as any,
        fitAddonRef: { current: null },
        streamRef: { current: { getSocket: () => null } },
        send: vi.fn(),
      };
    }) as any);

    render(
      <TestContext>
        <NodeShellTerminal item={mockNode} />
      </TestContext>
    );

    // Invoke connectStream to create the pod
    let connectPromise: Promise<any>;
    await act(async () => {
      connectPromise = capturedOptions.connectStream(vi.fn());
    });
    await connectPromise!;

    const createdPod = (apply as any).mock.calls[0][0];
    const podName = createdPod.metadata.name;
    const namespace = createdPod.metadata.namespace;

    // Get the failCb callback passed to stream and trigger it 10 times to exceed MAX_CONNECTION_ATTEMPTS
    const streamCalls = vi.mocked(stream).mock.calls;
    const failCb = streamCalls[0][2].failCb;
    expect(failCb).toBeDefined();

    vi.mocked(remove).mockClear();

    for (let i = 0; i < 10; i++) {
      await act(async () => {
        failCb?.();
      });
    }

    // Verify pod deletion was triggered after 10 consecutive failures
    expectPodDeleted(namespace, podName);

    // Verify "Connection lost" message was written only once to avoid spamming
    const connectionLostCalls = xtermWriteln.mock.calls.filter(call =>
      call[0]?.includes('Connection lost. Retrying...')
    );
    expect(connectionLostCalls.length).toBe(1);

    // Verify stream cancel was called
    const streamInstance = vi.mocked(stream).mock.results[0].value;
    expect(streamInstance.cancel).toHaveBeenCalled();
  });
});
