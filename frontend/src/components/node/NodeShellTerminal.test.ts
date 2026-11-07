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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apply } from '../../lib/k8s/api/v1/apply';
import { stream } from '../../lib/k8s/api/v1/streamingApi';
import type Node from '../../lib/k8s/node';
import { shell } from './NodeShellTerminal';

vi.mock('../../lib/k8s/api/v1/apply', () => ({ apply: vi.fn() }));
vi.mock('../../lib/k8s/api/v1/streamingApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s/api/v1/streamingApi')>()),
  stream: vi.fn(() => ({ cancel: vi.fn(), getSocket: vi.fn() })),
}));

describe('shell', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only attaches to a debugger pod an earlier attempt created', async () => {
    const node = { getName: () => 'node-1' } as unknown as Node;
    const onError = vi.fn();
    vi.mocked(apply).mockResolvedValue({} as any);

    await shell(node, 'test-cluster', 'node-debugger-node-1-abc', false, vi.fn(), onError);

    // Applying an existing pod falls back to an update, which users who may
    // create and attach to pods are not necessarily allowed to do.
    vi.mocked(apply).mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));

    const { stream: reattached } = await shell(
      node,
      'test-cluster',
      'node-debugger-node-1-abc',
      true,
      vi.fn(),
      onError
    );

    expect(apply).toHaveBeenCalledOnce();
    expect(stream).toHaveBeenCalledTimes(2);
    expect(vi.mocked(stream).mock.calls[1][0]).toContain('/pods/node-debugger-node-1-abc/attach');
    expect(reattached).toBeDefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a failure to create the pod', async () => {
    const node = { getName: () => 'node-1' } as unknown as Node;
    const onError = vi.fn();
    vi.mocked(apply).mockRejectedValue(new Error('quota exceeded'));

    const result = await shell(
      node,
      'test-cluster',
      'node-debugger-node-1-abc',
      false,
      vi.fn(),
      onError
    );

    expect(result).toEqual({});
    expect(stream).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('quota exceeded');
  });
});
