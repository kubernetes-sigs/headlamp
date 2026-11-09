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
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apply } from '../../lib/k8s/api/v1/apply';
import { stream } from '../../lib/k8s/api/v1/streamingApi';
import type Node from '../../lib/k8s/node';
import type { TerminalStreamOptions } from '../../lib/k8s/useTerminalStream';
import { TestContext } from '../../test';
import { NodeShellTerminal, shell } from './NodeShellTerminal';

const terminal = vi.hoisted(() => ({
  options: null as TerminalStreamOptions | null,
  writeln: vi.fn(),
  enqueueSnackbar: vi.fn(),
  currentCluster: 'test-cluster' as string | null,
}));

vi.mock('../../lib/k8s/api/v1/apply', () => ({ apply: vi.fn() }));
vi.mock('../../lib/cluster', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/cluster')>()),
  getCluster: () => terminal.currentCluster,
}));
vi.mock('notistack', async importOriginal => ({
  ...(await importOriginal<typeof import('notistack')>()),
  useSnackbar: () => ({ enqueueSnackbar: terminal.enqueueSnackbar, closeSnackbar: vi.fn() }),
}));
vi.mock('../../lib/k8s/useTerminalStream', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s/useTerminalStream')>()),
  useTerminalStream: (options: TerminalStreamOptions) => {
    terminal.options = options;
    return {
      xtermRef: { current: { xterm: { writeln: terminal.writeln } } },
      streamRef: { current: null },
      send: vi.fn(),
    };
  },
}));
vi.mock('../../lib/k8s/api/v1/streamingApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s/api/v1/streamingApi')>()),
  stream: vi.fn(() => ({ cancel: vi.fn(), getSocket: vi.fn() })),
}));

describe('shell', () => {
  const pod = { name: 'node-debugger-node-1-abc', namespace: 'kube-system' };

  beforeEach(() => vi.clearAllMocks());

  it('only attaches to a debugger pod an earlier attempt created', async () => {
    const node = { getName: () => 'node-1' } as unknown as Node;
    const onError = vi.fn();
    vi.mocked(apply).mockResolvedValue({} as any);

    await shell(node, 'test-cluster', pod, false, vi.fn(), onError);

    // Applying an existing pod falls back to an update, which users who may
    // create and attach to pods are not necessarily allowed to do.
    vi.mocked(apply).mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));

    const { stream: reattached } = await shell(node, 'test-cluster', pod, true, vi.fn(), onError);

    expect(apply).toHaveBeenCalledOnce();
    expect(stream).toHaveBeenCalledTimes(2);
    expect(vi.mocked(stream).mock.calls[1][0]).toContain('/pods/node-debugger-node-1-abc/attach');
    expect(reattached).toBeDefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a failure to create the pod', async () => {
    const node = { getName: () => 'node-1' } as unknown as Node;
    const onError = vi.fn();
    vi.mocked(apply).mockRejectedValue(Object.assign(new Error('quota exceeded'), { status: 403 }));

    const result = await shell(node, 'test-cluster', pod, false, vi.fn(), onError);

    expect(result).toEqual({ retry: false });
    expect(stream).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('quota exceeded');
  });

  it('retries creating the pod when the cluster could not be reached', async () => {
    const node = { getName: () => 'node-1' } as unknown as Node;
    vi.mocked(apply).mockRejectedValue(Object.assign(new Error('Unreachable'), { status: 502 }));

    const result = await shell(node, 'test-cluster', pod, false, vi.fn(), vi.fn());

    expect(result).toEqual({ retry: true });
  });
});

describe('NodeShellTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminal.currentCluster = 'test-cluster';
  });
  afterEach(() => localStorage.clear());

  it('reattaches in the namespace the pod was created in after the setting changes', async () => {
    const node = { getName: () => 'node-1', cluster: 'test-cluster' } as unknown as Node;
    const setNamespace = (namespace: string) =>
      localStorage.setItem(
        'cluster_settings.test-cluster',
        JSON.stringify({ nodeShellTerminal: { namespace } })
      );
    setNamespace('shell-a');
    render(createElement(TestContext, null, createElement(NodeShellTerminal, { item: node })));
    vi.mocked(apply).mockResolvedValue({} as any);

    await terminal.options!.connectStream(vi.fn());
    setNamespace('shell-b');
    await terminal.options!.connectStream(vi.fn());

    expect(vi.mocked(apply).mock.calls[0][0].metadata.namespace).toBe('shell-a');
    const urls = vi.mocked(stream).mock.calls.map(([url]) => url);
    expect(urls).toHaveLength(2);
    expect(urls.every(url => url.startsWith('/api/v1/namespaces/shell-a/'))).toBe(true);
  });

  it("keeps opening the shell in the node's cluster after navigating away", async () => {
    const node = { getName: () => 'node-1', cluster: 'cluster-a' } as unknown as Node;
    render(createElement(TestContext, null, createElement(NodeShellTerminal, { item: node })));
    vi.mocked(apply).mockResolvedValue({} as any);

    // The terminal stays open while the user goes to another cluster, then home.
    for (const current of ['cluster-b', null]) {
      terminal.currentCluster = current;
      const { stream: opened } = await terminal.options!.connectStream(vi.fn());
      expect(opened).not.toBeNull();
    }

    expect(vi.mocked(apply).mock.calls.map(([, cluster]) => cluster)).toEqual(['cluster-a']);
    expect(vi.mocked(stream).mock.calls.map(([, , args]) => args.cluster)).toEqual([
      'cluster-a',
      'cluster-a',
    ]);
  });

  it('reports a failure to start once while it retries, and a new failure again', async () => {
    const node = { getName: () => 'node-1' } as unknown as Node;
    render(createElement(TestContext, null, createElement(NodeShellTerminal, { item: node })));
    const unreachable = Object.assign(new Error('Unreachable'), { status: 502 });
    vi.mocked(apply)
      .mockRejectedValueOnce(unreachable)
      .mockRejectedValueOnce(unreachable)
      .mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));

    const results = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      results.push(await terminal.options!.connectStream(vi.fn()));
    }

    expect(results.map(result => result.retry)).toEqual([true, true, false]);
    // Every attempt creates the same pod, so a retry cannot add another one.
    const podNames = vi.mocked(apply).mock.calls.map(([pod]) => pod.metadata.name);
    expect(new Set(podNames).size).toBe(1);
    expect(terminal.enqueueSnackbar).toHaveBeenCalledTimes(2);
    const lines = terminal.writeln.mock.calls.map(([line]) => line);
    expect(lines.filter(line => line.includes('Unreachable'))).toHaveLength(1);
    expect(lines.filter(line => line.includes('forbidden'))).toHaveLength(1);
    expect(lines.filter(line => line === 'Trying to open a shell')).toHaveLength(1);
  });
});
