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

import { beforeEach, describe, expect, it } from 'vitest';
import { resetClusterConnectQueue, withClusterConnectSlot } from './clusterConnectQueue';

/** A promise plus the handles needed to settle it from the test body. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('withClusterConnectSlot', () => {
  beforeEach(() => {
    resetClusterConnectQueue();
  });

  it('does not start a second cluster while the first has not answered', async () => {
    const first = deferred<string>();
    const started: string[] = [];

    const a = withClusterConnectSlot('cluster-a', () => {
      started.push('a');
      return first.promise;
    });
    const b = withClusterConnectSlot('cluster-b', () => {
      started.push('b');
      return Promise.resolve('b');
    });

    // Give the queue a chance to run anything it should not have run yet.
    await Promise.resolve();
    expect(started).toEqual(['a']);

    first.resolve('a');
    await expect(a).resolves.toBe('a');
    await expect(b).resolves.toBe('b');
    expect(started).toEqual(['a', 'b']);
  });

  it('lets the next cluster through when the first one fails', async () => {
    const first = deferred<string>();
    const started: string[] = [];

    const a = withClusterConnectSlot('cluster-a', () => {
      started.push('a');
      return first.promise;
    });
    const b = withClusterConnectSlot('cluster-b', () => {
      started.push('b');
      return Promise.resolve('b');
    });

    first.reject(new Error('login failed'));

    await expect(a).rejects.toThrow('login failed');
    await expect(b).resolves.toBe('b');
    expect(started).toEqual(['a', 'b']);
  });

  it('runs later requests for an already contacted cluster immediately', async () => {
    await withClusterConnectSlot('cluster-a', () => Promise.resolve('first'));

    const blocker = deferred<string>();
    // cluster-b holds the queue; cluster-a must not be stuck behind it.
    withClusterConnectSlot('cluster-b', () => blocker.promise);

    let ran = false;
    const again = withClusterConnectSlot('cluster-a', () => {
      ran = true;
      return Promise.resolve('again');
    });

    expect(ran).toBe(true);
    await expect(again).resolves.toBe('again');

    blocker.resolve('b');
  });

  it('marks a cluster as contacted even when its first request failed', async () => {
    await expect(
      withClusterConnectSlot('cluster-a', () => Promise.reject(new Error('nope')))
    ).rejects.toThrow('nope');

    const blocker = deferred<string>();
    withClusterConnectSlot('cluster-b', () => blocker.promise);

    let ran = false;
    await withClusterConnectSlot('cluster-a', () => {
      ran = true;
      return Promise.resolve('again');
    });

    expect(ran).toBe(true);

    blocker.resolve('b');
  });

  it('does not queue requests that have no cluster', async () => {
    const blocker = deferred<string>();
    withClusterConnectSlot('cluster-a', () => blocker.promise);

    let ran = false;
    const config = withClusterConnectSlot('', () => {
      ran = true;
      return Promise.resolve('config');
    });

    expect(ran).toBe(true);
    await expect(config).resolves.toBe('config');

    blocker.resolve('a');
  });

  it('admits queued clusters in the order they were requested', async () => {
    const blocker = deferred<string>();
    const started: string[] = [];

    const a = withClusterConnectSlot('cluster-a', () => {
      started.push('a');
      return blocker.promise;
    });
    const b = withClusterConnectSlot('cluster-b', () => {
      started.push('b');
      return Promise.resolve('b');
    });
    const c = withClusterConnectSlot('cluster-c', () => {
      started.push('c');
      return Promise.resolve('c');
    });

    blocker.resolve('a');
    await Promise.all([a, b, c]);

    expect(started).toEqual(['a', 'b', 'c']);
  });
});
