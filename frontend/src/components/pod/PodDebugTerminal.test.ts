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
import Pod from '../../lib/k8s/pod';
import type { TerminalStreamOptions } from '../../lib/k8s/useTerminalStream';
import { TestContext } from '../../test';
import { debugPod, PodDebugTerminal } from './PodDebugTerminal';

const terminal = vi.hoisted(() => ({
  options: null as TerminalStreamOptions | null,
  writeln: vi.fn(),
  enqueueSnackbar: vi.fn(),
  currentCluster: 'test-cluster' as string | null,
}));

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

describe('debugPod', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function podWith(addEphemeralContainer: () => Promise<void>) {
    return {
      getName: () => 'test-pod',
      getNamespace: () => 'default',
      cluster: 'test-cluster',
      addEphemeralContainer,
    } as unknown as Pod;
  }

  it('retries adding the container when the cluster could not be reached', async () => {
    const add = () => Promise.reject(Object.assign(new Error('Unreachable'), { status: 502 }));
    expect(await debugPod(podWith(add), 'debugger', 'busybox', vi.fn())).toEqual({ retry: true });
  });

  it('does not retry adding the container when that is not allowed', async () => {
    const add = () => Promise.reject(Object.assign(new Error('forbidden'), { status: 403 }));
    expect(await debugPod(podWith(add), 'debugger', 'busybox', vi.fn())).toEqual({
      retry: false,
    });
  });

  it('keeps waiting for the container when a poll of the pod fails', async () => {
    const running = {
      status: { ephemeralContainerStatuses: [{ name: 'debugger', state: { running: {} } }] },
    };
    let polls = 0;
    vi.spyOn(Pod, 'apiGet').mockImplementation(
      (onPod: any, _name: any, _namespace: any, onError: any) => () =>
        ++polls === 1
          ? onError(Object.assign(new Error('Unreachable'), { status: 502 }))
          : onPod(running)
    );
    const onError = vi.fn();
    const result = debugPod(
      podWith(() => Promise.resolve()),
      'debugger',
      'busybox',
      onError
    );

    await vi.advanceTimersByTimeAsync(2000);

    expect(await result).toEqual({ containerName: 'debugger' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('stops waiting when the pod is gone', async () => {
    vi.spyOn(Pod, 'apiGet').mockImplementation(
      (_onPod: any, _name: any, _namespace: any, onError: any) => () =>
        onError(Object.assign(new Error('pods "my-pod" not found'), { status: 404 }))
    );
    const onError = vi.fn();
    const result = debugPod(
      podWith(() => Promise.resolve()),
      'debugger',
      'busybox',
      onError
    );

    await vi.advanceTimersByTimeAsync(1000);

    expect(await result).toEqual({});
    expect(onError).toHaveBeenCalledWith('pods "my-pod" not found');
  });

  it('gives up on a container that terminated', async () => {
    vi.spyOn(Pod, 'apiGet').mockImplementation(
      (onPod: any) => () =>
        onPod({
          status: {
            ephemeralContainerStatuses: [
              { name: 'debugger', state: { terminated: { reason: 'Error' } } },
            ],
          },
        })
    );
    const onError = vi.fn();
    const result = debugPod(
      podWith(() => Promise.resolve()),
      'debugger',
      'busybox',
      onError
    );

    await vi.advanceTimersByTimeAsync(1000);

    expect(await result).toEqual({});
    expect(onError).toHaveBeenCalledWith('Ephemeral container terminated: Error');
  });

  it('attaches to a container that is still starting after the wait', async () => {
    vi.spyOn(Pod, 'apiGet').mockImplementation(
      (onPod: any) => () => onPod({ status: { ephemeralContainerStatuses: [] } })
    );
    const onError = vi.fn();
    const result = debugPod(
      podWith(() => Promise.resolve()),
      'debugger',
      'busybox',
      onError
    );

    await vi.advanceTimersByTimeAsync(30_000);

    expect(await result).toEqual({ containerName: 'debugger' });
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('PodDebugTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminal.currentCluster = 'test-cluster';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("keeps attaching in the pod's cluster after navigating away", async () => {
    localStorage.setItem(
      'cluster_settings.cluster-b',
      JSON.stringify({ podDebugTerminal: { isEnabled: false } })
    );
    const attach = vi.fn(() => ({ cancel: vi.fn(), getSocket: vi.fn() }));
    const pod = {
      jsonData: { spec: { ephemeralContainers: [{ name: 'headlamp-debug' }] } },
      status: { ephemeralContainerStatuses: [{ name: 'headlamp-debug', state: { running: {} } }] },
      cluster: 'cluster-a',
      getName: () => 'test-pod',
      getNamespace: () => 'default',
      attach,
    } as unknown as Pod;
    render(createElement(TestContext, null, createElement(PodDebugTerminal, { item: pod })));

    // The terminal stays open while the user goes to a cluster where debugging is
    // disabled, then home.
    for (const current of ['cluster-b', null]) {
      terminal.currentCluster = current;
      const { stream: opened } = await terminal.options!.connectStream(vi.fn());
      expect(opened).not.toBeNull();
    }

    expect(attach).toHaveBeenCalledTimes(2);
  });

  it('adds the same container on every attempt and reports a failure once while retrying', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 100_000));
    const unreachable = Object.assign(new Error('Unreachable'), { status: 502 });
    const addEphemeralContainer = vi
      .fn()
      .mockRejectedValueOnce(unreachable)
      .mockRejectedValueOnce(unreachable)
      .mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
    // A debug container exists already, so new ones get a name made from the time.
    const pod = {
      jsonData: { spec: { ephemeralContainers: [{ name: 'headlamp-debug' }] } },
      status: {},
      cluster: 'test-cluster',
      getName: () => 'test-pod',
      getNamespace: () => 'default',
      addEphemeralContainer,
    } as unknown as Pod;
    render(createElement(TestContext, null, createElement(PodDebugTerminal, { item: pod })));

    const results = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      results.push(await terminal.options!.connectStream(vi.fn()));
    }

    expect(results.map(result => result.retry)).toEqual([true, true, false]);
    // An attempt whose response was lost may have added the container, so a retry
    // adds the same one, which changes nothing, instead of a second container.
    const names = addEphemeralContainer.mock.calls.map(([name]) => name);
    expect(new Set(names).size).toBe(1);
    expect(terminal.enqueueSnackbar).toHaveBeenCalledTimes(2);
    const lines = terminal.writeln.mock.calls.map(([line]) => line);
    expect(lines.filter(line => line.includes('Unreachable'))).toHaveLength(1);
    expect(lines.filter(line => line.includes('Creating ephemeral debug container'))).toHaveLength(
      1
    );
  });
});
