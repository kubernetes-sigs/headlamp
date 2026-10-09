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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeShellTerminal } from './NodeShellTerminal';

const { mockApply, mockStream, capturedConnect } = vi.hoisted(() => ({
  mockApply: vi.fn(),
  mockStream: vi.fn(),
  capturedConnect: {
    current: null as null | ((onData: (data: ArrayBuffer) => void) => Promise<unknown>),
  },
}));

// The URL has several clusters selected and getCluster() reports the first one.
vi.mock('../../lib/cluster', () => ({ getCluster: () => 'cluster-a' }));

vi.mock('../../lib/k8s/api/v1/apply', () => ({ apply: mockApply }));

vi.mock('../../lib/k8s/api/v1/streamingApi', () => ({ stream: mockStream }));

vi.mock('../../lib/k8s/useTerminalStream', () => ({
  Channel: { StdIn: 0, StdOut: 1, StdErr: 2, ServerError: 3, Resize: 4 },
  useTerminalStream: (opts: { connectStream: typeof capturedConnect.current }) => {
    capturedConnect.current = opts.connectStream;
    return { xtermRef: { current: null }, streamRef: { current: null }, send: vi.fn() };
  },
}));

vi.mock('../../helpers/clusterSettings', () => ({
  DEFAULT_NODE_SHELL_LINUX_IMAGE: 'busybox',
  DEFAULT_NODE_SHELL_NAMESPACE: 'default',
  loadClusterSettings: () => ({}),
}));

vi.mock('../../redux/stores/store', () => ({
  default: { getState: () => ({ config: {} }) },
}));

vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: vi.fn() }) }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('NodeShellTerminal', () => {
  beforeEach(() => {
    mockApply.mockReset().mockResolvedValue({});
    mockStream.mockReset().mockReturnValue({});
    capturedConnect.current = null;
  });

  it("creates and attaches to the debugger pod on the node's own cluster", async () => {
    const node = { cluster: 'cluster-b', getName: () => 'worker-1' };

    render(<NodeShellTerminal item={node as any} />);
    await capturedConnect.current!(() => {});

    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply.mock.calls[0][1]).toBe('cluster-b');
    expect(mockApply.mock.calls[0][0].spec.nodeName).toBe('worker-1');
    expect(mockStream.mock.calls[0][2]).toMatchObject({ cluster: 'cluster-b' });
  });
});
