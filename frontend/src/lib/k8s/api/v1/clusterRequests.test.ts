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
import { setBackendToken } from '../../../../helpers/getHeadlampAPIHeaders';
import { isBackstage } from '../../../../helpers/isBackstage';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { subscribeToApiWarnings } from './apiWarnings';
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
    vi.stubGlobal('fetch', vi.fn());
    setBackendToken('desktop-token');
    vi.mocked(isBackstage).mockReturnValue(false);
    vi.mocked(findKubeconfigByClusterName).mockResolvedValue(null);
    vi.mocked(getUserIdFromLocalStorage).mockReturnValue('desktop-user');
    vi.mocked(addBackstageAuthHeaders).mockImplementation(headers => headers ?? {});
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('keeps the timeout active while consuming the response body', async () => {
    vi.useFakeTimers();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    (fetch as Mock).mockImplementation((_url, init: RequestInit) =>
      Promise.resolve({
        ok: true,
        headers: new Headers(),
        json: () =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(abortError));
          }),
      } as Response)
    );

    const result = clusterRequest('/config', { timeout: 100 });
    const expectation = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(100);

    await expectation;
  });

  describe('API server warnings', () => {
    const PSA_WARNING =
      'would violate PodSecurity "restricted:latest": privileged (container "c" must not set securityContext.privileged=true)';

    function responseWithWarnings(status: number, ...warnings: string[]) {
      const headers = new Headers();
      warnings.forEach(warning =>
        headers.append('Warning', `299 - "${warning.replace(/"/g, '\\"')}"`)
      );
      return new Response(JSON.stringify({ kind: 'Pod' }), { status, headers });
    }

    let received: string[][];
    let unsubscribe: () => void;

    beforeEach(() => {
      received = [];
      unsubscribe = subscribeToApiWarnings(warnings => received.push(warnings));
    });

    afterEach(() => {
      unsubscribe();
    });

    it('reports the warnings of a write', async () => {
      (fetch as Mock).mockResolvedValue(
        responseWithWarnings(201, PSA_WARNING, 'unknown field "bogus"')
      );

      await clusterRequest('/api/v1/namespaces/psa-test/pods', {
        method: 'POST',
        cluster: 'desktop-cluster',
      });

      expect(received).toEqual([[PSA_WARNING, 'unknown field "bogus"']]);
    });

    it.each(['PUT', 'PATCH', 'DELETE', 'post'])('reports the warnings of a %s', async method => {
      (fetch as Mock).mockResolvedValue(responseWithWarnings(200, PSA_WARNING));

      await clusterRequest('/api/v1/namespaces/psa-test/pods/p', { method });

      expect(received).toEqual([[PSA_WARNING]]);
    });

    it('does not report the warnings of a read', async () => {
      (fetch as Mock).mockImplementation(() =>
        Promise.resolve(responseWithWarnings(200, 'v1 Endpoints is deprecated'))
      );

      await clusterRequest('/api/v1/endpoints');
      await clusterRequest('/api/v1/endpoints', { method: 'GET' });

      expect(received).toEqual([]);
    });

    it('does not report anything when the response has no warnings', async () => {
      (fetch as Mock).mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }));

      await clusterRequest('/api/v1/namespaces/psa-test/pods', { method: 'POST' });

      expect(received).toEqual([]);
    });

    it('does not report warnings of a request that failed', async () => {
      (fetch as Mock).mockResolvedValue(
        new Response(JSON.stringify({ message: 'forbidden' }), {
          status: 403,
          headers: { Warning: '299 - "ignored"' },
        })
      );

      await expect(
        clusterRequest('/api/v1/namespaces/psa-test/pods', { method: 'POST' })
      ).rejects.toMatchObject({ status: 403 });

      expect(received).toEqual([]);
    });

    it('still returns the body of a write that had warnings', async () => {
      (fetch as Mock).mockResolvedValue(responseWithWarnings(201, PSA_WARNING));

      const result = await clusterRequest('/api/v1/namespaces/psa-test/pods', { method: 'POST' });

      expect(result).toEqual({ kind: 'Pod' });
    });
  });
});
