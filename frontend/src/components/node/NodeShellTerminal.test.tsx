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
import * as discoveredRevisions from '../../lib/k8s/api/v2/discoveredConnectionRevisions';
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

  vi.spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision').mockReturnValue(
    conflict ? 'original:2' : 'original:1'
  );
  const post = vi.spyOn(Pod.apiEndpoint, 'post').mockResolvedValue({});
  const stream = vi
    .spyOn(streamingApi, 'stream')
    .mockReturnValue({ cancel: vi.fn(), getSocket: vi.fn(() => null) });

  render(
    <TestContext>
      <NodeShellTerminal item={node} />
    </TestContext>
  );

  const [{ connectStream }] = vi.mocked(useTerminalStream).mock.lastCall!;
  await connectStream(vi.fn(), new AbortController().signal);

  if (conflict) {
    expect(post).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  } else {
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Pod' }),
      { __headlamp_connection_revision: 'original' },
      cluster
    );
    expect(stream).toHaveBeenCalledWith(
      expect.stringMatching(/\/attach\?.*__headlamp_connection_revision=original/),
      expect.any(Function),
      expect.objectContaining({ cluster })
    );
  }
});

it.each([
  { case: 'the terminal has closed', replaced: false },
  { case: 'the connection has been replaced', replaced: true },
])('handles shell pod creation after $case', async ({ replaced }) => {
  const cluster = 'discovered';
  const node = new Node(NODE_DETAILED_DATA, cluster);
  recordDiscoveryConnection(node, cluster, 'original:1');
  const revision = vi
    .spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision')
    .mockReturnValue('original:1');
  vi.mocked(useTerminalStream).mockReturnValue({
    xtermRef: { current: null },
    fitAddonRef: { current: null },
    streamRef: { current: null },
    send: vi.fn(),
  });
  const response = Promise.withResolvers<object>();
  const post = vi.spyOn(Pod.apiEndpoint, 'post').mockReturnValue(response.promise);
  const remove = vi.spyOn(Pod.apiEndpoint, 'delete').mockResolvedValue({});
  const stream = vi.spyOn(streamingApi, 'stream');
  const controller = new AbortController();
  render(
    <TestContext>
      <NodeShellTerminal item={node} />
    </TestContext>
  );

  const [{ connectStream }] = vi.mocked(useTerminalStream).mock.lastCall!;
  const result = connectStream(vi.fn(), controller.signal);
  const [pod] = post.mock.calls[0];
  if (replaced) {
    revision.mockReturnValue('replacement:2');
  } else {
    controller.abort();
  }
  response.resolve({});

  if (replaced) {
    await expect(result).rejects.toMatchObject({ status: 409 });
    expect(remove).not.toHaveBeenCalled();
    expect(pod.spec).toMatchObject({ activeDeadlineSeconds: 3600, restartPolicy: 'Never' });
  } else {
    await expect(result).resolves.toEqual({});
    expect(remove).toHaveBeenCalledWith(
      pod.metadata?.namespace,
      pod.metadata?.name,
      { __headlamp_connection_revision: 'original' },
      cluster
    );
  }
  expect(stream).not.toHaveBeenCalled();
});
