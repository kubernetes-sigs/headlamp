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
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import * as streamingApi from '../../lib/k8s/api/v1/streamingApi';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { recordDiscoveryConnection } from '../../lib/k8s/api/v2/discoveryConnection';
import Node from '../../lib/k8s/node';
import Pod from '../../lib/k8s/pod';
import { useTerminalStream } from '../../lib/k8s/useTerminalStream';
import { TestContext } from '../../test';
import { NodeShellTerminal } from './NodeShellTerminal';
import { NODE_DETAILED_DATA } from './storyHelper';

vi.mock('../../lib/k8s/useTerminalStream', () => ({
  useTerminalStream: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

it.each([
  { case: 'the connection still matches', conflict: false },
  { case: 'the connection changed', conflict: true },
])('checks the Node connection before opening a terminal when $case', async ({ conflict }) => {
  const cluster = 'discovered';
  const node = new Node(NODE_DETAILED_DATA, cluster);
  recordDiscoveryConnection(node, cluster, 'original:1');
  vi.mocked(useTerminalStream).mockReturnValue({
    xtermRef: { current: null },
    fitAddonRef: { current: null },
    streamRef: { current: null },
    send: vi.fn(),
  });

  const post = vi.spyOn(Pod.apiEndpoint, 'post');
  if (conflict) {
    post.mockRejectedValue(new ApiError('Discovered cluster connection changed', { status: 409 }));
  } else {
    post.mockResolvedValue({});
  }
  const stream = vi
    .spyOn(streamingApi, 'stream')
    .mockReturnValue({ cancel: vi.fn(), getSocket: vi.fn(() => null) });

  render(
    <TestContext>
      <NodeShellTerminal item={node} />
    </TestContext>
  );

  const [{ connectStream }] = vi.mocked(useTerminalStream).mock.lastCall!;
  await connectStream(vi.fn());

  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ kind: 'Pod' }),
    { __headlamp_connection_revision: 'original' },
    cluster
  );
  if (conflict) {
    expect(stream).not.toHaveBeenCalled();
  } else {
    expect(stream).toHaveBeenCalledWith(
      expect.stringMatching(/\/attach\?.*__headlamp_connection_revision=original/),
      expect.any(Function),
      expect.objectContaining({ cluster })
    );
  }
});
