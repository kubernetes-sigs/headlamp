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
import Pod from '../../lib/k8s/pod';
import { TestContext } from '../../test';
import { NodeShellTerminal } from './NodeShellTerminal';

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
  stream: vi.fn().mockReturnValue({ cancel: vi.fn() }),
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

describe('NodeShellTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOptions = null;
    vi.mocked(apply).mockResolvedValue({} as any);
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

    // Get the name of the created pod from the apply call
    const createdPod = (apply as any).mock.calls[0][0];
    const podName = createdPod.metadata.name;
    const namespace = createdPod.metadata.namespace;

    // Simulate dialog close by calling onClose callback passed to useTerminalStream
    await act(async () => {
      capturedOptions.onClose();
    });

    // Verify pod deletion was triggered
    expect(Pod.apiEndpoint.delete).toHaveBeenCalledWith(
      namespace,
      podName,
      undefined,
      'test-cluster'
    );
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
    expect(Pod.apiEndpoint.delete).toHaveBeenCalledWith(
      namespace,
      podName,
      undefined,
      'test-cluster'
    );
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
    expect(Pod.apiEndpoint.delete).not.toHaveBeenCalled();

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
    expect(Pod.apiEndpoint.delete).toHaveBeenCalledWith(
      namespace,
      podName,
      undefined,
      'test-cluster'
    );
  });
});
