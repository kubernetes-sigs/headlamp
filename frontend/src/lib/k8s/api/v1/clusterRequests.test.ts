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

import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { addBackstageAuthHeaders } from '../../../../helpers/addBackstageAuthHeaders';
import { resetClusterConnectQueue } from '../../../../helpers/clusterConnectQueue';
import { setBackendToken } from '../../../../helpers/getHeadlampAPIHeaders';
import { isBackstage } from '../../../../helpers/isBackstage';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { clusterRequest } from './clusterRequests';

vi.mock('../../../../helpers/addBackstageAuthHeaders', () => ({
  addBackstageAuthHeaders: vi.fn(headers => headers),
}));

vi.mock('../../../../helpers/isBackstage', () => ({
  isBackstage: vi.fn(() => false),
}));

vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn(),
}));

vi.mock('../../../../stateless/getUserIdFromLocalStorage', () => ({
  getUserIdFromLocalStorage: vi.fn(),
}));

vi.mock('../../../auth', () => ({
  logout: vi.fn(),
}));

describe('clusterRequest transports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClusterConnectQueue();
    vi.stubGlobal('fetch', vi.fn());
    setBackendToken('desktop-token');
    vi.mocked(isBackstage).mockReturnValue(false);
    vi.mocked(findKubeconfigByClusterName).mockResolvedValue(null);
    vi.mocked(getUserIdFromLocalStorage).mockReturnValue('desktop-user');
    vi.mocked(addBackstageAuthHeaders).mockImplementation(headers => headers ?? {});
  });

  afterEach(() => {
    setBackendToken(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('preserves caller and stateless headers with the backend token', async () => {
    vi.mocked(findKubeconfigByClusterName).mockResolvedValue('encoded-kubeconfig');
    (fetch as Mock).mockResolvedValue(
      new Response(JSON.stringify({ kind: 'PodList' }), { status: 200 })
    );

    await clusterRequest('/api/v1/pods', {
      cluster: 'desktop-cluster',
      headers: new Headers({ 'X-Caller': 'caller-value' }),
    });

    const [url, init] = (fetch as Mock).mock.lastCall!;
    const headers = new Headers(init.headers);
    expect(url).toContain('/clusters/desktop-cluster/api/v1/pods');
    expect(headers.get('X-Caller')).toBe('caller-value');
    expect(headers.get('X-HEADLAMP_BACKEND-TOKEN')).toBe('desktop-token');
    expect(headers.get('KUBECONFIG')).toBe('encoded-kubeconfig');
    expect(headers.get('X-HEADLAMP-USER-ID')).toBe('desktop-user');
  });

  it('adds the backend token to requests without a cluster', async () => {
    (fetch as Mock).mockResolvedValue(
      new Response(JSON.stringify({ clusters: [] }), { status: 200 })
    );

    await clusterRequest('/config');

    const [url, init] = (fetch as Mock).mock.lastCall!;
    const headers = new Headers(init.headers);
    expect(url).toContain('/config');
    expect(headers.get('X-HEADLAMP_BACKEND-TOKEN')).toBe('desktop-token');
  });

  it('overwrites a caller backend token without creating a duplicate header', async () => {
    (fetch as Mock).mockResolvedValue(
      new Response(JSON.stringify({ clusters: [] }), { status: 200 })
    );

    await clusterRequest('/config', {
      headers: { 'X-HEADLAMP_BACKEND-TOKEN': 'stale-token' },
    });

    const headers = new Headers((fetch as Mock).mock.lastCall![1].headers);
    expect(headers.get('X-HEADLAMP_BACKEND-TOKEN')).toBe('desktop-token');
    expect([...headers.keys()].filter(name => name === 'x-headlamp_backend-token')).toHaveLength(1);
  });

  it('preserves the backend token when Backstage headers are added', async () => {
    vi.mocked(isBackstage).mockReturnValue(true);
    vi.mocked(addBackstageAuthHeaders).mockImplementation(headers => {
      const mergedHeaders = new Headers(headers);
      mergedHeaders.set('X-Backstage', 'backstage-value');
      return Object.fromEntries(mergedHeaders.entries());
    });
    (fetch as Mock).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await clusterRequest('/version', { cluster: 'desktop-cluster' });

    const headers = new Headers((fetch as Mock).mock.lastCall![1].headers);
    expect(headers.get('X-Backstage')).toBe('backstage-value');
    expect(headers.get('X-HEADLAMP_BACKEND-TOKEN')).toBe('desktop-token');
  });

  it('maps an aborted cluster request to a timeout response', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    (fetch as Mock).mockRejectedValue(abortError);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(clusterRequest('/version', { cluster: 'desktop-cluster' })).rejects.toMatchObject({
      status: 408,
      message: expect.stringContaining('Request timed-out'),
    });
  });

  it('does not contact two clusters at once on their first request', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    (fetch as Mock).mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 10));
      inFlight -= 1;
      return new Response(JSON.stringify({}), { status: 200 });
    });

    await Promise.all([
      clusterRequest('/version', { cluster: 'cluster-a' }),
      clusterRequest('/version', { cluster: 'cluster-b' }),
    ]);

    expect(maxInFlight).toBe(1);
    expect((fetch as Mock).mock.calls).toHaveLength(2);
  });

  it('contacts a cluster in parallel once it has answered once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    (fetch as Mock).mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 10));
      inFlight -= 1;
      return new Response(JSON.stringify({}), { status: 200 });
    });

    await clusterRequest('/version', { cluster: 'cluster-a' });
    maxInFlight = 0;

    await Promise.all([
      clusterRequest('/version', { cluster: 'cluster-a' }),
      clusterRequest('/api/v1/pods', { cluster: 'cluster-a' }),
    ]);

    expect(maxInFlight).toBe(2);
  });

  it('starts the request timeout only once the cluster has a queue slot', async () => {
    // cluster-a holds the queue for longer than cluster-b's timeout. If the
    // abort timer started before the slot was granted, cluster-b would time out
    // while it was still only waiting.
    (fetch as Mock).mockImplementation(
      (url: string, init: RequestInit) =>
        new Promise((resolve, reject) => {
          const delay = String(url).includes('cluster-a') ? 60 : 5;
          const timer = setTimeout(
            () => resolve(new Response(JSON.stringify({}), { status: 200 })),
            delay
          );
          init.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            const abortError = new Error('aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        })
    );

    const results = Promise.all([
      clusterRequest('/version', { cluster: 'cluster-a' }),
      clusterRequest('/version', { cluster: 'cluster-b', timeout: 40 }),
    ]);

    await expect(results).resolves.toHaveLength(2);
  });
});
