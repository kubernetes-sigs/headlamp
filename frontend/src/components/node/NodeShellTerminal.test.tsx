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

import 'vitest-canvas-mock';
import { render } from '@testing-library/react';
import React from 'react';
import { TestContext } from '../../test';
import { NodeShellTerminal } from './NodeShellTerminal';

const { mockApply, mockDelete, podConstructorCalls } = vi.hoisted(() => ({
  mockApply: vi.fn(),
  mockDelete: vi.fn().mockResolvedValue(undefined),
  podConstructorCalls: [] as any[],
}));

vi.mock('../../lib/cluster', () => ({
  getCluster: () => 'cluster-a',
}));

vi.mock('../../lib/k8s/api/v1/apply', () => ({
  apply: (...args: any[]) => mockApply(...args),
}));

vi.mock('../../lib/k8s/api/v1/streamingApi', () => ({
  stream: () => ({
    cancel: vi.fn(),
    getSocket: () => null,
  }),
}));

vi.mock('../../helpers/clusterSettings', () => ({
  loadClusterSettings: () => ({}),
  DEFAULT_NODE_SHELL_LINUX_IMAGE: 'busybox',
  DEFAULT_NODE_SHELL_NAMESPACE: 'default',
}));

vi.mock('../../lib/k8s/pod', () => ({
  default: class MockPod {
    kubePod: any;
    cluster: any;
    delete = mockDelete;
    constructor(kubePod: any, cluster: any) {
      this.kubePod = kubePod;
      this.cluster = cluster;
      podConstructorCalls.push({ kubePod, cluster });
    }
  },
}));

const mockNode = {
  getName: () => 'test-node',
  metadata: { uid: 'node-1' },
} as any;

describe('NodeShellTerminal', () => {
  beforeEach(() => {
    mockDelete.mockClear();
    podConstructorCalls.length = 0;
  });

  it('deletes the debug pod when the terminal unmounts after the shell connects', async () => {
    mockApply.mockResolvedValue({});

    const { unmount } = render(
      <TestContext>
        <NodeShellTerminal item={mockNode} onClose={() => {}} />
      </TestContext>
    );

    await vi.waitFor(() => expect(podConstructorCalls.length).toBe(1));

    unmount();

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('still deletes the debug pod if the terminal is closed before creation finishes (race regression)', async () => {
    let resolveApply: (value: unknown) => void;
    mockApply.mockReturnValue(
      new Promise(res => {
        resolveApply = res;
      })
    );

    const { unmount } = render(
      <TestContext>
        <NodeShellTerminal item={mockNode} onClose={() => {}} />
      </TestContext>
    );

    // Close before apply() (and therefore shell()) has resolved.
    unmount();
    expect(podConstructorCalls.length).toBe(0);
    expect(mockDelete).not.toHaveBeenCalled();

    // Pod creation completes after the component is already gone.
    resolveApply!({});
    await vi.waitFor(() => expect(podConstructorCalls.length).toBe(1));

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
