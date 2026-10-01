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
import { getCluster } from '../../../cluster';
import { apply } from './apply';
import { getClusterDefaultNamespace } from './clusterApi';
import { resourceDefToApiFactory } from './factories';

vi.mock('../../../cluster', () => ({
  getCluster: vi.fn(),
}));

vi.mock('./clusterApi', () => ({
  getClusterDefaultNamespace: vi.fn(),
}));

vi.mock('./factories', () => ({
  resourceDefToApiFactory: vi.fn(),
}));

describe('apply', () => {
  const post = vi.fn();
  const put = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCluster).mockReturnValue('test-cluster');
    vi.mocked(getClusterDefaultNamespace).mockReturnValue('default');
    vi.mocked(resourceDefToApiFactory).mockResolvedValue({
      isNamespaced: true,
      post,
      put,
    } as any);
    post.mockResolvedValue({ applied: true });
  });

  it('applies a resource that already has metadata and a namespace', async () => {
    const body = { kind: 'Pod', metadata: { name: 'my-pod', namespace: 'kube-system' } } as any;

    await apply(body);

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ namespace: 'kube-system' }) }),
      {},
      'test-cluster'
    );
  });

  it('does not throw when the resource has no metadata at all', async () => {
    const body = { kind: 'Pod' } as any;

    await expect(apply(body)).resolves.toEqual({ applied: true });
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ namespace: 'default' }) }),
      {},
      'test-cluster'
    );
  });

  it('fills in the default namespace when metadata has no namespace', async () => {
    const body = { kind: 'Pod', metadata: { name: 'my-pod' } } as any;

    await apply(body);

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ namespace: 'default' }) }),
      {},
      'test-cluster'
    );
  });

  it('does not touch namespace for cluster-scoped resources with no metadata', async () => {
    vi.mocked(resourceDefToApiFactory).mockResolvedValue({
      isNamespaced: false,
      post,
      put,
    } as any);
    const body = { kind: 'Namespace' } as any;

    await apply(body);

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.not.objectContaining({ namespace: expect.anything() }),
      }),
      {},
      'test-cluster'
    );
  });

  it('falls back to PUT on conflict, preserving resourceVersion, without metadata blowing up', async () => {
    post.mockRejectedValueOnce({ status: 409 });
    put.mockResolvedValue({ applied: 'via-put' });
    const body = { kind: 'Pod', metadata: { name: 'my-pod', resourceVersion: '42' } } as any;

    const result = await apply(body);

    expect(result).toEqual({ applied: 'via-put' });
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ resourceVersion: '42' }),
      }),
      {},
      'test-cluster'
    );
  });
});
